import React, { useEffect, useMemo, useState } from 'react'
import { call, on, formatBytes } from '../api.js'
import { t, locale } from '../i18n.js'
import { Icon } from '../components/Icon.jsx'
import { Empty } from '../components/ui.jsx'

const src = (s, thumb) => `ghost-shot://img/${encodeURIComponent(s.profileId)}/${encodeURIComponent(s.name)}${thumb ? '?thumb=1' : ''}`
const monthLabel = (time) => new Date(time).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })

// Capturas de pantalla de todos los perfiles (F2 en el juego)
export default function Gallery ({ ctx }) {
  const { notify } = ctx
  const [shots, setShots] = useState(null)
  const [profile, setProfile] = useState('all')
  const [open, setOpen] = useState(null) // índice en la lista filtrada

  const load = () => call('gallery:list').then(setShots).catch(e => { setShots([]); notify(e.message, 'error') })
  useEffect(() => {
    load()
    return on('game:closed', load)
  }, [])

  const profilesWithShots = useMemo(() => {
    const m = new Map()
    for (const s of shots || []) m.set(s.profileId, { id: s.profileId, name: s.profileName, n: (m.get(s.profileId)?.n || 0) + 1 })
    return [...m.values()]
  }, [shots])
  const list = useMemo(() => (shots || []).filter(s => profile === 'all' || s.profileId === profile), [shots, profile])
  const groups = useMemo(() => {
    const g = []
    for (const [i, s] of list.entries()) {
      const label = monthLabel(s.time)
      if (!g.length || g[g.length - 1].label !== label) g.push({ label, items: [] })
      g[g.length - 1].items.push({ s, i })
    }
    return g
  }, [list])

  const remove = async (s) => {
    try {
      await call('gallery:remove', s.profileId, s.name)
      setShots(list0 => list0.filter(x => !(x.profileId === s.profileId && x.name === s.name)))
      notify(t('Captura enviada a la papelera'))
    } catch (e) { notify(e.message, 'error') }
  }

  if (!shots) return <div className="page"><div className="boot"><div className="spinner" /></div></div>

  return (
    <div className="page gallery-page">
      <div className="page-head">
        <div>
          <h1>{t('Capturas')}</h1>
          <p className="muted">{shots.length ? t('{n} capturas de tus perfiles · Hazlas en el juego con F2', { n: shots.length }) : t('Hazlas en el juego con F2')}</p>
        </div>
        <button className="btn small ghost" onClick={load}><Icon name="refresh" size={14} /> {t('Actualizar')}</button>
      </div>

      {profilesWithShots.length > 1 && (
        <div className="chips">
          <button className={`chip ${profile === 'all' ? 'active' : ''}`} onClick={() => setProfile('all')}>{t('Todas')} · {shots.length}</button>
          {profilesWithShots.map(p => <button key={p.id} className={`chip ${profile === p.id ? 'active' : ''}`} onClick={() => setProfile(p.id)}>{p.name} · {p.n}</button>)}
        </div>
      )}

      {!list.length && <Empty icon="images" title={t('Aún no hay capturas')} text={t('Pulsa F2 dentro del juego para hacer una. Aparecerán aquí, de todos tus perfiles.')} />}

      {groups.map(g => (
        <section key={g.label}>
          <h3 className="gallery-month">{g.label}</h3>
          <div className="gallery-grid">
            {g.items.map(({ s, i }) => (
              <button key={s.profileId + s.name} className="gallery-item" onClick={() => setOpen(i)} title={s.name}>
                <img src={src(s, true)} alt="" loading="lazy" />
                <span className="gallery-meta">
                  <span>{new Date(s.time).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}</span>
                  {profile === 'all' && profilesWithShots.length > 1 && <span className="gallery-profile">{s.profileName}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {open !== null && list[open] && (
        <Viewer shot={list[open]} index={open} total={list.length} notify={notify}
          onClose={() => setOpen(null)}
          onMove={(d) => setOpen(i => Math.max(0, Math.min(list.length - 1, i + d)))}
          onRemove={async () => { const s = list[open]; await remove(s); setOpen(i => (list.length <= 1 ? null : Math.min(i, list.length - 2))) }} />
      )}
    </div>
  )
}

function Viewer ({ shot, index, total, onClose, onMove, onRemove, notify }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { setArmed(false) }, [shot])
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onMove(-1)
      if (e.key === 'ArrowRight') onMove(1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, onMove])
  const act = (channel, msg) => call(channel, shot.profileId, shot.name).then(() => msg && notify(msg)).catch(e => notify(e.message, 'error'))
  return (
    <div className="viewer" onClick={onClose}>
      <div className="viewer-bar" onClick={e => e.stopPropagation()}>
        <div className="viewer-title">
          <strong>{shot.name}</strong>
          <small className="muted">{shot.profileName} · {new Date(shot.time).toLocaleString(locale())} · {formatBytes(shot.size)} · {index + 1}/{total}</small>
        </div>
        <button className="btn small ghost" onClick={() => act('gallery:copy', t('Captura copiada: pégala donde quieras'))}><Icon name="copy" size={14} /> {t('Copiar')}</button>
        <button className="btn small ghost" onClick={() => act('gallery:open')}><Icon name="external" size={14} /> {t('Abrir')}</button>
        <button className="btn small ghost" onClick={() => act('gallery:show')}><Icon name="folder" size={14} /> {t('Carpeta')}</button>
        <button className={`btn small ${armed ? 'danger' : 'ghost'}`} onClick={() => (armed ? onRemove() : setArmed(true))}>
          <Icon name="trash" size={14} /> {armed ? t('¿Seguro?') : t('Borrar')}
        </button>
        <button className="icon-btn" title={t('Cerrar')} onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      <div className="viewer-stage">
        <button className="viewer-nav" disabled={index === 0} onClick={e => { e.stopPropagation(); onMove(-1) }} title={t('Anterior')}><Icon name="chevron-left" size={26} /></button>
        <img src={src(shot, false)} alt={shot.name} onClick={e => e.stopPropagation()} />
        <button className="viewer-nav" disabled={index === total - 1} onClick={e => { e.stopPropagation(); onMove(1) }} title={t('Siguiente')}><Icon name="chevron-right" size={26} /></button>
      </div>
    </div>
  )
}
