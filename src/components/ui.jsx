import React, { useEffect } from 'react'
import { t, locale } from '../i18n.js'
import { formatBytes, formatGB } from '../api.js'
import { Icon } from './Icon.jsx'
import { Medal, bestMedal } from './Medal.jsx'

export function Modal ({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Cerrar')}><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field ({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function Toggle ({ checked, onChange, label, hint }) {
  return (
    <div className="toggle-row">
      <div>
        <div>{label}</div>
        {hint && <small className="field-hint">{hint}</small>}
      </div>
      <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  )
}

// Control de RAM: deslizador por pasos de 512 MB con aviso si te pasas
export function RamSlider ({ value, onChange, totalRam }) {
  const max = Math.max(2048, Math.floor((totalRam || 8192) / 512) * 512)
  const pct = ((value - 512) / (max - 512)) * 100
  const tooMuch = value > (totalRam || 8192) * 0.75
  return (
    <div className="ram">
      <div className="ram-top">
        <strong>{formatGB(value)}</strong>
        <small>{t('de {total} en tu equipo', { total: formatGB(totalRam || 0) })}</small>
      </div>
      <input type="range" min={512} max={max} step={512} value={value}
        style={{ '--pct': `${pct}%` }} onChange={e => onChange(Number(e.target.value))} aria-label={t('Memoria RAM')} />
      <div className="ram-presets">
        {[2048, 4096, 6144, 8192].filter(v => v <= max).map(v => (
          <button key={v} className={`chip ${value === v ? 'active' : ''}`} onClick={() => onChange(v)}>{formatGB(v)}</button>
        ))}
      </div>
      {tooMuch && <small className="warn"><Icon name="alert" size={14} /> {t('Dejar poca RAM al sistema puede dar tirones. Con mods, 4–6 GB suele bastar.')}</small>}
      {!tooMuch && value > 10240 && <small className="field-hint">{t('Más de 10 GB rara vez mejora el rendimiento y puede causar pausas largas.')}</small>}
    </div>
  )
}

export function ProgressBar ({ progress }) {
  if (!progress) return null
  const pct = progress.total ? Math.min(100, (progress.current / progress.total) * 100) : null
  const isBytes = progress.total > 100000
  return (
    <div className="progress">
      <div className="progress-text">
        <span>{progress.stage}</span>
        {pct !== null && <span>{isBytes ? `${formatBytes(progress.current)} / ${formatBytes(progress.total)}` : `${Math.round(pct)}%`}</span>}
      </div>
      <div className={`progress-track ${pct === null ? 'indeterminate' : ''}`}>
        <div className="progress-fill" style={{ width: pct === null ? '35%' : `${pct}%` }} />
      </div>
    </div>
  )
}

export function Empty ({ icon, title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  )
}

export const loaderLabel = (p) => (p.loader === 'fabric' ? 'Fabric' : 'Vanilla')

// Foto del perfil, o su inicial sobre su color si no tiene foto
// La mejor medalla del perfil va en la esquina de su foto
export function ProfileBadge ({ profile, size = 44, src, showMedal = true }) {
  const image = src !== undefined ? src : profile.iconUrl
  const medal = showMedal ? bestMedal(profile) : null
  const badge = (
    <div className="profile-badge" style={{ '--c': profile.color, width: size, height: size, fontSize: size * 0.42, borderRadius: size * 0.28 }}>
      {image
        ? <img src={image} alt="" />
        : (profile.name || '?').trim().charAt(0).toUpperCase()}
    </div>
  )
  if (!medal) return badge
  return (
    <div className="badge-wrap">
      {badge}
      <span className="badge-medal">
        <Medal hours={medal.hours} size={Math.max(18, Math.round(size * 0.46))}
          title={t('Medalla de {h} horas · conseguida el {date}', { h: medal.hours, date: new Date(medal.at).toLocaleDateString(locale()) })} />
      </span>
    </div>
  )
}
