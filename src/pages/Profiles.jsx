import React, { useEffect, useState } from 'react'
import { t } from '../i18n.js'
import { call, on, timeAgo, formatPlayTime } from '../api.js'
import { toSquarePng, pickImage } from '../image.js'
import { Icon } from '../components/Icon.jsx'
import { Modal, Field, RamSlider, Toggle, ProfileBadge, Empty, ProgressBar, loaderLabel } from '../components/ui.jsx'
import ghostLogo from '../assets/logo.png'
import UpgradeModal, { ModeSwitch } from './UpgradeModal.jsx'
import { OptimizeModal, ExportModal, ImportProfileModal } from './ProfileTools.jsx'

const COLORS = ['#7c5cff', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#94a3b8']

export default function Profiles ({ ctx }) {
  const { profiles, refreshProfiles, selected, setSelected, launch, running, progress, setPage, openMods } = ctx
  const [editing, setEditing] = useState(null) // null | 'new' | perfil
  const [importing, setImporting] = useState(false)
  // Herramientas: { kind: 'optimize' | 'export' | 'import', profile?, picked? }
  const [tool, setTool] = useState(null)
  const importProfile = async () => {
    try {
      const picked = await call('share:pick')
      if (picked) setTool({ kind: 'import', picked })
    } catch (e) { ctx.notify(e.message, 'error') }
  }

  const play = (id) => { setSelected(id); setPage('home'); launch(id) }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Perfiles')}</h1>
          <p className="muted">{t('Cada perfil tiene su propia carpeta con mods, mundos y ajustes.')}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={importProfile} title={t('Abrir un archivo .ghostprofile exportado desde Ghost Launcher')}><Icon name="upload" /> {t('Importar perfil')}</button>
          <button className="btn" onClick={() => setImporting(true)}><Icon name="package" /> {t('Importar modpack')}</button>
          <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> {t('Nuevo perfil')}</button>
        </div>
      </div>

      {profiles.length === 0
        ? (
          <Empty icon="ghost" title={t('Crea tu primer perfil')} text={t('Elige una versión de Minecraft, o importa un modpack de Lunar Client o Modrinth.')}>
            <div className="row">
              <button className="btn" onClick={() => setImporting(true)}><Icon name="package" /> {t('Importar modpack')}</button>
              <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> {t('Nuevo perfil')}</button>
            </div>
          </Empty>
          )
        : (
          <div className="profile-grid">
            {profiles.map(p => (
              <div key={p.id} className={`profile-card ${p.id === selected ? 'selected' : ''}`} onClick={() => setSelected(p.id)}>
                <div className="profile-cover-wrap">
                  <div className="profile-cover" style={{ '--c': p.color }}>
                    {p.iconUrl && <div className="profile-cover-img" style={{ backgroundImage: `url(${p.iconUrl})` }} />}
                  </div>
                  <div className="cover-badges">
                    {running.includes(p.id) && <span className="cover-badge"><span className="live-dot static" /> {t('Jugando')}</span>}
                    {p.source?.type && <span className="cover-badge right">{p.source.type === 'lunar' ? 'Lunar' : 'Modrinth'}</span>}
                  </div>
                </div>
                <div className="profile-card-body">
                  <ProfileBadge profile={p} size={58} />
                  <div className="profile-card-info">
                    <strong>{p.name}</strong>
                    <small>{p.version} · {loaderLabel(p)}</small>
                    {p.playTime >= 60 && <small><Icon name="timer" size={12} /> {t('{time} jugadas', { time: formatPlayTime(p.playTime) })}</small>}
                    <small className="muted"><Icon name="clock" size={12} /> {timeAgo(p.lastPlayed)}</small>
                  </div>
                </div>
                <div className="profile-card-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn small primary grow" disabled={!!progress || running.includes(p.id)} onClick={() => play(p.id)}>
                    <Icon name="play" size={14} fill="currentColor" /> {running.includes(p.id) ? t('Abierto') : t('Jugar')}
                  </button>
                  <button className="btn small" onClick={() => openMods(p.id)} title={t('Editar los mods de este perfil')}>
                    <Icon name="puzzle" size={14} /> Mods
                  </button>
                  <button className="icon-btn" title={t('Optimizar para tu PC')} onClick={() => setTool({ kind: 'optimize', profile: p })}><Icon name="zap" size={16} /></button>
                  <button className="icon-btn" title={t('Editar perfil')} onClick={() => setEditing(p)}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn" title={t('Abrir carpeta')} onClick={() => call('profiles:openFolder', p.id)}><Icon name="folder" size={16} /></button>
                </div>
              </div>
            ))}
          </div>
          )}

      {editing && (
        <ProfileModal
          ctx={ctx}
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (p) => { await refreshProfiles(); if (p) setSelected(p.id); setEditing(null) }}
          onTool={(kind) => { const p = editing; setEditing(null); setTool({ kind, profile: p }) }}
        />
      )}
      {tool?.kind === 'optimize' && <OptimizeModal ctx={ctx} profile={tool.profile} onClose={() => setTool(null)} />}
      {tool?.kind === 'export' && <ExportModal ctx={ctx} profile={tool.profile} onClose={() => setTool(null)} />}
      {tool?.kind === 'import' && <ImportProfileModal ctx={ctx} picked={tool.picked} onClose={() => setTool(null)} />}
      {importing && <ImportModal ctx={ctx} onClose={() => setImporting(false)} />}
    </div>
  )
}

