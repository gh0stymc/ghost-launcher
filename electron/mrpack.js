// Exportar un perfil como modpack de Modrinth (.mrpack). Lo abren la app de Modrinth y Lunar Client
// (Versiones → Modpacks → arrastrar el archivo).
// - Los mods, texture packs y shaders que están en Modrinth van como enlace (el archivo pesa poco).
// - Los que no están en Modrinth y toda la configuración van dentro, en overrides/.
// - Los mods integrados de Ghost Launcher (ghost client, Sodium, Iris… ver builtins.js) no se incluyen.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')
const paths = require('./paths')
const profiles = require('./profiles')
const modrinth = require('./modrinth')
const { BUILTINS, CAPES } = require('./builtins')
const { getJson, UA } = require('./http')
const { t } = require('./i18n')

const API = 'https://api.modrinth.com/v2'
const MAX_BYTES = 4 * 1024 ** 3
// Igual que en share.js: cosas que se regeneran solas o son solo de esta instalación
const SKIP = new Set(['logs', 'crash-reports', 'screenshots', '.fabric', '.mixin.out', 'downloads', 'debug', 'cache', '.cache',
  '.voxy', 'voxy', 'replay_recordings', 'replay_videos', 'flashback', 'backups', 'natives', 'command_history.txt'])
// La configuración de ghost client (HUD, cosméticos, estadísticas) solo sirve en ghost client
const SKIP_PATHS = ['config/ghostclient', 'config/axolotlclient']
const CONTENT = Object.values(modrinth.FOLDERS) // mods, resourcepacks, shaderpacks

function walk (dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = base ? `${base}/${name}` : name
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, rel, out)
    else out.push({ full, rel, size: st.size })
  }
  return out
}

const hashOf = (file, algo) => new Promise((resolve, reject) => {
  const h = crypto.createHash(algo)
  fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
})

// IDs de Modrinth de los mods integrados (para saber cuáles quitar)
async function builtinProjectIds () {
  const slugs = [...BUILTINS, CAPES].map(b => b.slug).filter(s => s !== 'ghost-client')
  const list = await getJson(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(slugs))}`)
  return new Set(list.map(p => p.id))
}

async function versionsByHash (hashes) {
  if (!hashes.length) return {}
  const res = await fetch(`${API}/version_files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ hashes, algorithm: 'sha1' })
  })
  if (!res.ok) throw new Error(t('No se pudo conectar con Modrinth'))
  return res.json()
}

async function exportMrpack (profileId, file, { worlds = false } = {}, onProgress = () => {}) {
  const profile = profiles.list().find(p => p.id === profileId)
  if (!profile) throw new Error(t('Perfil no encontrado'))
  const root = paths.instance(profileId)

  onProgress({ stage: t('Buscando los mods en Modrinth…'), current: 0, total: 0 })
  const builtin = await builtinProjectIds()
  const meta = modrinth.readMeta(profileId)

  // Mods, texture packs y shaders activos: se buscan en Modrinth por su hash
  const content = []
  for (const folder of CONTENT) {
    const dir = path.join(root, folder)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (!fs.statSync(full).isFile() || name.endsWith('.part') || name.endsWith('.disabled')) continue
      // ghost client viene del launcher, no de Modrinth
      if (folder === 'mods' && (/^ghostclient/i.test(name) || meta[name]?.local)) continue
      content.push({ full, rel: `${folder}/${name}`, name, folder, size: fs.statSync(full).size, sha1: await hashOf(full, 'sha1') })
    }
  }
  const found = await versionsByHash(content.map(c => c.sha1))

  const files = []
  const overrides = []
  let skipped = 0
  for (const c of content) {
    const v = found[c.sha1]
    const projectId = v?.project_id || meta[c.name]?.projectId
    if (projectId && builtin.has(projectId)) { skipped++; continue }
    const remote = v?.files?.find(f => f.hashes?.sha1 === c.sha1)
    if (remote) {
      files.push({
        path: c.rel,
        hashes: { sha1: c.sha1, sha512: remote.hashes.sha512 || await hashOf(c.full, 'sha512') },
        env: { client: 'required', server: 'unsupported' },
        downloads: [remote.url],
        fileSize: c.size
      })
    } else {
      overrides.push(c) // añadido a mano o de fuera de Modrinth: va dentro del pack
    }
  }

  // El resto de la carpeta del juego: configuración, opciones, servidores, carpetas de texture packs, mundos…
  for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (SKIP.has(name) || CONTENT.includes(name) || name.startsWith('.ghost') || (!worlds && name === 'saves')) continue
    const full = path.join(root, name)
    if (fs.statSync(full).isDirectory()) walk(full, name, overrides)
    else overrides.push({ full, rel: name, size: fs.statSync(full).size })
  }
  // Carpetas dentro de resourcepacks/shaderpacks (packs sin comprimir)
  for (const folder of CONTENT.filter(f => f !== 'mods')) {
    const dir = path.join(root, folder)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) walk(full, `${folder}/${name}`, overrides)
    }
  }
  const kept = overrides.filter(o => !SKIP_PATHS.some(p => o.rel === p || o.rel.startsWith(p + '/')))
  const total = kept.reduce((n, e) => n + e.size, 0)
  if (total > MAX_BYTES) throw new Error(t('El perfil ocupa demasiado para exportarlo ({gb} GB). Prueba sin los mundos.', { gb: (total / 1024 ** 3).toFixed(1) }))

  const dependencies = { minecraft: profile.version }
  if (profile.loader === 'fabric') {
    dependencies['fabric-loader'] = profile.loaderVersion || await require('./versions').fabricLatestLoader(profile.version)
  }
  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: profile.name,
    summary: t('Exportado desde Ghost Launcher'),
    files,
    dependencies
  }

  const zip = new AdmZip()
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)))
  let done = 0
  for (const e of kept) {
    const dir = path.posix.dirname(e.rel)
    zip.addLocalFile(e.full, `overrides/${dir === '.' ? '' : dir}`)
    if (++done % 50 === 0) {
      onProgress({ stage: t('Preparando archivos ({x}/{n})', { x: done, n: kept.length }), current: done, total: kept.length })
      await new Promise(r => setImmediate(r))
    }
  }
  onProgress({ stage: t('Comprimiendo…'), current: 0, total: 0 })
  await zip.writeZipPromise(file)
  return { file, size: fs.statSync(file).size, linked: files.length, included: kept.length, skipped }
}

module.exports = { exportMrpack }
