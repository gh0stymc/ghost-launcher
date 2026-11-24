// Versiones oficiales de Mojang y perfiles de Fabric
const fs = require('fs')
const path = require('path')
const paths = require('./paths')
const { getJson, download } = require('./http')
const { t } = require('./i18n')

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

// Fabric tiene servidores secundarios oficiales (meta2/maven2) fuera de Cloudflare.
// Los usamos si los principales no responden (p. ej. bloqueos de IPs en España durante el fútbol).
const FABRIC_META = ['https://meta.fabricmc.net/v2', 'https://meta2.fabricmc.net/v2']
const FABRIC_MAVEN = ['https://maven.fabricmc.net/', 'https://maven2.fabricmc.net/']
const MAVEN_CENTRAL = 'https://repo1.maven.org/maven2/'
let workingMeta = 0

async function fabricGet (pathname) {
  let lastError
  for (let i = 0; i < FABRIC_META.length; i++) {
    const idx = (workingMeta + i) % FABRIC_META.length
    try {
      const json = await getJson(FABRIC_META[idx] + pathname, 1)
      workingMeta = idx
      return json
    } catch (e) {
      if (e.final) throw e
      lastError = e
    }
  }
  throw new Error(t('No se puede conectar con Fabric ({message})', { message: lastError?.message }))
}

// Descarga nosotros las librerías de Fabric probando varios servidores.
// Así el lanzador las encuentra ya en disco y no depende de un único servidor.
async function prefetchFabricLibraries (json, onProgress = () => {}) {
  const libs = json.libraries || []
  let n = 0
  for (const lib of libs) {
    const [group, artifact, version] = lib.name.split(':')
    const rel = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`
    const dest = path.join(paths.root(), 'libraries', ...rel.split('/'))
    onProgress({ stage: t('Descargando librerías de Fabric'), current: ++n, total: libs.length })
    if (fs.existsSync(dest)) continue
    const hosts = lib.url && lib.url.includes('fabricmc.net') ? [...FABRIC_MAVEN] : [lib.url || MAVEN_CENTRAL]
    if (!group.startsWith('net.fabricmc')) hosts.push(MAVEN_CENTRAL)
    let ok = false
    for (const host of hosts) {
      try {
        await download(host + rel, dest, { sha1: lib.sha1 })
        ok = true
        break
      } catch { /* probamos el siguiente servidor */ }
    }
    if (!ok) throw new Error(t('No se pudo descargar {name}', { name: lib.name }))
  }
}

let manifestCache = null

async function manifest () {
  if (manifestCache) return manifestCache
  try {
    manifestCache = await getJson(MANIFEST)
    fs.mkdirSync(paths.root(), { recursive: true })
    fs.writeFileSync(path.join(paths.root(), 'manifest.json'), JSON.stringify(manifestCache))
  } catch (e) {
    // Sin internet: usamos la última copia guardada
    const saved = path.join(paths.root(), 'manifest.json')
    if (!fs.existsSync(saved)) throw e
    manifestCache = JSON.parse(fs.readFileSync(saved, 'utf8'))
  }
  return manifestCache
}

async function listVersions () {
  const m = await manifest()
  return {
    latest: m.latest,
    versions: m.versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
  }
}

// Lee (y guarda) el JSON de una versión para saber qué Java necesita
async function versionJson (id) {
  const file = path.join(paths.root(), 'versions', id, `${id}.json`)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const entry = (await manifest()).versions.find(v => v.id === id)
  if (!entry) throw new Error(t('La versión {id} no existe', { id: id }))
  const json = await getJson(entry.url)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(json))
  return json
}

async function requiredJava (id) {
  const json = await versionJson(id)
  return json.javaVersion?.majorVersion || 8
}

async function fabricGameVersions () {
  const list = await fabricGet('/versions/game')
  return list.map(v => v.version)
}

async function fabricLatestLoader (gameVersion) {
  const list = await fabricGet(`/versions/loader/${encodeURIComponent(gameVersion)}`)
  if (!list.length) throw new Error(t('Fabric no está disponible para {gameVersion}', { gameVersion: gameVersion }))
  return (list.find(l => l.loader.stable) || list[0]).loader.version
}

// Crea el perfil de Fabric dentro de versions/ para que el lanzador lo use
async function ensureFabric (gameVersion, loaderVersion, onProgress) {
  const loader = loaderVersion || await fabricLatestLoader(gameVersion)
  const id = `fabric-loader-${loader}-${gameVersion}`
  const file = path.join(paths.root(), 'versions', id, `${id}.json`)
  let json
  if (fs.existsSync(file)) {
    json = JSON.parse(fs.readFileSync(file, 'utf8'))
  } else {
    json = await fabricGet(`/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/profile/json`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(json))
  }
  await prefetchFabricLibraries(json, onProgress)
  return { id, loader }
}

module.exports = { listVersions, versionJson, requiredJava, fabricGameVersions, fabricLatestLoader, ensureFabric }
