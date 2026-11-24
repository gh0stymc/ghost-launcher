import React, { useEffect, useState } from 'react'
import { call, on } from '../api.js'
import { t } from '../i18n.js'
import { Icon } from './Icon.jsx'
import logo from '../assets/logo.png'

// Las etiquetas se traducen al pintar (t), así cambian al momento con el idioma
const items = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'profiles', label: 'Perfiles', icon: 'layers' },
  { id: 'content', label: 'Mods', icon: 'puzzle' },
  { id: 'wardrobe', label: 'Vestidor', icon: 'shirt' },
  { id: 'friends', label: 'Amigos', icon: 'users' },
  { id: 'stats', label: 'Estadísticas', icon: 'chart' },
  { id: 'gallery', label: 'Capturas', icon: 'picture' },
  { id: 'console', label: 'Consola', icon: 'terminal' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' }
]

export const avatar = (uuid, size = 64) => `https://mc-heads.net/avatar/${uuid}/${size}`

export default function Sidebar ({ page, setPage, ctx }) {
  const { accounts, setAccounts, notify, running } = ctx
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = accounts.accounts.find(a => a.uuid === accounts.active)
  // Amigos conectados y avisos pendientes (solicitudes, mensajes, invitación)
  const [social, setSocial] = useState(null)
  useEffect(() => {
    call('social:get').then(setSocial).catch(() => {})
    return on('social:update', setSocial)
  }, [])
  const friendsOnline = social?.friends?.filter(f => f.online).length || 0
  const friendsAlert = (social?.incoming?.length || 0) + (social?.friends || []).reduce((n, f) => n + (f.unread || 0), 0) + (social?.invite ? 1 : 0)

  const login = async () => {
    setBusy(true)
    try {
      setAccounts(await call('auth:login'))
      notify(t('Sesión iniciada'))
    } catch (e) {
      notify(e.message, 'error')
    }
    setBusy(false)
    setOpen(false)
  }

  return (
    <nav className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="" />
        <div className="brand-text">
          <strong>Ghost</strong>
          <span>Launcher</span>
        </div>
      </div>

      <div className="nav">
        {items.map(i => (
          <button key={i.id} className={`nav-item ${page === i.id ? 'active' : ''}`} onClick={() => setPage(i.id)} title={t(i.label)}>
            <Icon name={i.icon} size={19} />
            <span>{t(i.label)}</span>
            {i.id === 'console' && running.length > 0 && <span className="nav-dot" />}
            {i.id === 'friends' && friendsAlert > 0 && <span className="nav-badge">{friendsAlert > 9 ? '9+' : friendsAlert}</span>}
            {i.id === 'friends' && !friendsAlert && friendsOnline > 0 && <span className="nav-count">{friendsOnline}</span>}
          </button>
        ))}
      </div>

      <UpdateBanner running={running} notify={notify} />

      <div className="account">
        {open && (
          <div className="account-menu">
            <small className="menu-label">{t('Cuentas')}</small>
            {accounts.accounts.map(a => (
              <div key={a.uuid} className={`account-row ${a.uuid === accounts.active ? 'current' : ''}`}>
                <button className="account-pick" onClick={async () => { setAccounts(await call('auth:select', a.uuid)); setOpen(false) }}>
                  <img src={avatar(a.uuid, 32)} alt="" />
                  <span>{a.name}</span>
                  {a.uuid === accounts.active && <Icon name="check" size={14} className="accent-text" />}
                </button>
                <button className="icon-btn" title={t('Cerrar sesión')} onClick={async () => setAccounts(await call('auth:logout', a.uuid))}>
                  <Icon name="logout" size={15} />
                </button>
              </div>
            ))}
            <button className="account-add" onClick={login} disabled={busy}>
              <Icon name="plus" size={15} /> {busy ? t('Esperando a Microsoft…') : t('Añadir cuenta')}
            </button>
          </div>
        )}
        {active
          ? (
            <button className="account-current" onClick={() => setOpen(o => !o)}>
              <img src={avatar(active.uuid)} alt="" />
              <div>
                <strong>{active.name}</strong>
                <small><span className="online" /> {t('Cuenta Microsoft')}</small>
              </div>
              <Icon name="chevron" size={16} />
            </button>
            )
          : (
            <button className="btn primary block" onClick={login} disabled={busy}>
              <Icon name="user" /> <span>{busy ? t('Esperando…') : t('Iniciar sesión')}</span>
            </button>
            )}
      </div>
    </nav>
  )
}

// Aviso cuando hay una versión nueva del launcher descargada y lista para instalar
function UpdateBanner ({ running, notify }) {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    call('update:status').then(setStatus).catch(() => {})
    return on('update:status', setStatus)
  }, [])
  if (!status || (status.state !== 'ready' && status.state !== 'downloading')) return null
  if (status.state === 'downloading') {
    return (
      <div className="update-banner downloading" title={t('Descargando la versión {v}', { v: status.next })}>
        <Icon name="download" size={15} />
        <span>{t('Descargando actualización… {p}%', { p: status.progress || 0 })}</span>
      </div>
    )
  }
  const install = async () => {
    try { await call('update:install') } catch (e) { notify(e.message, 'error') }
  }
  return (
    <button className="update-banner" onClick={install} disabled={running.length > 0}
      title={running.length ? t('Cierra el juego para actualizar') : t('Se cierra el launcher, se actualiza y se vuelve a abrir')}>
      <Icon name="sparkles" size={15} />
      <span><strong>{t('Versión {v} lista', { v: status.next })}</strong>{t('Reiniciar y actualizar')}</span>
    </button>
  )
}
