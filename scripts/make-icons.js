// Genera los iconos a partir del logo: quita el fondo negro y crea .png y .ico
// Uso: node scripts/make-icons.js <logo.png>
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico').default || require('png-to-ico')

const src = process.argv[2]
const root = path.join(__dirname, '..')

async function main () {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

  // Rellenamos desde los bordes solo el negro conectado al exterior,
  // así los ojos y la boca (negros pero dentro del fantasma) se conservan
  const bg = new Uint8Array(w * h)
  const stack = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  while (stack.length) {
    const p = stack.pop()
    if (bg[p] || lum(p * 4) > 60) continue
    bg[p] = 1
    const x = p % w
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (p >= w) stack.push(p - w)
    if (p < w * (h - 1)) stack.push(p + w)
  }

  // Borde suave: los píxeles junto al fondo se vuelven semitransparentes según su brillo
  const nearBg = (p, r) => {
    const x = p % w; const y = (p / w) | 0
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx; const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) return true
      }
    }
    return false
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (bg[p]) { data[i + 3] = 0; continue }
    const l = lum(i)
    if (l < 225 && nearBg(p, 2)) {
      const a = Math.max(0, Math.min(1, l / 225))
      data[i + 3] = Math.round(a * 255)
      if (a > 0) for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(data[i + c] / a))
    }
  }

  // Recortamos al contenido y lo centramos en un lienzo cuadrado
  const trimmed = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().trim().toBuffer()
  const meta = await sharp(trimmed).metadata()
  const side = Math.round(Math.max(meta.width, meta.height) * 1.06)
  const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: trimmed, gravity: 'center' }]).png().toBuffer()

  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src', 'assets'), { recursive: true })
  fs.mkdirSync(path.join(root, 'electron', 'assets'), { recursive: true })

  await sharp(square).resize(512, 512).png().toFile(path.join(root, 'build', 'icon.png'))
  await sharp(square).resize(256, 256).png().toFile(path.join(root, 'src', 'assets', 'logo.png'))
  await sharp(square).resize(256, 256).png().toFile(path.join(root, 'electron', 'assets', 'icon.png'))

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngs = await Promise.all(sizes.map(s => sharp(square).resize(s, s).png().toBuffer()))
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), await pngToIco(pngs))
  console.log('Iconos generados')
}

main().catch(e => { console.error(e); process.exit(1) })
