import React, { useId } from 'react'
import { t } from '../i18n.js'

// Medallas por horas jugadas. Cada nivel tiene su forma, su material y su emblema:
// 500 oro (moneda), 750 esmeralda (hexágono), 1000 amatista (escudo con fantasma),
// 2500 diamante (estrella con alas) y 5000 leyenda (corona, brillo animado).
export const MEDALS = {
  500: { name: 'Oro', label: '500', tier: 0, light: '#fff1b8', from: '#ffd65a', to: '#b8740a', edge: '#6b4100', ink: '#4a2c00', glow: 'rgba(255,200,80,.55)' },
  750: { name: 'Esmeralda', label: '750', tier: 1, light: '#d6ffe9', from: '#4ee39a', to: '#0b7a4a', edge: '#03422a', ink: '#ffffff', glow: 'rgba(60,220,140,.55)' },
  1000: { name: 'Amatista', label: '1K', tier: 2, light: '#efe8ff', from: '#b49cff', to: '#5b2fd6', edge: '#2a1170', ink: '#ffffff', glow: 'rgba(150,120,255,.65)' },
  2500: { name: 'Diamante', label: '2.5K', tier: 3, light: '#f0fdff', from: '#8eeaff', to: '#1f7fd1', edge: '#0b3a6b', ink: '#ffffff', glow: 'rgba(110,210,255,.7)' },
  5000: { name: 'Leyenda', label: '5K', tier: 4, light: '#ffffff', from: '#ff9ad5', to: '#7c3aed', edge: '#2b0f5c', ink: '#ffffff', glow: 'rgba(240,120,255,.8)' }
}

export const MEDAL_HOURS = Object.keys(MEDALS).map(Number)

// La mejor medalla de un perfil (la de más horas que siga existiendo)
export const bestMedal = (profile) =>
  (profile?.medals || []).filter(m => MEDALS[m.hours])
    .reduce((best, m) => (!best || m.hours > best.hours ? m : best), null)

