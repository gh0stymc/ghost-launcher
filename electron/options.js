// Lee y escribe options.txt de Minecraft (idioma, texture packs activos...) y la configuración de Iris (shaders).
const fs = require('fs')
const path = require('path')
const paths = require('./paths')

const optionsFile = (profileId) => path.join(paths.instance(profileId), 'options.txt')
const irisFile = (profileId) => path.join(paths.instance(profileId), 'config', 'iris.properties')

// Archivo "clave:valor" (options.txt) o "clave=valor" (iris.properties) → lista de líneas para no perder el orden
function readLines (file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/) } catch { return [] }
}

function getValue (lines, key, sep) {
  const line = lines.find(l => l.startsWith(key + sep))
  return line === undefined ? undefined : line.slice(key.length + 1)
}

function setValue (lines, key, value, sep) {
  const i = lines.findIndex(l => l.startsWith(key + sep))
  const line = `${key}${sep}${value}`
  if (i >= 0) lines[i] = line
  else {
    // Antes de la última línea vacía, para que el archivo siga acabando en salto de línea
    if (lines.length && lines[lines.length - 1] === '') lines.splice(lines.length - 1, 0, line)
    else lines.push(line)
  }
  return lines
}

function write (file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (lines[lines.length - 1] !== '') lines.push('')
  fs.writeFileSync(file, lines.join('\n'))
}

// Idioma del juego (Minecraft, ghost client y los mods con traducciones)
function setLanguage (profileId, lang) {
  const file = optionsFile(profileId)
  const lines = readLines(file)
  if (getValue(lines, 'lang', ':') === lang) return
  write(file, setValue(lines, 'lang', lang, ':'))
}

// Texture packs activos: resourcePacks:["vanilla","file/Pack.zip"] (el último es el que más manda)
function activeResourcePacks (profileId) {
  const value = getValue(readLines(optionsFile(profileId)), 'resourcePacks', ':')
  try { return JSON.parse(value || '[]') } catch { return [] }
}

function setResourcePack (profileId, file, on) {
  const optFile = optionsFile(profileId)
  const lines = readLines(optFile)
  let packs = activeResourcePacks(profileId)
  if (!packs.length) packs = ['vanilla']
  const id = `file/${file}`
  packs = packs.filter(p => p !== id)
  if (on) packs.push(id)
  setValue(lines, 'resourcePacks', JSON.stringify(packs), ':')
  // Si Minecraft lo había marcado como incompatible, se quita de esa lista para que lo cargue igual
  const bad = getValue(lines, 'incompatibleResourcePacks', ':')
  if (bad) {
    try { setValue(lines, 'incompatibleResourcePacks', JSON.stringify(JSON.parse(bad).filter(p => p !== id)), ':') } catch {}
  }
  write(optFile, lines)
}

// Shader activo de Iris (null si están desactivados)
function activeShader (profileId) {
  const lines = readLines(irisFile(profileId))
  if (getValue(lines, 'enableShaders', '=') !== 'true') return null
  return getValue(lines, 'shaderPack', '=') || null
}

function setShader (profileId, file, on) {
  const f = irisFile(profileId)
  const lines = readLines(f)
  if (on) setValue(lines, 'shaderPack', file, '=')
  setValue(lines, 'enableShaders', on ? 'true' : 'false', '=')
  write(f, lines)
}

// Qué packs están en uso dentro del juego
function activePacks (profileId) {
  return {
    resourcepack: activeResourcePacks(profileId).filter(p => p.startsWith('file/')).map(p => p.slice(5)),
    shader: activeShader(profileId)
  }
}

module.exports = { setLanguage, activePacks, setResourcePack, setShader }
