import React, { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n.js'
import { call, on, formatPlayTime } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { Modal, Field, Toggle, ProgressBar, ProfileBadge, loaderLabel } from '../components/ui.jsx'

// Selector arriba de "Nuevo perfil": crear uno desde cero o actualizar uno que ya tienes
export function ModeSwitch ({ mode, onChange, disabled }) {
  return (
    <div className="segmented mode-switch">
      <button className={mode === 'new' ? 'active' : ''} onClick={() => onChange('new')} disabled={disabled}>
        <Icon name="plus" size={14} /> {t('Perfil nuevo')}
      </button>
      <button className={mode === 'upgrade' ? 'active' : ''} onClick={() => onChange('upgrade')} disabled={disabled}>
        <Icon name="refresh" size={14} /> {t('Actualizar un perfil')}
      </button>
    </div>
  )
}

// Nombre propuesto para la copia: si el perfil se llama como su versión, se usa la versión nueva
const suggestName = (src, version) =>
  !src || !version ? '' : src.name === src.version ? version : `${src.name} ${version}`

export default function UpgradeModal ({ ctx, onClose, onSaved, onModeChange }) {
  const { profiles, notify, openMods } = ctx
  const candidates = profiles.filter(p => !p.importing)
  const [sourceId, setSourceId] = useState(() => {
    const byRecent = [...candidates].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
    return byRecent[0]?.id || ''
  })
  const [versions, setVersions] = useState([])
  const [fabricVersions, setFabricVersions] = useState([])
  const [version, setVersion] = useState('')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [copySaves, setCopySaves] = useState(false)
  const [modCount, setModCount] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const src = candidates.find(p => p.id === sourceId)

  useEffect(() => {
    call('versions:list').then(v => {
      const releases = v.versions.filter(x => x.type === 'release').map(x => x.id)
      setVersions(releases)
    }).catch(() => {})
    call('versions:fabric').then(setFabricVersions).catch(() => {})
    return on('upgrade:progress', p => p && setProgress(p))
  }, [])

  // Versiones a las que se puede actualizar (con Fabric si el perfil usa mods)
  const targets = useMemo(() => versions.filter(v =>
    v !== src?.version && (src?.loader !== 'fabric' || !fabricVersions.length || fabricVersions.includes(v))
  ), [versions, fabricVersions, src])

  useEffect(() => {
    if (!targets.length) return
    if (!targets.includes(version)) setVersion(targets[0])
  }, [targets])

  useEffect(() => {
    if (!nameTouched) setName(suggestName(src, version))
  }, [src?.id, version])

  useEffect(() => {
    setModCount(null)
    if (src) call('content:list', src.id).then(l => setModCount(l.filter(i => i.type === 'mod').length)).catch(() => {})
  }, [sourceId])

  const start = async () => {
    setProgress({ stage: t('Preparando…'), current: 0, total: 0 })
    try {
      const r = await call('profiles:upgrade', sourceId, { version, name: name.trim(), copySaves })
      setResult(r)
      notify(t('Perfil «{name}» creado para {version}', { name: r.profile.name, version }))
    } catch (e) {
      notify(e.message, 'error')
    }
    setProgress(null)
  }

  // Resumen al terminar
  if (result) {
    return (
      <Modal title={t('Perfil actualizado')} onClose={() => onSaved(result.profile)} wide
        footer={<>
          <div className="spacer" />
          <button className="btn ghost" onClick={() => onSaved(result.profile)}>{t('Cerrar')}</button>
          <button className="btn primary" onClick={() => { onSaved(result.profile); openMods(result.profile.id) }}><Icon name="puzzle" /> {t('Ver mods')}</button>
        </>}>
        <div className="upgrade-done">
          <ProfileBadge profile={result.profile} size={64} />
          <div>
            <h3>{result.profile.name}</h3>
            <p className="muted no-margin">{result.profile.version} · {loaderLabel(result.profile)} · {t('empieza con 0 horas')}</p>
          </div>
        </div>
        <div className="upgrade-summary">
          <div className="upgrade-stat ok"><Icon name="check" /> <strong>{result.updated.length}</strong> {t('mods actualizados a {version}', { version: result.profile.version })}</div>
          <div className="upgrade-stat ok"><Icon name="check" /> {t('Ajustes de Minecraft (teclas, sensibilidad, FOV…) y configuración de los mods')}</div>
          {result.missing.length > 0 && (
            <div className="upgrade-stat warn">
              <Icon name="alert" /> <div><strong>{result.missing.length}</strong> {t('mods todavía no tienen versión para {version}:', { version: result.profile.version })}
                <small className="muted"> {result.missing.join(', ')}</small></div>
            </div>
          )}
          {result.manual.length > 0 && (
            <div className="upgrade-stat warn">
              <Icon name="alert" /> <div>{t('Añadidos a mano (no se pueden actualizar solos):')}
                <small className="muted"> {result.manual.join(', ')}</small></div>
            </div>
          )}
          {result.adjusted.length > 0 && (
            <div className="upgrade-stat"><Icon name="refresh" /> {t('{n} versiones ajustadas para que todo sea compatible', { n: result.adjusted.length })}</div>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={t('Nuevo perfil')} onClose={() => !progress && onClose()} wide
      footer={progress
        ? <div className="footer-progress"><ProgressBar progress={progress} /></div>
        : <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
          <button className="btn primary" onClick={start} disabled={!src || !version}><Icon name="refresh" /> {t('Crear perfil actualizado')}</button>
        </>}>
      <ModeSwitch mode="upgrade" onChange={onModeChange} disabled={!!progress} />

      {candidates.length === 0
        ? <p className="muted">{t('Todavía no tienes perfiles que actualizar.')}</p>
        : (
          <>
            <p className="muted small-text no-margin">
              {t('Crea una copia de un perfil para otra versión de Minecraft: los mismos mods (descargados en su versión nueva), tus ajustes del juego y la configuración de los mods. El perfil original no se toca y las horas empiezan de cero.')}
            </p>

            <div className="upgrade-flow">
              <Field label={t('Perfil a actualizar')}>
                <select value={sourceId} onChange={e => { setSourceId(e.target.value); setNameTouched(false) }} disabled={!!progress}>
                  {candidates.map(p => <option key={p.id} value={p.id}>{p.name} ({p.version} · {loaderLabel(p)})</option>)}
                </select>
              </Field>
              <div className="upgrade-arrow"><Icon name="back" className="flip" /></div>
              <Field label={t('Versión nueva')}>
                <select value={version} onChange={e => setVersion(e.target.value)} disabled={!!progress || !targets.length}>
                  {!targets.length && <option>{t('Cargando…')}</option>}
                  {targets.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('Nombre del perfil nuevo')}>
              <input value={name} onChange={e => { setName(e.target.value); setNameTouched(true) }} disabled={!!progress} />
            </Field>

            {src && (
              <div className="upgrade-preview">
                <ProfileBadge profile={src} size={44} />
                <div>
                  <strong>{t('Se copiará de «{name}»', { name: src.name })}</strong>
                  <small className="muted">
                    {t('{mods} actualizados a {version} · ajustes del juego y de los mods · texturas, shaders y servidores', { mods: modCount === null ? '…' : `${modCount} mods`, version: version || '…' })}
                    {src.playTime ? ' · ' + t('sus {time} se quedan en el original', { time: formatPlayTime(src.playTime) }) : ''}
                  </small>
                </div>
              </div>
            )}

            <Toggle checked={copySaves} onChange={setCopySaves} label={t('Copiar también los mundos')}
              hint={t('Minecraft los actualiza al abrirlos en la versión nueva (los originales siguen en el otro perfil)')} />
          </>
          )}
    </Modal>
  )
}
