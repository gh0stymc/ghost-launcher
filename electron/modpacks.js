// Importar modpacks de Modrinth (.mrpack) y perfiles/modpacks de Lunar Client
const fs = require('fs')
const os = require('os')
const path = require('path')
const AdmZip = require('adm-zip')
const paths = require('./paths')
const profiles = require('./profiles')
const modrinth = require('./modrinth')
const versions = require('./versions')
const { getJson, download } = require('./http')
const { copyEntries } = require('./copytree')

const API = 'https://api.modrinth.com/v2'

// Evita que un modpack malicioso escriba fuera de la carpeta del perfil
function safeJoin (base, rel) {
  const target = path.resolve(base, rel)
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error(`Ruta no permitida en el modpack: ${rel}`)
  return target
}

async function pool (items, size, fn) {
  let i = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  })
  await Promise.all(workers)
}

const iconPayload = (buffer, mime) => buffer && { base64: buffer.toString('base64'), mime }

async function fetchBytes (url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'image/png' }
  } catch { return null }
}

function loaderFrom (deps) {
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] }
  const other = ['forge', 'neoforge', 'quilt-loader'].find(k => deps[k])
  if (other) throw new Error(`Este modpack usa ${other.replace('-loader', '')}. Ghost Launcher de momento solo es compatible con Fabric.`)
  return { loader: 'vanilla', loaderVersion: null }
}

// ---------- Modrinth ----------

async function importMrpack (file, { name, source } = {}, onProgress = () => {}) {
  const zip = new AdmZip(file)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error('El archivo no es un modpack de Modrinth válido')
  const index = JSON.parse(indexEntry.getData().toString('utf8'))
  const deps = index.dependencies || {}
  if (!deps.minecraft) throw new Error('El modpack no indica la versión de Minecraft')
  const { loader, loaderVersion } = loaderFrom(deps)

  const profile = profiles.create({ name: name || index.name, version: deps.minecraft, loader, loaderVersion, source: source || { type: 'mrpack' } })
  const dir = paths.instance(profile.id)
  try {
    const files = (index.files || []).filter(f => f.env?.client !== 'unsupported')
    let done = 0
    await pool(files, 6, async (f) => {
      const dest = safeJoin(dir, f.path)
      let ok = false
      for (const url of f.downloads || []) {
        try { await download(url, dest, { sha1: f.hashes?.sha1 }); ok = true; break } catch { /* siguiente enlace */ }
      }
      if (!ok) throw new Error(`No se pudo descargar ${path.basename(f.path)}`)
      onProgress({ stage: `Descargando mods (${++done}/${files.length})`, current: done, total: files.length })
    })

    onProgress({ stage: 'Copiando configuración', current: 0, total: 0 })
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const m = entry.entryName.match(/^(client-overrides|overrides)\/(.+)$/)
      if (!m) continue
      const dest = safeJoin(dir, m[2])
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, entry.getData())
    }

    onProgress({ stage: 'Reconociendo mods', current: 0, total: 0 })
    await modrinth.identify(profile.id).catch(() => {})
    return profile
  } catch (e) {
    profiles.remove(profile.id, true)
    throw e
  }
}

