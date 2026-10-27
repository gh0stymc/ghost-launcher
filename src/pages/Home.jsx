import React, { useEffect, useState } from 'react'
import { call, timeAgo, formatPlayTime, playTimeByVersion } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { ProgressBar, ProfileBadge, Empty, loaderLabel } from '../components/ui.jsx'
import logo from '../assets/logo.png'
import { Medal } from '../components/Medal.jsx'

export default function Home ({ ctx, profile }) {
  const { profiles, selected, setSelected, launch, progress, running, setPage, accounts, openMods } = ctx
  const isRunning = profile && running.includes(profile.id)
  const busy = !!progress
  const recent = [...profiles].sort((a, b) => (b.lastPlayed || b.created) - (a.lastPlayed || a.created)).slice(0, 8)
  const active = accounts.accounts.find(a => a.uuid === accounts.active)
  const [modCount, setModCount] = useState(null)

  useEffect(() => {
    setModCount(null)
    if (profile) call('content:list', profile.id).then(l => setModCount(l.filter(i => i.type === 'mod' && i.enabled).length)).catch(() => {})
  }, [profile?.id])

  return (
    <div className="page home">
      <section className={`hero ${profile?.iconUrl ? 'has-cover' : ''}`}>
        {profile?.iconUrl && <div className="hero-cover" style={{ backgroundImage: `url(${profile.iconUrl})` }} />}
        <img className="hero-ghost" src={logo} alt="" />
        <div className="hero-content">
          <p className="eyebrow">{active ? `Hola, ${active.name}` : 'Bienvenido a Ghost Launcher'}</p>
          <div className="hero-title">
            {profile && <ProfileBadge profile={profile} size={64} />}
            <h1>{profile ? profile.name : 'Crea tu primer perfil'}</h1>
          </div>
          {profile && (
            <div className="hero-meta">
              <span className="tag"><Icon name="boxes" size={13} /> {profile.version}</span>
              <span className="tag">{loaderLabel(profile)}</span>
              {profile.loader === 'fabric' && modCount !== null && <span className="tag"><Icon name="puzzle" size={13} /> {modCount} mods</span>}
              {profile.playTime >= 60 && <span className="tag"><Icon name="timer" size={13} /> {formatPlayTime(profile.playTime)} jugadas</span>}
              <span className="tag subtle"><Icon name="clock" size={13} /> {timeAgo(profile.lastPlayed)}</span>
            </div>
          )}

          <div className="play-row">
            {isRunning
              ? (
                <button className="btn play running" onClick={() => call('game:stop', profile.id)}>
                  <Icon name="stop" size={22} /> Cerrar juego
                </button>
                )
              : (
                <button className="btn play" disabled={busy} onClick={() => (profile ? launch() : setPage('profiles'))}>
                  <Icon name={profile ? 'play' : 'plus'} size={22} fill={profile ? 'currentColor' : undefined} />
                  {busy ? 'Lanzando…' : profile ? 'Jugar' : 'Nuevo perfil'}
                </button>
                )}
            {profile && (
              <>
                <button className="btn glass" onClick={() => openMods(profile.id)}><Icon name="puzzle" /> Mods</button>
                <button className="btn glass icon-only" title="Abrir carpeta" onClick={() => call('profiles:openFolder', profile.id)}><Icon name="folder" /></button>
              </>
            )}
          </div>
          <ProgressBar progress={progress} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Tus perfiles</h2>
          <button className="btn small ghost" onClick={() => setPage('profiles')}>Ver todos</button>
        </div>
        {recent.length === 0
          ? <Empty icon="ghost" title="Todavía no tienes perfiles" text="Un perfil es una instalación de Minecraft con su versión, mods y ajustes. También puedes importar uno de Lunar o Modrinth." />
          : (
            <div className="quick-grid">
              {recent.map(p => (
                <button key={p.id} className={`quick-card ${p.id === selected ? 'selected' : ''}`} onClick={() => setSelected(p.id)}>
                  <ProfileBadge profile={p} size={46} />
                  <div className="quick-text">
                    <strong>{p.name}</strong>
                    <small>{p.version} · {loaderLabel(p)}</small>
                  </div>
                  {running.includes(p.id) && <span className="live-dot" title="En ejecución" />}
                </button>
              ))}
            </div>
            )}
      </section>

      <PlayTime profiles={profiles} />
    </div>
  )
}

