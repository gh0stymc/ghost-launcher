import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { call, on, formatPlayTime } from '../api.js'
import { t, locale } from '../i18n.js'
import { Icon } from '../components/Icon.jsx'
import { Empty, ProfileBadge } from '../components/ui.jsx'

// Colores de las series (validados para el fondo oscuro del launcher: diferenciables también con daltonismo)
const KILLS = '#3987e5'
const DEATHS = '#d95926'
const RANGES = [
  { id: 7, label: '7 días' },
  { id: 30, label: '30 días' },
  { id: 90, label: '90 días' },
  { id: 0, label: 'Todo' }
]

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const kd = (k, d) => (d ? k / d : k)
const fmtKd = (k, d) => (k + d === 0 ? '—' : kd(k, d).toFixed(2))
const serverName = (key) => (key === 'singleplayer' ? t('Un jugador') : key)

// Estadísticas de PvP de ghost client: por perfil y en global, con gráficas por día y por servidor
export default function Stats ({ ctx }) {
  const [data, setData] = useState(null)
  const [scope, setScope] = useState('global')
  const [range, setRange] = useState(30)
  const [server, setServer] = useState(null)
  const [table, setTable] = useState(false)

  const load = () => call('stats:all').then(setData).catch(() => setData({ profiles: [], global: { servers: {}, days: {} } }))
  useEffect(() => {
    load()
    return on('game:closed', load)
  }, [])
  useEffect(() => { setServer(null) }, [scope])

  const profile = data?.profiles.find(p => p.id === scope)
  const stats = scope === 'global' ? data?.global : profile?.stats
  const view = useMemo(() => stats && build(stats, range, server), [stats, range, server])

  if (!data) return <div className="page"><div className="boot"><div className="spinner" /></div></div>

  if (!data.profiles.length) {
    return (
      <div className="page">
        <Head />
        <Empty icon="swords" title={t('Aún no hay estadísticas')}
          text={t('ghost client apunta tus asesinatos, muertes y rachas en cada servidor mientras juegas. Juega una partida con un perfil que tenga ghost client y vuelve aquí.')} />
      </div>
    )
  }

  return (
    <div className="page stats-page">
      <Head />

      {/* Filtros: qué perfil (o todos) y qué periodo, en una sola fila */}
      <div className="stats-filters">
        <div className="chips">
          <button className={`chip ${scope === 'global' ? 'active' : ''}`} onClick={() => setScope('global')}><Icon name="globe" size={14} /> {t('Global')}</button>
          {data.profiles.map(p => (
            <button key={p.id} className={`chip ${scope === p.id ? 'active' : ''}`} onClick={() => setScope(p.id)}>
              <ProfileBadge profile={p} size={18} showMedal={false} /> {p.name}
            </button>
          ))}
        </div>
        <div className="tabs">
          {RANGES.map(r => <button key={r.id} className={range === r.id ? 'active' : ''} onClick={() => setRange(r.id)}>{t(r.label)}</button>)}
        </div>
      </div>

      {server && (
        <div className="stats-server-filter">
          <Icon name="server" size={15} />
          <span>{t('Solo {server}', { server: serverName(server) })}</span>
          <button className="icon-btn" title={t('Ver todos los servidores')} onClick={() => setServer(null)}><Icon name="x" size={14} /></button>
        </div>
      )}

      <div className="stat-tiles">
        <Tile icon="swords" label={t('Asesinatos')} value={view.kills.toLocaleString(locale())} />
        <Tile icon="skull" label={t('Muertes')} value={view.deaths.toLocaleString(locale())} />
        <Tile icon="trophy" label={t('K/D')} value={fmtKd(view.kills, view.deaths)} hint={view.kills + view.deaths ? t('{k} asesinatos por cada muerte', { k: kd(view.kills, view.deaths).toFixed(2) }) : null} />
        <Tile icon="flame" label={t('Mejor racha')} value={view.bestStreak} hint={t('Asesinatos seguidos sin morir')} />
        <Tile icon="timer" label={t('Tiempo jugado')} value={formatPlayTime(view.seconds)} hint={t('En servidores y mundos propios')} />
      </div>

      <section className="card chart-card">
        <div className="chart-head">
          <div>
            <h2>{t('Asesinatos y muertes por día')}</h2>
            <small className="muted">{range ? t('Últimos {n} días', { n: range }) : t('Desde el primer día con estadísticas')}</small>
          </div>
          <div className="chart-head-right">
            <div className="legend">
              <span><i style={{ background: KILLS }} /> {t('Asesinatos')}</span>
              <span><i style={{ background: DEATHS }} /> {t('Muertes')}</span>
            </div>
            <button className="btn small ghost" onClick={() => setTable(v => !v)}><Icon name={table ? 'chart' : 'layers'} size={14} /> {table ? t('Ver gráfica') : t('Ver tabla')}</button>
          </div>
        </div>
        {table ? <DayTable days={view.days} /> : <DayBars days={view.days} />}
      </section>

      <section className="card chart-card">
        <div className="chart-head">
          <div>
            <h2>{t('K/D por día')}</h2>
            <small className="muted">{t('Asesinatos entre muertes de cada día. La línea discontinua es tu K/D del periodo.')}</small>
          </div>
        </div>
        <KdLine days={view.days} overall={view.kills + view.deaths ? kd(view.kills, view.deaths) : null} />
      </section>

      <section className="card">
        <div className="chart-head">
          <div>
            <h2>{t('Por servidor')}</h2>
            <small className="muted">{t('Pulsa un servidor para ver solo sus estadísticas')}</small>
          </div>
        </div>
        <ServerTable rows={view.servers} selected={server} onPick={(k) => setServer(s => (s === k ? null : k))} />
      </section>

      {scope === 'global' && data.profiles.length > 1 && (
        <section className="card">
          <div className="chart-head">
            <div>
              <h2>{t('Por perfil')}</h2>
              <small className="muted">{t('Pulsa un perfil para ver sus estadísticas')}</small>
            </div>
          </div>
          <ProfileTable profiles={data.profiles} range={range} onPick={setScope} />
        </section>
      )}
    </div>
  )
}

