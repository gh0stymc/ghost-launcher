import React, { useEffect, useRef, useState } from 'react'
import { call, on, formatBytes } from '../api.js'
import { t, locale } from '../i18n.js'
import { Icon } from '../components/Icon.jsx'
import { Empty, ProgressBar, ProfileBadge } from '../components/ui.jsx'
import ghostLogo from '../assets/logo.png'

const TYPES = [
  { id: 'mod', label: 'Mods' },
  { id: 'resourcepack', label: 'Texturas' },
  { id: 'shader', label: 'Shaders' }
]

// Pestañas de la página: lo instalado y una tienda por cada tipo (todo gratis desde Modrinth)
const TABS = [
  { id: 'installed', label: 'Instalados', icon: 'check' },
  { id: 'mod', label: 'Mods', icon: 'puzzle' },
  { id: 'resourcepack', label: 'Texturas', icon: 'picture' },
  { id: 'shader', label: 'Shaders', icon: 'sun' }
]

// Atajos de búsqueda de mods
const QUICK = [
  { label: 'Rendimiento', query: 'sodium' },
  { label: 'Cosméticos y capas', query: 'cosmetics' },
  { label: 'Minimapa', query: 'minimap' },
  { label: 'Zoom', query: 'zoom' },
  { label: 'HUD / PvP', query: 'hud' }
]

// Filtros de texture packs y shaders (categorías de Modrinth). Dentro de un grupo basta con una.
const PACK_FILTERS = {
  resourcepack: [
    {
      label: 'Estilo',
      options: [
        { label: 'PvP', cats: ['combat'] },
        { label: 'Vanilla+', cats: ['vanilla-like'] },
        { label: 'Simplistas', cats: ['simplistic'] },
        { label: 'Realistas', cats: ['realistic'] },
        { label: 'Temáticos', cats: ['themed'] }
      ]
    },
    {
      label: 'Resolución',
      options: [
        { label: '16x', cats: ['16x', '8x-'] },
        { label: '32x', cats: ['32x', '48x'] },
        { label: '64x+', cats: ['64x', '128x', '256x', '512x+'] }
      ]
    }
  ],
  shader: [
    {
      label: 'Rendimiento',
      options: [
        { label: 'Ligeros', cats: ['potato', 'low'] },
        { label: 'Medios', cats: ['medium'] },
        { label: 'Altos', cats: ['high', 'screenshot'] }
      ]
    },
    {
      label: 'Estilo',
      options: [
        { label: 'Realistas', cats: ['realistic', 'semi-realistic'] },
        { label: 'Vanilla+', cats: ['vanilla-like'] },
        { label: 'Fantasía', cats: ['fantasy', 'cartoon'] }
      ]
    }
  ]
}

// Etiquetas que se muestran en las tarjetas
const TAG_LABELS = {
  '8x-': '8x', '16x': '16x', '32x': '32x', '48x': '48x', '64x': '64x', '128x': '128x', '256x': '256x', '512x+': '512x+',
  potato: 'Muy ligero', low: 'Ligero', medium: 'Medio', high: 'Exigente', screenshot: 'Para capturas',
  combat: 'PvP', 'vanilla-like': 'Vanilla+', simplistic: 'Simplista', realistic: 'Realista', 'semi-realistic': 'Semirrealista',
  themed: 'Temático', fantasy: 'Fantasía', cartoon: 'Cartoon'
}

