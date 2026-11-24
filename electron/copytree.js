// Copia de carpetas sin bloquear el launcher: archivo a archivo, cediendo el turno y avisando del progreso.
// (fs.cpSync congelaba la ventana con instancias grandes de varios GB.)
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { t } = require('./i18n')

const MB = 1024 * 1024
const fmt = (b) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : `${Math.round(b / MB)} MB`)

// Lista de archivos (con tamaño) dentro de las entradas elegidas de una carpeta
async function collect (srcDir, entries) {
  const files = []
  async function walk (rel) {
    const abs = path.join(srcDir, rel)
    let st
    try { st = await fsp.lstat(abs) } catch { return }
    if (st.isSymbolicLink()) return
    if (st.isDirectory()) {
      for (const name of await fsp.readdir(abs)) await walk(path.join(rel, name))
    } else if (st.isFile()) {
      files.push({ rel, size: st.size })
    }
  }
  for (const e of entries) await walk(e)
  return files
}

// Copia las entradas de srcDir a destDir. onProgress recibe { stage, current, total } en bytes.
async function copyEntries (srcDir, destDir, entries, onProgress = () => {}, label = 'Copiando archivos') {
  const files = await collect(srcDir, entries)
  const total = files.reduce((s, f) => s + f.size, 0)
  let done = 0
  let last = 0
  for (const f of files) {
    const to = path.join(destDir, f.rel)
    await fsp.mkdir(path.dirname(to), { recursive: true })
    try {
      await fsp.copyFile(path.join(srcDir, f.rel), to)
    } catch (e) {
      // Un archivo bloqueado (p. ej. un log abierto por otro programa) no debe parar la importación
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e
    }
    done += f.size
    if (Date.now() - last > 150) {
      last = Date.now()
      onProgress({ stage: t('{label} ({x} de {x2})', { label: label, x: fmt(done), x2: fmt(total) }), current: done, total })
    }
  }
  onProgress({ stage: t('{label} ({x})', { label: label, x: fmt(total) }), current: total, total })
  return { files: files.length, bytes: total }
}

// Tamaño total de unas entradas (para avisar antes de copiar cosas pesadas)
async function sizeOf (srcDir, entries) {
  return (await collect(srcDir, entries)).reduce((s, f) => s + f.size, 0)
}

const exists = (p) => fs.existsSync(p)

module.exports = { copyEntries, sizeOf, fmt, exists }
