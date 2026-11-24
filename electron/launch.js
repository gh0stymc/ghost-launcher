const fs = require('fs')
const { Client } = require('minecraft-launcher-core')
const store = require('./store')
const paths = require('./paths')
const auth = require('./auth')
const java = require('./java')
const versions = require('./versions')
const profiles = require('./profiles')
const { t } = require('./i18n')

const running = new Map() // id de perfil -> proceso del juego
const stopped = new Set() // perfiles que el usuario cerró desde el launcher

// Líneas del registro que indican que el juego ya terminó de cargar
const LOADED = /Sound engine started|Created: \d+x\d+x\d+ minecraft:textures\/atlas/

// Divide los argumentos de Java respetando comillas
const splitArgs = (s) => (s.match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"|"$/g, ''))

// server: entrar directamente en ese servidor al abrir el juego (unirse a un amigo)
async function launch (profileId, emit, { retry = 0, server = null } = {}) {
  if (running.has(profileId)) throw new Error(t('Este perfil ya está abierto'))
  const profile = profiles.list().find(p => p.id === profileId)
  if (!profile) throw new Error(t('Perfil no encontrado'))
  const { settings } = store.get()

  emit('progress', { stage: t('Iniciando sesión'), current: 0, total: 0 })
  const authorization = await auth.authorization()

  emit('progress', { stage: t('Preparando versión'), current: 0, total: 0 })
  const major = await versions.requiredJava(profile.version)
  const javaPath = await java.ensureJava(major, p => emit('progress', p))

  const version = { number: profile.version, type: 'release' }
  if (profile.loader === 'fabric') {
    const fabric = await versions.ensureFabric(profile.version, profile.loaderVersion, p => emit('progress', p))
    version.custom = fabric.id
    if (!profile.loaderVersion) profiles.update(profile.id, { loaderVersion: fabric.loader })
  }

  // ghost client siempre en la última versión que trae el launcher
  try { require('./ghostclient').updateIfInstalled(profile) } catch (e) { emit('log', `[Ghost Launcher] No se pudo actualizar ghost client: ${e.message}\n`) }

  const ram = profile.ram || { max: settings.maxRam, min: settings.minRam }
  const gameDir = paths.instance(profile.id)
  fs.mkdirSync(gameDir, { recursive: true })

  // El juego (Minecraft, ghost client y los mods integrados) en el idioma del launcher
  try { require('./options').setLanguage(profile.id, require('./i18n').minecraftLang()) } catch (e) { emit('log', `[Ghost Launcher] ${e.message}\n`) }

  const options = {
    authorization,
    root: paths.root(),
    version,
    javaPath,
    memory: { max: `${ram.max}M`, min: `${Math.min(ram.min, ram.max)}M` },
    customArgs: [
      ...splitArgs([settings.jvmArgs, profile.jvmArgs].filter(Boolean).join(' ')),
      // ghost client usa la aplicación de Discord "ghost client" del usuario para el estado de Discord
      ...(/^\d{15,22}$/.test(settings.discordAppId || '') ? [`-Dghostclient.discordAppId=${settings.discordAppId}`] : []),
      // Pantalla de carga de ghost client: animación del launcher, la personalizada del usuario o la clásica
      ...require('./loadingscreen').jvmArgs(settings),
      // Servidor de ghost client (amigos, chat y cosméticos)
      `-Dghostclient.server=${require('./ghostserver').SERVER}`
    ],
    overrides: { gameDirectory: gameDir, cwd: gameDir, maxSockets: 16 }
  }
  if (profile.resolution) options.window = profile.resolution
  if (server) options.quickPlay = { type: 'multiplayer', identifier: server }

  const client = new Client()
  client.on('progress', e => emit('progress', { stage: stageName(e.type), current: e.task, total: e.total }))
  client.on('download-status', e => {
    if (e.type === 'version-jar' || e.type === 'assets') return
    emit('progress', { stage: t('Descargando {name}', { name: e.name }), current: e.current, total: e.total })
  })
  client.on('debug', line => emit('log', line))
  let loaded = false
  const startedAt = Date.now()
  client.on('data', line => {
    if (!loaded && LOADED.test(line)) loaded = true
    emit('log', line)
  })

  emit('progress', { stage: t('Descargando archivos del juego'), current: 0, total: 0 })
  const proc = await client.launch(options)
  if (!proc) throw new Error(t('No se pudo iniciar el juego. Mira la consola para más detalles.'))

  running.set(profileId, proc)
  profiles.update(profile.id, { lastPlayed: Date.now() })
  emit('started', { profileId })

  // Contador de tiempo de juego: se guarda cada minuto (por si el launcher se cierra con el juego abierto)
  const session = { last: Date.now() }
  // Al sumar tiempo se comprueba si se ha llegado a un hito: la medalla es para este perfil
  const tick = () => {
    addPlayTime(profileId, session)
    for (const medal of require('./medals').sync(profileId)) emit('medal', medal)
    emit('playtime', { profileId })
  }
  const timer = setInterval(tick, 60 * 1000)

  proc.on('close', code => {
    clearInterval(timer)
    addPlayTime(profileId, session)
    for (const medal of require('./medals').sync(profileId)) emit('medal', medal)
    running.delete(profileId)
    const byUser = stopped.delete(profileId)
    // Java a veces se cae al cargar en algunos PCs (overlays, drivers...). Se reintenta una vez solo.
    if (code !== 0 && !loaded && !byUser && retry < 1 && Date.now() - startedAt < 5 * 60 * 1000) {
      emit('log', '\n[Ghost Launcher] El juego se cerró mientras cargaba. Volviendo a intentarlo...\n\n')
      launch(profileId, emit, { retry: retry + 1, server }).catch(e => {
        emit('log', `[Ghost Launcher] ${e.message}\n`)
        emit('closed', { profileId, code })
      })
      return
    }
    emit('closed', { profileId, code })
  })
}

// Suma al perfil los segundos jugados desde la última vez que se guardó
function addPlayTime (profileId, session) {
  const now = Date.now()
  const seconds = Math.max(0, Math.round((now - session.last) / 1000))
  session.last = now
  const p = profiles.list().find(x => x.id === profileId)
  if (!p || !seconds) return
  profiles.update(profileId, { playTime: (p.playTime || 0) + seconds })
}

function stageName (type) {
  const name = {
    assets: 'Descargando assets',
    'assets-copy': 'Copiando assets',
    natives: 'Preparando librerías nativas',
    classes: 'Descargando librerías',
    'classes-custom': 'Descargando librerías de Fabric',
    'classes-maven-custom': 'Descargando librerías de Fabric'
  }[type]
  return name ? t(name) : t('Preparando ({type})', { type })
}

function stop (profileId) {
  const proc = running.get(profileId)
  if (proc) {
    stopped.add(profileId)
    proc.kill()
  }
}

const runningIds = () => [...running.keys()]

module.exports = { launch, stop, runningIds, addPlayTime }