// Polígono regular (o estrella si inner < 1) centrado en 24,cy
function poly (points, r, inner = 1, rot = -90, cy = 24) {
  const n = inner < 1 ? points * 2 : points
  return Array.from({ length: n }, (_, i) => {
    const a = (rot + (360 / n) * i) * Math.PI / 180
    const rr = inner < 1 && i % 2 ? r * inner : r
    return `${(24 + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

const SHIELD = 'M24 4 L40 10 V23 C40 33 33 40 24 44 C15 40 8 33 8 23 V10 Z'
// Fantasma de ghost client (centrado en 24,22.5)
const GHOST = 'M24 13 C18.5 13 15.5 17 15.5 22 V32 L18.3 30 L21.1 32 L24 30 L26.9 32 L29.7 30 L32.5 32 V22 C32.5 17 29.5 13 24 13 Z'

// Forma de cada nivel: contorno exterior y relieve interior
function Shape ({ tier, fill, inner, edge, ring }) {
  const common = { stroke: edge, strokeWidth: 2, strokeLinejoin: 'round' }
  switch (tier) {
    case 0: return (
      <>
        <circle cx="24" cy="24" r="19" fill={fill} {...common} />
        <circle cx="24" cy="24" r="16.6" fill="none" stroke={edge} strokeOpacity=".4" strokeWidth="1.2" strokeDasharray="1.3 1.5" />
        <circle cx="24" cy="24" r="13.5" fill={inner} stroke={ring} strokeOpacity=".8" strokeWidth="1" />
      </>
    )
    case 1: return (
      <>
        <polygon points={poly(6, 20)} fill={fill} {...common} />
        <polygon points={poly(6, 14.5)} fill={inner} stroke={ring} strokeOpacity=".8" strokeWidth="1" />
        <path d="M24 4 V9.5 M41.3 14 L36.6 16.7 M41.3 34 L36.6 31.3 M24 44 V38.5 M6.7 34 L11.4 31.3 M6.7 14 L11.4 16.7"
          stroke="#fff" strokeOpacity=".4" strokeWidth="1" />
      </>
    )
    case 2: return (
      <>
        <path d={SHIELD} fill={fill} {...common} />
        <path d={SHIELD} transform="translate(24 24) scale(.74) translate(-24 -24)" fill={inner} stroke={ring} strokeOpacity=".8" strokeWidth="1.3" />
      </>
    )
    case 3: return (
      <>
        <path d="M13 23 C6 21.5 2.5 16 2 9.5 C6 13 10 14.5 14 14.5 Z M35 23 C42 21.5 45.5 16 46 9.5 C42 13 38 14.5 34 14.5 Z"
          fill={fill} stroke={edge} strokeWidth="1.4" strokeLinejoin="round" />
        <polygon points={poly(8, 20, 0.64)} fill={fill} {...common} />
        <circle cx="24" cy="24" r="10.5" fill={inner} stroke={ring} strokeOpacity=".8" strokeWidth="1" />
      </>
    )
    default: return (
      <>
        <polygon points={poly(12, 21.5, 0.8, -90, 26)} fill={fill} stroke={edge} strokeWidth="1.3" strokeLinejoin="round" opacity=".85" />
        <circle cx="24" cy="26" r="15" fill={fill} {...common} />
        <circle cx="24" cy="26" r="11.5" fill={inner} stroke={ring} strokeOpacity=".8" strokeWidth="1" />
        <path d="M14 11.5 L18.5 15.5 L24 6.5 L29.5 15.5 L34 11.5 L32.5 18.5 H15.5 Z" fill="#ffd66b" stroke="#7a4b00" strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="24" cy="6.5" r="1.7" fill="#fff6c9" stroke="#7a4b00" strokeWidth=".6" />
      </>
    )
  }
}

export function Medal ({ hours, size = 32, locked = false, title }) {
  const id = useId().replace(/:/g, '')
  const m = MEDALS[hours]
  if (!m) return null
  const tier = m.tier
  const cy = tier === 4 ? 26 : 24
  // Emblema y número
  const ghostY = tier === 2 ? 20.5 : cy - 1.5
  const ghostScale = tier === 2 ? 0.6 : 0.46
  const ribbonY = tier === 2 ? 37 : tier === 3 ? 41 : 43.5
  const w = m.label.length * 3.1 + 4.5

  return (
    <svg className={`medal ${locked ? 'locked' : ''} tier-${tier}`} width={size} height={size} viewBox="0 0 48 48" role="img"
      style={{ '--medal-glow': m.glow }} aria-label={title || t('Medalla de {h} horas ({name})', { h: hours, name: t(m.name) })}>
      <title>{title || t('Medalla de {h} horas · {name}', { h: hours, name: t(m.name) })}</title>
      <defs>
        <linearGradient id={`f${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={m.light} />
          <stop offset=".35" stopColor={m.from} />
          <stop offset="1" stopColor={m.to} />
        </linearGradient>
        <linearGradient id={`i${id}`} x1="0.8" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={m.to} />
          <stop offset="1" stopColor={m.from} />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {tier === 4 && (
          <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
            <animateTransform attributeName="gradientTransform" type="translate" values="-1 -1; 1 1; 1 1" keyTimes="0; .6; 1" dur="3s" repeatCount="indefinite" />
          </linearGradient>
        )}
        <clipPath id={`c${id}`}><circle cx="24" cy={cy} r="15" /></clipPath>
      </defs>

      <Shape tier={tier} fill={`url(#f${id})`} inner={`url(#i${id})`} edge={m.edge} ring={m.light} />

      {tier >= 2 && (
        <g transform={`translate(24 ${ghostY}) scale(${ghostScale}) translate(-24 -22.5)`}>
          <path d={GHOST} fill="#fff" stroke={m.edge} strokeOpacity=".6" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="21.2" cy="21" r="1.7" fill={m.edge} />
          <circle cx="26.8" cy="21" r="1.7" fill={m.edge} />
        </g>
      )}

      <ellipse cx="19" cy={tier === 4 ? 18 : 13} rx="10" ry="4.5" fill={`url(#h${id})`} opacity=".5" pointerEvents="none" />
      {tier === 4 && !locked && <rect x="4" y="6" width="40" height="40" fill={`url(#r${id})`} clipPath={`url(#c${id})`} opacity=".6" pointerEvents="none" />}

      {tier < 2
        ? (
          <text x="24" y="28.2" textAnchor="middle" fontFamily="Inter Variable, system-ui, sans-serif" fontWeight="900"
            fontSize="11" fill={m.ink} style={{ letterSpacing: '-0.05em' }}>
            {m.label}
          </text>
          )
        : (
          <g>
            <path d={`M${24 - w} ${ribbonY - 7} H${24 + w} L${24 + w - 2} ${ribbonY - 3.5} L${24 + w} ${ribbonY} H${24 - w} L${24 - w + 2} ${ribbonY - 3.5} Z`}
              fill={m.edge} stroke={m.light} strokeOpacity=".7" strokeWidth=".8" strokeLinejoin="round" />
            <text x="24" y={ribbonY - 1.4} textAnchor="middle" fontFamily="Inter Variable, system-ui, sans-serif" fontWeight="900"
              fontSize="6.6" fill={m.ink} style={{ letterSpacing: '-0.02em' }}>
              {m.label}
            </text>
          </g>
          )}
    </svg>
  )
}
