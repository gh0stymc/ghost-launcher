const fs = require('fs')
const path = require('path')
const { nativeImage } = require('electron')
const store = require('./store')
const paths = require('./paths')

const COLORS = ['#7c5cff', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#eab308']
const iconFile = (id) => path.join(paths.instance(id), '.ghost-icon.png')

// La foto se manda a la interfaz como data URL (son imágenes pequeñas)
function iconUrl (id) {
  try { return 'data:image/png;base64,' + fs.readFileSync(iconFile(id)).toString('base64') } catch { return null }
}

function list () {
  return store.get().profiles.map(p => ({ ...p, iconUrl: p.hasIcon ? iconUrl(p.id) : null }))
}

const raw = (id) => store.get().profiles.find(p => p.id === id)

function create (data) {
  const profile = {
    id: store.newId(),
    name: data.name || `Minecraft ${data.version}`,
    version: data.version,
    loader: data.loader || 'vanilla',
    loaderVersion: data.loaderVersion || null,
    // null = usar la RAM de los ajustes generales
    ram: data.ram || null,
    jvmArgs: data.jvmArgs || '',
    resolution: data.resolution || null,
    color: data.color || COLORS[store.get().profiles.length % COLORS.length],
    hasIcon: false,
    source: data.source || null,
    // true mientras se importa: si el launcher se cierra a medias, se limpia al volver a abrirlo
    importing: !!data.importing,
    created: Date.now(),
    lastPlayed: null
  }
  store.update(s => { s.profiles.push(profile) })
  fs.mkdirSync(paths.instance(profile.id), { recursive: true })
  return profile
}

function update (id, changes) {
  let result = null
  store.update(s => {
    const p = s.profiles.find(x => x.id === id)
    if (!p) return
    // Si cambia la versión o el loader, hay que volver a resolver la versión de Fabric
    if (changes.version !== undefined && changes.version !== p.version) changes.loaderVersion = null
    if (changes.loader !== undefined && changes.loader !== p.loader) changes.loaderVersion = null
    delete changes.iconUrl
    Object.assign(p, changes, { id })
    result = p
  })
  return result
}

function remove (id, deleteFiles) {
  store.update(s => { s.profiles = s.profiles.filter(p => p.id !== id) })
  if (deleteFiles) fs.rmSync(paths.instance(id), { recursive: true, force: true })
}

// Convierte cualquier imagen (archivo o bytes) en un cuadrado de 256 px
function toSquarePng (image) {
  if (image.isEmpty()) throw new Error('No se pudo leer la imagen (usa PNG o JPG)')
  const { width, height } = image.getSize()
  const side = Math.min(width, height)
  const cropped = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
  return cropped.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
}

function preview (file) {
  return 'data:image/png;base64,' + toSquarePng(nativeImage.createFromPath(file)).toString('base64')
}

// source: ruta de archivo, Buffer, o null para quitar la foto
function setIcon (id, source) {
  if (!raw(id)) throw new Error('Perfil no encontrado')
  if (!source) {
    fs.rmSync(iconFile(id), { force: true })
    update(id, { hasIcon: false })
    return null
  }
  const image = Buffer.isBuffer(source) ? nativeImage.createFromBuffer(source) : nativeImage.createFromPath(source)
  fs.mkdirSync(paths.instance(id), { recursive: true })
  fs.writeFileSync(iconFile(id), toSquarePng(image))
  update(id, { hasIcon: true })
  return iconUrl(id)
}

module.exports = { list, create, update, remove, setIcon, preview, raw }
