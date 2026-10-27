import React, { useEffect, useRef, useState } from 'react'
import { call, on, formatBytes } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { Empty, ProgressBar, ProfileBadge } from '../components/ui.jsx'
import ghostLogo from '../assets/logo.png'

const TYPES = [
  { id: 'mod', label: 'Mods' },
  { id: 'resourcepack', label: 'Texturas' },
  { id: 'shader', label: 'Shaders' }
]

// Atajos de búsqueda: todo gratis desde Modrinth
const QUICK = [
  { label: 'Rendimiento', query: 'sodium', type: 'mod' },
  { label: 'Cosméticos y capas', query: 'cosmetics', type: 'mod' },
  { label: 'Minimapa', query: 'minimap', type: 'mod' },
  { label: 'Zoom', query: 'zoom', type: 'mod' },
  { label: 'HUD / PvP', query: 'hud', type: 'mod' },
  { label: 'Shaders (Iris)', query: 'iris', type: 'mod' }
]

export default function Content ({ ctx }) {
  const { profiles, selected, setSelected, notify, setPage, contentTab: tab, setContentTab: setTab } = ctx
  const profile = profiles.find(p => p.id === selected) || profiles[0]

  if (!profile) {
    return (
      <div className="page">
        <Empty icon="puzzle" title="Primero crea un perfil" text="Los mods se instalan dentro de un perfil con Fabric.">
          <button className="btn primary" onClick={() => setPage('profiles')}>Ir a perfiles</button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="content-head">
          <ProfileBadge profile={profile} size={56} />
          <div>
            <h1>Mods de {profile.name}</h1>
            <p className="muted">{profile.version} · {profile.loader === 'fabric' ? 'Fabric' : 'Vanilla'} — instala lo que quieras desde Modrinth o arrastrando tus archivos.</p>
          </div>
        </div>
        <select className="profile-select" value={profile.id} onChange={e => setSelected(e.target.value)} aria-label="Cambiar de perfil">
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.version} · {p.loader === 'fabric' ? 'Fabric' : 'Vanilla'})</option>)}
        </select>
      </div>

      <div className="tabs">
        <button className={tab === 'installed' ? 'active' : ''} onClick={() => setTab('installed')}>Instalados</button>
        <button className={tab === 'browse' ? 'active' : ''} onClick={() => setTab('browse')}>Explorar Modrinth</button>
      </div>

      {tab === 'installed'
        ? <Installed key={profile.id} profile={profile} notify={notify} goBrowse={() => setTab('browse')} />
        : <Browse key={profile.id} profile={profile} notify={notify} />}
    </div>
  )
}

