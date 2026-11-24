// Cosméticos 3D de ghost client (mascotas, sombreros, espalda y auras) en la vista 3D del Vestidor.
// Los modelos son los mismos que usa el mod (los genera ghost-client/tools/make-cosmetics.js): bloques con una textura
// pintada pixel a pixel (model.png, estilo Blockbench, como los de Lunar). También se leen mallas con color por vértice y
// los modelos antiguos de bloques de un color. Destellos de luz (sprites aditivos) en lo que brilla.
// Para que sea rápido: una sola malla por parte y material (no una por bloque).
// Los modelos nuevos (tools/make-bb-cosmetics.js) traen animaciones de fotogramas clave por estado ("kf"): aquí se usa
// la de estar quieto (idle), igual que en el juego cuando el jugador no se mueve.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const MODELS = Object.fromEntries(Object.entries(import.meta.glob('../assets/cosmetics-models/*.json', { eager: true, import: 'default' }))
  .map(([file, m]) => [file.match(/([^/]+)\.json$/)[1], m]))

// Texturas de los modelos (pixeles nítidos, compartidas entre visores)
const TEXTURE_URLS = Object.fromEntries(Object.entries(import.meta.glob('../assets/cosmetics/*/model.png', { eager: true, import: 'default' }))
  .map(([file, url]) => [file.match(/cosmetics\/([^/]+)\/model\.png$/)[1], url]))
const textures = new Map()
function modelTexture (id) {
  if (!TEXTURE_URLS[id]) return null
  if (!textures.has(id)) {
    const waiting = []
    const tex = new THREE.TextureLoader().load(TEXTURE_URLS[id], () => { tex.userData.ready = true; for (const fn of waiting.splice(0)) fn(tex) })
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.userData.waiting = waiting
    textures.set(id, tex)
  }
  return textures.get(id)
}
// Llama a fn cuando la textura esté cargada (para leer el color de las gemas)
function whenReady (tex, fn) { if (tex.userData.ready) fn(tex); else tex.userData.waiting.push(fn) }
function texColor (tex, u, v) {
  if (!tex.userData.ctx) {
    const c = document.createElement('canvas')
    c.width = tex.image.width; c.height = tex.image.height
    tex.userData.ctx = c.getContext('2d', { willReadFrequently: true })
    tex.userData.ctx.drawImage(tex.image, 0, 0)
  }
  const d = tex.userData.ctx.getImageData(Math.min(tex.image.width - 1, Math.floor(u * tex.image.width)), Math.min(tex.image.height - 1, Math.floor(v * tex.image.height)), 1, 1).data
  return new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace)
}

export const hasModel = (id) => !!MODELS[id]

const deg = (d) => d * Math.PI / 180
const FACES = [
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] }
]

// Entorno de estudio para los reflejos (uno por visor)
const envs = new WeakMap()
function envFor (renderer) {
  if (!envs.has(renderer)) {
    const pmrem = new THREE.PMREMGenerator(renderer)
    envs.set(renderer, pmrem.fromScene(new RoomEnvironment(), 0.04).texture)
    pmrem.dispose()
  }
  return envs.get(renderer)
}

// Textura del destello (círculo con degradado), compartida
let glowTex = null
function glowTexture () {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}
function glowSprite (color, size, opacity) {
  const mat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  const s = new THREE.Sprite(mat)
  s.scale.setScalar(size)
  return s
}

const hexColor = (h) => new THREE.Color().setHex(parseInt(h, 16)) // de sRGB a lineal (three lo convierte)