function Head () {
  return (
    <div className="page-head">
      <div>
        <h1>{t('Estadísticas')}</h1>
        <p className="muted">{t('Tus asesinatos, muertes y K/D en cada servidor, apuntados por ghost client')}</p>
      </div>
    </div>
  )
}

function Tile ({ icon, label, value, hint }) {
  return (
    <div className="stat-tile" title={hint || ''}>
      <span className="stat-tile-label"><Icon name={icon} size={14} /> {label}</span>
      <strong>{value}</strong>
    </div>
  )
}

// Junta las estadísticas del periodo (y del servidor elegido)
function build (stats, range, server) {
  const want = (key) => !server || key === server
  const dates = Object.keys(stats.days).sort()
  const today = new Date()
  let start
  if (range) {
    start = new Date(today)
    start.setDate(start.getDate() - (range - 1))
  } else {
    start = dates.length ? new Date(dates[0] + 'T00:00:00') : new Date(today)
    // Al menos una semana para que la gráfica no sea una sola barra
    const minStart = new Date(today)
    minStart.setDate(minStart.getDate() - 6)
    if (start > minStart) start = minStart
  }
  const days = []
  const perServer = {}
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d)
    const row = { key, date: new Date(d), k: 0, d: 0, s: 0 }
    for (const [srv, v] of Object.entries(stats.days[key] || {})) {
      if (!want(srv)) continue
      row.k += v.k || 0
      row.d += v.d || 0
      row.s += v.s || 0
      const p = perServer[srv] || (perServer[srv] = { k: 0, d: 0, s: 0 })
      p.k += v.k || 0
      p.d += v.d || 0
      p.s += v.s || 0
    }
    days.push(row)
  }
  // "Todo" usa los totales guardados por servidor (incluyen lo de antes de que hubiera resumen por día)
  const servers = Object.entries(stats.servers).map(([key, v]) => {
    const p = range ? perServer[key] || { k: 0, d: 0, s: 0 } : { k: v.kills || 0, d: v.deaths || 0, s: v.seconds || 0 }
    return { key, kills: p.k, deaths: p.d, seconds: p.s, bestStreak: v.bestStreak || 0, last: v.last }
  }).filter(r => r.kills + r.deaths + r.seconds > 0)
    .sort((a, b) => (b.kills - a.kills) || (b.seconds - a.seconds))
  const shown = servers.filter(r => want(r.key))
  return {
    days,
    servers,
    kills: shown.reduce((n, r) => n + r.kills, 0),
    deaths: shown.reduce((n, r) => n + r.deaths, 0),
    seconds: shown.reduce((n, r) => n + r.seconds, 0),
    bestStreak: Object.entries(stats.servers).filter(([k]) => want(k)).reduce((n, [, v]) => Math.max(n, v.bestStreak || 0), 0)
  }
}

// ---------- Gráficas (SVG a mano) ----------

