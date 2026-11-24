import React, { useEffect, useState } from 'react'
import { t } from '../i18n.js'
import { call, on, formatBytes, formatGB } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { Modal, Toggle, ProgressBar, ProfileBadge } from '../components/ui.jsx'

const TIER = { low: 'PC modesto', mid: 'PC medio', high: 'PC potente' }

// Optimizar: propuesta de cambios según el PC; se puede quitar lo que no quieras
export function OptimizeModal ({ ctx, profile, onClose }) {
  const { notify, refreshProfiles, running } = ctx
  const [plan, setPlan] = useState(null)
  const [picked, setPicked] = useState({})
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    call('optimize:plan', profile.id).then(p => {
      setPlan(p)
      setPicked(Object.fromEntries(p.changes.filter(c => !c.disabled).map(c => [c.id, true])))
    }).catch(e => { notify(e.message, 'error'); onClose() })
    return on('share:progress', setProgress)
  }, [])

  const apply = async () => {
    setBusy(true)
    try {
      const r = await call('optimize:apply', profile.id, Object.keys(picked).filter(k => picked[k]))
      await refreshProfiles()
      notify(r.done.length ? t('Perfil optimizado: {list}', { list: r.done.join(' · ') }) : t('No había nada que cambiar'))
      onClose()
    } catch (e) {
      notify(e.message, 'error')
      setBusy(false)
    }
  }

  const count = Object.values(picked).filter(Boolean).length
  const isRunning = running.includes(profile.id)
  return (
    <Modal title={t('Optimizar {name}', { name: profile.name })} onClose={() => !busy && onClose()}
      footer={busy
        ? <div className="footer-progress"><ProgressBar progress={progress || { stage: t('Aplicando…'), current: 0, total: 0 }} /></div>
        : <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
          <button className="btn primary" disabled={!plan || !count || isRunning} onClick={apply}><Icon name="zap" size={16} /> {t('Optimizar')}</button>
        </>}>
      {!plan
        ? <div className="boot pad"><div className="spinner" /></div>
        : (
          <>
            <div className="pc-card">
              <Icon name="cpu" size={22} />
              <div className="grow">
                <strong>{t(TIER[plan.pc.tier])}</strong>
                <small className="muted">
                  {[formatGB(plan.pc.ram) + ' RAM', t('{n} núcleos', { n: plan.pc.cores }), plan.pc.gpu].filter(Boolean).join(' · ')}
                </small>
              </div>
              <span className={`tier-badge ${plan.pc.tier}`}>{t(TIER[plan.pc.tier])}</span>
            </div>
            {isRunning && <p className="warn-text"><Icon name="alert" size={14} /> {t('Cierra el juego de este perfil para optimizarlo')}</p>}
            {plan.changes.length === 0 && <p className="muted">{t('Este perfil ya está optimizado para tu PC. ¡A jugar!')}</p>}
            <div className="opt-list">
              {plan.changes.map(c => (
                <label key={c.id} className={`opt-item ${c.disabled ? 'disabled' : ''}`}>
                  {c.disabled
                    ? <Icon name="alert" size={18} />
                    : <input type="checkbox" checked={!!picked[c.id]} onChange={e => setPicked(p => ({ ...p, [c.id]: e.target.checked }))} />}
                  <div>
                    <strong>{c.title}</strong>
                    {c.group === 'video'
                      ? <ul className="opt-sub">{c.value.map(o => <li key={o.key}><span>{o.name}</span><span className="muted">{o.from ? `${o.from} → ` : ''}</span><strong>{o.to}</strong></li>)}</ul>
                      : <small className="muted">{c.hint}</small>}
                  </div>
                </label>
              ))}
            </div>
            <p className="muted small-text">{t('Puedes deshacer cualquier cambio en Editar perfil o en las opciones de vídeo del juego.')}</p>
          </>
          )}
    </Modal>
  )
}

