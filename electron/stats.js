// Estadísticas de PvP que guarda ghost client en cada perfil (config/ghostclient/stats.json):
// asesinatos, muertes, mejor racha y tiempo por servidor, y un resumen por día para las gráficas.
const fs = require('fs')
const path = require('path')
const paths = require('./paths')
const profiles = require('./profiles')

function read (profileId) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(paths.instance(profileId), 'config', 'ghostclient', 'stats.json'), 'utf8'))
    return { servers: data.servers || {}, days: data.days || {} }
  } catch {
    return null
  }
}

// { profiles: [{ id, name, version, color, stats }], global }
function all () {
  const out = []
  for (const p of profiles.list()) {
    const stats = read(p.id)
    if (stats && Object.keys(stats.servers).length) out.push({ id: p.id, name: p.name, version: p.version, color: p.color, iconUrl: p.iconUrl, stats })
  }
  return { profiles: out, global: merge(out.map(p => p.stats)) }
}

// Suma las estadísticas de varios perfiles
function merge (list) {
  const servers = {}
  const days = {}
  for (const s of list) {
    for (const [key, v] of Object.entries(s.servers)) {
      const t = servers[key] || (servers[key] = { kills: 0, deaths: 0, bestStreak: 0, seconds: 0, first: v.first, last: v.last })
      t.kills += v.kills || 0
      t.deaths += v.deaths || 0
      t.seconds += v.seconds || 0
      t.bestStreak = Math.max(t.bestStreak, v.bestStreak || 0)
      t.first = Math.min(t.first || Infinity, v.first || Infinity)
      t.last = Math.max(t.last || 0, v.last || 0)
    }
    for (const [day, perServer] of Object.entries(s.days)) {
      const d = days[day] || (days[day] = {})
      for (const [key, v] of Object.entries(perServer)) {
        const t = d[key] || (d[key] = { k: 0, d: 0, s: 0 })
        t.k += v.k || 0
        t.d += v.d || 0
        t.s += v.s || 0
      }
    }
  }
  return { servers, days }
}

module.exports = { all, read }
