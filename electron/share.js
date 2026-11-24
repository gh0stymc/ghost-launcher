// Exportar e importar perfiles (para pasarlos a otro PC o a un amigo).
// Un archivo .ghostprofile es un zip con ghost-profile.json (ajustes del perfil), la foto y la carpeta del juego:
// mods, configuración, texture packs, shaders, opciones, servidores y, si se quiere, los mundos.
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const paths = require('./paths')
const profiles = require('./profiles')
const { t } = require('./i18n')

const FORMAT = 1
// Carpetas que no se exportan nunca (se regeneran solas o son de esta instalación)
const SKIP = new Set(['logs', 'crash-reports', 'screenshots', '.fabric', '.mixin.out', 'downloads', 'debug', 'cache', '.cache',
  '.voxy', 'voxy', 'replay_recordings', 'replay_videos', 'flashback', 'backups', 'natives', '.ghost-icon.png', 'command_history.txt'])
const WORLDS = new Set(['saves'])
const MAX_BYTES = 4 * 1024 ** 3

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

// Qué hay en el perfil (para que la interfaz enseñe el tamaño de cada parte)
function inspect (profileId) {
  const root = paths.instance(profileId)
  const sum = (filter) => {
    let size = 0, files = 0
    for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
      if (!filter(name)) continue
      const full = path.join(root, name)
      for (const f of fs.statSync(full).isDirectory() ? walk(full, name, []) : [{ size: fs.statSync(full).size }]) { size += f.size; files++ }
    }
    return { size, files }
  }
  const worlds = fs.existsSync(path.join(root, 'saves')) ? fs.readdirSync(path.join(root, 'saves')).filter(n => fs.statSync(path.join(root, 'saves', n)).isDirectory()).length : 0
  return { base: sum(n => !SKIP.has(n) && !WORLDS.has(n)), worlds: { ...sum(n => WORLDS.has(n)), count: worlds } }
}

async function exportProfile (profileId, file, { worlds = false } = {}, onProgress = () => {}) {
  const profile = profiles.list().find(p => p.id === profileId)
  if (!profile) throw new Error(t('Perfil no encontrado'))
  const root = paths.instance(profileId)
  const entries = []
  for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (SKIP.has(name) || (!worlds && WORLDS.has(name))) continue
    const full = path.join(root, name)
    if (fs.statSync(full).isDirectory()) walk(full, name, entries)
    else entries.push({ full, rel: name, size: fs.statSync(full).size })
  }
  // Las estadísticas de PvP son tuyas: no viajan con el perfil
  const mine = new Set(['config/ghostclient/stats.json', 'config/ghostclient/stats.json.tmp'])
  for (let i = entries.length - 1; i >= 0; i--) if (mine.has(entries[i].rel)) entries.splice(i, 1)
  const total = entries.reduce((n, e) => n + e.size, 0)
  if (total > MAX_BYTES) throw new Error(t('El perfil ocupa demasiado para exportarlo ({gb} GB). Prueba sin los mundos.', { gb: (total / 1024 ** 3).toFixed(1) }))
  const zip = new AdmZip()
  const meta = {
    format: FORMAT,
    name: profile.name,
    version: profile.version,
    loader: profile.loader,
    loaderVersion: profile.loaderVersion || null,
    color: profile.color,
    ram: profile.ram || null,
    jvmArgs: profile.jvmArgs || '',
    resolution: profile.resolution || null,
    worlds,
    exportedAt: new Date().toISOString(),
    launcher: require('electron').app.getVersion()
  }
  zip.addFile('ghost-profile.json', Buffer.from(JSON.stringify(meta, null, 2)))
  const icon = path.join(root, '.ghost-icon.png')
  if (profile.hasIcon && fs.existsSync(icon)) zip.addLocalFile(icon, '', 'icon.png')
  let done = 0
  for (const e of entries) {
    zip.addLocalFile(e.full, `files/${path.posix.dirname(e.rel) === '.' ? '' : path.posix.dirname(e.rel)}`)
    if (++done % 50 === 0) {
      onProgress({ stage: t('Preparando archivos ({x}/{n})', { x: done, n: entries.length }), current: done, total: entries.length })
      await new Promise(r => setImmediate(r))
    }
  }
  onProgress({ stage: t('Comprimiendo…'), current: 0, total: 0 })
  await zip.writeZipPromise(file)
  return { file, size: fs.statSync(file).size, files: entries.length }
}

// Mira un archivo antes de importarlo
function peek (file) {
  const zip = new AdmZip(file)
  const metaEntry = zip.getEntry('ghost-profile.json')
  if (!metaEntry) throw new Error(t('Ese archivo no es un perfil de Ghost Launcher'))
  const meta = JSON.parse(metaEntry.getData().toString('utf8'))
  if (!meta.version || !meta.name) throw new Error(t('El perfil está dañado'))
  const files = zip.getEntries().filter(e => e.entryName.startsWith('files/') && !e.isDirectory)
  return { meta, files: files.length, size: files.reduce((n, e) => n + e.header.size, 0), hasIcon: !!zip.getEntry('icon.png') }
}

async function importProfile (file, onProgress = () => {}) {
  const { meta } = peek(file)
  const zip = new AdmZip(file)
  const profile = profiles.create({
    name: profiles.list().some(p => p.name === meta.name) ? `${meta.name} (2)` : meta.name,
    version: meta.version,
    loader: meta.loader === 'fabric' ? 'fabric' : 'vanilla',
    loaderVersion: meta.loaderVersion || null,
    color: meta.color,
    ram: meta.ram && Number.isFinite(meta.ram.max) ? meta.ram : null,
    jvmArgs: typeof meta.jvmArgs === 'string' ? meta.jvmArgs : '',
    resolution: meta.resolution || null,
    source: { type: 'ghost', importedAt: Date.now() },
    importing: true
  })
  const root = paths.instance(profile.id)
  try {
    const entries = zip.getEntries().filter(e => e.entryName.startsWith('files/') && !e.isDirectory)
    let done = 0
    for (const e of entries) {
      const rel = e.entryName.slice('files/'.length)
      const dest = path.resolve(root, rel)
      // Nada fuera de la carpeta del perfil
      if (!dest.startsWith(path.resolve(root) + path.sep)) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, e.getData())
      if (++done % 25 === 0) {
        onProgress({ stage: t('Copiando archivos ({x}/{n})', { x: done, n: entries.length }), current: done, total: entries.length })
        await new Promise(r => setImmediate(r))
      }
    }
    const icon = zip.getEntry('icon.png')
    if (icon) profiles.setIcon(profile.id, icon.getData())
    profiles.update(profile.id, { importing: false })
    return profiles.list().find(p => p.id === profile.id)
  } catch (e) {
    profiles.remove(profile.id, true)
    throw e
  }
}

module.exports = { inspect, exportProfile, peek, importProfile }
