// Conexión del launcher con el servidor de ghost client (el mismo que usa el juego para amigos, chat y cosméticos).
// Aquí solo se usan los cosméticos: ver cuáles llevas y ponerte otro desde el Vestidor del launcher.
//
// La identidad se demuestra con el certificado de jugador de Mojang (ver login). Sin contraseñas.
const crypto = require('crypto')
const auth = require('./auth')
const { t } = require('./i18n')

// Dirección del servidor. Se puede cambiar con la variable GHOST_SERVER (p. ej. para pruebas en local).
const SERVER = (process.env.GHOST_SERVER || 'https://ghost-server.gh0styclient.workers.dev').replace(/\/+$/, '')

// Sesión del servidor por cuenta (dura 30 días; se renueva sola si caduca)
const sessions = new Map()

async function request (pathname, options = {}) {
  let res
  try {
    res = await fetch(SERVER + pathname, { ...options, signal: AbortSignal.timeout(15000) })
  } catch {
    throw new Error(t('No se puede conectar con el servidor de ghost client'))
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

async function login () {
  // Solo para pruebas con el servidor en local (DEV_FAKE_AUTH): GHOST_DEV_USER=Nombre:uuid
  if (process.env.GHOST_DEV_USER && /^http:\/\/(127\.0\.0\.1|localhost)/.test(SERVER)) {
    const [username, devUuid] = process.env.GHOST_DEV_USER.split(':')
    const r = await request('/v1/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, serverId: 'dev', devUuid }) })
    return r.token
  }
  const mc = await auth.minecraftToken()
  const uuid = mc.uuid.replace(/-/g, '')
  const cached = sessions.get(uuid)
  if (cached) return cached
  // Certificado de jugador de Mojang (la clave con la que Minecraft firma el chat). Con su clave privada firmamos
  // un mensaje y el servidor comprueba que Mojang firmó esa clave para esta cuenta. El token no sale del PC.
  const res = await fetch('https://api.minecraftservices.com/player/certificates', {
    method: 'POST',
    headers: { authorization: `Bearer ${mc.token}` },
    signal: AbortSignal.timeout(15000)
  }).catch(() => null)
  if (!res || !res.ok) throw new Error(t('Mojang no ha aceptado la sesión. Vuelve a iniciar sesión con tu cuenta.'))
  const cert = await res.json()
  const der = (pem) => pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(der(cert.keyPair.privateKey), 'base64'), format: 'der', type: 'pkcs8' })
  const timestamp = Date.now()
  const r = await request('/v1/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: mc.name,
      uuid,
      publicKey: der(cert.keyPair.publicKey),
      expiresAt: Date.parse(cert.expiresAt),
      keySignature: cert.publicKeySignatureV2,
      timestamp,
      signature: crypto.sign('sha256', Buffer.from(`ghostclient:auth:${uuid}:${timestamp}`), privateKey).toString('base64')
    })
  })
  sessions.set(uuid, r.token)
  return r.token
}

// Llama al servidor con la sesión; si ha caducado, inicia sesión otra vez
async function withSession (fn) {
  try {
    return await fn(await login())
  } catch (e) {
    if (e.status !== 401) throw e
    sessions.clear()
    return fn(await login())
  }
}

// Cosméticos que llevas y los que hay
function me () {
  return withSession(token => request('/v1/me', { headers: { authorization: `Bearer ${token}` } }))
}

// Ponerte un cosmético en un hueco (cape, pet, hat, back, aura) o quitártelo con null
function equip (slot, id) {
  return withSession(token => request('/v1/me', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ slot, id: id || null })
  }))
}

// Sesión para la conexión en tiempo real (amigos en el launcher)
const token = () => login()
const forget = () => sessions.clear()

// Horas jugadas en total (desbloquean cosméticos)
function setHours (hours) {
  return withSession(token => request('/v1/me', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ hours })
  }))
}

module.exports = { SERVER, me, equip, token, forget, setHours }
