const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const UA = 'ghost-launcher/1.0'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

// Reintenta ante cortes de red o errores del servidor
async function getJson (url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status} en ${url}`)
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} en ${url}`)
        err.final = true
        throw err
      }
      return await res.json()
    } catch (e) {
      if (e.final || i >= tries) throw e
      await wait(1000 * i)
    }
  }
}

function sha1Of (file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1')
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

// Descarga a un archivo temporal y lo mueve al final, para no dejar archivos a medias
async function download (url, dest, { onProgress, sha1, sha256 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  let done = 0
  const hash = sha256 ? crypto.createHash('sha256') : sha1 ? crypto.createHash('sha1') : null
  const body = Readable.fromWeb(res.body)
  body.on('data', chunk => {
    done += chunk.length
    if (hash) hash.update(chunk)
    if (onProgress) onProgress(done, total)
  })
  const tmp = dest + '.part'
  await pipeline(body, fs.createWriteStream(tmp))
  if (hash) {
    const got = hash.digest('hex')
    const want = (sha256 || sha1).toLowerCase()
    if (got !== want) {
      fs.rmSync(tmp, { force: true })
      throw new Error(`El archivo descargado está corrupto (${path.basename(dest)})`)
    }
  }
  fs.renameSync(tmp, dest)
  return dest
}

module.exports = { UA, getJson, download, sha1Of }