async function installModrinthPack (projectId, onProgress = () => {}) {
  const project = await getJson(`${API}/project/${projectId}`)
  const list = await getJson(`${API}/project/${projectId}/version?loaders=${encodeURIComponent('["fabric"]')}`)
  if (!list.length) throw new Error(`${project.title} no tiene versión para Fabric`)
  const version = list.find(v => v.version_type === 'release') || list[0]
  const file = version.files.find(f => f.primary) || version.files[0]

  const tmp = path.join(paths.base(), 'tmp', file.filename)
  onProgress({ stage: `Descargando ${project.title}`, current: 0, total: file.size })
  await download(file.url, tmp, {
    sha1: file.hashes.sha1,
    onProgress: (d, t) => onProgress({ stage: `Descargando ${project.title}`, current: d, total: t || file.size })
  })
  try {
    const profile = await importMrpack(tmp, { name: project.title, source: { type: 'modrinth', projectId, versionId: version.id } }, onProgress)
    const icon = project.icon_url ? await fetchBytes(project.icon_url) : null
    return { profile, icon: icon && iconPayload(icon.buffer, icon.mime) }
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

// ---------- Lunar Client ----------

const lunarDir = () => path.join(os.homedir(), '.lunarclient', 'profiles')

// Ni cuentas ni registros: solo lo que hace falta para jugar
// options.txt lleva los ajustes de Minecraft: teclas, sensibilidad, FOV, escala de la interfaz…
const LUNAR_COPY = ['config', 'resourcepacks', 'shaderpacks', 'options.txt', 'optionsof.txt', 'optionsshaders.txt',
  'servers.dat', 'hotbar.nbt', 'xaero', 'fancymenu_data', 'data', 'datapacks']

const isModFile = (n) => /\.jar(\.disabled)?$/i.test(n)

function lunarMods (folder) {
  const dir = path.join(folder, 'mods')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(n => isModFile(n) && fs.statSync(path.join(dir, n)).isFile())
}

function compareVersions (a, b) {
  const pa = a.split('.').map(Number); const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

// Averigua la versión de Minecraft de un perfil de Lunar
async function guessVersion (folder, name, mods) {
  const { versions: all } = await versions.listVersions()
  const releases = all.filter(v => v.type === 'release').map(v => v.id)
  const exists = (v) => releases.includes(v)

  const gv = path.join(folder, 'game-versions')
  if (fs.existsSync(gv)) {
    const found = fs.readdirSync(gv).filter(exists).sort(compareVersions).pop()
    if (found) return found
  }
  // Nombres de archivo como "mod-1.2+mc1.21.11.jar" o "mod-mc26.1-3.0.jar"
  const counts = {}
  const vdir = path.join(folder, 'versions')
  const names = [...mods, ...(fs.existsSync(vdir) ? fs.readdirSync(vdir) : [])]
  for (const n of names) {
    for (const m of n.matchAll(/(?:mc|\+|-)((?:1\.\d{1,2}|2\d\.\d{1,2})(?:\.\d{1,2})?)(?=[-+_.]|$)/gi)) {
      if (exists(m[1])) counts[m[1]] = (counts[m[1]] || 0) + 1
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (best) return best[0]
  // Perfiles de Lunar por versión: "1.8" -> 1.8.9, "26" -> la última 26.x
  if (/^\d+(\.\d+)?$/.test(name)) {
    const match = releases.filter(v => v === name || v.startsWith(name + '.')).sort(compareVersions).pop()
    if (match) return match
  }
  return null
}

const prettyName = (n) => n.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

async function listLunar () {
  const dir = lunarDir()
  if (!fs.existsSync(dir)) return { found: false, profiles: [] }
  const result = []
  for (const name of fs.readdirSync(dir)) {
    const folder = path.join(dir, name)
    if (!fs.statSync(folder).isDirectory()) continue
    const mods = lunarMods(folder)
    const count = (sub) => { try { return fs.readdirSync(path.join(folder, sub)).length } catch { return 0 } }
    result.push({
      folder: name,
      name: /^\d/.test(name) ? `Lunar ${name}` : prettyName(name),
      version: await guessVersion(folder, name, mods).catch(() => null),
      loader: mods.length ? 'fabric' : 'vanilla',
      mods: mods.length,
      resourcepacks: count('resourcepacks'),
      saves: count('saves')
    })
  }
  return { found: true, profiles: result.sort((a, b) => b.mods - a.mods) }
}

async function importLunar (folderName, { version, name, copySaves } = {}, onProgress = () => {}) {
  const src = path.join(lunarDir(), path.basename(folderName))
  if (!fs.existsSync(src)) throw new Error('No se encuentra ese perfil de Lunar')
  const mods = lunarMods(src)
  const loader = mods.length ? 'fabric' : 'vanilla'
  const mcVersion = version || await guessVersion(src, folderName, mods)
  if (!mcVersion) throw new Error('No se pudo saber la versión de Minecraft. Elígela a mano.')
  if (loader === 'fabric') {
    const fabricVersions = await versions.fabricGameVersions()
    if (!fabricVersions.includes(mcVersion)) throw new Error(`Fabric no está disponible para ${mcVersion}`)
  }

  const profile = profiles.create({ name: name || prettyName(folderName), version: mcVersion, loader, source: { type: 'lunar', folder: folderName }, importing: true })
  const dest = paths.instance(profile.id)
  try {
    // Copia en segundo plano (los mundos pueden ocupar mucho)
    const items = [...mods.map(m => path.join('mods', m)), ...LUNAR_COPY, ...(copySaves ? ['saves'] : [])]
      .filter(e => fs.existsSync(path.join(src, e)))
    await copyEntries(src, dest, items, onProgress, 'Copiando el perfil de Lunar')

    onProgress({ stage: 'Reconociendo mods', current: 0, total: 0 })
    await modrinth.identify(profile.id).catch(() => {})

    profiles.update(profile.id, { importing: false })
    let icon = null
    for (const f of ['icon.png', 'icon.webp', 'icon.jpg']) {
      const p = path.join(src, f)
      if (fs.existsSync(p)) { icon = iconPayload(fs.readFileSync(p), f.endsWith('webp') ? 'image/webp' : f.endsWith('jpg') ? 'image/jpeg' : 'image/png'); break }
    }
    return { profile, icon }
  } catch (e) {
    profiles.remove(profile.id, true)
    throw e
  }
}

module.exports = { importMrpack, installModrinthPack, listLunar, importLunar }