function useWidth () {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Números redondos para el eje
function niceMax (v) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

const shortDate = (d) => d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
const longDate = (d) => d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })

// Barra con las esquinas de arriba redondeadas (4 px) y apoyada en la base
function barPath (x, y, w, h, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

function Tooltip ({ x, y, width, children }) {
  // Se queda dentro de la gráfica
  const left = Math.min(Math.max(x, 70), width - 70)
  return <div className="chart-tip" style={{ left, top: y }}>{children}</div>
}

const PAD = { l: 34, r: 10, t: 12, b: 26 }
const H = 230

function DayBars ({ days }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const max = niceMax(Math.max(1, ...days.map(d => Math.max(d.k, d.d))))
  const iw = width - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const band = iw / days.length
  const gap = 2
  const bw = Math.max(1.5, Math.min(14, (band * 0.72 - gap) / 2))
  const y = (v) => PAD.t + ih - (v / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f))
  const every = Math.ceil(days.length / Math.max(2, Math.floor(iw / 64)))
  const empty = days.every(d => !d.k && !d.d)
  return (
    <div className="chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label={t('Asesinatos y muertes por día')}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 8} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = PAD.l + band * i + band / 2
          return (
            <g key={d.key}>
              {hover === i && <rect x={PAD.l + band * i} y={PAD.t} width={band} height={ih} className="hover-band" />}
              <path d={barPath(cx - bw - gap / 2, y(d.k), bw, PAD.t + ih - y(d.k))} fill={KILLS} />
              <path d={barPath(cx + gap / 2, y(d.d), bw, PAD.t + ih - y(d.d))} fill={DEATHS} />
              {i % every === 0 && <text x={cx} y={H - 8} className="axis" textAnchor="middle">{shortDate(d.date)}</text>}
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={ih} fill="transparent" onPointerEnter={() => setHover(i)} />
            </g>
          )
        })}
        <line x1={PAD.l} x2={width - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="baseline" />
        {empty && <text x={PAD.l + iw / 2} y={PAD.t + ih / 2} className="axis" textAnchor="middle">{t('Sin partidas en este periodo')}</text>}
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.l + band * hover + band / 2} y={PAD.t} width={width}>
          <small>{longDate(days[hover].date)}</small>
          <div><i style={{ background: KILLS }} /><strong>{days[hover].k}</strong> {t('asesinatos')}</div>
          <div><i style={{ background: DEATHS }} /><strong>{days[hover].d}</strong> {t('muertes')}</div>
          <div><strong>{fmtKd(days[hover].k, days[hover].d)}</strong> K/D</div>
        </Tooltip>
      )}
    </div>
  )
}

function KdLine ({ days, overall }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const points = days.map((d, i) => ({ i, d, v: d.k + d.d ? kd(d.k, d.d) : null }))
  const vals = points.filter(p => p.v !== null).map(p => p.v)
  const max = niceMax(Math.max(1, ...vals, overall || 0))
  const iw = width - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const step = days.length > 1 ? iw / (days.length - 1) : iw
  const x = (i) => PAD.l + (days.length > 1 ? step * i : iw / 2)
  const y = (v) => PAD.t + ih - (v / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => +(max * f).toFixed(2))
  const every = Math.ceil(days.length / Math.max(2, Math.floor(iw / 64)))
  // La línea se corta en los días sin partidas
  let dPath = ''
  let pen = false
  for (const p of points) {
    if (p.v === null) { pen = false; continue }
    dPath += `${pen ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`
    pen = true
  }
  const lonely = points.filter((p, k) => p.v !== null && (points[k - 1]?.v ?? null) === null && (points[k + 1]?.v ?? null) === null)
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round((e.clientX - r.left - PAD.l) / (days.length > 1 ? step : 1))
    setHover(Math.max(0, Math.min(days.length - 1, i)))
  }
  const h = hover !== null ? points[hover] : null
  return (
    <div className="chart" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label={t('K/D por día')} onPointerMove={onMove}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.l - 8} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
          </g>
        ))}
        {overall !== null && <line x1={PAD.l} x2={width - PAD.r} y1={y(overall)} y2={y(overall)} className="ref-line" />}
        {h && <line x1={x(h.i)} x2={x(h.i)} y1={PAD.t} y2={PAD.t + ih} className="crosshair" />}
        <path d={dPath} fill="none" stroke={KILLS} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {lonely.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="3" fill={KILLS} />)}
        {h && h.v !== null && <circle cx={x(h.i)} cy={y(h.v)} r="5" fill={KILLS} className="marker" />}
        {days.map((d, i) => i % every === 0 && <text key={d.key} x={x(i)} y={H - 8} className="axis" textAnchor="middle">{shortDate(d.date)}</text>)}
        <line x1={PAD.l} x2={width - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="baseline" />
        {!vals.length && <text x={PAD.l + iw / 2} y={PAD.t + ih / 2} className="axis" textAnchor="middle">{t('Sin partidas en este periodo')}</text>}
      </svg>
      {h && (
        <Tooltip x={x(h.i)} y={PAD.t} width={width}>
          <small>{longDate(h.d.date)}</small>
          {h.v === null
            ? <div className="muted">{t('Sin partidas')}</div>
            : <div><strong>{h.v.toFixed(2)}</strong> K/D <span className="muted">· {h.d.k}/{h.d.d}</span></div>}
          {overall !== null && <div className="muted">{t('Periodo: {kd}', { kd: overall.toFixed(2) })}</div>}
        </Tooltip>
      )}
    </div>
  )
}

