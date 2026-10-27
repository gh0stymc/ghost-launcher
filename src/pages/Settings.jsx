import React, { useEffect, useState } from 'react'
import { call, on } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { Field, RamSlider, Toggle } from '../components/ui.jsx'
import LoadingScreenCard from './LoadingScreenCard.jsx'

const ACCENTS = ['#7c5cff', '#3b82f6', '#06b6d4', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#f1f1f6', '#e94f64']
const BACKGROUNDS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'night', label: 'Noche' },
  { id: 'grid', label: 'Rejilla' },
  { id: 'plain', label: 'Liso' }
]
// Argumentos de Java recomendados para mejor rendimiento
const AIKAR = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20'

// Estado de Discord: el ID de la aplicación "ghost client" que crea el usuario en Discord
function DiscordCard ({ settings, updateSettings }) {
  const [id, setId] = useState(settings.discordAppId || '')
  const valid = /^\d{15,22}$/.test(id.trim())
  const save = () => updateSettings({ discordAppId: valid ? id.trim() : '' })

  return (
    <section className="card">
      <h3 className="card-title"><Icon name="sparkles" /> Discord</h3>
      <p className="muted small-text no-margin">
        Para que Discord muestre «Jugando a ghost client» con el fantasma, crea una aplicación llamada
        <strong> ghost client</strong> en el portal de Discord y pega aquí su <strong>Application ID</strong>.
        Después actívalo dentro del juego en ghost client → Discord RPC.
      </p>
      <Field label="ID de la aplicación de Discord" hint={id && !valid ? 'Debe ser un número largo (17–20 cifras)' : settings.discordAppId ? 'Guardado. Se aplica la próxima vez que abras el juego.' : null}>
        <input value={id} inputMode="numeric" placeholder="Ej.: 1234567890123456789"
          onChange={e => setId(e.target.value.replace(/\D/g, ''))} onBlur={save} onKeyDown={e => e.key === 'Enter' && save()} />
      </Field>
      <div className="row">
        <button className="btn small" onClick={() => call('system:openUrl', 'https://discord.com/developers/applications')}>Abrir portal de Discord</button>
        <button className="btn small ghost" onClick={() => call('system:showDiscordIcon')}>Icono para subir</button>
      </div>
    </section>
  )
}

