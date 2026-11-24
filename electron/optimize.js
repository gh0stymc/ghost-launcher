// Botón "Optimizar": ajusta un perfil según el PC (RAM, procesador y gráfica) para tener más FPS.
// Calcula una propuesta (plan) que la interfaz enseña; el usuario elige qué cambios aplicar.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')
const paths = require('./paths')
const profiles = require('./profiles')
const store = require('./store')
const { t } = require('./i18n')

// Mods de rendimiento que se instalan si faltan (los mismos que los integrados)
const PERF_MODS = ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast', 'dynamic-fps']
// Argumentos de Java para un recolector de basura con pausas cortas (menos tirones)
const JVM_FLAGS = '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M'

async function machine () {
  const ram = Math.floor(os.totalmem() / 1024 / 1024)
  const cores = os.cpus().length
  const cpu = (os.cpus()[0]?.model || '').replace(/\s+/g, ' ').trim()
  let gpu = ''
  let integrated = false
  try {
    const info = await app.getGPUInfo('basic')
    const devices = info.gpuDevice || []
    const main = devices.find(d => d.active) || devices[0]
    // Nombre de la gráfica (si Windows lo da) o el fabricante
    gpu = (info.auxAttributes?.glRenderer || '').replace(/^ANGLE \(|\)$/g, '').split(',').slice(1, 2).join('').trim()
    const vendor = { 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x8086: 'Intel' }[main?.vendorId] || ''
    if (!gpu) gpu = vendor
    // Las gráficas de Intel (y las AMD "Radeon Graphics" de los portátiles) van en el procesador
    integrated = main?.vendorId === 0x8086 || /Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|UHD|Iris/i.test(gpu)
  } catch {}
  // Nivel del PC: bajo, medio o alto
  let tier = 'high'
  if (ram < 7.5 * 1024 || cores <= 4 || (integrated && ram < 15 * 1024)) tier = 'low'
  else if (ram < 15 * 1024 || cores <= 6 || integrated) tier = 'mid'
  return { ram, cores, cpu, gpu, integrated, tier }
}

function readOptions (profileId) {
  const lines = (() => { try { return fs.readFileSync(path.join(paths.instance(profileId), 'options.txt'), 'utf8').split(/\r?\n/) } catch { return [] } })()
  const map = {}
  for (const l of lines) { const i = l.indexOf(':'); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1) }
  return map
}

function modCount (profileId) {
  try { return fs.readdirSync(path.join(paths.instance(profileId), 'mods')).filter(f => f.endsWith('.jar')).length } catch { return 0 }
}