function ProfileModal ({ ctx, profile, onClose, onSaved, onTool }) {
  const { settings, system, notify, openMods } = ctx
  const [versions, setVersions] = useState(null)
  const [fabricVersions, setFabricVersions] = useState([])
  const [showSnapshots, setShowSnapshots] = useState(settings.showSnapshots)
  const [form, setForm] = useState(() => profile
    ? { ...profile, customRam: !!profile.ram, ramMax: profile.ram?.max || settings.maxRam, width: profile.resolution?.width || '', height: profile.resolution?.height || '' }
    : { name: '', version: '', loader: 'fabric', color: COLORS[0], jvmArgs: '', customRam: false, ramMax: settings.maxRam, width: '', height: '' })
  // undefined = sin cambios, null = quitar foto, string = nueva foto
  const [icon, setIcon] = useState(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [catalog, setCatalog] = useState(null)
  const [withBuiltins, setWithBuiltins] = useState(true)
  const [withCapes, setWithCapes] = useState(true)
  const [installing, setInstalling] = useState(null)
  // Nuevo perfil: desde cero o actualizando uno que ya existe
  const [mode, setMode] = useState('new')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (profile) return
    call('builtins:catalog').then(c => { setCatalog(c); setWithCapes(c.capes.enabled) })
    return on('builtins:progress', setInstalling)
  }, [])

  useEffect(() => {
    call('versions:list').then(v => {
      setVersions(v)
      if (!profile) setForm(f => ({ ...f, version: f.version || v.latest.release }))
    }).catch(e => notify(t('No se pudo cargar la lista de versiones: {error}', { error: e.message }), 'error'))
    call('versions:fabric').then(setFabricVersions).catch(() => {})
  }, [])

  const list = (versions?.versions || []).filter(v => v.type === 'release' || (showSnapshots && v.type === 'snapshot'))
  const fabricOk = fabricVersions.includes(form.version)
  const preview = icon !== undefined ? icon : profile?.iconUrl || null

  const choosePhoto = async () => {
    const file = await pickImage()
    if (!file) return
    try { setIcon(await toSquarePng(file)) } catch { notify(t('No se pudo leer esa imagen'), 'error') }
  }

  const save = async () => {
    if (!form.version) return
    if (form.loader === 'fabric' && fabricVersions.length && !fabricOk) return notify(t('Fabric no está disponible para {version}', { version: form.version }), 'error')
    const data = {
      name: form.name.trim() || `${form.loader === 'fabric' ? 'Fabric' : 'Minecraft'} ${form.version}`,
      version: form.version,
      loader: form.loader,
      color: form.color,
      jvmArgs: form.jvmArgs,
      ram: form.customRam ? { max: form.ramMax, min: Math.min(1024, form.ramMax) } : null,
      resolution: form.width && form.height ? { width: Number(form.width), height: Number(form.height) } : null
    }
    try {
      const saved = profile ? await call('profiles:update', profile.id, data) : await call('profiles:create', data)
      if (icon !== undefined) await call('profiles:setIcon', saved.id, icon)
      // Perfil nuevo con Fabric: mods integrados y Capes
      const slugs = [
        ...(withBuiltins && catalog ? catalog.enabled : []),
        ...(withCapes ? ['capes'] : [])
      ]
      if (!profile && data.loader === 'fabric' && slugs.length) {
        setInstalling({ stage: t('Preparando mods integrados…'), current: 0, total: 0 })
        const r = await call('builtins:apply', saved.id, slugs)
        notify(t('Perfil creado con {n} mods', { n: r.installed.length }) + (r.skipped.length ? ' ' + t('(no disponibles para {version}: {list})', { version: data.version, list: r.skipped.join(', ') }) : ''))
      } else {
        notify(profile ? t('Perfil guardado') : t('Perfil creado'))
      }
      onSaved(saved)
    } catch (e) {
      setInstalling(null)
      notify(e.message, 'error')
    }
  }

  const remove = async () => {
    await call('profiles:remove', profile.id, true)
    notify(t('Perfil eliminado'))
    onSaved(null)
  }

  if (!profile && mode === 'upgrade') {
    return <UpgradeModal ctx={ctx} onClose={onClose} onSaved={onSaved} onModeChange={setMode} />
  }

  return (
    <Modal title={profile ? t('Editar perfil') : t('Nuevo perfil')} onClose={() => !installing && onClose()} wide
      footer={installing
        ? <div className="footer-progress"><ProgressBar progress={installing} /></div>
        : <>
          {profile && (confirmDelete
            ? <button className="btn danger" onClick={remove}><Icon name="trash" /> {t('Borrar también mundos y mods')}</button>
            : <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}><Icon name="trash" /> {t('Eliminar')}</button>)}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
          <button className="btn primary" onClick={save} disabled={!form.version}>{profile ? t('Guardar') : t('Crear perfil')}</button>
        </>}>
      {!profile && <ModeSwitch mode="new" onChange={setMode} disabled={!!installing} />}
      <div className="identity">
        <button className="photo-picker" onClick={choosePhoto} title={t('Cambiar foto')}>
          <ProfileBadge profile={{ ...form, name: form.name || (form.loader === 'fabric' ? 'Fabric' : 'Minecraft') }} src={preview} size={96} />
          <span className="photo-overlay"><Icon name="image" size={22} /></span>
        </button>
        <div className="identity-fields">
          <Field label={t('Nombre')}>
            <input value={form.name} placeholder={`Minecraft ${form.version || ''}`} onChange={e => set('name', e.target.value)} />
          </Field>
          <div className="row">
            <button className="btn small" onClick={choosePhoto}><Icon name="image" size={14} /> {preview ? t('Cambiar foto') : t('Añadir foto')}</button>
            {preview && <button className="btn small ghost" onClick={() => setIcon(null)}>{t('Quitar foto')}</button>}
            <div className="colors compact">
              {COLORS.map(c => (
                <button key={c} className={`color ${form.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set('color', c)} aria-label={`Color ${c}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="form-grid">
        <Field label={t('Versión de Minecraft')}>
          <select value={form.version} onChange={e => set('version', e.target.value)} disabled={!versions}>
            {!versions && <option>{t('Cargando…')}</option>}
            {list.map(v => <option key={v.id} value={v.id}>{v.id}{v.type === 'snapshot' ? ' (snapshot)' : ''}</option>)}
          </select>
        </Field>
        <Field label={t('Tipo')} hint={form.loader === 'fabric' && fabricVersions.length && !fabricOk ? t('Fabric no existe para esta versión') : t('Fabric permite instalar mods')}>
          <div className="segmented">
            <button className={form.loader === 'vanilla' ? 'active' : ''} onClick={() => set('loader', 'vanilla')}>Vanilla</button>
            <button className={form.loader === 'fabric' ? 'active' : ''} onClick={() => set('loader', 'fabric')}>{t('Fabric (mods)')}</button>
          </div>
        </Field>
      </div>

      <Toggle checked={showSnapshots} onChange={setShowSnapshots} label={t('Mostrar snapshots')} hint={t('Versiones de prueba de Mojang')} />

      {!profile && (
        <div className={`builtin-box ${form.loader !== 'fabric' ? 'off' : ''}`}>
          <div className="builtin-box-head">
            <img src={ghostLogo} alt="" />
            <div>
              <strong>{t('Mods integrados')}</strong>
              <small>{form.loader === 'fabric' ? t('Las funciones de un cliente PvP, listas desde el primer momento') : t('Necesitan Fabric: cambia el tipo a "Fabric (mods)"')}</small>
            </div>
          </div>
          <Toggle checked={withBuiltins && form.loader === 'fabric'} onChange={setWithBuiltins}
            label={t('Mods de Ghost ({n})', { n: catalog ? catalog.enabled.length : '…' })}
            hint={t('HUD (FPS, CPS, keystrokes…), zoom, freelook, minimapa, shaders, rendimiento… Elige cuáles en Ajustes.')} />
          <Toggle checked={withCapes && form.loader === 'fabric'} onChange={setWithCapes}
            label="Capes" hint={t('Muestra capas de OptiFine, MinecraftCapes, Cosmetica y más')} />
        </div>
      )}

      {profile && profile.loader === 'fabric' && (
        <button className="link-card" onClick={() => { onClose(); openMods(profile.id) }}>
          <Icon name="puzzle" />
          <div><strong>{t('Gestionar mods de este perfil')}</strong><small>{t('Añadir, quitar, activar o desactivar')}</small></div>
          <Icon name="back" className="flip" />
        </button>
      )}

      {profile && (
        <div className="tool-cards">
          <button className="link-card" onClick={() => onTool('optimize')}>
            <Icon name="zap" />
            <div><strong>{t('Optimizar para tu PC')}</strong><small>{t('RAM, ajustes de vídeo y mods de rendimiento según tu equipo')}</small></div>
            <Icon name="back" className="flip" />
          </button>
          <button className="link-card" onClick={() => onTool('export')}>
            <Icon name="download" />
            <div><strong>{t('Exportar perfil')}</strong><small>{t('Un archivo para pasarlo a otro PC o a un amigo')}</small></div>
            <Icon name="back" className="flip" />
          </button>
        </div>
      )}

      {profile && <ModrinthHours ctx={ctx} profile={profile} />}

      <div className="divider" />
      <h3 className="sub">{t('Rendimiento')}</h3>
      <Toggle checked={form.customRam} onChange={v => set('customRam', v)} label={t('RAM propia para este perfil')}
        hint={form.customRam ? null : t('Usa la de Ajustes ({gb} GB)', { gb: (settings.maxRam / 1024).toFixed(1) })} />
      {form.customRam && <RamSlider value={form.ramMax} onChange={v => set('ramMax', v)} totalRam={system?.totalRam} />}

      <div className="form-grid">
        <Field label={t('Resolución de la ventana')} hint={t('Déjalo vacío para la de por defecto')}>
          <div className="res">
            <input type="number" placeholder={t('Ancho')} value={form.width} onChange={e => set('width', e.target.value)} />
            <span>×</span>
            <input type="number" placeholder={t('Alto')} value={form.height} onChange={e => set('height', e.target.value)} />
          </div>
        </Field>
        <Field label={t('Argumentos de Java')} hint={t('Se añaden a los de Ajustes')}>
          <input value={form.jvmArgs} placeholder="-XX:+UseG1GC" onChange={e => set('jvmArgs', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function ImportModal ({ ctx, onClose }) {
  const { notify, refreshProfiles, setSelected, applyIcon, openMods } = ctx
  const [tab, setTab] = useState('modrinth')
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => on('import:progress', setProgress), [])

  const finish = async (result) => {
    await applyIcon(result.profile.id, result.icon)
    await refreshProfiles()
    setSelected(result.profile.id)
    const extra = result.builtins?.installed?.length
    notify(extra ? t('"{name}" importado con {n} mods integrados añadidos', { name: result.profile.name, n: extra }) : t('"{name}" importado', { name: result.profile.name }))
    for (const m of result.medals || []) notify(t('¡Medalla de {h} horas para «{name}» con las horas de Modrinth!', { h: m.hours, name: m.profileName }), 'medal', { medal: m.hours })
    onClose()
    openMods(result.profile.id)
  }

  const run = async (key, fn) => {
    setBusy(key)
    try { await finish(await fn()) } catch (e) { notify(e.message, 'error') }
    setBusy(null)
    setProgress(null)
  }

  return (
    <Modal title={t('Importar modpack')} onClose={() => !busy && onClose()} wide>
      <div className="tabs">
        <button className={tab === 'modrinth' ? 'active' : ''} onClick={() => setTab('modrinth')} disabled={!!busy}>Modrinth</button>
        <button className={tab === 'lunar' ? 'active' : ''} onClick={() => setTab('lunar')} disabled={!!busy}>Lunar Client</button>
        <button className={tab === 'mrapp' ? 'active' : ''} onClick={() => setTab('mrapp')} disabled={!!busy}>Modrinth App</button>
      </div>
      {progress && <ProgressBar progress={progress} />}
      {tab === 'modrinth' && <ModrinthPacks busy={busy} run={run} notify={notify} />}
      {tab === 'lunar' && <LunarPacks busy={busy} run={run} />}
      {tab === 'mrapp' && <ModrinthAppPacks busy={busy} run={run} />}
    </Modal>
  )
}

function ModrinthPacks ({ busy, run, notify }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      call('content:search', { query, type: 'modpack', loader: 'fabric', sort: query ? 'relevance' : 'downloads' })
        .then(r => setResults(r.hits)).catch(e => notify(t('Modrinth no responde: {error}', { error: e.message }), 'error'))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const fromFile = async () => {
    const file = await call('modpacks:pickFile')
    if (file) run('file', () => call('modpacks:importFile', file))
  }

  return (
    <div className="import-pane">
      <div className="browse-bar">
        <div className="search">
          <Icon name="search" />
          <input value={query} placeholder={t('Buscar modpacks de Fabric…')} onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn" onClick={fromFile} disabled={!!busy}><Icon name="archive" /> {busy === 'file' ? t('Importando…') : t('Abrir .mrpack')}</button>
      </div>
      <div className="results compact">
        {results?.map(hit => (
          <div key={hit.project_id} className="result">
            {hit.icon_url ? <img className="item-icon" src={hit.icon_url} alt="" /> : <div className="item-icon placeholder"><Icon name="package" /></div>}
            <div className="result-text">
              <div className="result-title"><strong>{hit.title}</strong><small className="muted">{t('por {author}', { author: hit.author })}</small></div>
              <p>{hit.description}</p>
            </div>
            <button className="btn small primary" disabled={!!busy} onClick={() => run(hit.project_id, () => call('modpacks:installModrinth', hit.project_id))}>
              <Icon name="download" size={14} /> {busy === hit.project_id ? t('Instalando…') : t('Instalar')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function LunarPacks ({ busy, run }) {
  const [data, setData] = useState(null)
  const [releases, setReleases] = useState([])
  const [choices, setChoices] = useState({})
  const [copySaves, setCopySaves] = useState(false)

  useEffect(() => {
    call('modpacks:listLunar').then(d => {
      setData(d)
      setChoices(Object.fromEntries(d.profiles.map(p => [p.folder, p.version || ''])))
    })
    call('versions:list').then(v => setReleases(v.versions.filter(x => x.type === 'release').map(x => x.id)))
  }, [])

  if (!data) return <div className="center"><div className="spinner" /></div>
  if (!data.found) return <Empty icon="search" title={t('No se encontró Lunar Client')} text={t('Busqué en la carpeta .lunarclient de tu usuario y no hay perfiles.')} />

  return (
    <div className="import-pane">
      <p className="muted small-text">{t('Se copian los mods, su configuración, las texturas, los shaders, los servidores y tus ajustes de Minecraft (teclas, sensibilidad, FOV, interfaz…). Tu perfil de Lunar no se modifica.')}</p>
      <Toggle checked={copySaves} onChange={setCopySaves} label={t('Copiar también los mundos')} hint={t('Puede tardar si tienes mundos grandes')} />
      <div className="results compact">
        {data.profiles.map(p => (
          <div key={p.folder} className="result">
            <div className="item-icon placeholder"><Icon name={p.mods ? 'puzzle' : 'boxes'} /></div>
            <div className="result-text">
              <strong>{p.name}</strong>
              <small className="muted">
                {p.mods ? `${p.mods} mods · Fabric` : t('Sin mods · Vanilla')}
                {p.resourcepacks ? ' · ' + t('{n} texturas', { n: p.resourcepacks }) : ''}
                {p.saves ? ' · ' + t('{n} mundos', { n: p.saves }) : ''}
              </small>
            </div>
            <select className="version-select" value={choices[p.folder] || ''} onChange={e => setChoices(c => ({ ...c, [p.folder]: e.target.value }))} aria-label={t('Versión')}>
              {!choices[p.folder] && <option value="">{t('Elige versión')}</option>}
              {releases.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="btn small primary" disabled={!!busy || !choices[p.folder]}
              onClick={() => run(p.folder, () => call('modpacks:importLunar', p.folder, { version: choices[p.folder], copySaves }))}>
              <Icon name="download" size={14} /> {busy === p.folder ? t('Importando…') : t('Importar')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Instancias de la app de Modrinth, con sus horas jugadas
function ModrinthAppPacks ({ busy, run }) {
  const [data, setData] = useState(null)
  const [copySaves, setCopySaves] = useState(false)
  useEffect(() => { call('modrinthApp:list').then(setData).catch(() => setData({ found: false, instances: [] })) }, [])

  if (!data) return <div className="center"><div className="spinner" /></div>
  if (!data.found) return <Empty icon="search" title={t('No se encontró la app de Modrinth')} text={t('Si la tienes instalada en este PC, ábrela una vez y vuelve a intentarlo.')} />

  return (
    <div className="import-pane">
      <p className="muted small-text">{t('Se copian los mods, su configuración, las texturas, los shaders, los servidores, tus ajustes de Minecraft (teclas, sensibilidad, FOV, interfaz…) y también las horas jugadas. Las cachés (como la de Voxy) no se copian. La app de Modrinth no se modifica.')}</p>
      <Toggle checked={copySaves} onChange={setCopySaves} label={t('Copiar también mundos, repeticiones, copias de seguridad y capturas')} hint={t('Pueden ocupar varios GB y tardar un rato')} />
      <div className="results compact">
        {data.instances.map(i => {
          const supported = ['fabric', 'vanilla'].includes(i.loader)
          return (
            <div key={i.id} className="result">
              <div className="item-icon placeholder"><Icon name={i.mods ? 'puzzle' : 'boxes'} /></div>
              <div className="result-text">
                <strong>{i.name}</strong>
                <small className="muted">
                  {i.version} · {i.loader === 'fabric' ? 'Fabric' : i.loader} · {i.mods} mods · <Icon name="timer" size={11} /> {formatPlayTime(i.seconds)}
                </small>
              </div>
              <button className="btn small primary" disabled={!!busy || !supported || !i.exists}
                title={!supported ? t('De momento solo Fabric y Vanilla') : ''}
                onClick={() => run(i.id, () => call('modrinthApp:import', i.id, { copySaves }))}>
                <Icon name="download" size={14} /> {busy === i.id ? t('Importando…') : t('Importar')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Sumar a un perfil que ya existe las horas de una instancia de Modrinth (una sola vez por instancia)
function ModrinthHours ({ ctx, profile }) {
  const { notify, refreshProfiles } = ctx
  const [data, setData] = useState(null)
  const [choice, setChoice] = useState('')
  const [used, setUsed] = useState(new Set())
  useEffect(() => {
    call('modrinthApp:list').then(d => {
      setData(d)
      // Por defecto, la instancia con el mismo nombre o versión que el perfil
      const guess = d.instances.find(i => i.name === profile.name) || d.instances.find(i => i.version === profile.version && i.seconds > 0)
      if (guess) setChoice(guess.id)
    }).catch(() => setData({ found: false, instances: [] }))
    call('profiles:list').then(list => setUsed(new Set(list.flatMap(p => p.hoursFrom || []))))
  }, [])

  if (!data || !data.found || !data.instances.some(i => i.seconds > 0)) return null
  const options = data.instances.filter(i => i.seconds > 0)
  const selected = options.find(i => i.id === choice)
  const already = selected && used.has(selected.id)

  const add = async () => {
    try {
      const r = await call('modrinthApp:addHours', profile.id, choice)
      notify(t('Sumadas {time} de Modrinth a «{name}»', { time: formatPlayTime(r.seconds), name: profile.name }))
      for (const m of r.medals || []) notify(t('¡Medalla de {h} horas para «{name}»!', { h: m.hours, name: m.profileName }), 'medal', { medal: m.hours })
      setUsed(u => new Set([...u, choice]))
      refreshProfiles()
    } catch (e) { notify(e.message, 'error') }
  }

  return (
    <div className="mr-hours">
      <div className="mr-hours-text">
        <strong><Icon name="timer" size={14} /> {t('Horas de Modrinth App')}</strong>
        <small className="muted">{t('Suma a este perfil las horas que jugaste en una instancia de Modrinth (cuentan para las medallas).')}</small>
      </div>
      <div className="row">
        <select value={choice} onChange={e => setChoice(e.target.value)} aria-label={t('Instancia de Modrinth')}>
          <option value="">{t('Elige instancia…')}</option>
          {options.map(i => <option key={i.id} value={i.id}>{i.name} — {formatPlayTime(i.seconds)}{used.has(i.id) ? ' ' + t('(ya sumadas)') : ''}</option>)}
        </select>
        <button className="btn small primary" disabled={!choice || already} onClick={add}>{already ? t('Ya sumadas') : t('Sumar horas')}</button>
      </div>
    </div>
  )
}