// Material de three para un grupo (mismo material, transparencia y brillo)
function makeMaterial (g, materials, env) {
  const p = materials?.[g.mat] || {}
  const see = g.alpha < 1 || g.soft // tiene partes translúcidas
  const common = { vertexColors: g.vc !== false, map: g.map || null, alphaTest: g.cut ? 0.1 : 0, transparent: see, opacity: g.alpha, depthWrite: !see, side: THREE.DoubleSide }
  const mat = g.glow
    ? new THREE.MeshBasicMaterial({ ...common, toneMapped: false })
    : new THREE.MeshStandardMaterial({
      ...common,
      // metal parcial: el color sale de las luces y el brillo del reflejo (con metal al 100% se ve negro con poca luz)
      metalness: Math.min(0.5, p.metal ?? 0),
      roughness: p.rough ?? 0.8,
      envMap: env,
      envMapIntensity: p.metal ? 0.9 : 0.3
    })
  // la luz ambiental de skinview3d es fuerte (pensada para la skin): se baja el albedo para que no se quemen los claros
  // (con textura, menos: la textura ya lleva su sombreado pintado)
  if (!g.glow) mat.color.setScalar(g.map ? 0.85 : 0.62)
  return mat
}

// Mallas suaves del modelo (triángulos con normales por vértice). Devuelve las mallas de three y, para los destellos,
// el centro y tamaño de cada trozo que brilla (cada gema, runa u ojo por separado).
function buildSmooth (list, materials, env, out, tex) {
  const meshes = []
  const glows = []
  for (const m of list) {
    if (m.mat === 'halo') continue // en el launcher el brillo lo hacen los destellos
    const geo = new THREE.BufferGeometry()
    const count = m.v.length / 3
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.v, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.n, 3))
    if (m.c) {
      const col = new Float32Array(m.v.length)
      for (let k = 0; k < count; k++) {
        const c = hexColor(m.c.slice(k * 6, k * 6 + 6))
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    }
    if (m.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2))
    // caras de 4 vértices seguidas (bloques con textura) o triángulos con índices
    const idx = m.q ? [] : m.i
    if (m.q) for (let q = 0; q < count; q += 4) idx.push(q, q + 1, q + 2, q, q + 2, q + 3)
    geo.setIndex(idx)
    const alpha = m.a ?? 1
    const textured = !!(m.uv && tex)
    const mat = makeMaterial({ mat: m.mat, alpha, glow: !!m.g, vc: !!m.c, map: textured ? tex : null, cut: !!m.cut, soft: !!m.t }, materials, env)
    out.push(mat)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = alpha < 1 || m.t ? 2 : 0
    meshes.push(mesh)
    if (m.g && alpha >= 1) { // los brillos translúcidos (reflejos) no llevan destello
      // trozos sueltos: vértices unidos por triángulos o en el mismo sitio
      const parent = Array.from({ length: count }, (_, i) => i)
      const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
      for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a }
      const at = new Map()
      for (let k = 0; k < count; k++) {
        const key = m.v.slice(k * 3, k * 3 + 3).map(v => Math.round(v * 100)).join(',')
        if (at.has(key)) parent[find(k)] = find(at.get(key)); else at.set(key, k)
      }
      const box = new Map()
      for (let k = 0; k < parent.length; k++) {
        const r = find(k)
        if (!box.has(r)) box.set(r, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], color: m.c ? m.c.slice(k * 6, k * 6 + 6) : null, k0: k })
        const b = box.get(r)
        for (let a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], m.v[k * 3 + a]); b.max[a] = Math.max(b.max[a], m.v[k * 3 + a]) }
      }
      for (const b of box.values()) {
        const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])
        // con textura, el color del destello se lee de la textura (en el centro de una de sus caras)
        const uv = m.uv && m.q && [0, 1].map(a => (m.uv[b.k0 * 2 + a] + m.uv[(b.k0 + 2) * 2 + a]) / 2)
        glows.push({ pos: [0, 1, 2].map(a => (b.min[a] + b.max[a]) / 2), size, color: b.color, uv, big: m.mat === 'gem' })
      }
    }
  }
  return { meshes, glows }
}