// Propuesta de cambios para este perfil
async function plan (profileId) {
  const profile = profiles.list().find(p => p.id === profileId)
  if (!profile) throw new Error(t('Perfil no encontrado'))
  const pc = await machine()
  const settings = store.get().settings
  const opts = readOptions(profileId)
  const mods = modCount(profileId)
  const changes = []

  // RAM: lo justo (demasiada RAM también da tirones). Más si el perfil tiene muchos mods.
  const want = pc.ram < 7.5 * 1024 ? 2048 : pc.ram < 12 * 1024 ? 3072 : mods > 120 && pc.ram >= 15 * 1024 ? 6144 : 4096
  const current = profile.ram?.max || settings.maxRam
  if (current !== want) {
    changes.push({ id: 'ram', group: 'java', title: t('RAM: {from} → {to} GB', { from: (current / 1024).toFixed(1), to: (want / 1024).toFixed(1) }), hint: want < current ? t('Darle demasiada RAM hace que el juego se pare a limpiar memoria (tirones)') : t('Con {n} mods el juego necesita algo más de memoria', { n: mods }), value: want })
  }
  if (!/UseG1GC|UseZGC|UseShenandoahGC/.test((profile.jvmArgs || '') + ' ' + (settings.jvmArgs || ''))) {
    changes.push({ id: 'jvm', group: 'java', title: t('Recolector de memoria con pausas cortas (G1)'), hint: t('Menos tirones cuando Java libera memoria'), value: JVM_FLAGS })
  }

  // Ajustes de vídeo según el nivel del PC
  const video = {
    low: { renderDistance: 8, simulationDistance: 6, particles: 1, renderClouds: '"false"', entityShadows: 'false', biomeBlendRadius: 0, mipmapLevels: 0, entityDistanceScaling: '0.75' },
    mid: { renderDistance: 12, simulationDistance: 8, particles: 1, renderClouds: '"fast"', entityShadows: 'false', biomeBlendRadius: 1, mipmapLevels: 2, entityDistanceScaling: '1.0' },
    high: { renderDistance: 16, simulationDistance: 10, particles: 0, renderClouds: '"fast"', entityShadows: 'true', biomeBlendRadius: 2, mipmapLevels: 4, entityDistanceScaling: '1.0' }
  }[pc.tier]
  const always = { maxFps: 260, enableVsync: 'false', inactivityFpsLimit: '"afk"', prioritizeChunkUpdates: 0 }
  const names = {
    renderDistance: t('Distancia de renderizado'),
    simulationDistance: t('Distancia de simulación'),
    particles: t('Partículas'),
    renderClouds: t('Nubes'),
    entityShadows: t('Sombras de entidades'),
    biomeBlendRadius: t('Mezcla de biomas'),
    mipmapLevels: t('Niveles de mipmap'),
    entityDistanceScaling: t('Distancia de entidades'),
    maxFps: t('FPS máximos'),
    enableVsync: t('Sincronización vertical'),
    inactivityFpsLimit: t('Límite de FPS en segundo plano'),
    prioritizeChunkUpdates: t('Actualizar chunks')
  }
  const label = (k, v) => {
    const s = String(v).replace(/"/g, '')
    if (k === 'maxFps') return Number(s) >= 260 ? t('Sin límite') : s
    if (k === 'particles') return [t('Todas'), t('Menos'), t('Mínimas')][Number(s)] ?? s
    if (k === 'renderClouds') return { false: t('No'), fast: t('Rápidas'), true: t('Bonitas') }[s] ?? s
    if (k === 'enableVsync' || k === 'entityShadows') return s === 'true' ? t('Sí') : t('No')
    if (k === 'inactivityFpsLimit') return s === 'afk' ? t('Al estar ausente') : t('Al minimizar')
    if (k === 'prioritizeChunkUpdates') return [t('En segundo plano'), t('Cerca del jugador'), t('Al momento')][Number(s)] ?? s
    if (k === 'renderDistance' || k === 'simulationDistance') return t('{n} chunks', { n: s })
    return s
  }
  const target = { ...video, ...always }
  const optionChanges = []
  for (const [k, v] of Object.entries(target)) {
    const now = opts[k]
    // La distancia solo se baja (si alguien la tiene más baja, se respeta)
    if ((k === 'renderDistance' || k === 'simulationDistance') && now !== undefined && Number(now) <= v) continue
    if (now !== undefined && String(now) === String(v)) continue
    optionChanges.push({ key: k, value: String(v), from: now === undefined ? null : label(k, now), to: label(k, v), name: names[k] })
  }
  if (optionChanges.length) {
    changes.push({ id: 'video', group: 'video', title: t('Ajustes de vídeo para un PC {tier}', { tier: { low: t('modesto'), mid: t('medio'), high: t('potente') }[pc.tier] }), hint: optionChanges.map(o => `${o.name}: ${o.from ? o.from + ' → ' : ''}${o.to}`).join(' · '), value: optionChanges })
  }

  // Mods de rendimiento que falten (solo con Fabric)
  if (profile.loader === 'fabric') {
    const modrinth = require('./modrinth')
    const installed = modrinth.list(profileId).filter(i => i.type === 'mod')
    const ids = { sodium: 'AANobbMI', lithium: 'gvQqBUqZ', 'ferrite-core': 'uXXizFIs', entityculling: 'NNAgCjsB', immediatelyfast: '5ZwdcRci', 'dynamic-fps': 'LQ3K71Q1' }
    const has = (slug) => installed.some(i => i.projectId === ids[slug] || new RegExp(slug.replace(/-/g, '[-_ ]?'), 'i').test(i.file || ''))
    const missing = PERF_MODS.filter(s => !has(s))
    if (missing.length) {
      const pretty = { sodium: 'Sodium', lithium: 'Lithium', 'ferrite-core': 'FerriteCore', entityculling: 'Entity Culling', immediatelyfast: 'ImmediatelyFast', 'dynamic-fps': 'Dynamic FPS' }
      changes.push({ id: 'mods', group: 'mods', title: t('Instalar mods de rendimiento ({n})', { n: missing.length }), hint: missing.map(s => pretty[s] || s).join(', '), value: missing })
    }
  } else {
    changes.push({ id: 'fabric', group: 'info', title: t('Este perfil es Vanilla'), hint: t('Con Fabric se pueden instalar Sodium y otros mods que suben mucho los FPS. Edita el perfil y cámbialo a Fabric.'), disabled: true })
  }
  return { pc, mods, changes }
}

// Aplica los cambios elegidos (ids de plan().changes)
async function apply (profileId, ids, onProgress = () => {}) {
  const { changes } = await plan(profileId)
  const chosen = changes.filter(c => ids.includes(c.id) && !c.disabled)
  const done = []
  const profile = profiles.list().find(p => p.id === profileId)
  for (const c of chosen) {
    if (c.id === 'ram') {
      profiles.update(profileId, { ram: { max: c.value, min: Math.min(1024, c.value) } })
      done.push(c.title)
    } else if (c.id === 'jvm') {
      profiles.update(profileId, { jvmArgs: [profile.jvmArgs, c.value].filter(Boolean).join(' ').trim() })
      done.push(c.title)
    } else if (c.id === 'video') {
      const file = path.join(paths.instance(profileId), 'options.txt')
      let lines = []
      try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch {}
      for (const o of c.value) {
        const i = lines.findIndex(l => l.startsWith(o.key + ':'))
        if (i >= 0) lines[i] = `${o.key}:${o.value}`
        else lines.splice(Math.max(0, lines.length - (lines[lines.length - 1] === '' ? 1 : 0)), 0, `${o.key}:${o.value}`)
      }
      if (lines[lines.length - 1] !== '') lines.push('')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, lines.join('\n'))
      done.push(c.title)
    } else if (c.id === 'mods') {
      const builtins = require('./builtins')
      const r = await builtins.apply(profiles.list().find(p => p.id === profileId), c.value, onProgress)
      done.push(t('{n} mods de rendimiento instalados', { n: r.installed.length }))
    }
  }
  return { done }
}

module.exports = { plan, apply, machine }