export default function Content ({ ctx }) {
  const { profiles, selected, setSelected, notify, setPage, contentTab: tab, setContentTab: setTab } = ctx
  const profile = profiles.find(p => p.id === selected) || profiles[0]
  // Compatibilidad con la pestaña antigua "browse"
  const current = tab === 'browse' ? 'mod' : tab

  if (!profile) {
    return (
      <div className="page">
        <Empty icon="puzzle" title={t('Primero crea un perfil')} text={t('Los mods, texturas y shaders se instalan dentro de un perfil.')}>
          <button className="btn primary" onClick={() => setPage('profiles')}>{t('Ir a perfiles')}</button>
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
            <h1>{t('Contenido de {name}', { name: profile.name })}</h1>
            <p className="muted">{profile.version} · {profile.loader === 'fabric' ? 'Fabric' : 'Vanilla'} — {t('mods, texturas y shaders gratis desde Modrinth, o arrastrando tus archivos.')}</p>
          </div>
        </div>
        <select className="profile-select" value={profile.id} onChange={e => setSelected(e.target.value)} aria-label={t('Cambiar de perfil')}>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.version} · {p.loader === 'fabric' ? 'Fabric' : 'Vanilla'})</option>)}
        </select>
      </div>

      <div className="tabs content-tabs">
        {TABS.map(x => (
          <button key={x.id} className={current === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} size={15} /> {t(x.label)}
          </button>
        ))}
      </div>

      {current === 'installed' && <Installed key={profile.id} profile={profile} notify={notify} goBrowse={() => setTab('mod')} />}
      {current === 'mod' && <Browse key={profile.id} profile={profile} notify={notify} />}
      {(current === 'resourcepack' || current === 'shader') && <PackBrowse key={profile.id + current} type={current} profile={profile} notify={notify} />}
    </div>
  )
}

