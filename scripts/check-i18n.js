// Busca las frases t('...') del launcher que no están en el diccionario inglés.
// Uso: node scripts/check-i18n.js [--write] [--unused]
//   --write  añade las que faltan (con el texto en español) para traducirlas en electron/locales/en.json
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
const dictFile = path.join(root, 'electron', 'locales', 'en.json')
const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'))

const files = []
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) { if (f.name !== 'locales' && f.name !== 'assets') walk(p) } else if (/\.(jsx?|cjs)$/.test(f.name)) files.push(p)
  }
}
walk(path.join(root, 'src'))
walk(path.join(root, 'electron'))

const used = new Map()
const re = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(re)) {
    if (m[1] === '`' && m[2].includes('${')) { console.warn('Plantilla con ${} dentro de t():', path.relative(root, f), m[2]); continue }
    const key = m[2].replace(/\\n/g, '\n').replace(/\\(.)/g, '$1')
    if (!used.has(key)) used.set(key, path.relative(root, f))
  }
}
const missing = [...used.keys()].filter(k => !(k in dict))
const unused = Object.keys(dict).filter(k => !used.has(k))
console.log(`${used.size} frases, ${missing.length} sin traducir, ${unused.length} sin usar`)
for (const k of missing) console.log('  falta:', JSON.stringify(k), '<-', used.get(k))
if (process.argv.includes('--unused')) for (const k of unused) console.log('  sin usar:', JSON.stringify(k))
if (process.argv.includes('--write')) {
  for (const k of missing) dict[k] = k
  fs.writeFileSync(dictFile, JSON.stringify(dict, null, 2) + '\n')
}
