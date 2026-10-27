const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const paths = require('./paths')

const defaults = () => ({
  settings: {
    // RAM por defecto: 4 GB, o la mitad del equipo si tiene poca memoria
    maxRam: Math.min(4096, Math.max(2048, Math.floor(os.totalmem() / 1024 / 1024 / 2 / 512) * 512)),
    minRam: 1024,
    jvmArgs: '',
    closeOnLaunch: false,
    showSnapshots: false,
    accent: '#7c5cff',
    background: 'aurora',
    discordAppId: '',
    loadingScreen: 'ghost'
  },
  profiles: [],
  accounts: [],
  activeAccount: null
})

let cache = null
const file = () => paths.data('launcher.json')

function load () {
  if (cache) return cache
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'))
    const d = defaults()
    cache = { ...d, ...saved, settings: { ...d.settings, ...saved.settings } }
  } catch {
    cache = defaults()
  }
  return cache
}

function save () {
  fs.mkdirSync(paths.base(), { recursive: true })
  // Escritura atómica para no corromper el archivo si se cierra a mitad
  const tmp = file() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2))
  fs.renameSync(tmp, file())
}

function get () { return load() }

function update (fn) {
  load()
  fn(cache)
  save()
  return cache
}

const newId = () => crypto.randomBytes(6).toString('hex')

module.exports = { get, update, newId }