// Qué mods integrados se instalan en los perfiles nuevos
function BuiltinsCard ({ updateSettings }) {
  const [catalog, setCatalog] = useState(null)
  const [open, setOpen] = useState(null)
  useEffect(() => { call('builtins:catalog').then(setCatalog) }, [])
  if (!catalog) return null

  const enabled = new Set(catalog.enabled)
  const groups = [...new Set(catalog.mods.map(m => m.category))]
  const toggle = (slug, on) => {
    const next = catalog.mods.map(m => m.slug).filter(s => (s === slug ? on : enabled.has(s)))
    setCatalog(c => ({ ...c, enabled: next }))
    updateSettings({ builtins: next })
  }
  const setCapes = (on) => {
    setCatalog(c => ({ ...c, capes: { ...c.capes, enabled: on } }))
    updateSettings({ capesByDefault: on })
  }

  return (
    <section className="card wide">
      <h3 className="card-title"><Icon name="sparkles" /> Mods integrados</h3>
      <p className="muted small-text no-margin">
        Se instalan solos en cada perfil nuevo con Fabric: ghost client (nuestro cliente, con HUD, zoom, freelook y utilidades PvP)
        y mods libres de Modrinth para el resto. En un perfil ya creado puedes añadirlos desde su página de Mods.
      </p>
      <div className="capes-row">
        <Toggle checked={catalog.capes.enabled} onChange={setCapes} label="Capes en todos los perfiles nuevos"
          hint="También en los modpacks que importes. Muestra capas de OptiFine, MinecraftCapes, Cosmetica…" />
      </div>
      <div className="builtin-groups">
        {groups.map(g => {
          const mods = catalog.mods.filter(m => m.category === g)
          const on = mods.filter(m => enabled.has(m.slug)).length
          return (
            <div key={g} className={`builtin-group ${open === g ? 'open' : ''}`}>
              <button className="builtin-group-head" onClick={() => setOpen(open === g ? null : g)}>
                <strong>{g}</strong>
                <span className="muted small-text">{on}/{mods.length} activos</span>
                <Icon name="chevron" size={15} />
              </button>
              {open === g && mods.map(m => (
                <div key={m.slug} className="builtin-mod">
                  <div>
                    <div className="builtin-mod-name">{m.name}</div>
                    <small className="muted">Lunar: {m.lunar}</small>
                  </div>
                  <button className={`toggle ${enabled.has(m.slug) ? 'on' : ''}`} role="switch" aria-checked={enabled.has(m.slug)}
                    aria-label={m.name} onClick={() => toggle(m.slug, !enabled.has(m.slug))}><span /></button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const UPDATE_TEXT = {
  idle: 'Se comprueba sola al abrir el launcher y cada 4 horas.',
  dev: 'En modo desarrollo no se buscan actualizaciones.',
  checking: 'Buscando…',
  latest: 'Tienes la última versión.',
  downloading: 'Descargando la nueva versión…',
  ready: 'Nueva versión descargada: se instala al cerrar el launcher.'
}

function UpdatesCard ({ notify }) {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    call('update:status').then(setStatus).catch(() => {})
    return on('update:status', setStatus)
  }, [])
  if (!status) return null
  const text = status.state === 'error'
    ? `No se pudo comprobar: ${status.error || 'sin conexión'}`
    : status.state === 'downloading' ? `Descargando la versión ${status.next}… ${status.progress || 0}%`
      : UPDATE_TEXT[status.state] || ''
  return (
    <section className="card">
      <h3 className="card-title"><Icon name="refresh" /> Actualizaciones</h3>
      <p className="muted small-text" style={{ margin: 0 }}>
        Versión instalada: <strong style={{ color: 'var(--text)' }}>{status.version}</strong>. Ghost Launcher y ghost client
        se actualizan solos: la nueva versión se descarga en segundo plano.
      </p>
      <p className={`small-text ${status.state === 'error' ? 'danger-text' : 'muted'}`} style={{ margin: 0 }}>{text}</p>
      <div className="row">
        {status.state === 'ready'
          ? <button className="btn small primary" onClick={() => call('update:install').catch(e => notify(e.message, 'error'))}>Reiniciar y actualizar</button>
          : <button className="btn small" disabled={status.state === 'checking' || status.state === 'downloading'}
            onClick={() => call('update:check').then(setStatus).catch(e => notify(e.message, 'error'))}>Buscar actualizaciones</button>}
        <button className="btn small ghost" onClick={() => call('system:openUrl', 'https://github.com/gh0stymc/ghost-launcher')}>Código del launcher</button>
        <button className="btn small ghost" onClick={() => call('system:openUrl', 'https://github.com/gh0stymc/ghost-client')}>Código de ghost client</button>
      </div>
      <small className="muted">Launcher con licencia MIT. ghost client es una versión modificada de AxolotlClient (LGPL-3.0).</small>
    </section>
  )
}

export default function Settings ({ ctx }) {
  const { settings, updateSettings, system } = ctx
  const [jvm, setJvm] = useState(settings.jvmArgs)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="muted">Se aplican a todos los perfiles, salvo que un perfil tenga los suyos.</p>
        </div>
      </div>

      <div className="settings-grid">
        <BuiltinsCard updateSettings={updateSettings} />
        <DiscordCard settings={settings} updateSettings={updateSettings} />
        <UpdatesCard notify={ctx.notify} />
        <LoadingScreenCard settings={settings} updateSettings={updateSettings} notify={ctx.notify} />

        <section className="card">
          <h3 className="card-title"><Icon name="cpu" /> Memoria RAM</h3>
          <RamSlider value={settings.maxRam} onChange={v => updateSettings({ maxRam: v })} totalRam={system?.totalRam} />
        </section>

        <section className="card">
          <h3 className="card-title"><Icon name="palette" /> Apariencia</h3>
          <Field label="Color principal">
            <div className="colors">
              {ACCENTS.map(c => (
                <button key={c} className={`color ${settings.accent === c ? 'active' : ''}`} style={{ background: c }} onClick={() => updateSettings({ accent: c })} aria-label={`Color ${c}`} />
              ))}
              <label className="color custom" title="Color personalizado">
                <input type="color" value={settings.accent} onChange={e => updateSettings({ accent: e.target.value })} />
                <Icon name="plus" size={14} />
              </label>
            </div>
          </Field>
          <Field label="Fondo">
            <div className="segmented">
              {BACKGROUNDS.map(b => (
                <button key={b.id} className={settings.background === b.id ? 'active' : ''} onClick={() => updateSettings({ background: b.id })}>{b.label}</button>
              ))}
            </div>
          </Field>
        </section>

        <section className="card">
          <h3 className="card-title"><Icon name="settings" /> Comportamiento</h3>
          <Toggle checked={settings.closeOnLaunch} onChange={v => updateSettings({ closeOnLaunch: v })}
            label="Ocultar el launcher al jugar" hint="Vuelve a aparecer cuando cierras el juego" />
          <Toggle checked={settings.showSnapshots} onChange={v => updateSettings({ showSnapshots: v })}
            label="Mostrar snapshots por defecto" hint="Versiones de prueba al crear perfiles" />
        </section>

        <section className="card">
          <h3 className="card-title"><Icon name="terminal" /> Java</h3>
          <Field label="Argumentos de Java" hint="Para usuarios avanzados. Java se descarga solo según la versión.">
            <textarea rows={3} value={jvm} onChange={e => setJvm(e.target.value)} onBlur={() => updateSettings({ jvmArgs: jvm })} placeholder="-XX:+UseG1GC" />
          </Field>
          <div className="row">
            <button className="btn small ghost" onClick={() => { setJvm(AIKAR); updateSettings({ jvmArgs: AIKAR }) }}>Usar optimizados</button>
            <button className="btn small ghost" onClick={() => { setJvm(''); updateSettings({ jvmArgs: '' }) }}>Limpiar</button>
          </div>
          {system?.javas?.length > 0 && (
            <small className="field-hint">Java instalado: {system.javas.map(j => `Java ${j.major}`).join(', ')}</small>
          )}
        </section>

        <section className="card">
          <h3 className="card-title"><Icon name="folder" /> Archivos</h3>
          <p className="muted small-text">{system?.dataDir}</p>
          <div className="row">
            <button className="btn small ghost" onClick={() => call('system:openFolder')}>Carpeta del launcher</button>
            <button className="btn small ghost" onClick={() => call('system:openFolder', 'instances')}>Perfiles</button>
          </div>
          <small className="field-hint">Versión {system?.version}</small>
        </section>
      </div>
    </div>
  )
}