// Une los bloques de una parte en una geometría por material, con colores por esquina (modelos antiguos)
function buildMeshes (boxes, materials, env, out) {
  const groups = new Map()
  for (const b of boxes) {
    const [x, y, z, w, h, d, colors, alpha = 1, glow = false, mat = 'matte'] = b
    if (mat === 'halo') continue // en el launcher el brillo lo hacen los destellos
    const key = mat + '|' + (alpha < 1 ? 't' + alpha : 'o') + (glow ? 'g' : '')
    if (!groups.has(key)) groups.set(key, { mat, alpha, glow, pos: [], col: [], nrm: [], idx: [] })
    const g = groups.get(key)
    const per = colors.length >= 144
    const flat = hexColor(colors.replace('#', '').slice(0, 6))
    FACES.forEach((f, fi) => {
      const base = g.pos.length / 3
      f.c.forEach((k, v) => {
        g.pos.push(x + k[0] * w, y + k[1] * h, z + k[2] * d)
        const c = per ? hexColor(colors.slice((fi * 4 + v) * 6, (fi * 4 + v) * 6 + 6)) : flat
        g.col.push(c.r, c.g, c.b)
        g.nrm.push(...f.n)
      })
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })
  }
  const meshes = []
  for (const g of groups.values()) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3))
    geo.setIndex(g.idx)
    const mat = makeMaterial(g, materials, env)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = g.alpha < 1 ? 2 : 0
    out.push(mat)
    meshes.push(mesh)
  }
  return meshes
}

// Fotogramas clave: listas planas [t, x, y, z, suavizado, ...]; el suavizado va en el fotograma de llegada (como en el mod)
const EASES = [
  (x) => x,
  (x) => x < 1 ? 0 : 1,
  (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
  (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2) }
]
function track (k, t, a, def) {
  if (!k || k.length < 5) return def
  if (t <= k[0]) return k[1 + a]
  for (let i = 5; i < k.length; i += 5) {
    if (t <= k[i]) {
      const t0 = k[i - 5], t1 = k[i]
      const e = (EASES[k[i + 4]] || EASES[0])(t1 > t0 ? (t - t0) / (t1 - t0) : 1)
      return k[i - 4 + a] + (k[i + 1 + a] - k[i - 4 + a]) * e
    }
  }
  return k[k.length - 4 + a]
}

function setRot (obj, r) {
  if (r) obj.rotation.set(deg(r[0]), deg(r[1]), deg(r[2]), 'ZYX') // primero X, luego Y, luego Z (como en el mod)
}

