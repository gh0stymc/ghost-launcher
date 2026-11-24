import { t } from './i18n.js'

// Atajo para hablar con el proceso principal: lanza un error si algo falla
export async function call (channel, ...args) {
  const res = await window.launcher.call(channel, ...args)
  if (!res.ok) throw new Error(res.error)
  return res.data
}

export const on = (event, fn) => window.launcher.on(event, fn)

export const formatBytes = (n) => {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

export const formatGB = (mb) => `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB`

export const timeAgo = (time) => {
  if (!time) return t('Nunca jugado')
  const s = (Date.now() - time) / 1000
  if (s < 60) return t('Hace un momento')
  if (s < 3600) return t('Hace {n} min', { n: Math.floor(s / 60) })
  if (s < 86400) return t('Hace {n} h', { n: Math.floor(s / 3600) })
  const d = Math.floor(s / 86400)
  return d === 1 ? t('Hace 1 día') : t('Hace {n} días', { n: d })
}

// Tiempo jugado (en segundos) en texto corto: 45 min, 3 h 20 min, 120 h
export const formatPlayTime = (seconds) => {
  const s = seconds || 0
  if (s < 60) return t('Sin jugar')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m} min`
  if (h >= 100 || m === 0) return `${h} h`
  return `${h} h ${m} min`
}

// Tiempo total por versión de Minecraft, de más a menos
export const playTimeByVersion = (profiles) => {
  const byVersion = {}
  for (const p of profiles) {
    if (!p.playTime) continue
    byVersion[p.version] = (byVersion[p.version] || 0) + p.playTime
  }
  return Object.entries(byVersion)
    .map(([version, seconds]) => ({ version, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
}
