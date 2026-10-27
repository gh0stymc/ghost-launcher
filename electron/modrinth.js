// Mods, resource packs y shaders desde Modrinth, sin restricciones:
// cualquier mod de Modrinth o cualquier .jar que metas a mano en la carpeta.
const fs = require('fs')
const path = require('path')
const paths = require('./paths')
const { getJson, download } = require('./http')

const API = 'https://api.modrinth.com/v2'

// Carpeta de destino según el tipo de contenido
const FOLDERS = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }

const metaFile = (profileId) => path.join(paths.instance(profileId), '.ghost-content.json')

function readMeta (profileId) {
  try { return JSON.parse(fs.readFileSync(metaFile(profileId), 'utf8')) } catch { return {} }
}
function writeMeta (profileId, meta) {
  fs.mkdirSync(paths.instance(profileId), { recursive: true })
  fs.writeFileSync(metaFile(profileId), JSON.stringify(meta, null, 2))
}

async function search ({ query = '', type = 'mod', gameVersion, loader, offset = 0, sort = 'relevance' }) {
  const facets = [[`project_type:${type}`]]
  if (gameVersion) facets.push([`versions:${gameVersion}`])
  if ((type === 'mod' || type === 'modpack') && loader) facets.push([`categories:${loader}`])
  const params = new URLSearchParams({ query, index: sort, offset: String(offset), limit: '20', facets: JSON.stringify(facets) })
  return getJson(`${API}/search?${params}`)
}

async function pickVersion (projectId, type, gameVersion, loader) {
  const params = new URLSearchParams({ game_versions: JSON.stringify([gameVersion]) })
  if (type === 'mod' && loader) params.set('loaders', JSON.stringify([loader]))
  const versions = await getJson(`${API}/project/${projectId}/version?${params}`)
  if (!versions.length) return null
  // Preferimos versiones estables si las hay
  return versions.find(v => v.version_type === 'release') || versions[0]
}

// projectIdOrSlug: el id de Modrinth o su nombre corto (p. ej. "sodium").
// seen se comparte entre instalaciones en paralelo para no instalar dos veces lo mismo.
// skipIfInstalled: no toca el mod si el perfil ya lo tiene (útil para los mods integrados).
async function install (profile, projectIdOrSlug, type = 'mod', onProgress = () => {}, seen = new Set(), { skipIfInstalled = false } = {}) {
  if (seen.has(projectIdOrSlug)) return []
  seen.add(projectIdOrSlug)
  const loader = profile.loader === 'vanilla' ? null : profile.loader
  if (type === 'mod' && !loader) throw new Error('Los mods necesitan un perfil con Fabric')

  const project = await getJson(`${API}/project/${projectIdOrSlug}`)
  const projectId = project.id
  if (projectId !== projectIdOrSlug) {
    if (seen.has(projectId)) return []
    seen.add(projectId)
  }
  if (skipIfInstalled && Object.values(readMeta(profile.id)).some(m => m.projectId === projectId)) return []

  const version = await pickVersion(projectId, type, profile.version, loader)
  if (!version) throw new Error(`${project.title} no tiene versión para ${profile.version}`)
  await placeVersion(profile, project, version, type, onProgress)
  const installed = [project.title]

  // Dependencias obligatorias (por ejemplo Fabric API)
  for (const dep of version.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue
    const already = Object.values(readMeta(profile.id)).some(m => m.projectId === dep.project_id)
    if (already) continue
    try {
      installed.push(...await install(profile, dep.project_id, type, onProgress, seen))
    } catch { /* si una dependencia no existe para esta versión, seguimos */ }
  }
  return installed
}

// Descarga una versión concreta de un proyecto y la registra, sustituyendo otras versiones del mismo
async function placeVersion (profile, project, version, type, onProgress = () => {}) {
  const projectId = project.id
  const file = version.files.find(f => f.primary) || version.files[0]
  const folder = path.join(paths.instance(profile.id), FOLDERS[type])

  onProgress({ stage: `Descargando ${project.title}`, current: 0, total: file.size })
  await download(file.url, path.join(folder, file.filename), {
    sha1: file.hashes.sha1,
    onProgress: (done, total) => onProgress({ stage: `Descargando ${project.title}`, current: done, total: total || file.size })
  })

  // Si había una copia desactivada con el mismo nombre, sobra
  fs.rmSync(path.join(folder, file.filename + '.disabled'), { force: true })
  // Leer y escribir el registro sin pausas en medio, para que las descargas en paralelo no se pisen
  const meta = readMeta(profile.id)
  for (const [name, info] of Object.entries(meta)) {
    // Si ya había otra versión de este proyecto, la sustituimos
    if (info.projectId === projectId && name !== file.filename) {
      fs.rmSync(path.join(folder, name), { force: true })
      fs.rmSync(path.join(folder, name + '.disabled'), { force: true })
      delete meta[name]
    }
  }
  meta[file.filename] = {
    projectId,
    type,
    title: project.title,
    icon: project.icon_url,
    versionId: version.id,
    versionNumber: version.version_number
  }
  writeMeta(profile.id, meta)
}

