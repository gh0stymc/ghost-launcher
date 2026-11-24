// ghost client: el mod propio del launcher (HUD, zoom, freelook, utilidades PvP...).
// Va incluido dentro del launcher (carpeta resources/ghost-client), uno por versión de Minecraft.
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const paths = require('./paths')
const modrinth = require('./modrinth')
const resolver = require('./resolver')
const { t } = require('./i18n')

const PROJECT_ID = 'ghost-client'

const dir = () => app.isPackaged
  ? path.join(process.resourcesPath, 'ghost-client')
  : path.join(__dirname, '..', 'resources', 'ghost-client')

// Lista los ghost client incluidos y para qué versiones de Minecraft sirve cada uno
function available () {
  if (!fs.existsSync(dir())) return []
  return fs.readdirSync(dir())
    .filter(f => f.endsWith('.jar'))
    .map(f => {
      const json = resolver.readModJson(path.join(dir(), f))
      return json && { file: f, version: json.version, minecraft: json.depends?.minecraft }
    })
    .filter(Boolean)
}

function forVersion (mcVersion) {
  return available().find(j => resolver.matches(mcVersion, j.minecraft)) || null
}

function install (profile) {
  const jar = forVersion(profile.version)
  if (!jar) throw new Error(t('ghost client todavía no está disponible para {version}', { version: profile.version }))
  const mods = path.join(paths.instance(profile.id), 'mods')
  fs.mkdirSync(mods, { recursive: true })
  // Quitamos versiones anteriores de ghost client
  const meta = modrinth.readMeta(profile.id)
  for (const [name, info] of Object.entries(meta)) {
    if (info.projectId === PROJECT_ID && name !== jar.file) {
      fs.rmSync(path.join(mods, name), { force: true })
      fs.rmSync(path.join(mods, name + '.disabled'), { force: true })
      delete meta[name]
    }
  }
  fs.copyFileSync(path.join(dir(), jar.file), path.join(mods, jar.file))
  meta[jar.file] = { projectId: PROJECT_ID, type: 'mod', title: 'ghost client', icon: null, local: true, versionNumber: jar.version }
  modrinth.writeMeta(profile.id, meta)
  return 'ghost client'
}

// Al lanzar: si el perfil tiene ghost client activado, lo cambia por el que trae esta versión del launcher.
// Así los perfiles antiguos reciben las mejoras sin tener que crearlos de nuevo.
function updateIfInstalled (profile) {
  const item = modrinth.list(profile.id).find(i => i.projectId === PROJECT_ID)
  if (!item || !item.enabled) return false
  disableOtherDiscordMods(profile)
  if (!forVersion(profile.version)) return false
  install(profile)
  return true
}

// Otros mods de estado de Discord (Simple Discord Rich Presence, CraftPresence...) tapan el de ghost client.
// Si el perfil tiene ghost client, se desactivan (se pueden volver a activar en la lista de mods).
const OTHER_RPC = /discord.?(rich|rpc|presence|integration)|simple.?rpc|craftpresence|richpresence/i

function disableOtherDiscordMods (profile) {
  for (const item of modrinth.list(profile.id)) {
    if (item.type !== 'mod' || !item.enabled || item.projectId === PROJECT_ID) continue
    if (OTHER_RPC.test(item.file) || OTHER_RPC.test(item.title)) {
      modrinth.toggle(profile.id, 'mod', item.file, false)
    }
  }
}

module.exports = { PROJECT_ID, available, forVersion, install, updateIfInstalled }
