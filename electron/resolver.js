// Comprobador de compatibilidad de mods.
// Lee el fabric.mod.json de cada mod (donde su autor dice qué versión de Minecraft y de otros mods necesita)
// y, si algo no encaja, baja ese mod a una versión anterior de Modrinth hasta que todo sea compatible.
// Hace falta porque a veces en Modrinth un mod está marcado como compatible con versiones con las que no lo es.
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const paths = require('./paths')
const modrinth = require('./modrinth')
const { getJson } = require('./http')

const API = 'https://api.modrinth.com/v2'

// ---------- Versiones y rangos al estilo de Fabric ----------

// "0.8.9+mc26.1.1" -> [0, 8, 9]   ("+..." son metadatos y no cuentan)
function parse (v) {
  const core = String(v).split('+')[0].split('-')[0]
  return core.split('.').map(x => (x === 'x' || x === 'X' || x === '*') ? 'x' : (parseInt(x, 10) || 0))
}

function compare (a, b) {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = (a[i] || 0) - (b[i] || 0)
    if (d) return d
  }
  return 0
}

function matchOne (version, cond) {
  cond = cond.trim().replace(/-$/, '')
  if (!cond || cond === '*') return true
  const m = cond.match(/^(>=|<=|>|<|=|~|\^)?\s*(.+)$/)
  const op = m[1] || '='
  const target = parse(m[2])
  const v = parse(version)
  const wild = target.indexOf('x')
  if (wild !== -1) {
    const prefix = target.slice(0, wild)
    // "0.9.x": las primeras cifras deben coincidir
    if (op === '=') return prefix.every((n, i) => (v[i] || 0) === n)
    return compareOp(op, op.startsWith('<') ? v.slice(0, wild) : v, prefix)
  }
  return compareOp(op, v, target)
}

function compareOp (op, v, t) {
  const c = compare(v, t)
  switch (op) {
    case '>=': return c >= 0
    case '<=': return c <= 0
    case '>': return c > 0
    case '<': return c < 0
    case '~': { const upper = [t[0], (t[1] || 0) + 1]; return c >= 0 && compare(v, upper) < 0 }
    case '^': { const upper = t[0] > 0 ? [t[0] + 1] : [0, (t[1] || 0) + 1]; return c >= 0 && compare(v, upper) < 0 }
    default: return c === 0
  }
}

// Un rango puede ser texto (">=1.21 <1.22") o una lista de alternativas
function matches (version, predicate) {
  if (predicate === undefined || predicate === null) return true
  const options = Array.isArray(predicate) ? predicate : [predicate]
  if (!options.length) return true
  return options.some(p => String(p).split(/\s+/).filter(Boolean).every(c => matchOne(version, c)))
}

// ---------- Lectura de los mods ----------

function readModJson (file) {
  try {
    const entry = new AdmZip(file).getEntry('fabric.mod.json')
    if (!entry) return null
    const text = entry.getData().toString('utf8').replace(/^﻿/, '')
    try { return JSON.parse(text) } catch { return JSON.parse(text.replace(/[\u0000-\u001F]+/g, ' ')) }
  } catch { return null }
}

function scan (profileId) {
  const folder = path.join(paths.instance(profileId), 'mods')
  if (!fs.existsSync(folder)) return []
  return fs.readdirSync(folder)
    .filter(n => n.toLowerCase().endsWith('.jar'))
    .map(n => ({ file: n, json: readModJson(path.join(folder, n)) }))
    .filter(m => m.json && m.json.id)
}

// Devuelve los mods cuyas dependencias no se cumplen
function problems (profile) {
  const mods = scan(profile.id)
  const present = new Map([['minecraft', { version: profile.version, file: null }]])
  // Si el perfil fija una versión de Fabric (los modpacks lo hacen), también se comprueba
  if (profile.loaderVersion) present.set('fabricloader', { version: profile.loaderVersion, file: null })
  for (const m of mods) {
    present.set(m.json.id, { version: m.json.version, file: m.file })
    for (const p of m.json.provides || []) present.set(typeof p === 'string' ? p : p.id, { version: m.json.version, file: m.file })
  }
  const result = []
  for (const m of mods) {
    for (const [dep, range] of Object.entries(m.json.depends || {})) {
      // Solo comprobamos lo que conocemos: Minecraft y los mods que están en la carpeta
      if (!present.has(dep)) continue
      const have = present.get(dep)
      if (!matches(have.version, range)) {
        result.push({ file: m.file, id: m.json.id, dep, need: range, have: have.version, providerFile: have.file })
      }
    }
    // "breaks": versiones de otros mods con las que este mod NO funciona
    for (const [dep, range] of Object.entries(m.json.breaks || {})) {
      if (!present.has(dep) || dep === 'minecraft' || dep === 'fabricloader') continue
      const have = present.get(dep)
      if (matches(have.version, range)) {
        result.push({ file: m.file, id: m.json.id, dep, need: range, have: have.version, providerFile: have.file, breaks: true })
      }
    }
  }
  return result
}