function Installed ({ profile, notify, goBrowse }) {
  const [items, setItems] = useState(null)
  const [dragging, setDragging] = useState(false)
  const load = () => call('content:list', profile.id).then(setItems)
  useEffect(() => { load() }, [])

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files].map(f => window.launcher.filePath(f)).filter(f => /\.(jar|zip)$/i.test(f))
    if (!files.length) return notify('Solo se aceptan archivos .jar (mods) o .zip (texturas)', 'error')
    await call('content:addFiles', profile.id, files)
    notify(`${files.length} archivo(s) añadido(s)`)
    load()
  }

  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(null)
  const shown = items?.filter(it => !filter || it.title.toLowerCase().includes(filter.toLowerCase()))

  useEffect(() => on('builtins:progress', p => p && setAdding(p)), [])

  // Añade a este perfil los mods integrados que le falten (los que ya tiene no se tocan)
  const addBuiltins = async () => {
    setAdding({ stage: 'Preparando mods integrados…', current: 0, total: 0 })
    try {
      const r = await call('builtins:apply', profile.id, null)
      notify(r.installed.length
        ? `Añadidos ${r.installed.length} mods integrados${r.skipped.length ? ` (no disponibles para ${profile.version}: ${r.skipped.join(', ')})` : ''}`
        : 'Este perfil ya tenía todos los mods integrados')
    } catch (e) { notify(e.message, 'error') }
    setAdding(null)
    load()
  }

  const toggle = async (it) => {
    await call('content:toggle', profile.id, it.type, it.file, !it.enabled)
    load()
  }
  const remove = async (it) => {
    await call('content:remove', profile.id, it.type, it.file)
    notify(`${it.title} eliminado`)
    load()
  }

  return (
    <div className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="installed-toolbar">
        <div className="row">
          {items?.length > 6 && (
            <div className="search small">
              <Icon name="search" size={15} />
              <input value={filter} placeholder="Filtrar…" onChange={e => setFilter(e.target.value)} />
            </div>
          )}
          <span className="muted small-text">{items ? `${items.length} elementos · ${items.filter(i => i.enabled).length} activos` : 'Cargando…'} · arrastra aquí tus .jar o .zip</span>
        </div>
        <div className="row">
          {profile.loader === 'fabric' && (
            <button className="btn small" onClick={addBuiltins} disabled={!!adding} title="Instala los mods integrados de Ghost que le falten a este perfil">
              <Icon name="sparkles" size={14} /> {adding ? 'Añadiendo…' : 'Mods integrados'}
            </button>
          )}
          <button className="btn small ghost" onClick={() => call('profiles:openFolder', profile.id, 'mods')}><Icon name="folder" size={14} /> Carpeta de mods</button>
          <button className="btn small ghost" onClick={() => call('profiles:openFolder', profile.id, 'resourcepacks')}><Icon name="folder" size={14} /> Texturas</button>
          <button className="btn small ghost" onClick={load}>Actualizar</button>
        </div>
      </div>

      {adding && <ProgressBar progress={adding} />}

      {items && items.length === 0 && (
        <Empty icon="upload" title="No hay nada instalado" text={profile.loader === 'fabric' ? 'Busca mods en Modrinth o arrastra tus archivos aquí.' : 'Este perfil es Vanilla: puedes añadir texturas y shaders. Para mods, cambia el perfil a Fabric.'}>
          <button className="btn primary" onClick={goBrowse}><Icon name="search" /> Explorar Modrinth</button>
        </Empty>
      )}

      <div className="item-list">
        {shown?.map(it => (
          <div key={it.type + it.file} className={`item ${it.enabled ? '' : 'disabled'}`}>
            {it.projectId === 'ghost-client' ? <img className="item-icon ghost-icon" src={ghostLogo} alt="" /> : it.icon ? <img className="item-icon" src={it.icon} alt="" /> : <div className="item-icon placeholder"><Icon name="puzzle" /></div>}
            <div className="item-text">
              <strong>{it.title}</strong>
              <small>
                {TYPES.find(t => t.id === it.type)?.label}
                {it.versionNumber ? ` · ${it.versionNumber}` : ''}
                {it.manual ? ' · Añadido a mano' : ''}
                {' · '}{formatBytes(it.size)}
              </small>
            </div>
            <button className={`toggle ${it.enabled ? 'on' : ''}`} role="switch" aria-checked={it.enabled} aria-label={`Activar ${it.title}`} onClick={() => toggle(it)}><span /></button>
            <button className="icon-btn" title="Eliminar" onClick={() => remove(it)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Browse ({ profile, notify }) {
  const [type, setType] = useState(profile.loader === 'fabric' ? 'mod' : 'resourcepack')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [results, setResults] = useState(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [installing, setInstalling] = useState(null)
  const [installed, setInstalled] = useState(new Set())
  const [progress, setProgress] = useState(null)
  const debounce = useRef()

  useEffect(() => on('content:progress', setProgress), [])
  useEffect(() => {
    call('content:list', profile.id).then(list => setInstalled(new Set(list.map(i => i.projectId).filter(Boolean))))
  }, [])

  const search = async (q = query, t = type, s = sort, o = 0) => {
    try {
      const res = await call('content:search', {
        query: q, type: t, sort: s, offset: o,
        gameVersion: profile.version,
        loader: profile.loader === 'fabric' ? 'fabric' : null
      })
      setResults(o === 0 ? res.hits : r => [...(r || []), ...res.hits])
      setTotal(res.total_hits)
      setOffset(o)
    } catch (e) { notify(`Modrinth no responde: ${e.message}`, 'error') }
  }

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(query, type, sort, 0), 300)
  }, [query, type, sort])

  const install = async (hit) => {
    if (type === 'mod' && profile.loader !== 'fabric') return notify('Este perfil es Vanilla. Edítalo y cámbialo a Fabric para usar mods.', 'error')
    setInstalling(hit.project_id)
    try {
      const names = await call('content:install', profile.id, hit.project_id, type)
      setInstalled(s => new Set([...s, hit.project_id]))
      notify(names.length > 1 ? `Instalado ${names[0]} (+ ${names.slice(1).join(', ')})` : `Instalado ${names[0]}`)
    } catch (e) { notify(e.message, 'error') }
    setInstalling(null)
    setProgress(null)
  }

  return (
    <div>
      <div className="browse-bar">
        <div className="search">
          <Icon name="search" />
          <input value={query} placeholder={`Buscar en Modrinth para ${profile.version}…`} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="segmented">
          {TYPES.map(t => <button key={t.id} className={type === t.id ? 'active' : ''} onClick={() => setType(t.id)}>{t.label}</button>)}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Ordenar">
          <option value="relevance">Relevancia</option>
          <option value="downloads">Descargas</option>
          <option value="follows">Populares</option>
          <option value="updated">Actualizados</option>
          <option value="newest">Nuevos</option>
        </select>
      </div>

      {type === 'mod' && (
        <div className="chips">
          {QUICK.map(q => <button key={q.label} className={`chip ${query === q.query ? 'active' : ''}`} onClick={() => setQuery(q.query)}><Icon name="sparkles" size={13} /> {q.label}</button>)}
        </div>
      )}

      {progress && <ProgressBar progress={progress} />}

      {results && results.length === 0 && <Empty icon="search" title="Sin resultados" text={`No hay nada para ${profile.version} con esa búsqueda.`} />}

      <div className="results">
        {results?.map(hit => (
          <div key={hit.project_id} className="result">
            {hit.icon_url ? <img className="item-icon big" src={hit.icon_url} alt="" /> : <div className="item-icon big placeholder"><Icon name="puzzle" /></div>}
            <div className="result-text">
              <div className="result-title">
                <strong>{hit.title}</strong>
                <small className="muted">por {hit.author}</small>
              </div>
              <p>{hit.description}</p>
              <small className="muted"><Icon name="download" size={12} /> {Intl.NumberFormat('es', { notation: 'compact' }).format(hit.downloads)} descargas</small>
            </div>
            {installed.has(hit.project_id)
              ? <button className="btn small ghost" onClick={() => install(hit)} disabled={!!installing}><Icon name="check" size={14} /> Instalado</button>
              : (
                <button className="btn small primary" onClick={() => install(hit)} disabled={!!installing}>
                  <Icon name="download" size={14} /> {installing === hit.project_id ? 'Instalando…' : 'Instalar'}
                </button>
                )}
          </div>
        ))}
      </div>
      {results && results.length < total && (
        <div className="center"><button className="btn ghost" onClick={() => search(query, type, sort, offset + 20)}>Cargar más</button></div>
      )}
    </div>
  )
}
