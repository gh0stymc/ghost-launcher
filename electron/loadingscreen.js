// Pantalla de carga de ghost client (la que sustituye a la roja de Mojang).
// - "ghost": la animación 3D del launcher (resources/loading-screen)
// - "custom": imágenes, GIF o vídeo del usuario, convertidos a fotogramas en la carpeta de datos
// - "classic": la de Minecraft de siempre
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const paths = require('./paths')

const defaultDir = () => app.isPackaged
  ? path.join(process.resourcesPath, 'loading-screen')
  : path.join(__dirname, '..', 'resources', 'loading-screen')
const customDir = () => paths.data('loading-screen')
const tmpDir = () => paths.data('loading-screen.tmp')

function info () {
  try {
    const i = JSON.parse(fs.readFileSync(path.join(customDir(), 'info.json'), 'utf8'))
    const first = path.join(customDir(), i.files?.[0] || '')
    return { ...i, preview: fs.existsSync(first) ? 'data:image/jpeg;base64,' + fs.readFileSync(first).toString('base64') : null }
  } catch { return null }
}

// La interfaz convierte el archivo en fotogramas y los manda uno a uno
function begin () {
  fs.rmSync(tmpDir(), { recursive: true, force: true })
  fs.mkdirSync(tmpDir(), { recursive: true })
}
function frame (i, dataUrl) {
  const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'
  fs.writeFileSync(path.join(tmpDir(), `frame_${String(i).padStart(4, '0')}.${ext}`), Buffer.from(dataUrl.split(',')[1], 'base64'))
}
function finish (meta) {
  const files = fs.readdirSync(tmpDir()).filter(f => f.startsWith('frame_')).sort()
  if (!files.length) throw new Error('No se pudo sacar ninguna imagen del archivo')
  fs.writeFileSync(path.join(tmpDir(), 'info.json'), JSON.stringify({ ...meta, frames: files.length, files, loop: true, created: Date.now() }, null, 2))
  fs.rmSync(customDir(), { recursive: true, force: true })
  fs.renameSync(tmpDir(), customDir())
  return info()
}
function clear () {
  fs.rmSync(customDir(), { recursive: true, force: true })
  return null
}

function jvmArgs (settings) {
  const mode = ['ghost', 'custom', 'classic'].includes(settings.loadingScreen) ? settings.loadingScreen : 'ghost'
  return [
    `-Dghostclient.loading.mode=${mode}`,
    `-Dghostclient.loading.default=${defaultDir()}`,
    `-Dghostclient.loading.custom=${customDir()}`
  ]
}

module.exports = { info, begin, frame, finish, clear, jvmArgs }
