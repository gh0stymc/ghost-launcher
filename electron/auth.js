// Inicio de sesión con la cuenta Microsoft (la oficial de Minecraft).
// El token de refresco se guarda cifrado con el sistema (safeStorage).
const { safeStorage } = require('electron')
const { Auth } = require('msmc')
const store = require('./store')
const { t } = require('./i18n')

const encrypt = (s) => safeStorage.isEncryptionAvailable()
  ? 'enc:' + safeStorage.encryptString(s).toString('base64')
  : 'raw:' + Buffer.from(s).toString('base64')

const decrypt = (s) => s.startsWith('enc:')
  ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'))
  : Buffer.from(s.slice(4), 'base64').toString()

const publicAccount = (a) => a && ({ uuid: a.uuid, name: a.name })

function saveAccount (xbox, mc) {
  const account = { uuid: mc.profile.id, name: mc.profile.name, token: encrypt(xbox.save()) }
  store.update(s => {
    s.accounts = s.accounts.filter(a => a.uuid !== account.uuid).concat(account)
    s.activeAccount = account.uuid
  })
  return publicAccount(account)
}

async function login () {
  const auth = new Auth('select_account')
  const xbox = await auth.launch('electron', { width: 500, height: 650, title: 'Iniciar sesión con Microsoft' })
  const mc = await xbox.getMinecraft()
  if (!mc.profile) throw new Error(t('Esta cuenta no tiene Minecraft Java comprado'))
  return saveAccount(xbox, mc)
}

// Devuelve el objeto de autorización listo para lanzar el juego
// Si se pide varias veces seguidas (por ejemplo, skin y cosméticos a la vez), la sesión se renueva una sola vez
// y se reutiliza unos minutos: renovar en paralelo con el mismo token puede hacer que una de las dos falle.
const recent = new Map() // uuid -> { at, promise }

function authorization (uuid) {
  const id = uuid || store.get().activeAccount
  const cached = recent.get(id)
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.promise
  const promise = refreshAuthorization(id)
  recent.set(id, { at: Date.now(), promise })
  promise.catch(() => recent.delete(id))
  return promise
}

async function refreshAuthorization (uuid) {
  const s = store.get()
  const account = s.accounts.find(a => a.uuid === uuid)
  if (!account) throw new Error(t('Inicia sesión antes de jugar'))
  try {
    const xbox = await new Auth('none').refresh(decrypt(account.token))
    const mc = await xbox.getMinecraft()
    saveAccount(xbox, mc)
    return mc.mclc()
  } catch (e) {
    throw new Error(t('La sesión de {name} ha caducado. Vuelve a iniciar sesión.', { name: account.name }))
  }
}

// Token de Minecraft de la cuenta activa (para cambiar la skin y la capa)
async function minecraftToken () {
  const auth = await authorization()
  return { token: auth.access_token, uuid: auth.uuid, name: auth.name }
}

function accounts () {
  const s = store.get()
  return { accounts: s.accounts.map(publicAccount), active: s.activeAccount }
}

function select (uuid) {
  store.update(s => { s.activeAccount = uuid })
  return accounts()
}

function logout (uuid) {
  recent.delete(uuid)
  store.update(s => {
    s.accounts = s.accounts.filter(a => a.uuid !== uuid)
    if (s.activeAccount === uuid) s.activeAccount = s.accounts[0]?.uuid || null
  })
  return accounts()
}

// Cuenta activa ({ uuid, name }) o null
function activeAccount () {
  const s = store.get()
  const a = s.accounts.find(x => x.uuid === s.activeAccount)
  return a ? { uuid: a.uuid, name: a.name } : null
}

module.exports = { login, authorization, minecraftToken, accounts, select, logout, activeAccount }
