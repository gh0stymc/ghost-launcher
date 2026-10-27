import React, { useEffect, useState } from 'react'
import { call, on, timeAgo, formatPlayTime } from '../api.js'
import { toSquarePng, pickImage } from '../image.js'
import { Icon } from '../components/Icon.jsx'
import { Modal, Field, RamSlider, Toggle, ProfileBadge, Empty, ProgressBar, loaderLabel } from '../components/ui.jsx'
import ghostLogo from '../assets/logo.png'
import UpgradeModal, { ModeSwitch } from './UpgradeModal.jsx'

const COLORS = ['#7c5cff', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#eab308', '#ef4444', '#94a3b8']

export default function Profiles ({ ctx }) {
  const { profiles, refreshProfiles, selected, setSelected, launch, running, progress, setPage, openMods } = ctx
  const [editing, setEditing] = useState(null) // null | 'new' | perfil
  const [importing, setImporting] = useState(false)

  const play = (id) => { setSelected(id); setPage('home'); launch(id) }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Perfiles</h1>
          <p className="muted">Cada perfil tiene su propia carpeta con mods, mundos y ajustes.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}><Icon name="package" /> Importar modpack</button>
          <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> Nuevo perfil</button>
        </div>
      </div>

      {profiles.length === 0
        ? (
          <Empty icon="ghost" title="Crea tu primer perfil" text="Elige una versión de Minecraft, o importa un modpack de Lunar Client o Modrinth.">
            <div className="row">
              <button className="btn" onClick={() => setImporting(true)}><Icon name="package" /> Importar modpack</button>
              <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> Nuevo perfil</button>
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
                    {running.includes(p.id) && <span className="cover-badge"><span className="live-dot static" /> Jugando</span>}
                    {p.source?.type && <span className="cover-badge right">{p.source.type === 'lunar' ? 'Lunar' : 'Modrinth'}</span>}
                  </div>
                </div>
                <div className="profile-card-body">
                  <ProfileBadge profile={p} size={58} />
                  <div className="profile-card-info">
                    <strong>{p.name}</strong>
                    <small>{p.version} · {loaderLabel(p)}</small>
                    {p.playTime >= 60 && <small><Icon name="timer" size={12} /> {formatPlayTime(p.playTime)} jugadas</small>}
                    <small className="muted"><Icon name="clock" size={12} /> {timeAgo(p.lastPlayed)}</small>
                  </div>
                </div>
                <div className="profile-card-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn small primary grow" disabled={!!progress || running.includes(p.id)} onClick={() => play(p.id)}>
                    <Icon name="play" size={14} fill="currentColor" /> {running.includes(p.id) ? 'Abierto' : 'Jugar'}
                  </button>
                  <button className="btn small" onClick={() => openMods(p.id)} title="Editar los mods de este perfil">
                    <Icon name="puzzle" size={14} /> Mods
                  </button>
                  <button className="icon-btn" title="Editar perfil" onClick={() => setEditing(p)}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn" title="Abrir carpeta" onClick={() => call('profiles:openFolder', p.id)}><Icon name="folder" size={16} /></button>
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
        />
      )}
      {importing && <ImportModal ctx={ctx} onClose={() => setImporting(false)} />}
    </div>
  )
}