function Installed ({ profile, notify, goBrowse }) {
  const [items, setItems] = useState(null)
  const [active, setActive] = useState({ resourcepack: [], shader: null })
  const [dragging, setDragging] = useState(false)
  const [kind, setKind] = useState('all')
  const load = () => {
    call('content:list', profile.id).then(setItems)
    call('packs:active', profile.id).then(setActive).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const onDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files].map(f => window.launcher.filePath(f)).filter(f => /\.(jar|zip)$/i.test(f))
    if (!files.length) return notify(t('Solo se aceptan archivos .jar (mods) o .zip (texturas y shaders)'), 'error')
    await call('content:addFiles', profile.id, files)
    notify(t('{n} archivo(s) añadido(s)', { n: files.length }))
    load()
  }

  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(null)
  const shown = items?.filter(it => (kind === 'all' || it.type === kind) && (!filter || it.title.toLowerCase().includes(filter.toLowerCase())))
  const count = (k) => items?.filter(i => i.type === k).length || 0

  useEffect(() => on('builtins:progress', p => p && setAdding(p)), [])

  // Añade a este perfil los mods integrados que le falten (los que ya tiene no se tocan)
  const addBuiltins = async () => {
    setAdding({ stage: t('Preparando mods integrados…'), current: 0, total: 0 })
    try {
      const r = await call('builtins:apply', profile.id, null)
      notify(r.installed.length
        ? t('Añadidos {n} mods integrados', { n: r.installed.length }) + (r.skipped.length ? ' ' + t('(no disponibles para {version}: {list})', { version: profile.version, list: r.skipped.join(', ') }) : '')
        : t('Este perfil ya tenía todos los mods integrados'))
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
    notify(t('{name} eliminado', { name: it.title }))
    load()
  }
  const isActive = (it) => it.type === 'shader' ? active.shader === it.file : it.type === 'resourcepack' && active.resourcepack.includes(it.file)
  const use = async (it) => {
    const next = await call('packs:set', profile.id, it.type, it.file, !isActive(it))
    setActive(next)
    if (!isActive(it)) notify(it.type === 'shader' ? t('Shader activado: {name}', { name: it.title }) : t('Textura activada: {name}', { name: it.title }))
  }

  return (
    <div className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="installed-toolbar">
        <div className="row">
          <div className="segmented small">
            <button className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>{t('Todo')} {items ? `(${items.length})` : ''}</button>
            {TYPES.map(x => <button key={x.id} className={kind === x.id ? 'active' : ''} onClick={() => setKind(x.id)}>{t(x.label)} ({count(x.id)})</button>)}
          </div>
          {items?.length > 6 && (
            <div className="search small">
              <Icon name="search" size={15} />
              <input value={filter} placeholder={t('Filtrar…')} onChange={e => setFilter(e.target.value)} />
            </div>
          )}
        </div>
        <div className="row">
          {profile.loader === 'fabric' && (
            <button className="btn small" onClick={addBuiltins} disabled={!!adding} title={t('Instala los mods integrados de Ghost que le falten a este perfil')}>
              <Icon name="sparkles" size={14} /> {adding ? t('Añadiendo…') : t('Mods integrados')}
            </button>
          )}
          <button className="btn small ghost" onClick={() => call('profiles:openFolder', profile.id, kind === 'shader' ? 'shaderpacks' : kind === 'resourcepack' ? 'resourcepacks' : 'mods')}>
            <Icon name="folder" size={14} /> {t('Carpeta')}
          </button>
          <button className="btn small ghost" onClick={load} title={t('Actualizar')}><Icon name="refresh" size={14} /></button>
        </div>
      </div>
      <small className="muted small-text drop-hint">{t('Arrastra aquí tus .jar o .zip para añadirlos.')}</small>

      {adding && <ProgressBar progress={adding} />}

      {items && items.length === 0 && (
        <Empty icon="upload" title={t('No hay nada instalado')} text={profile.loader === 'fabric' ? t('Busca mods, texturas o shaders en las otras pestañas, o arrastra tus archivos aquí.') : t('Este perfil es Vanilla: puedes añadir texturas. Para mods y shaders, cambia el perfil a Fabric.')}>
          <button className="btn primary" onClick={goBrowse}><Icon name="search" /> {t('Explorar Modrinth')}</button>
        </Empty>
      )}
      {items && items.length > 0 && shown.length === 0 && <p className="muted center small-text">{t('Nada por aquí.')}</p>}

      <div className="item-list">
        {shown?.map(it => (
          <div key={it.type + it.file} className={`item ${it.enabled ? '' : 'disabled'} ${isActive(it) ? 'in-use' : ''}`}>
            {it.projectId === 'ghost-client' ? <img className="item-icon ghost-icon" src={ghostLogo} alt="" /> : it.icon ? <img className="item-icon" src={it.icon} alt="" /> : <div className="item-icon placeholder"><Icon name={it.type === 'shader' ? 'sun' : it.type === 'resourcepack' ? 'picture' : 'puzzle'} /></div>}
            <div className="item-text">
              <strong>{it.title}</strong>
              <small>
                {t(TYPES.find(x => x.id === it.type)?.label || '')}
                {it.versionNumber ? ` · ${it.versionNumber}` : ''}
                {it.manual ? ' · ' + t('Añadido a mano') : ''}
                {' · '}{formatBytes(it.size)}
              </small>
            </div>
            {it.type !== 'mod' && it.enabled && (
              <button className={`btn small ${isActive(it) ? 'in-use-btn' : 'ghost'}`} onClick={() => use(it)}
                title={isActive(it) ? t('Pulsa para dejar de usarlo') : t('Se activa en el juego sin tener que entrar al menú')}>
                {isActive(it) ? <><Icon name="check" size={14} /> {t('En uso')}</> : <><Icon name="star" size={14} /> {t('Usar')}</>}
              </button>
            )}
            <button className={`toggle ${it.enabled ? 'on' : ''}`} role="switch" aria-checked={it.enabled} aria-label={t('Activar {name}', { name: it.title })} onClick={() => toggle(it)}><span /></button>
            <button className="icon-btn" title={t('Eliminar')} onClick={() => remove(it)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Hook común de búsqueda en Modrinth (con retraso para no buscar en cada tecla)
function useModrinthSearch (profile, type, notify) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('relevance')
  const [filters, setFilters] = useState([])
  const [anyVersion, setAnyVersion] = useState(false)
  const [results, setResults] = useState(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounce = useRef()
  const latest = useRef(0)

  const search = async (o = 0) => {
    const id = ++latest.current
    setLoading(true)
    try {
      const res = await call('content:search', {
        query, type, sort, offset: o, filters, anyVersion,
        gameVersion: profile.version,
        loader: profile.loader === 'fabric' ? 'fabric' : null
      })
      if (id !== latest.current) return
      setResults(o === 0 ? res.hits : r => [...(r || []), ...res.hits])
      setTotal(res.total_hits)
      setOffset(o)
    } catch (e) { notify(t('Modrinth no responde: {error}', { error: e.message }), 'error') }
    if (id === latest.current) setLoading(false)
  }

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(0), 300)
  }, [query, sort, JSON.stringify(filters), anyVersion])

  return { query, setQuery, sort, setSort, filters, setFilters, anyVersion, setAnyVersion, results, total, offset, loading, more: () => search(offset + 20) }
}

// Instalación desde Modrinth con su barra de progreso
function useInstaller (profile, type, notify) {
  const [installing, setInstalling] = useState(null)
  const [installed, setInstalled] = useState(new Map()) // projectId -> archivo
  const [progress, setProgress] = useState(null)

  const refresh = () => call('content:list', profile.id)
    .then(list => setInstalled(new Map(list.filter(i => i.projectId).map(i => [i.projectId, i.file]))))
  useEffect(() => on('content:progress', setProgress), [])
  useEffect(() => { refresh() }, [])

  const install = async (hit) => {
    setInstalling(hit.project_id)
    try {
      const names = await call('content:install', profile.id, hit.project_id, type)
      await refresh()
      notify(names.length > 1 ? t('Instalado {name} (+ {extra})', { name: names[0], extra: names.slice(1).join(', ') }) : t('Instalado {name}', { name: names[0] }))
      return true
    } catch (e) { notify(e.message, 'error') }
    finally {
      setInstalling(null)
      setProgress(null)
    }
    return false
  }
  return { installing, installed, progress, install }
}

function SortSelect ({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={t('Ordenar')}>
      <option value="relevance">{t('Relevancia')}</option>
      <option value="downloads">{t('Descargas')}</option>
      <option value="follows">{t('Populares')}</option>
      <option value="updated">{t('Actualizados')}</option>
      <option value="newest">{t('Nuevos')}</option>
    </select>
  )
}

const compact = (n) => Intl.NumberFormat(locale(), { notation: 'compact' }).format(n)

function Browse ({ profile, notify }) {
  const s = useModrinthSearch(profile, 'mod', notify)
  const ins = useInstaller(profile, 'mod', notify)

  if (profile.loader !== 'fabric') {
    return (
      <Empty icon="puzzle" title={t('Este perfil es Vanilla')} text={t('Los mods necesitan Fabric. Edita el perfil y cámbialo a "Fabric (mods)". Las texturas sí funcionan en Vanilla.')} />
    )
  }

  return (
    <div>
      <div className="browse-bar">
        <div className="search">
          <Icon name="search" />
          <input value={s.query} placeholder={t('Buscar mods para {version}…', { version: profile.version })} onChange={e => s.setQuery(e.target.value)} />
        </div>
        <SortSelect value={s.sort} onChange={s.setSort} />
      </div>

      <div className="chips">
        {QUICK.map(q => <button key={q.label} className={`chip ${s.query === q.query ? 'active' : ''}`} onClick={() => s.setQuery(s.query === q.query ? '' : q.query)}><Icon name="sparkles" size={13} /> {t(q.label)}</button>)}
      </div>

      {ins.progress && <ProgressBar progress={ins.progress} />}

      {s.results && s.results.length === 0 && <Empty icon="search" title={t('Sin resultados')} text={t('No hay nada para {version} con esa búsqueda.', { version: profile.version })} />}

      <div className="results">
        {s.results?.map(hit => (
          <div key={hit.project_id} className="result">
            {hit.icon_url ? <img className="item-icon big" src={hit.icon_url} alt="" /> : <div className="item-icon big placeholder"><Icon name="puzzle" /></div>}
            <div className="result-text">
              <div className="result-title">
                <strong>{hit.title}</strong>
                <small className="muted">{t('por {author}', { author: hit.author })}</small>
              </div>
              <p>{hit.description}</p>
              <small className="muted"><Icon name="download" size={12} /> {t('{n} descargas', { n: compact(hit.downloads) })}</small>
            </div>
            {ins.installed.has(hit.project_id)
              ? <button className="btn small ghost" onClick={() => ins.install(hit)} disabled={!!ins.installing}><Icon name="check" size={14} /> {t('Instalado')}</button>
              : (
                <button className="btn small primary" onClick={() => ins.install(hit)} disabled={!!ins.installing}>
                  <Icon name="download" size={14} /> {ins.installing === hit.project_id ? t('Instalando…') : t('Instalar')}
                </button>
                )}
          </div>
        ))}
      </div>
      {s.results && s.results.length < s.total && (
        <div className="center"><button className="btn ghost" onClick={s.more} disabled={s.loading}>{t('Cargar más')}</button></div>
      )}
    </div>
  )
}

// Tienda visual de texture packs y shaders: tarjetas con su imagen, filtros y botón para usarlos al momento
function PackBrowse ({ type, profile, notify }) {
  const s = useModrinthSearch(profile, type, notify)
  const ins = useInstaller(profile, type, notify)
  const [active, setActive] = useState({ resourcepack: [], shader: null })
  const [hasIris, setHasIris] = useState(true)
  const isShader = type === 'shader'
  const blocked = isShader && profile.loader !== 'fabric'

  useEffect(() => {
    call('packs:active', profile.id).then(setActive).catch(() => {})
    call('content:list', profile.id).then(l => setHasIris(l.some(i => i.type === 'mod' && (i.projectId === 'YL57xq9U' || /^iris/i.test(i.file)))))
  }, [ins.installed])

  const groups = PACK_FILTERS[type]
  const optionOn = (opt) => s.filters.some(g => opt.cats.every(c => g.includes(c)))
  // Un filtro por grupo: pulsar otro del mismo grupo lo sustituye
  const toggleOption = (group, opt) => {
    const cats = new Set(group.options.flatMap(o => o.cats))
    const others = s.filters.filter(g => !g.some(c => cats.has(c)))
    s.setFilters(optionOn(opt) ? others : [...others, opt.cats])
  }

  const fileOf = (hit) => ins.installed.get(hit.project_id)
  const inUse = (hit) => {
    const f = fileOf(hit)
    return !!f && (isShader ? active.shader === f : active.resourcepack.includes(f))
  }
  const use = async (hit, on = true) => {
    const f = fileOf(hit)
    if (!f) return
    setActive(await call('packs:set', profile.id, type, f, on))
    if (on) notify(isShader ? t('Shader activado: {name}. Se verá al abrir el juego.', { name: hit.title }) : t('Textura activada: {name}. Se verá al abrir el juego.', { name: hit.title }))
  }
  const installAndUse = async (hit) => {
    if (await ins.install(hit)) {
      const list = await call('content:list', profile.id)
      const item = list.find(i => i.projectId === hit.project_id)
      if (item) setActive(await call('packs:set', profile.id, type, item.file, true))
    }
  }

  return (
    <div>
      <div className="browse-bar">
        <div className="search">
          <Icon name="search" />
          <input value={s.query} placeholder={isShader ? t('Buscar shaders…') : t('Buscar texture packs…')} onChange={e => s.setQuery(e.target.value)} />
        </div>
        <SortSelect value={s.sort} onChange={s.setSort} />
      </div>

      <div className="pack-filters">
        {groups.map(g => (
          <div key={g.label} className="pack-filter-group">
            <small>{t(g.label)}</small>
            {g.options.map(o => (
              <button key={o.label} className={`chip ${optionOn(o) ? 'active' : ''}`} onClick={() => toggleOption(g, o)}>{t(o.label)}</button>
            ))}
          </div>
        ))}
        <label className="pack-version-toggle" title={t('Muchos packs funcionan aunque no marquen tu versión')}>
          <input type="checkbox" checked={!s.anyVersion} onChange={e => s.setAnyVersion(!e.target.checked)} />
          {t('Solo para {version}', { version: profile.version })}
        </label>
      </div>

      {blocked && (
        <div className="notice warn"><Icon name="alert" size={16} /> {t('Los shaders necesitan Fabric. Edita el perfil y cámbialo a "Fabric (mods)".')}</div>
      )}
      {isShader && !blocked && !hasIris && (
        <div className="notice"><Icon name="sparkles" size={16} /> {t('Al instalar tu primer shader se añade Iris, el mod que los hace funcionar.')}</div>
      )}

      {ins.progress && <ProgressBar progress={ins.progress} />}

      {s.results && s.results.length === 0 && (
        <Empty icon="search" title={t('Sin resultados')} text={s.anyVersion ? t('Prueba con otra búsqueda o quita algún filtro.') : t('No hay nada marcado para {version}. Prueba a desmarcar «Solo para {version}».', { version: profile.version })} />
      )}

      <div className="pack-grid">
        {s.results?.map(hit => {
          const banner = hit.featured_gallery || hit.gallery?.[0] || null
          const tint = hit.color != null ? `#${hit.color.toString(16).padStart(6, '0')}` : 'var(--accent)'
          const tags = (hit.display_categories || hit.categories || []).filter(c => TAG_LABELS[c]).slice(0, 3)
          const installedHere = ins.installed.has(hit.project_id)
          return (
            <article key={hit.project_id} className={`pack-card ${inUse(hit) ? 'in-use' : ''}`} style={{ '--tint': tint }}>
              <div className="pack-banner">
                {banner ? <img src={banner} alt="" loading="lazy" /> : <div className="pack-banner-fallback" />}
                {inUse(hit) && <span className="pack-badge"><Icon name="check" size={12} /> {t('En uso')}</span>}
              </div>
              <div className="pack-body">
                <div className="pack-head">
                  {hit.icon_url ? <img className="pack-icon" src={hit.icon_url} alt="" loading="lazy" /> : <div className="pack-icon placeholder"><Icon name={isShader ? 'sun' : 'picture'} /></div>}
                  <div className="pack-title">
                    <strong title={hit.title}>{hit.title}</strong>
                    <small className="muted">{t('por {author}', { author: hit.author })}</small>
                  </div>
                </div>
                <p className="pack-desc">{hit.description}</p>
                <div className="pack-foot">
                  <div className="pack-tags">
                    {tags.map(c => <span key={c} className="tag">{t(TAG_LABELS[c])}</span>)}
                    <span className="pack-downloads"><Icon name="download" size={11} /> {compact(hit.downloads)}</span>
                  </div>
                  {installedHere
                    ? (inUse(hit)
                        ? <button className="btn small in-use-btn" onClick={() => use(hit, false)} title={t('Pulsa para dejar de usarlo')}><Icon name="check" size={14} /> {t('En uso')}</button>
                        : <button className="btn small" onClick={() => use(hit)}><Icon name="star" size={14} /> {t('Usar')}</button>)
                    : (
                      <button className="btn small primary" disabled={!!ins.installing || blocked} onClick={() => installAndUse(hit)}>
                        <Icon name="download" size={14} /> {ins.installing === hit.project_id ? t('Instalando…') : t('Instalar')}
                      </button>
                      )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {s.results && s.results.length < s.total && (
        <div className="center"><button className="btn ghost" onClick={s.more} disabled={s.loading}>{t('Cargar más')}</button></div>
      )}
    </div>
  )
}
