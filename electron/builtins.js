// Mods integrados de Ghost Launcher.
// No son los mods de Lunar (esos son código privado de Lunar), sino mods libres de Modrinth
// que dan las mismas funciones. Se instalan en cada perfil nuevo con Fabric.
const modrinth = require('./modrinth')
const store = require('./store')

// lunar: qué funciones de Lunar cubre cada mod
const BUILTINS = [
  // Rendimiento
  { slug: 'sodium', name: 'Sodium', category: 'Rendimiento', lunar: 'Motor gráfico rápido (más FPS)', default: true },
  { slug: 'lithium', name: 'Lithium', category: 'Rendimiento', lunar: 'Optimización del juego', default: true },
  { slug: 'ferrite-core', name: 'FerriteCore', category: 'Rendimiento', lunar: 'Menos uso de memoria', default: true },
  { slug: 'entityculling', name: 'Entity Culling', category: 'Rendimiento', lunar: 'No dibuja lo que no se ve', default: true },
  { slug: 'immediatelyfast', name: 'ImmediatelyFast', category: 'Rendimiento', lunar: 'HUD y texto más rápidos', default: true },
  { slug: 'dynamic-fps', name: 'Dynamic FPS', category: 'Rendimiento', lunar: 'Baja los FPS en segundo plano', default: true },
  { slug: 'sodium-extra', name: 'Sodium Extra', category: 'Rendimiento', lunar: 'Fog, Weather, Particles, Sky', default: true },
  { slug: 'reeses-sodium-options', name: "Reese's Sodium Options", category: 'Rendimiento', lunar: 'Menú de vídeo mejorado', default: true },

  // Cliente PvP
  { slug: 'ghost-client', name: 'ghost client', category: 'Cliente PvP', local: true, lunar: 'FPS, CPS, Ping, Keystrokes, ArmorStatus, Potion Effects, Coordinates, Direction, Clock, Memory, Combo, Server Address, Pack Display, Scoreboard, BossBar, Action Bar, Crosshair, Zoom, Freelook, Motion Blur, Hit Color, Block Outline, Nick Hider, AutoGG, Level Head, TNT Countdown, Time Changer, Fullbright, Particles, Scrollable Tooltips, Screenshot, Discord RPC', default: true },
  { slug: 'tiertagger', name: 'Tier Tagger', category: 'Cliente PvP', lunar: 'Tier Tagger', default: true },
  { slug: 'betterhurtcam', name: 'BetterHurtCam', category: 'Cliente PvP', lunar: 'Hurt Cam', default: true },

  // HUD e información
  { slug: 'betterf3', name: 'BetterF3', category: 'HUD e información', lunar: 'F3 Display', default: true },
  { slug: 'jade', name: 'Jade', category: 'HUD e información', lunar: 'WAILA (qué bloque estás mirando)', default: true },
  { slug: 'appleskin', name: 'AppleSkin', category: 'HUD e información', lunar: 'Saturation', default: true },
  { slug: 'xaeros-minimap', name: "Xaero's Minimap", category: 'HUD e información', lunar: 'Minimap, Waypoints', default: true },
  { slug: 'xaeros-world-map', name: "Xaero's World Map", category: 'HUD e información', lunar: 'Mapa completo', default: true },
  { slug: 'horsestatsvanilla', name: 'Horse Stats Vanilla', category: 'HUD e información', lunar: 'Horse Stats', default: true },
  { slug: 'lightoverlay', name: 'Light Overlay', category: 'HUD e información', lunar: 'Light Overlay', default: true },

  // Visuales
  { slug: '3dskinlayers', name: '3D Skin Layers', category: 'Visuales', lunar: '3D Skins', default: true },
  { slug: 'iris', name: 'Iris Shaders', category: 'Visuales', lunar: 'Shaders', default: true },
  { slug: 'continuity', name: 'Continuity', category: 'Visuales', lunar: 'Texturas conectadas de los packs', default: true },
  { slug: 'entitytexturefeatures', name: 'Entity Texture Features', category: 'Visuales', lunar: 'Texturas de entidades de los packs', default: true },
  { slug: 'entity-model-features', name: 'Entity Model Features', category: 'Visuales', lunar: 'Modelos de entidades de los packs', default: true },
  { slug: 'itemphysic-lite', name: 'ItemPhysic Lite', category: 'Visuales', lunar: 'Item Physics', default: false },

  // Utilidades
  { slug: 'modmenu', name: 'Mod Menu', category: 'Utilidades', lunar: 'Menú para configurar los mods', default: true },
  { slug: 'shulkerboxtooltip', name: 'Shulker Box Tooltip', category: 'Utilidades', lunar: 'Shulker Preview', default: true },
  { slug: 'mouse-tweaks', name: 'Mouse Tweaks', category: 'Utilidades', lunar: 'Inventory Mod', default: true },
  { slug: 'replaymod', name: 'ReplayMod', category: 'Utilidades', lunar: 'Rewind (grabar y ver repeticiones)', default: false },
  { slug: 'worldedit-cui', name: 'WorldEdit CUI', category: 'Utilidades', lunar: 'WorldEdit CUI', default: false },
  { slug: 'mumble-link-fabric', name: 'Mumble Link', category: 'Utilidades', lunar: 'Mumble Link', default: false }
]

