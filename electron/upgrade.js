// "Actualizar un perfil": crea una copia de un perfil para otra versión de Minecraft.
// Se copian los ajustes del juego (options.txt: teclas, sensibilidad, FOV…), la configuración de los mods,
// texturas, shaders, servidores y la foto; los mods se descargan en su versión para la nueva versión.
// Las horas empiezan en cero (es otra versión). El perfil original no se toca.
const fs = require('fs')
const path = require('path')
const paths = require('./paths')
const profiles = require('./profiles')
const modrinth = require('./modrinth')
const versions = require('./versions')
const resolver = require('./resolver')
const ghostclient = require('./ghostclient')
const { copyEntries } = require('./copytree')
const { t } = require('./i18n')

// No se copian: los mods (se descargan de nuevo), cachés, registros y datos internos del launcher
const SKIP = new Set(['mods', 'logs', 'crash-reports', '.fabric', '.cache', 'downloads', 'debug', '.mixin.out', 'natives',
  '.voxy', 'Distant_Horizons_server_data', '.ghost-content.json', '.ghost-icon.png'])
// Lo pesado, solo si se pide
const HEAVY = new Set(['saves', 'flashback', 'replay_recordings', 'backups', 'screenshots'])

async function pool (items, size, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

// Desactiva en el perfil nuevo un mod que estaba desactivado en el original
function keepDisabled (profileId, projectId) {
  const item = modrinth.list(profileId).find(i => i.projectId === projectId)
  if (item && item.enabled) modrinth.toggle(profileId, item.type, item.file, false)
}

async function upgrade (sourceId, { version, name, copySaves } = {}, onProgress = () => {}) {
  const src = profiles.list().find(p => p.id === sourceId)
  if (!src) throw new Error(t('No encuentro el perfil a actualizar'))
  if (!version) throw new Error(t('Elige la versión nueva'))
  if (version === src.version) throw new Error(t('El perfil ya está en esa versión'))
  if (src.loader === 'fabric' && !(await versions.fabricGameVersions()).includes(version)) {
    throw new Error(t('Fabric todavía no está disponible para {version}', { version: version }))
  }

  const profile = profiles.create({
    name: name || `${src.name} ${version}`,
    version,
    loader: src.loader,
    color: src.color,
    ram: src.ram,
    jvmArgs: src.jvmArgs,
    resolution: src.resolution,
    source: { type: 'upgrade', from: src.id, fromVersion: src.version },
    importing: true
  })
  const from = paths.instance(src.id)
  const dest = paths.instance(profile.id)

  try {
    // 1) Ajustes del juego, configuración de mods, texturas, shaders, servidores… (en segundo plano)
    const entries = fs.existsSync(from)
      ? fs.readdirSync(from).filter(e => !SKIP.has(e) && (copySaves || !HEAVY.has(e)))
      : []
    await copyEntries(from, dest, entries, onProgress, t('Copiando ajustes y configuración'))
    if (src.hasIcon && fs.existsSync(path.join(from, '.ghost-icon.png'))) {
      fs.copyFileSync(path.join(from, '.ghost-icon.png'), path.join(dest, '.ghost-icon.png'))
      profiles.update(profile.id, { hasIcon: true })
    }

    // 2) Mods: cada uno en su versión para la versión nueva
    const target = profiles.list().find(p => p.id === profile.id)
    const mods = modrinth.list(src.id).filter(i => i.type === 'mod')
    const updated = []
    const missing = []
    const manual = mods.filter(i => !i.projectId).map(i => i.title)

    const ghost = mods.find(i => i.projectId === ghostclient.PROJECT_ID)
    if (ghost) {
      try {
        ghostclient.install(target)
        if (!ghost.enabled) keepDisabled(profile.id, ghostclient.PROJECT_ID)
        updated.push('ghost client')
      } catch { missing.push('ghost client') }
    }

    const fromModrinth = mods.filter(i => i.projectId && i.projectId !== ghostclient.PROJECT_ID)
    const seen = new Set()
    let done = 0
    // Fabric API primero (casi todos la necesitan)
    await modrinth.install(target, 'fabric-api', 'mod', () => {}, seen, { skipIfInstalled: true }).catch(() => {})
    await pool(fromModrinth, 4, async (it) => {
      try {
        await modrinth.install(target, it.projectId, 'mod', () => {}, seen, { skipIfInstalled: true })
        if (!it.enabled) keepDisabled(profile.id, it.projectId)
        updated.push(it.title)
      } catch {
        missing.push(it.title)
      }
      onProgress({ stage: t('Actualizando mods a {version} ({x}/{length})', { version: version, x: ++done, length: fromModrinth.length }), current: done, total: fromModrinth.length })
    })

    // 3) Texturas y shaders copiados: se reconocen en Modrinth para ver su nombre e icono
    onProgress({ stage: t('Reconociendo texturas y shaders'), current: 0, total: 0 })
    await modrinth.identify(profile.id).catch(() => {})

    // 4) Compatibilidad entre los mods de la versión nueva
    onProgress({ stage: t('Comprobando compatibilidad entre mods'), current: 0, total: 0 })
    const check = await resolver.resolve(target, onProgress).catch(() => ({ changes: [] }))

    profiles.update(profile.id, { importing: false })
    return {
      profile: profiles.list().find(p => p.id === profile.id),
      updated: updated.sort((a, b) => a.localeCompare(b)),
      missing: missing.sort((a, b) => a.localeCompare(b)),
      manual,
      adjusted: check.changes || []
    }
  } catch (e) {
    profiles.remove(profile.id, true)
    throw e
  }
}

module.exports = { upgrade }
