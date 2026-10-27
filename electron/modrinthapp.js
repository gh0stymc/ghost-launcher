// Importar desde la app de Modrinth instalada en el PC: sus instancias y las horas jugadas en cada una.
// Solo se lee su base de datos (sobre una copia), nunca se modifica nada de Modrinth.
const fs = require('fs')
const os = require('os')
const path = require('path')
const paths = require('./paths')
const profiles = require('./profiles')
const modrinth = require('./modrinth')
const { copyEntries } = require('./copytree')

// Carpeta de datos de la app de Modrinth según el sistema
function dataDir () {
  const home = os.homedir()
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || '', 'ModrinthApp'), path.join(process.env.APPDATA || '', 'com.modrinth.theseus')]
    : process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Application Support', 'ModrinthApp'), path.join(home, 'Library', 'Application Support', 'com.modrinth.theseus')]
      : [path.join(home, '.local', 'share', 'ModrinthApp'), path.join(home, '.local', 'share', 'com.modrinth.theseus')]
  return candidates.find(d => fs.existsSync(path.join(d, 'app.db'))) || null
}

// Abre una copia de la base de datos (la app de Modrinth puede tenerla abierta)
function withDatabase (fn) {
  const dir = dataDir()
  if (!dir) return null
  const tmp = path.join(paths.base(), 'tmp', 'modrinth-db')
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  for (const f of ['app.db', 'app.db-wal', 'app.db-shm']) {
    if (fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(tmp, f))
  }
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(path.join(tmp, 'app.db'))
  try {
    return fn(db, dir)
  } finally {
    db.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const hasColumn = (db, table, column) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column)

function list () {
  const result = withDatabase((db, dir) => {
    // Versión actual de la app (tabla instances) y versiones antiguas (tabla profiles)
    let rows
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'instances'").get()) {
      rows = db.prepare(`
        SELECT i.id, i.path, i.name, i.icon_path AS iconPath, i.last_played AS lastPlayed,
               i.submitted_time_played + i.recent_time_played AS seconds,
               c.game_version AS version, c.loader, c.loader_version AS loaderVersion
        FROM instances i LEFT JOIN instance_content_sets c ON c.id = i.applied_content_set_id`).all()
    } else {
      const lv = hasColumn(db, 'profiles', 'loader_version') ? 'loader_version' : 'NULL'
      rows = db.prepare(`
        SELECT path AS id, path, name, icon_path AS iconPath, last_played AS lastPlayed,
               submitted_time_played + recent_time_played AS seconds,
               game_version AS version, mod_loader AS loader, ${lv} AS loaderVersion
        FROM profiles`).all()
    }
    return rows.map(r => {
      const folder = path.join(dir, 'profiles', r.path)
      const modsDir = path.join(folder, 'mods')
      const mods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir).filter(f => /\.jar(\.disabled)?$/i.test(f)).length : 0
      return {
        id: String(r.id),
        name: r.name,
        version: r.version,
        loader: (r.loader || 'vanilla').toLowerCase(),
        loaderVersion: r.loaderVersion || null,
        seconds: Number(r.seconds) || 0,
        lastPlayed: r.lastPlayed ? Number(r.lastPlayed) * 1000 : null,
        iconPath: r.iconPath && fs.existsSync(r.iconPath) ? r.iconPath : null,
        exists: fs.existsSync(folder),
        folder,
        mods
      }
    }).sort((a, b) => b.seconds - a.seconds)
  })
  return result ? { found: true, instances: result } : { found: false, instances: [] }
}

// Lo que no hace falta copiar de una instancia
// Cachés que se regeneran solas: no se copian nunca (Voxy puede ocupar varios GB)
const CACHES = new Set(['logs', 'crash-reports', '.fabric', '.cache', 'downloads', 'debug', '.mixin.out', 'natives',
  '.voxy', 'Distant_Horizons_server_data', '.ghost-content.json'])
// Lo que más ocupa: solo si se pide (mundos, repeticiones, copias de seguridad y capturas)
const HEAVY = new Set(['saves', 'flashback', 'replay_recordings', 'backups', 'screenshots'])

async function importInstance (id, { copySaves } = {}, onProgress = () => {}) {
  const inst = list().instances.find(i => i.id === id)
  if (!inst) throw new Error('No encuentro esa instancia de Modrinth')
  if (!inst.exists) throw new Error('La carpeta de esa instancia ya no existe')
  if (!['fabric', 'vanilla'].includes(inst.loader)) {
    throw new Error(`Esa instancia usa ${inst.loader}. ghost launcher de momento solo es compatible con Fabric.`)
  }

  const profile = profiles.create({
    name: inst.name, version: inst.version, loader: inst.loader,
    loaderVersion: inst.loaderVersion, source: { type: 'modrinth-app', id }, importing: true
  })
  const dest = paths.instance(profile.id)
  try {
    // Todo lo de la instancia (mods, config, texturas, shaders y los ajustes de Minecraft: options.txt
    // con teclas, sensibilidad, FOV...), en segundo plano para no congelar el launcher
    const entries = fs.readdirSync(inst.folder).filter(e => !CACHES.has(e) && (copySaves || !HEAVY.has(e)))
    await copyEntries(inst.folder, dest, entries, onProgress, 'Copiando la instancia')
    // Las horas jugadas en Modrinth pasan al perfil
    profiles.update(profile.id, { playTime: inst.seconds, lastPlayed: inst.lastPlayed, hoursFrom: [id], importing: false })

    onProgress({ stage: 'Reconociendo mods', current: 0, total: 0 })
    await modrinth.identify(profile.id).catch(() => {})

    const icon = inst.iconPath
      ? { base64: fs.readFileSync(inst.iconPath).toString('base64'), mime: inst.iconPath.endsWith('.webp') ? 'image/webp' : 'image/png' }
      : null
    return { profile: profiles.list().find(p => p.id === profile.id), icon }
  } catch (e) {
    profiles.remove(profile.id, true)
    throw e
  }
}

// Suma a un perfil que ya existe las horas de una instancia de Modrinth (solo una vez por instancia)
function addHours (profileId, id) {
  const inst = list().instances.find(i => i.id === id)
  if (!inst) throw new Error('No encuentro esa instancia de Modrinth')
  const p = profiles.list().find(x => x.id === profileId)
  if (!p) throw new Error('Perfil no encontrado')
  const used = new Set(profiles.list().flatMap(x => x.hoursFrom || []))
  if (used.has(id)) throw new Error('Las horas de esa instancia ya se sumaron a un perfil')
  profiles.update(profileId, {
    playTime: (p.playTime || 0) + inst.seconds,
    lastPlayed: Math.max(p.lastPlayed || 0, inst.lastPlayed || 0) || null,
    hoursFrom: [...(p.hoursFrom || []), id]
  })
  return inst.seconds
}

module.exports = { dataDir, list, importInstance, addHours }
