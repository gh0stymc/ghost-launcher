// Galería de capturas: las de la carpeta screenshots de cada perfil.
// Las imágenes llegan a la interfaz por el protocolo ghost-shot:// (con miniaturas guardadas en caché).
const fs = require('fs')
const path = require('path')
const { protocol, net, nativeImage, shell, clipboard } = require('electron')
const { pathToFileURL } = require('url')
const paths = require('./paths')
const profiles = require('./profiles')
const { t } = require('./i18n')

const EXT = /\.(png|jpe?g|webp)$/i
const ID = /^[\w-]+$/

// Se llama antes de que la app esté lista
function registerScheme () {
  protocol.registerSchemesAsPrivileged([{ scheme: 'ghost-shot', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
}

function fileOf (profileId, name) {
  if (!ID.test(profileId || '') || !EXT.test(name || '') || path.basename(name) !== name) throw new Error(t('Captura no válida'))
  if (!profiles.list().some(p => p.id === profileId)) throw new Error(t('Perfil no encontrado'))
  return path.join(paths.instance(profileId), 'screenshots', name)
}

// Miniatura de 480 px de ancho (se guarda para no volver a hacerla)
function thumbOf (profileId, name, file) {
  const stat = fs.statSync(file)
  const dir = path.join(paths.base(), 'cache', 'thumbs', profileId)
  const out = path.join(dir, `${name}.${Math.floor(stat.mtimeMs)}.jpg`)
  if (fs.existsSync(out)) return out
  const img = nativeImage.createFromPath(file)
  if (img.isEmpty()) return file
  const { width } = img.getSize()
  const small = width > 480 ? img.resize({ width: 480, quality: 'good' }) : img
  fs.mkdirSync(dir, { recursive: true })
  // Se borran miniaturas viejas de la misma captura
  for (const f of fs.readdirSync(dir)) if (f.startsWith(name + '.') && f !== path.basename(out)) fs.rmSync(path.join(dir, f), { force: true })
  fs.writeFileSync(out, small.toJPEG(82))
  return out
}

function registerHandler () {
  // ghost-shot://img/<perfil>/<archivo>[?thumb=1]
  protocol.handle('ghost-shot', async (req) => {
    try {
      const url = new URL(req.url)
      const [profileId, name] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const file = fileOf(profileId, name)
      const target = url.searchParams.get('thumb') ? thumbOf(profileId, name, file) : file
      return net.fetch(pathToFileURL(target).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

function list () {
  const out = []
  for (const p of profiles.list()) {
    const dir = path.join(paths.instance(p.id), 'screenshots')
    let files = []
    try { files = fs.readdirSync(dir) } catch { continue }
    for (const name of files) {
      if (!EXT.test(name)) continue
      try {
        const st = fs.statSync(path.join(dir, name))
        out.push({ profileId: p.id, profileName: p.name, name, size: st.size, time: st.mtimeMs })
      } catch {}
    }
  }
  return out.sort((a, b) => b.time - a.time)
}

module.exports = {
  registerScheme,
  registerHandler,
  list,
  open: (profileId, name) => shell.openPath(fileOf(profileId, name)),
  show: (profileId, name) => shell.showItemInFolder(fileOf(profileId, name)),
  copy: (profileId, name) => {
    const img = nativeImage.createFromPath(fileOf(profileId, name))
    if (img.isEmpty()) throw new Error(t('No se pudo leer la imagen'))
    clipboard.writeImage(img)
  },
  remove: (profileId, name) => shell.trashItem(fileOf(profileId, name))
}