// Construye un modelo. Devuelve el grupo y una función para animarlo (t = segundos).
function build (m, env) {
  const mats = []
  const tex = m.texture ? modelTexture(m.id) : null
  const root = new THREE.Group()
  const off = m.offset || [0, 0, 0]
  root.position.set(off[0], off[1], off[2])
  setRot(root, m.rot)
  const anims = []
  const contents = []
  const parts = m.parts || []
  parts.forEach((p, i) => {
    const pv = p.pivot || [0, 0, 0]
    const outer = new THREE.Group()
    outer.position.set(pv[0], pv[1], pv[2])
    setRot(outer, p.rot)
    const anim = new THREE.Group()
    const content = new THREE.Group()
    content.position.set(-pv[0], -pv[1], -pv[2])
    const sprites = []
    if (p.meshes) {
      const { meshes, glows } = buildSmooth(p.meshes, m.materials, env, mats, tex)
      for (const mesh of meshes) content.add(mesh)
      for (const g of glows) {
        const s = glowSprite(g.color ? hexColor(g.color) : new THREE.Color(1, 1, 1), g.size * (g.big ? 3.2 : 2.2), g.big ? 0.75 : 0.45)
        if (!g.color && g.uv && tex) whenReady(tex, (t) => s.material.color.copy(texColor(t, g.uv[0], g.uv[1])))
        s.position.set(...g.pos)
        s.userData.base = s.material.opacity
        content.add(s)
        sprites.push(s)
      }
    }
    if (p.boxes) for (const mesh of buildMeshes(p.boxes, m.materials, env, mats)) content.add(mesh)
    // destellos en lo que brilla (gemas, runas, ojos)
    for (const b of p.boxes || []) {
      if (!b[8] || b[9] === 'halo') continue
      const big = b[9] === 'gem'
      const s = glowSprite(hexColor(b[6].replace('#', '').slice(0, 6)), Math.max(b[3], b[4], b[5]) * (big ? 4.2 : 2.6), big ? 0.75 : 0.45)
      s.position.set(b[0] + b[3] / 2, b[1] + b[4] / 2, b[2] + b[5] / 2)
      s.userData.base = s.material.opacity
      content.add(s)
      sprites.push(s)
    }
    anim.add(content)
    outer.add(anim)
    contents.push(content)
    anims.push({ g: anim, outer, pivot: pv, list: [].concat(p.anim || []), sprites, glowMats: [], kf: p.kf && (p.kf.gui || p.kf.idle) })
    // se cuelga de su padre (dentro del espacio del padre, que es el mismo del modelo)
    ;(p.parent !== undefined && contents[p.parent] ? contents[p.parent] : root).add(outer)
  })
  // materiales que brillan de cada parte (para el pulso)
  parts.forEach((p, i) => contents[i].children.forEach(c => { if (c.isMesh && c.material.isMeshBasicMaterial) anims[i].glowMats.push(c.material) }))
  let auraUpdate = null
  if (m.aura) auraUpdate = buildAura(m.aura, root, mats)
  const state = m.states && (m.states.gui ? 'gui' : 'idle')
  const len = state ? m.states[state] : 0
  const update = (t) => {
    const tt = len > 0 ? t % len : 0
    for (const { g, outer, pivot, list, sprites, glowMats, kf } of anims) {
      g.position.set(0, 0, 0)
      g.rotation.set(0, 0, 0)
      g.scale.set(1, 1, 1)
      if (kf) {
        // la posición va antes del giro de reposo (en el espacio del padre), como en el mod
        outer.position.set(...[0, 1, 2].map(a => pivot[a] + track(kf.pos, tt, a, 0)))
        g.rotation.set(...[0, 1, 2].map(a => deg(track(kf.rot, tt, a, 0))), 'ZYX')
        g.scale.set(...[0, 1, 2].map(a => Math.max(1e-3, track(kf.scl, tt, a, 1))))
      }
      for (const a of list) {
        const ph = t * a.speed + (a.phase || 0)
        const wave = Math.sin(ph * Math.PI * 2)
        const hop = Math.abs(Math.sin(ph * Math.PI))
        if (a.type === 'bob') g.position.y += a.amp * wave
        else if (a.type === 'hop') {
          const squash = Math.pow(1 - hop, 4)
          g.position.y += a.amp * hop
          g.scale.set(1 + 0.14 * squash - 0.03 * hop, 1 - 0.22 * squash + 0.06 * hop, 1 + 0.14 * squash - 0.03 * hop)
        } else if (a.type === 'shadowHop') { const s = 1 - a.amp * hop; g.scale.set(s, 1, s) }
        else if (a.type === 'blink') { const p = ((ph % 1) + 1) % 1; if (p < 0.06) g.scale.y = 1 - 0.9 * Math.sin(p / 0.06 * Math.PI) }
        else if (a.type === 'sway' || a.type === 'flap') g.rotation.y = deg(a.amp * wave)
        else if (a.type === 'flapZ') g.rotation.z = deg(a.amp * wave)
        else if (a.type === 'spin') g.rotation.y = deg(t * a.speed * 360)
        else if (a.type === 'pulse') {
          const k = 1 + a.amp * wave
          for (const s of sprites) s.material.opacity = s.userData.base * k
          for (const gm of glowMats) gm.color.setScalar(k)
        }
      }
    }
    if (auraUpdate) auraUpdate(t)
  }
  const dispose = () => {
    root.traverse(o => o.geometry && o.geometry.dispose())
    for (const mat of mats) mat.dispose()
    root.traverse(o => o.isSprite && o.material.dispose())
  }
  return { root, update, dispose }
}