// Busca entre las versiones de un mod una cuya versión real (la de dentro del archivo)
// cumpla lo que se le pide y que además funcione con esta versión de Minecraft
// breaks: buscamos una versión que NO esté en el rango
async function findSatisfying (projectId, need, profile, tried, breaks = false) {
  const list = await candidates(projectId, profile)
  const tmpDir = path.join(paths.base(), 'tmp', 'resolver')
  let checked = 0
  for (const v of list) {
    if (tried.has(v.id) || checked >= 10) continue
    tried.add(v.id)
    checked++
    const file = v.files.find(f => f.primary) || v.files[0]
    const tmp = path.join(tmpDir, file.filename)
    try {
      await require('./http').download(file.url, tmp, { sha1: file.hashes.sha1 })
      const json = readModJson(tmp)
      if (json && matches(json.version, need) !== breaks && matches(profile.version, json.depends?.minecraft)) return v
    } catch { /* probamos la siguiente */ } finally {
      fs.rmSync(tmp, { force: true })
    }
  }
  return null
}

// ---------- Arreglo automático ----------

async function candidates (projectId, profile) {
  const params = new URLSearchParams({ game_versions: JSON.stringify([profile.version]), loaders: JSON.stringify(['fabric']) })
  const list = await getJson(`${API}/project/${projectId}/version?${params}`)
  const releases = list.filter(v => v.version_type === 'release')
  return releases.length ? releases : list
}

async function resolve (profile, onProgress = () => {}) {
  const changes = []
  const tried = new Map() // projectId -> versiones ya probadas al bajar el mod que falla
  const triedProvider = new Map() // projectId -> versiones ya probadas al cambiar la dependencia
  const triedSet = (map, id) => { if (!map.has(id)) map.set(id, new Set()); return map.get(id) }
  for (let round = 0; round < 25; round++) {
    const issues = problems(profile)
    if (!issues.length) return { ok: true, changes }
    onProgress({ stage: 'Ajustando versiones de mods incompatibles', current: round, total: 0 })

    const meta = modrinth.readMeta(profile.id)
    // Arreglamos primero los que fallan con Minecraft: así los demás se ajustan a ellos
    const ordered = [...issues].sort((a, b) => (b.dep === 'minecraft') - (a.dep === 'minecraft'))
    // Solo podemos cambiar mods que vienen de Modrinth (ghost client y los añadidos a mano no)
    const offender = ordered.find(i => meta[i.file]?.projectId && !meta[i.file].local)
    if (!offender) return { ok: false, changes, issues }

    // 1) Si lo que falla es la versión de otro mod, intentamos cambiar ese otro mod
    const provider = offender.providerFile && meta[offender.providerFile]
    if (offender.dep !== 'minecraft' && provider?.projectId && !provider.local) {
      const v = await findSatisfying(provider.projectId, offender.need, profile, triedSet(triedProvider, provider.projectId), !!offender.breaks)
      if (v) {
        const project = await getJson(`${API}/project/${provider.projectId}`)
        await modrinth.placeVersion(profile, project, v, 'mod')
        changes.push(`${provider.title}: ${provider.versionNumber} → ${v.version_number} (lo pide ${meta[offender.file].title})`)
        continue
      }
    }

    // 2) Si no, bajamos el mod que falla a una versión anterior
    const info = meta[offender.file]
    const list = await candidates(info.projectId, profile)
    const seen = tried.get(info.projectId) || new Set([info.versionId])
    tried.set(info.projectId, seen)
    const currentIndex = list.findIndex(v => v.id === info.versionId)
    const next = list.slice(currentIndex + 1).find(v => !seen.has(v.id))
    if (next) {
      seen.add(next.id)
      const project = await getJson(`${API}/project/${info.projectId}`)
      await modrinth.placeVersion(profile, project, next, 'mod')
      changes.push(`${info.title}: ${info.versionNumber} → ${next.version_number}`)
    } else {
      // No hay ninguna versión que encaje: lo desactivamos para que el juego arranque
      modrinth.toggle(profile.id, 'mod', offender.file, false)
      changes.push(`${info.title}: desactivado (no hay versión compatible con ${profile.version})`)
    }
  }
  return { ok: problems(profile).length === 0, changes }
}

module.exports = { resolve, problems, matches, readModJson }