// Exportar un perfil a un archivo .ghostprofile
export function ExportModal ({ ctx, profile, onClose }) {
  const { notify } = ctx
  const [info, setInfo] = useState(null)
  const [worlds, setWorlds] = useState(false)
  const [format, setFormat] = useState('ghost')
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    call('share:inspect', profile.id).then(setInfo).catch(e => notify(e.message, 'error'))
    return on('share:progress', setProgress)
  }, [])

  const run = async () => {
    setBusy(true)
    try {
      const r = await call(format === 'mrpack' ? 'share:exportMrpack' : 'share:export', profile.id, { worlds })
      if (r) {
        notify(format === 'mrpack'
          ? t('Modpack exportado ({size}): {linked} desde Modrinth y {included} archivos dentro. Arrástralo a Modrinth o a Lunar (Versiones → Modpacks).', { size: formatBytes(r.size), linked: r.linked, included: r.included })
          : t('Perfil exportado ({size}). Ábrelo en otro PC con «Importar perfil».', { size: formatBytes(r.size) }))
        call('share:showFile', r.file)
        onClose()
      }
    } catch (e) { notify(e.message, 'error') }
    setBusy(false)
  }

  return (
    <Modal title={t('Exportar perfil')} onClose={() => !busy && onClose()}
      footer={busy
        ? <div className="footer-progress"><ProgressBar progress={progress || { stage: t('Eligiendo dónde guardarlo…'), current: 0, total: 0 }} /></div>
        : <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
          <button className="btn primary" disabled={!info} onClick={run}><Icon name="download" size={16} /> {t('Exportar')}</button>
        </>}>
      <div className="share-head">
        <ProfileBadge profile={profile} size={52} />
        <div>
          <strong>{profile.name}</strong>
          <small className="muted">{profile.version} · {profile.loader === 'fabric' ? 'Fabric' : 'Vanilla'}</small>
        </div>
      </div>
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button className={format === 'ghost' ? 'active' : ''} onClick={() => setFormat('ghost')}>Ghost Launcher (.ghostprofile)</button>
        <button className={format === 'mrpack' ? 'active' : ''} onClick={() => setFormat('mrpack')}>Modrinth / Lunar (.mrpack)</button>
      </div>
      {format === 'mrpack'
        ? <p className="muted">{t('Un modpack .mrpack que abren la app de Modrinth y Lunar Client (Versiones → Modpacks), con tus mods, la configuración, los texture packs, los shaders, tus ajustes del juego y tus servidores. Los mods integrados de Ghost (ghost client, Sodium, Iris…) no se incluyen.')}</p>
        : <p className="muted">{t('Se guarda en un solo archivo .ghostprofile con los mods, la configuración, los texture packs, los shaders, tus ajustes del juego y tus servidores. Para pasarlo a otro PC o a un amigo.')}</p>}
      {format === 'ghost' && info && <p className="small-text">{t('Tamaño aproximado: {size}', { size: formatBytes(info.base.size + (worlds ? info.worlds.size : 0)) })}</p>}
      <Toggle checked={worlds} onChange={setWorlds} label={t('Incluir los mundos')}
        hint={info ? (info.worlds.count ? t('{n} mundos · {size}', { n: info.worlds.count, size: formatBytes(info.worlds.size) }) : t('Este perfil no tiene mundos')) : null} />
      <p className="muted small-text">{t('No se incluyen tu cuenta, las capturas, los registros ni las horas jugadas.')}</p>
    </Modal>
  )
}

// Importar un .ghostprofile
export function ImportProfileModal ({ ctx, picked, onClose }) {
  const { notify, refreshProfiles, setSelected } = ctx
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => on('share:progress', setProgress), [])
  const { meta } = picked

  const run = async () => {
    setBusy(true)
    try {
      const p = await call('share:import', picked.file)
      await refreshProfiles()
      setSelected(p.id)
      notify(t('Perfil «{name}» importado', { name: p.name }))
      onClose()
    } catch (e) {
      notify(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={t('Importar perfil')} onClose={() => !busy && onClose()}
      footer={busy
        ? <div className="footer-progress"><ProgressBar progress={progress || { stage: t('Leyendo el archivo…'), current: 0, total: 0 }} /></div>
        : <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
          <button className="btn primary" onClick={run}><Icon name="upload" size={16} /> {t('Importar')}</button>
        </>}>
      <div className="share-head">
        <ProfileBadge profile={{ name: meta.name, color: meta.color }} size={52} showMedal={false} />
        <div>
          <strong>{meta.name}</strong>
          <small className="muted">{meta.version} · {meta.loader === 'fabric' ? 'Fabric' : 'Vanilla'}</small>
        </div>
      </div>
      <p className="muted">
        {t('{n} archivos · {size}', { n: picked.files, size: formatBytes(picked.size) })}
        {meta.worlds ? ' · ' + t('con mundos') : ''}
      </p>
      <p className="muted small-text">{t('Se crea un perfil nuevo; los que ya tienes no se tocan.')}</p>
    </Modal>
  )
}
