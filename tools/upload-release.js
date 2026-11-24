// Sube el instalador de Windows al R2 de Cloudflare (bucket ghost-launcher), de donde lo sirve ghost-server en
// /updates (actualizaciones automáticas) y /descargar (enlace para descargarlo).
// Uso (después de "npx electron-builder --win --publish never"): node tools/upload-release.js
//
// Para no pasar NUNCA del plan gratis de R2 (10 GB, 1 millón de escrituras y 10 millones de lecturas al mes):
//   - en el bucket solo queda la última versión: al subir una nueva se borra la anterior
//   - se niega a subir si los archivos pasan de 400 MB en total
//   - las lecturas las limita el propio servidor (ghost-server, R2_READS_PER_MONTH / R2_READS_PER_DAY)
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const BUCKET = 'ghost-launcher'
const MAX_BYTES = 400 * 1024 * 1024
const SERVER_DIR = path.join(__dirname, '..', '..', 'ghost-server') // ahí está la sesión de wrangler
const release = path.join(__dirname, '..', 'release')

const wrangler = (...args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], { cwd: SERVER_DIR, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
const pathOf = (yml) => /^path:\s*(\S+)/m.exec(yml)?.[1]

const yml = fs.readFileSync(path.join(release, 'latest.yml'), 'utf8')
const key = pathOf(yml) // Ghost-Launcher-Setup-x.y.z.exe
const version = /^version:\s*(\S+)/m.exec(yml)?.[1]
const local = path.join(release, key)
const files = [[key, local], [key + '.blockmap', local + '.blockmap']]
for (const [, f] of files) if (!fs.existsSync(f)) throw new Error('Falta ' + f)
const total = files.reduce((n, [, f]) => n + fs.statSync(f).size, 0)
if (total > MAX_BYTES) throw new Error(`Demasiado grande (${Math.round(total / 1048576)} MB): no se sube`)

// versión que había antes en el bucket (para borrarla luego)
let old = null
try {
  const tmp = path.join(release, 'latest-old.yml')
  wrangler('r2', 'object', 'get', `${BUCKET}/latest.yml`, '--remote', '--file', tmp)
  old = pathOf(fs.readFileSync(tmp, 'utf8'))
  fs.rmSync(tmp, { force: true })
} catch { /* no había nada */ }

console.log(`Subiendo ${version} (${Math.round(total / 1048576)} MB)…`)
for (const [k, f] of files) wrangler('r2', 'object', 'put', `${BUCKET}/${k}`, '--remote', '--file', f, '--content-type', k.endsWith('.exe') ? 'application/vnd.microsoft.portable-executable' : 'application/octet-stream')
// latest.yml el último: hasta que no está, nadie intenta bajar la versión nueva
wrangler('r2', 'object', 'put', `${BUCKET}/latest.yml`, '--remote', '--file', path.join(release, 'latest.yml'), '--content-type', 'text/yaml')

if (old && old !== key) {
  for (const k of [old, old + '.blockmap']) { try { wrangler('r2', 'object', 'delete', `${BUCKET}/${k}`, '--remote'); console.log('Borrado', k) } catch {} }
}
console.log('Listo: https://ghost-server.gh0styclient.workers.dev/descargar')