function ProfileModal ({ ctx, profile, onClose, onSaved }) {
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
    }).catch(e => notify(`No se pudo cargar la lista de versiones: ${e.message}`, 'error'))
    call('versions:fabric').then(setFabricVersions).catch(() => {})
  }, [])

  const list = (versions?.versions || []).filter(v => v.type === 'release' || (showSnapshots && v.type === 'snapshot'))
  const fabricOk = fabricVersions.includes(form.version)
  const preview = icon !== undefined ? icon : profile?.iconUrl || null

  const choosePhoto = async () => {
    const file = await pickImage()
    if (!file) return
    try { setIcon(await toSquarePng(file)) } catch { notify('No se pudo leer esa imagen', 'error') }
  }

  const save = async () => {
    if (!form.version) return
    if (form.loader === 'fabric' && fabricVersions.length && !fabricOk) return notify(`Fabric no está disponible para ${form.version}`, 'error')
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
        setInstalling({ stage: 'Preparando mods integrados…', current: 0, total: 0 })
        const r = await call('builtins:apply', saved.id, slugs)
        notify(`Perfil creado con ${r.installed.length} mods${r.skipped.length ? ` (no disponibles para ${data.version}: ${r.skipped.join(', ')})` : ''}`)
      } else {
        notify(profile ? 'Perfil guardado' : 'Perfil creado')
      }
      onSaved(saved)
    } catch (e) {
      setInstalling(null)
      notify(e.message, 'error')
    }
  }

  const remove = async () => {
    await call('profiles:remove', profile.id, true)
    notify('Perfil eliminado')
    onSaved(null)
  }

  if (!profile && mode === 'upgrade') {
    return <UpgradeModal ctx={ctx} onClose={onClose} onSaved={onSaved} onModeChange={setMode} />
  }

  return (
    <Modal title={profile ? 'Editar perfil' : 'Nuevo perfil'} onClose={() => !installing && onClose()} wide
      footer={installing
        ? <div className="footer-progress"><ProgressBar progress={installing} /></div>
        : <>
          {profile && (confirmDelete
            ? <button className="btn danger" onClick={remove}><Icon name="trash" /> Borrar también mundos y mods</button>
            : <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}><Icon name="trash" /> Eliminar</button>)}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={!form.version}>{profile ? 'Guardar' : 'Crear perfil'}</button>
        </>}>
      {!profile && <ModeSwitch mode="new" onChange={setMode} disabled={!!installing} />}
      <div className="identity">
        <button className="photo-picker" onClick={choosePhoto} title="Cambiar foto">
          <ProfileBadge profile={{ ...form, name: form.name || (form.loader === 'fabric' ? 'Fabric' : 'Minecraft') }} src={preview} size={96} />
          <span className="photo-overlay"><Icon name="image" size={22} /></span>
        </button>
        <div className="identity-fields">
          <Field label="Nombre">
            <input value={form.name} placeholder={`Minecraft ${form.version || ''}`} onChange={e => set('name', e.target.value)} />
          </Field>
          <div className="row">
            <button className="btn small" onClick={choosePhoto}><Icon name="image" size={14} /> {preview ? 'Cambiar foto' : 'Añadir foto'}</button>
            {preview && <button className="btn small ghost" onClick={() => setIcon(null)}>Quitar foto</button>}
            <div className="colors compact">
              {COLORS.map(c => (
                <button key={c} className={`color ${form.color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set('color', c)} aria-label={`Color ${c}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="form-grid">
        <Field label="Versión de Minecraft">
          <select value={form.version} onChange={e => set('version', e.target.value)} disabled={!versions}>
            {!versions && <option>Cargando…</option>}
            {list.map(v => <option key={v.id} value={v.id}>{v.id}{v.type === 'snapshot' ? ' (snapshot)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Tipo" hint={form.loader === 'fabric' && fabricVersions.length && !fabricOk ? 'Fabric no existe para esta versión' : 'Fabric permite instalar mods'}>
          <div className="segmented">
            <button className={form.loader === 'vanilla' ? 'active' : ''} onClick={() => set('loader', 'vanilla')}>Vanilla</button>
            <button className={form.loader === 'fabric' ? 'active' : ''} onClick={() => set('loader', 'fabric')}>Fabric (mods)</button>
          </div>
        </Field>
      </div>

      <Toggle checked={showSnapshots} onChange={setShowSnapshots} label="Mostrar snapshots" hint="Versiones de prueba de Mojang" />

      {!profile && (
        <div className={`builtin-box ${form.loader !== 'fabric' ? 'off' : ''}`}>
          <div className="builtin-box-head">
            <img src={ghostLogo} alt="" />
            <div>
              <strong>Mods integrados</strong>
              <small>{form.loader === 'fabric' ? 'Las funciones de un cliente PvP, listas desde el primer momento' : 'Necesitan Fabric: cambia el tipo a "Fabric (mods)"'}</small>
            </div>
          </div>
          <Toggle checked={withBuiltins && form.loader === 'fabric'} onChange={setWithBuiltins}
            label={`Mods de Ghost (${catalog ? catalog.enabled.length : '…'})`}
            hint="HUD (FPS, CPS, keystrokes…), zoom, freelook, minimapa, shaders, rendimiento… Elige cuáles en Ajustes." />
          <Toggle checked={withCapes && form.loader === 'fabric'} onChange={setWithCapes}
            label="Capes" hint="Muestra capas de OptiFine, MinecraftCapes, Cosmetica y más" />
        </div>
      )}

      {profile && profile.loader === 'fabric' && (
        <button className="link-card" onClick={() => { onClose(); openMods(profile.id) }}>
          <Icon name="puzzle" />
          <div><strong>Gestionar mods de este perfil</strong><small>Añadir, quitar, activar o desactivar</small></div>
          <Icon name="back" className="flip" />
        </button>
      )}

      {profile && <ModrinthHours ctx={ctx} profile={profile} />}

      <div className="divider" />
      <h3 className="sub">Rendimiento</h3>
      <Toggle checked={form.customRam} onChange={v => set('customRam', v)} label="RAM propia para este perfil"
        hint={form.customRam ? null : `Usa la de Ajustes (${(settings.maxRam / 1024).toFixed(1)} GB)`} />
      {form.customRam && <RamSlider value={form.ramMax} onChange={v => set('ramMax', v)} totalRam={system?.totalRam} />}

      <div className="form-grid">
        <Field label="Resolución de la ventana" hint="Déjalo vacío para la de por defecto">
          <div className="res">
            <input type="number" placeholder="Ancho" value={form.width} onChange={e => set('width', e.target.value)} />
            <span>×</span>
            <input type="number" placeholder="Alto" value={form.height} onChange={e => set('height', e.target.value)} />
          </div>
        </Field>
        <Field label="Argumentos de Java" hint="Se añaden a los de Ajustes">
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
    notify(`"${result.profile.name}" importado${extra ? ` con ${extra} mods integrados añadidos` : ''}`)
    for (const m of result.medals || []) notify(`¡Medalla de ${m.hours} horas para «${m.profileName}» con las horas de Modrinth!`, 'medal', { medal: m.hours })
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
    <Modal title="Importar modpack" onClose={() => !busy && onClose()} wide>
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
    const t = setTimeout(() => {
      call('content:search', { query, type: 'modpack', loader: 'fabric', sort: query ? 'relevance' : 'downloads' })
        .then(r => setResults(r.hits)).catch(e => notify(`Modrinth no responde: ${e.message}`, 'error'))
    }, 300)
    return () => clearTimeout(t)
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
          <input value={query} placeholder="Buscar modpacks de Fabric…" onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn" onClick={fromFile} disabled={!!busy}><Icon name="archive" /> {busy === 'file' ? 'Importando…' : 'Abrir .mrpack'}</button>
      </div>
      <div className="results compact">
        {results?.map(hit => (
          <div key={hit.project_id} className="result">
            {hit.icon_url ? <img className="item-icon" src={hit.icon_url} alt="" /> : <div className="item-icon placeholder"><Icon name="package" /></div>}
            <div className="result-text">
              <div className="result-title"><strong>{hit.title}</strong><small className="muted">por {hit.author}</small></div>
              <p>{hit.description}</p>
            </div>
            <button className="btn small primary" disabled={!!busy} onClick={() => run(hit.project_id, () => call('modpacks:installModrinth', hit.project_id))}>
              <Icon name="download" size={14} /> {busy === hit.project_id ? 'Instalando…' : 'Instalar'}
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
  if (!data.found) return <Empty icon="search" title="No se encontró Lunar Client" text="Busqué en la carpeta .lunarclient de tu usuario y no hay perfiles." />

  return (
    <div className="import-pane">
      <p className="muted small-text">Se copian los mods, su configuración, las texturas, los shaders, los servidores y <strong>tus ajustes de Minecraft</strong> (teclas, sensibilidad, FOV, interfaz…). Tu perfil de Lunar no se modifica.</p>
      <Toggle checked={copySaves} onChange={setCopySaves} label="Copiar también los mundos" hint="Puede tardar si tienes mundos grandes" />
      <div className="results compact">
        {data.profiles.map(p => (
          <div key={p.folder} className="result">
            <div className="item-icon placeholder"><Icon name={p.mods ? 'puzzle' : 'boxes'} /></div>
            <div className="result-text">
              <strong>{p.name}</strong>
              <small className="muted">
                {p.mods ? `${p.mods} mods · Fabric` : 'Sin mods · Vanilla'}
                {p.resourcepacks ? ` · ${p.resourcepacks} texturas` : ''}
                {p.saves ? ` · ${p.saves} mundos` : ''}
              </small>
            </div>
            <select className="version-select" value={choices[p.folder] || ''} onChange={e => setChoices(c => ({ ...c, [p.folder]: e.target.value }))} aria-label="Versión">
              {!choices[p.folder] && <option value="">Elige versión</option>}
              {releases.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="btn small primary" disabled={!!busy || !choices[p.folder]}
              onClick={() => run(p.folder, () => call('modpacks:importLunar', p.folder, { version: choices[p.folder], copySaves }))}>
              <Icon name="download" size={14} /> {busy === p.folder ? 'Importando…' : 'Importar'}
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
  if (!data.found) return <Empty icon="search" title="No se encontró la app de Modrinth" text="Si la tienes instalada en este PC, ábrela una vez y vuelve a intentarlo." />

  return (
    <div className="import-pane">
      <p className="muted small-text">Se copian los mods, su configuración, las texturas, los shaders, los servidores y <strong>tus ajustes de Minecraft</strong> (teclas, sensibilidad, FOV, interfaz…), y <strong>también las horas jugadas</strong>. Las cachés (como la de Voxy) no se copian. La app de Modrinth no se modifica.</p>
      <Toggle checked={copySaves} onChange={setCopySaves} label="Copiar también mundos, repeticiones, copias de seguridad y capturas" hint="Pueden ocupar varios GB y tardar un rato" />
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
                title={!supported ? 'De momento solo Fabric y Vanilla' : ''}
                onClick={() => run(i.id, () => call('modrinthApp:import', i.id, { copySaves }))}>
                <Icon name="download" size={14} /> {busy === i.id ? 'Importando…' : 'Importar'}
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
      notify(`Sumadas ${formatPlayTime(r.seconds)} de Modrinth a «${profile.name}»`)
      for (const m of r.medals || []) notify(`¡Medalla de ${m.hours} horas para «${m.profileName}»!`, 'medal', { medal: m.hours })
      setUsed(u => new Set([...u, choice]))
      refreshProfiles()
    } catch (e) { notify(e.message, 'error') }
  }

  return (
    <div className="mr-hours">
      <div className="mr-hours-text">
        <strong><Icon name="timer" size={14} /> Horas de Modrinth App</strong>
        <small className="muted">Suma a este perfil las horas que jugaste en una instancia de Modrinth (cuentan para las medallas).</small>
      </div>
      <div className="row">
        <select value={choice} onChange={e => setChoice(e.target.value)} aria-label="Instancia de Modrinth">
          <option value="">Elige instancia…</option>
          {options.map(i => <option key={i.id} value={i.id}>{i.name} — {formatPlayTime(i.seconds)}{used.has(i.id) ? ' (ya sumadas)' : ''}</option>)}
        </select>
        <button className="btn small primary" disabled={!choice || already} onClick={add}>{already ? 'Ya sumadas' : 'Sumar horas'}</button>
      </div>
    </div>
  )
}
