// Descarga automática de Java (Eclipse Temurin), como hace Lunar con su carpeta "jre".
// Cada versión de Minecraft pide una versión de Java distinta (8, 17, 21, 25...).
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const paths = require('./paths')
const { getJson, download } = require('./http')
const { t } = require('./i18n')

const run = promisify(execFile)

const adoptOS = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform]
const adoptArch = { x64: 'x64', arm64: 'aarch64' }[process.arch] || 'x64'
const exeName = process.platform === 'win32' ? 'javaw.exe' : 'java'

function findJava (dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return null
  const direct = path.join(dir, 'bin', exeName)
  if (fs.existsSync(direct)) return direct
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const found = findJava(path.join(dir, entry.name), depth + 1)
      if (found) return found
    }
  }
  return null
}

async function latestPackage (major) {
  for (const image of ['jre', 'jdk']) {
    const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${adoptArch}&image_type=${image}&os=${adoptOS}&vendor=eclipse`
    const list = await getJson(url).catch(() => [])
    if (list.length) return list[0].binary.package
  }
  throw new Error(t('No se encontró Java {major} para este sistema', { major: major }))
}

async function ensureJava (major, onProgress = () => {}) {
  const dir = path.join(paths.java(), String(major))
  const existing = findJava(dir)
  if (existing) return existing

  onProgress({ stage: t('Descargando Java {major}', { major: major }), current: 0, total: 1 })
  const pkg = await latestPackage(major)
  const archive = path.join(paths.java(), pkg.name)
  await download(pkg.link, archive, {
    sha256: pkg.checksum,
    onProgress: (done, total) => onProgress({ stage: t('Descargando Java {major}', { major: major }), current: done, total: total || pkg.size })
  })

  onProgress({ stage: t('Instalando Java {major}', { major: major }), current: 0, total: 0 })
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // "tar" viene incluido en Windows 10+, macOS y Linux, y abre tanto .zip como .tar.gz
  // En Windows usamos siempre el tar del sistema (otros "tar" del PATH, como el de Git, no abren .zip)
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  await run(tar, ['-xf', archive, '-C', dir])
  fs.rmSync(archive, { force: true })

  const java = findJava(dir)
  if (!java) throw new Error(t('No se pudo instalar Java {major}', { major: major }))
  return java
}

function installedJavas () {
  if (!fs.existsSync(paths.java())) return []
  return fs.readdirSync(paths.java())
    .map(major => ({ major, path: findJava(path.join(paths.java(), major)) }))
    .filter(j => j.path)
}

module.exports = { ensureJava, installedJavas }
