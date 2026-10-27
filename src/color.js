// Calcula colores legibles a partir del color principal elegido.
// Así un acento blanco o amarillo lleva texto oscuro, y uno muy oscuro se aclara cuando se usa como texto.
function hexToRgb (hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance ([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

export function accentVars (hex) {
  const rgb = hexToRgb(hex)
  const L = luminance(rgb)
  const DARK = '#0c0c14'
  // Texto encima del acento: blanco salvo que el color sea claro (blanco, amarillo, verde lima...)
  const onAccent = contrast(L, 1) >= 2.6 ? '#ffffff' : DARK
  // Acento usado como texto sobre fondo oscuro: si es muy oscuro, lo aclaramos
  const bgL = luminance(hexToRgb('#101018'))
  let accentText = hex
  if (contrast(L, bgL) < 3.5) accentText = `color-mix(in srgb, ${hex} 45%, #ffffff)`
  return { '--accent': hex, '--on-accent': onAccent, '--accent-text': accentText }
}