const CAPES = { slug: 'capes', name: 'Capes', category: 'Siempre', lunar: 'Capas (OptiFine, MinecraftCapes, Cosmetica...)' }

function catalog () {
  const s = store.get().settings
  // (AxolotlClient fue sustituido por ghost client)
  const enabled = (s.builtins || BUILTINS.filter(b => b.default).map(b => b.slug))
    .map(slug => (slug === 'axolotlclient' ? 'ghost-client' : slug))
  return { mods: BUILTINS, enabled, capes: { ...CAPES, enabled: s.capesByDefault !== false } }
}

// Lo que se instala por defecto en un perfil nuevo según los ajustes
function defaultSelection () {
  const { enabled, capes } = catalog()
  return capes.enabled ? [...enabled, CAPES.slug] : enabled
}

async function pool (items, size, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

// Instala los mods elegidos en un perfil. Los que no existan para su versión se saltan.
// replace: si el perfil ya tiene alguno de estos mods (p. ej. lo trae un modpack), se cambia por el nuestro
async function apply (profile, slugs, onProgress = () => {}, { replace = false } = {}) {
  if (profile.loader !== 'fabric') return { installed: [], skipped: [] }
  const seen = new Set()
  const installed = []
  const skipped = []
  let done = 0
  // Fabric API primero: casi todos dependen de ella
  await modrinth.install(profile, 'fabric-api', 'mod', () => {}, seen, { skipIfInstalled: true }).catch(() => {})
  // ghost client viene dentro del launcher, no de Modrinth
  if (slugs.includes('ghost-client')) {
    try {
      installed.push(require('./ghostclient').install(profile))
    } catch {
      skipped.push('ghost client')
    }
    onProgress({ stage: `Instalando mods integrados (${++done}/${slugs.length})`, current: done, total: slugs.length })
  }
  await pool(slugs.filter(s => s !== 'ghost-client'), 4, async (slug) => {
    const name = [...BUILTINS, CAPES].find(b => b.slug === slug)?.name || slug
    try {
      const names = await modrinth.install(profile, slug, 'mod', () => {}, seen, { skipIfInstalled: !replace })
      installed.push(...names)
    } catch {
      skipped.push(name)
    }
    onProgress({ stage: `Instalando mods integrados (${++done}/${slugs.length})`, current: done, total: slugs.length })
  })
  onProgress({ stage: 'Comprobando compatibilidad entre mods', current: 0, total: 0 })
  const check = await require('./resolver').resolve(profile, onProgress).catch(() => ({ changes: [] }))
  return { installed, skipped, adjusted: check.changes }
}

module.exports = { BUILTINS, CAPES, catalog, defaultSelection, apply }
