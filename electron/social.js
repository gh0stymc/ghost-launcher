// Amigos de ghost client dentro del launcher: la misma conexión en tiempo real que usa el juego.
// Sirve para ver qué hacen tus amigos, unirte a su servidor con un clic y recibir avisos en el escritorio
// (amigo conectado, mensaje, solicitud o invitación) aunque no tengas el juego abierto.
const ghostserver = require('./ghostserver')
const store = require('./store')
const { t } = require('./i18n')

let send = () => {}
let notify = () => {}
let ws = null
let state = 'offline' // offline | connecting | online | no_account | unreachable
let me = null
let friends = new Map()
let incoming = []
let outgoing = []
let invite = null
let retryTimer = null
let pingTimer = null
let retryDelay = 5000
let account = null // uuid de la cuenta con la que se conectó
let stopped = false

const snapshot = () => ({
  state,
  me,
  friends: [...friends.values()].sort((a, b) => (b.online - a.online) || (a.name || '').localeCompare(b.name || '')),
  incoming,
  outgoing,
  invite: invite && Date.now() - invite.ts < 120000 ? invite : null
})
const changed = () => send('social:update', snapshot())

function setState (s) {
  if (state === s) return
  state = s
  changed()
}

function init (sendFn, notifyFn) {
  send = sendFn
  notify = notifyFn
  connectLater(1500)
}

function connectLater (ms) {
  clearTimeout(retryTimer)
  if (!stopped) retryTimer = setTimeout(connect, ms)
}

async function connect () {
  if (ws) return
  const active = require('./auth').activeAccount?.()
  if (!active) { setState('no_account'); return connectLater(30000) }
  setState('connecting')
  let token
  try {
    token = await ghostserver.token()
  } catch (e) {
    setState(e.status === 401 || /Mojang/.test(e.message) ? 'no_account' : 'unreachable')
    connectLater(retryDelay)
    retryDelay = Math.min(retryDelay * 2, 120000)
    return
  }
  account = active.uuid
  const url = ghostserver.SERVER.replace(/^http/, 'ws') + '/v1/ws?token=' + encodeURIComponent(token)
  const socket = new WebSocket(url)
  ws = socket
  socket.onmessage = (e) => {
    try { handle(JSON.parse(e.data)) } catch (err) { console.error('[social]', err) }
  }
  socket.onclose = (e) => {
    if (ws !== socket) return
    ws = null
    clearInterval(pingTimer)
    for (const f of friends.values()) f.online = false
    setState('unreachable')
    // Sesión caducada: se pide otra
    if (e.code === 1008 || e.code === 4001) ghostserver.forget()
    connectLater(retryDelay)
    retryDelay = Math.min(retryDelay * 2, 120000)
  }
  socket.onerror = () => {}
}

function sendMsg (m) {
  if (ws && ws.readyState === 1 && state === 'online') {
    ws.send(JSON.stringify(m))
    return true
  }
  return false
}

const gameRunning = () => require('./launch').runningIds().length > 0
// Avisos de escritorio: solo si el juego no está abierto (el juego ya enseña los suyos)
function alert (kind, title, body) {
  send('social:event', { kind, title, body })
  if (!gameRunning()) notify(title, body)
}

function updateFriend (o, announce) {
  const f = friends.get(o.uuid) || { uuid: o.uuid, unread: 0 }
  const was = f.online
  if (o.name !== undefined) f.name = o.name
  if (o.online !== undefined) f.online = o.online
  if (o.lastSeen !== undefined) f.lastSeen = o.lastSeen
  if (o.unread !== undefined) f.unread = o.unread
  if ('status' in o) {
    f.activity = o.status?.activity || null
    f.server = o.status?.server || null
  }
  friends.set(o.uuid, f)
  if (announce && !was && f.online && store.get().settings.friendNotifications !== false) {
    alert('online', t('{name} se ha conectado', { name: f.name }), t('Tu amigo está usando ghost client'))
  }
  return f
}