// Lista lo que hay en las carpetas, incluidos los archivos añadidos a mano
function list (profileId) {
  const meta = readMeta(profileId)
  const items = []
  for (const [type, folderName] of Object.entries(FOLDERS)) {
    const folder = path.join(paths.instance(profileId), folderName)
    if (!fs.existsSync(folder)) continue
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name)
      if (name.endsWith('.part')) continue
      const enabled = !name.endsWith('.disabled')
      const baseName = enabled ? name : name.slice(0, -'.disabled'.length)
      const info = meta[baseName] || {}
      items.push({
        file: baseName,
        type,
        enabled,
        title: info.title || baseName.replace(/\.(jar|zip)$/i, ''),
        icon: info.icon || null,
        versionNumber: info.versionNumber || null,
        projectId: info.projectId || null,
        manual: !info.projectId,
        size: fs.statSync(full).size
      })
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title))
}

function toggle (profileId, type, file, enabled) {
  const folder = path.join(paths.instance(profileId), FOLDERS[type])
  const on = path.join(folder, file)
  const off = on + '.disabled'
  if (enabled && fs.existsSync(off)) fs.renameSync(off, on)
  if (!enabled && fs.existsSync(on)) fs.renameSync(on, off)
}

function remove (profileId, type, file) {
  const folder = path.join(paths.instance(profileId), FOLDERS[type])
  fs.rmSync(path.join(folder, file), { force: true })
  fs.rmSync(path.join(folder, file + '.disabled'), { force: true })
  const meta = readMeta(profileId)
  delete meta[file]
  writeMeta(profileId, meta)
}

// Copia archivos arrastrados al launcher a la carpeta correcta
function addFiles (profileId, files) {
  for (const src of files) {
    const ext = path.extname(src).toLowerCase()
    const type = ext === '.jar' ? 'mod' : 'resourcepack'
    const folder = path.join(paths.instance(profileId), FOLDERS[type])
    fs.mkdirSync(folder, { recursive: true })
    fs.copyFileSync(src, path.join(folder, path.basename(src)))
  }
}

// Reconoce archivos añadidos a mano o importados buscándolos en Modrinth por su hash,
// para mostrar su nombre e icono reales
async function identify (profileId) {
  const { sha1Of } = require('./http')
  const meta = readMeta(profileId)
  const pending = {}
  for (const [type, folderName] of Object.entries(FOLDERS)) {
    const folder = path.join(paths.instance(profileId), folderName)
    if (!fs.existsSync(folder)) continue
    for (const name of fs.readdirSync(folder)) {
      const full = path.join(folder, name)
      if (!fs.statSync(full).isFile() || name.endsWith('.part')) continue
      const base = name.endsWith('.disabled') ? name.slice(0, -9) : name
      if (meta[base]) continue
      pending[await sha1Of(full)] = { file: base, type }
    }
  }
  const hashes = Object.keys(pending)
  if (!hashes.length) return 0
  const res = await fetch(`${API}/version_files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': require('./http').UA },
    body: JSON.stringify({ hashes, algorithm: 'sha1' })
  })
  if (!res.ok) return 0
  const versions = await res.json()
  const ids = [...new Set(Object.values(versions).map(v => v.project_id))]
  if (!ids.length) return 0
  const projects = {}
  for (let i = 0; i < ids.length; i += 100) {
    const batch = await getJson(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids.slice(i, i + 100)))}`)
    for (const p of batch) projects[p.id] = p
  }
  let found = 0
  for (const [hash, v] of Object.entries(versions)) {
    const p = projects[v.project_id]
    const target = pending[hash]
    if (!p || !target) continue
    meta[target.file] = { projectId: p.id, type: target.type, title: p.title, icon: p.icon_url, versionId: v.id, versionNumber: v.version_number }
    found++
  }
  writeMeta(profileId, meta)
  return found
}

module.exports = { search, install, placeVersion, list, toggle, remove, addFiles, identify, readMeta, writeMeta, FOLDERS }