function DayTable ({ days }) {
  const rows = [...days].reverse().filter(d => d.k || d.d || d.s)
  if (!rows.length) return <p className="muted small-text">{t('Sin partidas en este periodo')}</p>
  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead><tr><th>{t('Día')}</th><th>{t('Asesinatos')}</th><th>{t('Muertes')}</th><th>K/D</th><th>{t('Tiempo')}</th></tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.key}><td>{longDate(d.date)}</td><td>{d.k}</td><td>{d.d}</td><td>{fmtKd(d.k, d.d)}</td><td>{formatPlayTime(d.s)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ServerTable ({ rows, selected, onPick }) {
  if (!rows.length) return <p className="muted small-text">{t('Sin partidas en este periodo')}</p>
  const max = Math.max(1, ...rows.map(r => r.kills + r.deaths))
  return (
    <div className="server-rows" role="table">
      <div className="server-row head" role="row">
        <span>{t('Servidor')}</span><span>{t('Asesinatos / muertes')}</span><span>K/D</span><span>{t('Racha')}</span><span>{t('Tiempo')}</span>
      </div>
      {rows.map(r => (
        <button key={r.key} className={`server-row ${selected === r.key ? 'active' : ''}`} role="row" onClick={() => onPick(r.key)}>
          <span className="server-name">
            <Icon name={r.key === 'singleplayer' ? 'home' : 'server'} size={15} />
            <strong>{serverName(r.key)}</strong>
          </span>
          <span className="server-bars" title={t('{k} asesinatos · {d} muertes', { k: r.kills, d: r.deaths })}>
            <span className="server-track">
              <span style={{ width: `${(r.kills / max) * 100}%`, background: KILLS }} />
              <span style={{ width: `${(r.deaths / max) * 100}%`, background: DEATHS }} />
            </span>
            <small>{r.kills} / {r.deaths}</small>
          </span>
          <span className="num">{fmtKd(r.kills, r.deaths)}</span>
          <span className="num">{r.bestStreak}</span>
          <span className="num muted">{formatPlayTime(r.seconds)}</span>
        </button>
      ))}
    </div>
  )
}

function ProfileTable ({ profiles, range, onPick }) {
  const rows = profiles.map(p => ({ p, v: build(p.stats, range, null) }))
    .sort((a, b) => b.v.kills - a.v.kills)
  const max = Math.max(1, ...rows.map(r => r.v.kills + r.v.deaths))
  return (
    <div className="server-rows" role="table">
      <div className="server-row head" role="row">
        <span>{t('Perfil')}</span><span>{t('Asesinatos / muertes')}</span><span>K/D</span><span>{t('Racha')}</span><span>{t('Tiempo')}</span>
      </div>
      {rows.map(({ p, v }) => (
        <button key={p.id} className="server-row" role="row" onClick={() => onPick(p.id)}>
          <span className="server-name"><ProfileBadge profile={p} size={22} showMedal={false} /><strong>{p.name}</strong></span>
          <span className="server-bars">
            <span className="server-track">
              <span style={{ width: `${(v.kills / max) * 100}%`, background: KILLS }} />
              <span style={{ width: `${(v.deaths / max) * 100}%`, background: DEATHS }} />
            </span>
            <small>{v.kills} / {v.deaths}</small>
          </span>
          <span className="num">{fmtKd(v.kills, v.deaths)}</span>
          <span className="num">{v.bestStreak}</span>
          <span className="num muted">{formatPlayTime(v.seconds)}</span>
        </button>
      ))}
    </div>
  )
}
