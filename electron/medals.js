// Medallas por horas jugadas (suma de todos los perfiles).
// Al cruzar un hito, la medalla se la lleva el perfil con el que estabas jugando.
// Cada perfil muestra su mejor medalla, que "sube de nivel" si ese mismo perfil gana la siguiente.
const store = require('./store')

// Horas de cada hito, de menor a mayor (el orden es el nivel de la medalla)
const MILESTONES = [500, 750, 1000, 2500, 5000]

const totalSeconds = (profiles) => profiles.reduce((sum, p) => sum + (p.playTime || 0), 0)

// Reparte las medallas que falten. profileId: el perfil que estaba jugando (si no, el que más ha jugado).
// Devuelve las medallas nuevas: [{ hours, profileId }]
function sync (profileId = null) {
  const awarded = []
  store.update(s => {
    // Las medallas que ya no existen (50 y 100 horas) se quitan
    for (const p of s.profiles) if (p.medals) p.medals = p.medals.filter(m => MILESTONES.includes(m.hours))
    const total = totalSeconds(s.profiles)
    const owned = new Set(s.profiles.flatMap(p => (p.medals || []).map(m => m.hours)))
    for (const hours of MILESTONES) {
      if (total < hours * 3600 || owned.has(hours)) continue
      const target = s.profiles.find(p => p.id === profileId) ||
        [...s.profiles].sort((a, b) => (b.playTime || 0) - (a.playTime || 0))[0]
      if (!target) continue
      target.medals = [...(target.medals || []), { hours, at: Date.now() }]
      owned.add(hours)
      awarded.push({ hours, profileId: target.id, profileName: target.name })
    }
  })
  return awarded
}

module.exports = { MILESTONES, sync }