// Tiempo de juego total y por versión de Minecraft (como el contador de Modrinth)
function PlayTime ({ profiles }) {
  const rows = playTimeByVersion(profiles).slice(0, 8)
  const total = profiles.reduce((sum, p) => sum + (p.playTime || 0), 0)
  if (!profiles.length) return null
  const max = rows.length ? rows[0].seconds : 1

  return (
    <section className="playtime card">
      <div className="playtime-head">
        <div>
          <h2>Tiempo de juego</h2>
          <small className="muted">Por versión de Minecraft, sumando todos tus perfiles</small>
        </div>
        <div className="playtime-total">
          <strong>{formatPlayTime(total)}</strong>
          <small className="muted">en total</small>
        </div>
      </div>
      <Milestones profiles={profiles} total={total} />

      {rows.length === 0 && <p className="muted small-text no-margin">Cuando juegues, aquí verás tus horas por versión.</p>}
      <div className="playtime-list" role="table" aria-label="Tiempo de juego por versión">
        {rows.map(r => (
          <div key={r.version} className="playtime-row" role="row" title={`${r.version}: ${formatPlayTime(r.seconds)}`}>
            <span className="playtime-version" role="cell">{r.version}</span>
            <span className="playtime-track" role="presentation">
              <span className="playtime-fill" style={{ width: `${Math.max(2, (r.seconds / max) * 100)}%` }} />
            </span>
            <span className="playtime-value" role="cell">{formatPlayTime(r.seconds)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// Hitos de horas (500, 750, 1000, 2500, 5000): cada uno da una medalla al perfil con el que llegaste
const MILESTONES = [500, 750, 1000, 2500, 5000]

function Milestones ({ profiles, total }) {
  const hours = total / 3600
  const owner = (h) => profiles.find(p => (p.medals || []).some(m => m.hours === h))
  const next = MILESTONES.find(h => hours < h)
  // Relleno de la línea: tramos iguales entre hitos, y dentro de cada tramo según lo que llevas
  const reached = MILESTONES.filter(h => hours >= h).length
  const prev = reached ? MILESTONES[reached - 1] : 0
  const partial = next ? (hours - prev) / (next - prev) : 0
  const fill = next ? (reached + partial) / MILESTONES.length : 1

  return (
    <div className="milestones">
      <div className="milestones-track">
        <span className="milestones-line"><span className="milestones-fill" style={{ width: `${fill * 100}%` }} /></span>
        {MILESTONES.map((h, i) => {
          const got = hours >= h
          const who = owner(h)
          return (
            <div key={h} className={`milestone ${got ? 'got' : ''}`} style={{ left: `${((i + 1) / MILESTONES.length) * 100}%` }}>
              <Medal hours={h} size={got ? 52 : 46} locked={!got}
                title={got ? `Medalla de ${h} h${who ? ` · para ${who.name}` : ''}` : `Medalla de ${h} h · bloqueada`} />
              <strong>{h} h</strong>
              <small>{got ? (who ? who.name : '¡Conseguida!') : 'Bloqueada'}</small>
            </div>
          )
        })}
      </div>
      <p className="milestones-next muted">
        {next
          ? <>Siguiente medalla: <strong>{next} h</strong> · te faltan {formatPlayTime(next * 3600 - total)}. Se la lleva el perfil con el que llegues.</>
          : '¡Has conseguido todas las medallas!'}
      </p>
    </div>
  )
}