// Auras: núcleos brillantes con destello que giran o suben (igual que en el mod)
function buildAura (a, root, mats) {
  const geo = new THREE.BoxGeometry(1, 1, 1) // partículas cuadradas (estilo pixel)
  const items = []
  const make = (color) => {
    const mat = new THREE.MeshBasicMaterial({ color: hexColor(color.slice(1)), transparent: true, depthWrite: false, toneMapped: false })
    mats.push(mat)
    const core = new THREE.Mesh(geo, mat)
    const halo = glowSprite(hexColor(color.slice(1)), 4, 0.6)
    root.add(core, halo)
    items.push({ core, halo })
    return items[items.length - 1]
  }
  if (a.type === 'orbit') {
    const tilts = [0, 55, -55]
    const trail = a.trail ?? 5
    for (let k = 0; k < 3; k++) for (let j = 0; j <= trail; j++) make(a.colors[k % a.colors.length])
    return (t) => {
      let i = 0
      for (let k = 0; k < 3; k++) {
        const twinkle = 1 + 0.15 * Math.sin(t * 6 + k * 2)
        for (let j = 0; j <= trail; j++) {
          const ang = (t * a.speed + k / 3) * Math.PI * 2 - j * 0.14
          const fade = 1 - j / (trail + 1)
          const s = 1.3 * (0.3 + 0.7 * fade) * (j === 0 ? twinkle : 1)
          const x = Math.cos(ang) * a.radius
          const z0 = Math.sin(ang) * a.radius
          const tl = deg(tilts[k])
          const it = items[i++]
          it.core.position.set(x, z0 * Math.sin(tl) - 12, z0 * Math.cos(tl))
          it.core.scale.setScalar(s)
          it.core.material.opacity = fade
          it.halo.position.copy(it.core.position)
          it.halo.scale.setScalar(s * (j === 0 ? 5 : 3))
          it.halo.material.opacity = (j === 0 ? 0.7 : 0.3) * fade
        }
      }
    }
  }
  const count = a.count || 16
  for (let i = 0; i < count; i++) make(a.colors[i % a.colors.length])
  return (t) => {
    for (let i = 0; i < count; i++) {
      const p = (t * a.speed + i / count) % 1
      const ang = p * Math.PI * 2.6 + i * 2.4
      const r = a.radius - p * 3.5
      const fade = Math.sin(p * Math.PI)
      const s = 1.0 * (1 - p * 0.45)
      const it = items[i]
      it.core.position.set(Math.cos(ang) * r, -24 + p * 31, Math.sin(ang) * r)
      it.core.scale.setScalar(s)
      it.core.material.opacity = fade
      it.halo.position.copy(it.core.position)
      it.halo.scale.setScalar(s * (i % 4 === 0 ? 6 + Math.sin(t * 8 + i) * 1.5 : 4))
      it.halo.material.opacity = 0.55 * fade
    }
  }
}

// Pone en el personaje de skinview3d los cosméticos indicados ({ pet, hat, back, aura }).
// skinview3d mira al jugador por delante en +z; en Minecraft delante es -z, por eso se invierte z.
export function attachCosmetics (viewer, slots) {
  const skin = viewer.playerObject.skin
  const env = envFor(viewer.renderer)
  const built = []
  const anchors = { hat: skin.head, back: skin.body, pet: skin, aura: skin }
  for (const slot of ['pet', 'hat', 'back', 'aura']) {
    const m = MODELS[slots[slot]]
    if (!m) continue
    const b = build(m, env)
    const wrap = new THREE.Group()
    wrap.scale.set(1, 1, -1)
    if (slot === 'back') wrap.position.y = 6 // el grupo del cuerpo está 6 píxeles por debajo del cuello
    wrap.add(b.root)
    anchors[slot].add(wrap)
    built.push({ ...b, wrap, parent: anchors[slot] })
  }
  let frame = 0
  const start = performance.now()
  const loop = () => {
    const t = (performance.now() - start) / 1000
    for (const b of built) b.update(t)
    frame = requestAnimationFrame(loop)
  }
  if (built.length) loop()
  return () => {
    cancelAnimationFrame(frame)
    for (const b of built) { b.parent.remove(b.wrap); b.dispose() }
  }
}