function handle (m) {
  switch (m.t) {
    case 'welcome':
      me = { uuid: m.me.uuid, name: m.me.name, hours: m.me.hours || 0 }
      friends = new Map()
      for (const f of m.friends) updateFriend(f, false)
      incoming = m.incoming
      outgoing = m.outgoing
      retryDelay = 5000
      state = 'online'
      sendMsg({ t: 'status', activity: 'launcher' })
      clearInterval(pingTimer)
      pingTimer = setInterval(() => sendMsg({ t: 'ping' }), 25000)
      syncHours()
      break
    case 'presence': updateFriend(m, true); break
    case 'friend_request':
      incoming = [...incoming.filter(u => u.uuid !== m.user.uuid), m.user]
      alert('request', t('Solicitud de amistad'), t('{name} quiere ser tu amigo', { name: m.user.name }))
      break
    case 'request_sent':
      outgoing = [...outgoing.filter(u => u.uuid !== m.user.uuid), m.user]
      send('social:event', { kind: 'info', title: t('Solicitud enviada a {name}', { name: m.user.name }) })
      break
    case 'request_removed':
      incoming = incoming.filter(u => u.uuid !== m.uuid)
      outgoing = outgoing.filter(u => u.uuid !== m.uuid)
      break
    case 'friend_added': {
      const f = updateFriend(m.friend, false)
      incoming = incoming.filter(u => u.uuid !== f.uuid)
      outgoing = outgoing.filter(u => u.uuid !== f.uuid)
      alert('added', t('Nuevo amigo'), t('{name} y tú ya sois amigos', { name: f.name }))
      break
    }
    case 'friend_removed': friends.delete(m.uuid); break
    case 'chat': {
      if (me && m.msg.from !== me.uuid) {
        const f = friends.get(m.msg.from)
        if (f) {
          f.unread = (f.unread || 0) + 1
          if (store.get().settings.friendNotifications !== false) alert('message', t('Mensaje de {name}', { name: f.name }), m.msg.text)
        }
      }
      break
    }
    case 'invite':
      invite = { from: m.from, server: m.server, ts: Date.now() }
      alert('invite', t('{name} te invita a jugar', { name: m.from.name }), t('Únete a {server} desde Amigos', { server: m.server }))
      break
    case 'hours': if (me) me.hours = m.hours; break
    case 'error':
      if (m.ref !== 'status') send('social:event', { kind: 'error', title: errorText(m.code, m.name) })
      break
  }
  changed()
}

function errorText (code, name) {
  return {
    not_ghost_user: t('{name} no usa ghost client', { name }),
    already_friends: t('Ya eres amigo de {name}', { name }),
    already_sent: t('Ya le enviaste una solicitud a {name}', { name }),
    self: t('No puedes añadirte a ti mismo'),
    bad_name: t('Ese nombre no es válido'),
    too_many_requests: t('Tienes demasiadas solicitudes pendientes'),
    too_many_friends: t('Has llegado al máximo de amigos'),
    rate_limited: t('Vas demasiado rápido, espera un momento'),
    locked: t('Aún no has desbloqueado ese cosmético')
  }[code] || t('No se pudo hacer ({code})', { code })
}

// Horas jugadas (todos los perfiles) → servidor: desbloquean cosméticos
async function syncHours () {
  const total = store.get().profiles.reduce((s, p) => s + (p.playTime || 0), 0) / 3600
  if (!me || Math.floor(total) === me.hours) return
  try {
    const r = await ghostserver.setHours(total)
    me.hours = r.hours
    changed()
  } catch (e) { console.error('[social] horas', e.message) }
}

// La cuenta activa cambió (o se cerró sesión): conexión nueva
function restart () {
  const active = require('./auth').activeAccount?.()
  if (active && active.uuid === account && ws) return
  if (ws) { const s = ws; ws = null; try { s.close() } catch {} }
  me = null
  friends = new Map()
  incoming = []
  outgoing = []
  invite = null
  retryDelay = 5000
  setState('offline')
  connectLater(300)
}

function stop () {
  stopped = true
  clearTimeout(retryTimer)
  if (ws) try { ws.close() } catch {}
}

module.exports = {
  init,
  restart,
  stop,
  syncHours,
  get: snapshot,
  reconnect: () => { retryDelay = 5000; if (!ws) connectLater(0) },
  add: (name) => sendMsg({ t: 'friend_add', name: String(name || '').trim() }) || Promise.reject(new Error(t('Sin conexión con el servidor de ghost client'))),
  accept: (uuid) => sendMsg({ t: 'friend_accept', uuid }),
  decline: (uuid) => sendMsg({ t: 'friend_decline', uuid }),
  cancel: (uuid) => sendMsg({ t: 'friend_cancel', uuid }),
  remove: (uuid) => sendMsg({ t: 'friend_remove', uuid }),
  clearInvite: () => { invite = null; changed() },
  markRead: (uuid) => { const f = friends.get(uuid); if (f) f.unread = 0; sendMsg({ t: 'chat_read', with: uuid }); changed() }
}
