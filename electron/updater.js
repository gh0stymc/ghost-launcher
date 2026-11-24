// Actualizaciones automáticas del launcher (y con él, de ghost client, que va dentro).
// Busca versiones nuevas en el servidor de ghost client (R2 de Cloudflare, ghost-server /updates), las descarga en segundo plano y se instalan al cerrar
// el launcher, o al pulsar "Reiniciar y actualizar".
const { app } = require('electron')

let send = () => {}
let status = { state: 'idle', version: app.getVersion() }
let updater = null
let timer = null

function set (changes) {
  status = { ...status, ...changes }
  send('update:status', status)
}

function init (sendFn) {
  send = sendFn
  // Solo en el launcher instalado (en desarrollo no hay nada que actualizar)
  if (!app.isPackaged || (process.env.ML_DATA && !process.env.ML_UPDATE_TEST)) return
  try {
    updater = require('electron-updater').autoUpdater
  } catch (e) {
    console.error('[updater]', e)
    return
  }
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.logger = null
  updater.on('checking-for-update', () => set({ state: 'checking' }))
  updater.on('update-not-available', () => set({ state: 'latest', checkedAt: Date.now() }))
  updater.on('update-available', info => set({ state: 'downloading', next: info.version, progress: 0 }))
  updater.on('download-progress', p => set({ state: 'downloading', progress: Math.round(p.percent) }))
  updater.on('update-downloaded', info => set({ state: 'ready', next: info.version }))
  updater.on('error', e => set({ state: 'error', error: String(e?.message || e).split('\n')[0] }))
  setTimeout(check, 8000)
  timer = setInterval(check, 4 * 60 * 60 * 1000)
}

function check () {
  if (!updater) {
    set({ state: app.isPackaged ? 'error' : 'dev', error: app.isPackaged ? 'Las actualizaciones no están disponibles' : null })
    return status
  }
  if (status.state === 'downloading' || status.state === 'ready') return status
  updater.checkForUpdates().catch(e => set({ state: 'error', error: String(e?.message || e).split('\n')[0] }))
  return status
}

// Cierra el launcher, instala la nueva versión y lo vuelve a abrir
function install () {
  if (updater && status.state === 'ready') {
    clearInterval(timer)
    setImmediate(() => updater.quitAndInstall(true, true))
  }
}

module.exports = { init, check, install, get: () => status }
