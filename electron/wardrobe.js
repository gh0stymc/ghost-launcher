// Vestidor: skins guardadas en el launcher para ir cambiando entre ellas.
// "Ponerse" una skin la sube a la cuenta de Minecraft (API oficial de Mojang), así se ve en todos los servidores.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const paths = require('./paths')
const auth = require('./auth')

const API = 'https://api.minecraftservices.com/minecraft/profile'
const dir = () => paths.data('wardrobe')
const indexFile = () => path.join(dir(), 'skins.json')

function readIndex () {
  try { return JSON.parse(fs.readFileSync(indexFile(), 'utf8')) } catch { return { skins: [] } }
}
function writeIndex (idx) {
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(indexFile(), JSON.stringify(idx, null, 2))
}

const dataUrl = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64')

// Una skin válida es un PNG de 64x64 (o 64x32, el formato antiguo)
function checkPng (buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('La skin tiene que ser una imagen PNG')
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(`La skin tiene que medir 64x64 píxeles (esta mide ${w}x${h})`)
}

// Detecta si una skin es de brazos finos (Alex): el píxel del hombro derecho (54,20) es transparente
function guessVariant (buf) {
  try {
    const { nativeImage } = require('electron')
    const img = nativeImage.createFromBuffer(buf)
    const bmp = img.toBitmap() // BGRA
    const { width } = img.getSize()
    return bmp[(20 * width + 54) * 4 + 3] === 0 ? 'slim' : 'classic'
  } catch { return 'classic' }
}

function addBuffer (buf, name, variant, source = null) {
  checkPng(buf)
  const hash = crypto.createHash('sha1').update(buf).digest('hex')
  const idx = readIndex()
  const existing = idx.skins.find(s => s.hash === hash)
  if (existing) return { ...existing, duplicate: true }
  const skin = {
    id: hash.slice(0, 12),
    hash,
    name: (name || 'Skin').slice(0, 40),
    variant: variant || guessVariant(buf),
    cape: null,
    added: Date.now(),
    source
  }
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(path.join(dir(), skin.id + '.png'), buf)
  idx.skins.unshift(skin)
  writeIndex(idx)
  return skin
}

async function download (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar la skin (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

async function api (method, url, body, headers = {}) {
  const { token } = await auth.minecraftToken()
  const res = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) {
    if (res.status === 429) throw new Error('Mojang dice que has cambiado de skin demasiadas veces seguidas. Espera un minuto.')
    if (res.status === 401) throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.')
    throw new Error(json?.errorMessage || json?.error || `Mojang respondió ${res.status}`)
  }
  return json
}

// ---------- Lo que usa la interfaz ----------

function list () {
  const idx = readIndex()
  return {
    skins: idx.skins
      .filter(s => fs.existsSync(path.join(dir(), s.id + '.png')))
      .map(s => ({ ...s, image: dataUrl(path.join(dir(), s.id + '.png')) })),
    active: idx.active || null
  }
}

function addFile (file, name) {
  const buf = fs.readFileSync(file)
  return addBuffer(buf, name || path.basename(file, path.extname(file)))
}

// Copia la skin de cualquier jugador por su nombre
async function addFromPlayer (username) {
  const name = String(username || '').trim()
  if (!/^\w{2,16}$/.test(name)) throw new Error('Escribe un nombre de jugador válido')
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)
  if (res.status === 404 || res.status === 204) throw new Error(`No existe ningún jugador llamado ${name}`)
  if (!res.ok) throw new Error(`No se pudo buscar a ${name} (${res.status})`)
  const { id, name: realName } = await res.json()
  const prof = await (await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`)).json()
  const textures = JSON.parse(Buffer.from(prof.properties.find(p => p.name === 'textures').value, 'base64').toString())
  const skin = textures.textures?.SKIN
  if (!skin) throw new Error(`${realName} usa la skin por defecto`)
  return addBuffer(await download(skin.url), realName, skin.metadata?.model === 'slim' ? 'slim' : 'classic', realName)
}

// La skin y las capas de tu cuenta ahora mismo
async function account () {
  const prof = await api('GET', API)
  const skin = (prof.skins || []).find(s => s.state === 'ACTIVE')
  return {
    name: prof.name,
    skin: skin ? { url: skin.url, variant: skin.variant === 'SLIM' ? 'slim' : 'classic' } : null,
    capes: (prof.capes || []).map(c => ({ id: c.id, alias: c.alias, url: c.url, active: c.state === 'ACTIVE' }))
  }
}

async function capeImage (url) {
  return 'data:image/png;base64,' + (await download(url)).toString('base64')
}

// Guarda en el vestidor la skin que llevas puesta
async function addCurrent () {
  const acc = await account()
  if (!acc.skin) throw new Error('Tu cuenta usa una skin por defecto')
  const skin = addBuffer(await download(acc.skin.url), `${acc.name} (actual)`, acc.skin.variant)
  const idx = readIndex()
  idx.active = skin.id
  writeIndex(idx)
  return skin
}

function update (id, changes) {
  const idx = readIndex()
  const skin = idx.skins.find(s => s.id === id)
  if (!skin) throw new Error('Esa skin ya no está en el vestidor')
  if (changes.name !== undefined) skin.name = String(changes.name).trim().slice(0, 40) || skin.name
  if (changes.variant === 'slim' || changes.variant === 'classic') skin.variant = changes.variant
  if (changes.cape !== undefined) skin.cape = changes.cape || null
  writeIndex(idx)
  return skin
}

function remove (id) {
  const idx = readIndex()
  idx.skins = idx.skins.filter(s => s.id !== id)
  if (idx.active === id) idx.active = null
  writeIndex(idx)
  fs.rmSync(path.join(dir(), id + '.png'), { force: true })
  return list()
}

// Se pone la skin (y su capa, si tiene una elegida) en la cuenta de Minecraft
async function apply (id) {
  const idx = readIndex()
  const skin = idx.skins.find(s => s.id === id)
  if (!skin) throw new Error('Esa skin ya no está en el vestidor')
  const form = new FormData()
  form.append('variant', skin.variant)
  form.append('file', new Blob([fs.readFileSync(path.join(dir(), id + '.png'))], { type: 'image/png' }), 'skin.png')
  await api('POST', `${API}/skins`, form)
  if (skin.cape === 'none') await api('DELETE', `${API}/capes/active`)
  else if (skin.cape) {
    await api('PUT', `${API}/capes/active`, JSON.stringify({ capeId: skin.cape }), { 'Content-Type': 'application/json' })
  }
  idx.active = id
  writeIndex(idx)
  return { active: id }
}

module.exports = { list, addFile, addFromPlayer, addCurrent, account, capeImage, update, remove, apply }
