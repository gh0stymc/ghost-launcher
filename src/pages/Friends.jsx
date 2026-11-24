import React, { useEffect, useMemo, useState } from 'react'
import { call, on, timeAgo } from '../api.js'
import { t } from '../i18n.js'
import { Icon } from '../components/Icon.jsx'
import { Empty } from '../components/ui.jsx'
import { avatar } from '../components/Sidebar.jsx'

// Amigos de ghost client: quién está conectado, dónde juega y unirse a su servidor con un clic
export default function Friends ({ ctx }) {
  const { profiles, selected, notify, running, accounts, progress } = ctx
  const [social, setSocial] = useState(null)
  const [name, setName] = useState('')
  const [profileId, setProfileId] = useState(null)
  const [armed, setArmed] = useState(null)

  useEffect(() => {
    call('social:get').then(setSocial).catch(() => {})
    return on('social:update', setSocial)
  }, [])

  // Para unirse: solo perfiles con ghost client o de versiones modernas (las que aceptan entrar directo a un servidor)
  const playable = useMemo(() => profiles.filter(p => !p.importing), [profiles])
  const target = playable.find(p => p.id === (profileId || selected)) || playable[0]

  const join = async (server) => {
    if (!target) return notify(t('Crea un perfil para poder unirte'), 'error')
    if (running.includes(target.id)) return notify(t('Ese perfil ya está abierto: entra en {server} desde el juego', { server }), 'error')
    try {
      call('social:clearInvite').catch(() => {})
      notify(t('Abriendo {profile} y entrando en {server}…', { profile: target.name, server }))
      ctx.setSelected(target.id)
      await ctx.launch(target.id, server)
    } catch (e) { notify(e.message, 'error') }
  }

  const add = async (e) => {
    e?.preventDefault()
    if (!name.trim()) return
    try { await call('social:add', name.trim()); setName('') } catch (err) { notify(err.message, 'error') }
  }

  if (!accounts.active) {
    return (
      <div className="page">
        <Header />
        <Empty icon="users" title={t('Inicia sesión para ver a tus amigos')} text={t('Los amigos son los mismos que en ghost client: añade a alguien aquí o desde el juego.')} />
      </div>
    )
  }

  const state = social?.state || 'connecting'
  const friends = social?.friends || []
  const online = friends.filter(f => f.online)
  const offline = friends.filter(f => !f.online)

  return (
    <div className="page friends-page">
      <Header social={social} />

      <div className="friends-toolbar">
        <form className="friends-add" onSubmit={add}>
          <Icon name="plus" size={16} />
          <input value={name} maxLength={16} onChange={e => setName(e.target.value.replace(/[^\w]/g, ''))}
            placeholder={t('Añadir amigo por nombre de Minecraft')} disabled={state !== 'online'} />
          <button className="btn small primary" disabled={state !== 'online' || !name.trim()}>{t('Enviar')}</button>
        </form>
        {playable.length > 0 && (
          <label className="friends-profile" title={t('Perfil con el que se abre el juego al unirte')}>
            <span className="muted small-text">{t('Unirse con')}</span>
            <select value={target?.id || ''} onChange={e => setProfileId(e.target.value)}>
              {playable.map(p => <option key={p.id} value={p.id}>{p.name} · {p.version}</option>)}
            </select>
          </label>
        )}
      </div>

      {state !== 'online' && <Connection state={state} />}

      {social?.invite && (
        <div className="invite-banner">
          <img src={avatar(social.invite.from.uuid, 40)} alt="" />
          <div className="grow">
            <strong>{t('{name} te invita a jugar', { name: social.invite.from.name })}</strong>
            <small className="muted">{social.invite.server}</small>
          </div>
          <button className="btn primary small" disabled={!!progress} onClick={() => join(social.invite.server)}><Icon name="play" size={14} /> {t('Unirse')}</button>
          <button className="icon-btn" title={t('Descartar')} onClick={() => call('social:clearInvite')}><Icon name="x" size={16} /></button>
        </div>
      )}

      {state === 'online' && social.incoming.length > 0 && (
        <section>
          <h3 className="friends-section">{t('Solicitudes ({n})', { n: social.incoming.length })}</h3>
          <div className="friends-grid">
            {social.incoming.map(u => (
              <div key={u.uuid} className="friend-card request">
                <img className="friend-head" src={avatar(u.uuid, 64)} alt="" />
                <div className="friend-info"><strong>{u.name}</strong><small className="muted">{t('Quiere ser tu amigo')}</small></div>
                <div className="friend-actions">
                  <button className="btn small primary" onClick={() => call('social:accept', u.uuid)}><Icon name="check" size={14} /> {t('Aceptar')}</button>
                  <button className="btn small ghost" onClick={() => call('social:decline', u.uuid)}>{t('Rechazar')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {state === 'online' && friends.length === 0 && social.incoming.length === 0 && (
        <Empty icon="users" title={t('Aún no tienes amigos en ghost client')}
          text={t('Escribe arriba el nombre de Minecraft de un amigo que use ghost client. Cuando acepte, verás aquí en qué servidor juega.')} />
      )}

      {online.length > 0 && (
        <section>
          <h3 className="friends-section"><span className="dot-online" /> {t('Conectados ({n})', { n: online.length })}</h3>
          <div className="friends-grid">
            {online.map(f => <FriendCard key={f.uuid} f={f} join={join} busy={!!progress} armed={armed} setArmed={setArmed} target={target} />)}
          </div>
        </section>
      )}
      {offline.length > 0 && (
        <section>
          <h3 className="friends-section">{t('Desconectados ({n})', { n: offline.length })}</h3>
          <div className="friends-grid">
            {offline.map(f => <FriendCard key={f.uuid} f={f} join={join} busy={!!progress} armed={armed} setArmed={setArmed} target={target} />)}
          </div>
        </section>
      )}

      {state === 'online' && social.outgoing.length > 0 && (
        <section>
          <h3 className="friends-section">{t('Solicitudes enviadas ({n})', { n: social.outgoing.length })}</h3>
          <div className="chips">
            {social.outgoing.map(u => (
              <span key={u.uuid} className="chip">
                <img className="chip-head" src={avatar(u.uuid, 24)} alt="" /> {u.name}
                <button className="chip-x" title={t('Cancelar')} onClick={() => call('social:cancel', u.uuid)}><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Header ({ social }) {
  const online = social?.friends?.filter(f => f.online).length || 0
  return (
    <div className="page-head">
      <div>
        <h1>{t('Amigos')}</h1>
        <p className="muted">
          {social?.state === 'online'
            ? t('{online} de {total} conectados · Los mismos amigos que en ghost client', { online, total: social.friends.length })
            : t('Los mismos amigos que en ghost client')}
        </p>
      </div>
    </div>
  )
}

function Connection ({ state }) {
  const text = {
    connecting: t('Conectando con el servidor de ghost client…'),
    offline: t('Conectando con el servidor de ghost client…'),
    no_account: t('Mojang no ha aceptado la sesión. Vuelve a iniciar sesión con tu cuenta.'),
    unreachable: t('No se puede conectar con el servidor de ghost client. Se reintentará solo.')
  }[state]
  return (
    <div className="friends-connection">
      {state === 'connecting' || state === 'offline' ? <span className="spinner small" /> : <Icon name="alert" size={16} />}
      <span>{text}</span>
      {state === 'unreachable' && <button className="btn small ghost" onClick={() => call('social:reconnect')}><Icon name="refresh" size={14} /> {t('Reintentar')}</button>}
    </div>
  )
}

function statusText (f) {
  if (!f.online) return f.lastSeen ? t('Visto {when}', { when: timeAgo(f.lastSeen).toLowerCase() }) : t('Desconectado')
  if (f.activity === 'server') return f.server ? t('Jugando en {server}', { server: f.server }) : t('Jugando en un servidor')
  if (f.activity === 'singleplayer') return t('Jugando en un mundo propio')
  if (f.activity === 'launcher') return t('En el launcher')
  return t('En el menú del juego')
}

function FriendCard ({ f, join, busy, armed, setArmed, target }) {
  const canJoin = f.online && f.activity === 'server' && f.server
  const removing = armed === f.uuid
  useEffect(() => {
    if (!removing) return
    const id = setTimeout(() => setArmed(null), 3000)
    return () => clearTimeout(id)
  }, [removing])
  return (
    <div className={`friend-card ${f.online ? 'is-online' : ''}`}>
      <div className="friend-head-wrap">
        <img className="friend-head" src={avatar(f.uuid, 64)} alt="" />
        <span className={`friend-dot ${f.online ? 'on' : ''}`} />
      </div>
      <div className="friend-info">
        <strong>{f.name}</strong>
        <small className={f.online ? 'online-text' : 'muted'}>{statusText(f)}</small>
        {f.unread > 0 && <small className="friend-unread" title={t('Ábrelos en el menú social del juego')}><Icon name="sparkles" size={12} /> {(f.unread === 1 ? t('1 mensaje sin leer') : t('{n} mensajes sin leer', { n: f.unread }))}</small>}
      </div>
      <div className="friend-actions">
        {canJoin && (
          <button className="btn small primary" disabled={busy} title={target ? t('Abre {profile} y entra en {server}', { profile: target.name, server: f.server }) : ''} onClick={() => join(f.server)}>
            <Icon name="play" size={14} fill="currentColor" /> {t('Unirse')}
          </button>
        )}
        <button className={`icon-btn ${removing ? 'danger' : ''}`} title={removing ? t('Pulsa otra vez para quitar a {name}', { name: f.name }) : t('Quitar amigo')}
          onClick={() => { if (removing) { call('social:remove', f.uuid); setArmed(null) } else setArmed(f.uuid) }}>
          <Icon name={removing ? 'check' : 'trash'} size={15} />
        </button>
      </div>
    </div>
  )
}

