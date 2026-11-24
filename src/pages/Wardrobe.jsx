import React, { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'
import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d'
import { call } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { Empty } from '../components/ui.jsx'
import ghostLogo from '../assets/logo.png'
import { attachCosmetics } from './cosmetics3d.js'
import * as THREE from 'three'

// Capas de ghost client: cada una son 24 fotogramas (textura de capa de 512x256), uno cada 85 ms,
// y preview.png (la cara de fuera, 80x128)
const FRAME_FILES = import.meta.glob('../assets/cosmetics/*/*.png', { eager: true, query: '?url', import: 'default' })
const CAPE_FRAMES = {}
const CAPE_PREVIEW = {}
// card.png: la capa renderizada en 3D (una lámina fina con luz y sombra), para las tarjetas
const CAPE_CARD = {}
for (const [file, url] of Object.entries(FRAME_FILES)) {
  const [, id, name] = file.match(/cosmetics\/([^/]+)\/([^/]+)\.png$/)
  if (name === 'preview') CAPE_PREVIEW[id] = url
  else if (name === 'card') CAPE_CARD[id] = url
  else (CAPE_FRAMES[id] ||= [])[parseInt(name)] = url
}
// Todas gratis. slot = hueco (capa, mascota, sombrero, espalda, aura); color = brillo de la tarjeta
const COSMETICS = [
  ...[
    { id: 'ghost_cape', name: 'Ghost morada', sub: 'Animada', color: '#8b5cf6' },
    { id: 'ghost_cape_pink', name: 'Ghost rosa', sub: 'Animada', color: '#ff5fb4' },
    { id: 'ghost_cape_white', name: 'Ghost blanca', sub: 'Animada', color: '#dcdcf0' },
    { id: 'ghost_cape_orange', name: 'Ghost naranja', sub: 'Animada', color: '#ff8a1f' },
    { id: 'ghost_cape_red', name: 'Ghost roja', sub: 'Animada', color: '#ff3b4f' },
    { id: 'ghost_cape_green', name: 'Ghost verde', sub: 'Animada', color: '#2ee87a' },
    { id: 'ghost_cape_blue', name: 'Ghost azul', sub: 'Animada', color: '#3b8bff' },
    { id: 'cape_aurora', name: 'Aurora', sub: 'Minimalista', color: '#3dffb0', group: 'minimal' },
    { id: 'cape_moon', name: 'Luna', sub: 'Minimalista', color: '#efe8d4', group: 'minimal' },
    { id: 'cape_sakura', name: 'Sakura', sub: 'Minimalista', color: '#f7a8c0', group: 'minimal' },
    { id: 'cape_sunset', name: 'Atardecer', sub: 'Minimalista', color: '#ff5fb4', group: 'minimal' },
    { id: 'cape_waves', name: 'Oleaje', sub: 'Minimalista', color: '#3b6ea8', group: 'minimal' },
    { id: 'cape_eclipse', name: 'Eclipse', sub: 'Minimalista', color: '#ffb347', group: 'minimal' },
    { id: 'ghost_cape_halloween', name: 'Halloween', sub: 'De miedo', color: '#ff7a1a', group: 'season' },
    { id: 'ghost_cape_christmas', name: 'Navidad', sub: 'Navideña', color: '#e8212f', group: 'season' },
    // De medalla: se desbloquean al llegar a esas horas jugadas (las mismas que las medallas)
    { id: 'cape_medal_500', name: 'Medalla de oro', sub: 'De medalla', color: '#f5c23e', group: 'medal', unlock: 500 },
    { id: 'cape_medal_750', name: 'Medalla esmeralda', sub: 'De medalla', color: '#2ee87a', group: 'medal', unlock: 750 },
    { id: 'cape_medal_1000', name: 'Medalla amatista', sub: 'De medalla', color: '#a77bff', group: 'medal', unlock: 1000 },
    { id: 'cape_medal_2500', name: 'Medalla diamante', sub: 'De medalla', color: '#6fe3ff', group: 'medal', unlock: 2500 },
    { id: 'cape_medal_5000', name: 'Medalla leyenda', sub: 'De medalla', color: '#ff5a7a', group: 'medal', unlock: 5000 }
  ].map(c => ({ slot: 'cape', ...c })),
  { slot: 'pet', id: 'pet_boo', name: 'Boo', sub: 'Flota a tu lado', color: '#dcdcf0' },
  { slot: 'pet', id: 'pet_slime', name: 'Gelatina', sub: 'Bota a tu lado', color: '#7ee86f' },
  { slot: 'pet', id: 'pet_bat', name: 'Murciélago', sub: 'Revolotea a tu lado', color: '#7a4fa8' },
  { slot: 'pet', id: 'pet_dragon', name: 'Dragoncito', sub: 'Vuela a tu lado', color: '#7c5cff' },
  { slot: 'hat', id: 'hat_crown', name: 'Corona', sub: 'En la cabeza', color: '#f4c542' },
  { slot: 'hat', id: 'hat_witch', name: 'Gorro de bruja', sub: 'En la cabeza', color: '#8b5cf6' },
  { slot: 'hat', id: 'hat_halo', name: 'Aureola', sub: 'Sobre la cabeza', color: '#ffe680' },
  { slot: 'hat', id: 'hat_cat_ears', name: 'Orejas de gato', sub: 'En la cabeza', color: '#f29ac0' },
  { slot: 'back', id: 'back_wings', name: 'Alas', sub: 'Aletean', color: '#dcd6f2' },
  { slot: 'back', id: 'back_dragon_wings', name: 'Alas de dragón', sub: 'Aletean', color: '#9b6bff' },
  { slot: 'back', id: 'back_sword', name: 'Espada', sub: 'En la espalda', color: '#a9b4c4' },
  { slot: 'aura', id: 'aura_orbit', name: 'Órbita', sub: 'Te rodea', color: '#6ee7ff' },
  { slot: 'aura', id: 'aura_sparks', name: 'Chispas', sub: 'Te rodea', color: '#ffd36b' },
  { slot: 'aura', id: 'aura_frost', name: 'Escarcha', sub: 'Te rodea', color: '#bfefff' },
  { slot: 'aura', id: 'aura_flames', name: 'Llamas', sub: 'Te rodea', color: '#ff8a1f' }
]
const SLOTS = ['cape', 'pet', 'hat', 'back', 'aura']
const SLOT_TABS = [['cape', 'Capas', 'shirt'], ['pet', 'Mascotas', 'ghost'], ['hat', 'Sombreros', 'star'], ['back', 'Espalda', 'wand'], ['aura', 'Auras', 'sparkles']]
const emptySlots = () => Object.fromEntries(SLOTS.map(k => [k, null]))
const slotsFrom = (me) => Object.fromEntries(SLOTS.map(k => [k, me?.[k] || null]))
const noneFor = (slot) => slot === 'cape'
  ? { id: null, name: 'Sin capa', sub: 'La de siempre', color: '#6b6b80' }
  : { id: null, name: 'Nada', sub: 'Quitártelo', color: '#6b6b80' }

// Vestidor: guarda skins y cámbialas con un clic. "Ponerse" la sube a tu cuenta de Minecraft,
// así se ve en todos los servidores.
export default function Wardrobe ({ ctx }) {
  const { notify, accounts } = ctx
  const [data, setData] = useState({ skins: [], active: null })
  const [selected, setSelected] = useState(null)
  const [account, setAccount] = useState(null)
  const [capeImages, setCapeImages] = useState({})
  const [busy, setBusy] = useState(null)
  const [player, setPlayer] = useState('')
  const [dragging, setDragging] = useState(false)
  const loggedIn = !!accounts.active
  // Cosméticos de ghost client: lo que llevas en cada hueco y lo que hay debajo del ratón ({ slot, id })
  const [ghost, setGhost] = useState({ state: 'loading', slots: emptySlots() })
  const [hover, setHover] = useState(undefined)
  const [tab, setTab] = useState('skins')
  const [accountSkin, setAccountSkin] = useState(null)

  const reload = async (select) => {
    const d = await call('wardrobe:list')
    setData(d)
    setSelected(s => select || (d.skins.some(x => x.id === s) ? s : (d.active || d.skins[0]?.id || null)))
    return d
  }

  useEffect(() => { reload().catch(e => notify(e.message, 'error')) }, [])

  useEffect(() => {
    if (!loggedIn) { setGhost({ state: 'nologin', slots: emptySlots() }); return }
    let alive = true
    setGhost(g => ({ ...g, state: 'loading' }))
    call('cosmetics:me')
      .then(me => alive && setGhost({ state: 'ok', slots: slotsFrom(me), hours: me.hours || 0 }))
      .catch(e => alive && setGhost({ state: 'error', slots: emptySlots(), error: e.message }))
    return () => { alive = false }
  }, [accounts.active])

  const equipGhost = async (slot, id) => {
    if (ghost.state !== 'ok' || ghost.slots[slot] === id) return
    setGhost(g => ({ ...g, busy: slot + ':' + (id || 'none') }))
    try {
      await call('cosmetics:equip', slot, id)
      setGhost(g => ({ ...g, busy: null, slots: { ...g.slots, [slot]: id } }))
      notify(id ? t('Puesto. Lo verán los jugadores con ghost client.') : t('Quitado'))
    } catch (e) {
      setGhost(g => ({ ...g, busy: null }))
      notify(e.message, 'error')
    }
  }

  // Skin y capas de la cuenta (para elegir capa y guardar la skin actual)
  useEffect(() => {
    if (!loggedIn) { setAccount(null); return }
    let alive = true
    call('wardrobe:account').then(async acc => {
      if (!alive) return
      setAccount(acc)
      const imgs = {}
      for (const c of acc.capes) imgs[c.id] = await call('wardrobe:capeImage', c.url).catch(() => null)
      if (alive) setCapeImages(imgs)
      if (acc.skin) {
        const img = await call('wardrobe:capeImage', acc.skin.url).catch(() => null)
        if (alive && img) setAccountSkin({ image: img, variant: acc.skin.variant })
      }
      // La primera vez, el vestidor empieza con tu skin actual
      const d = await call('wardrobe:list')
      if (alive && d.skins.length === 0 && acc.skin) {
        const s = await call('wardrobe:addCurrent').catch(() => null)
        if (s) reload(s.id)
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [accounts.active])

  const run = async (key, fn, ok) => {
    setBusy(key)
    try {
      const r = await fn()
      if (ok) notify(typeof ok === 'function' ? ok(r) : ok)
      return r
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const addFiles = async (files) => {
    let last = null
    for (const f of files) {
      const s = await run('add', () => call('wardrobe:addFile', f))
      if (s) last = s
    }
    if (last) {
      await reload(last.id)
      notify(last.duplicate ? t('Esa skin ya estaba en el vestidor') : t('Skin añadida al vestidor'))
    }
  }

  const pick = async () => addFiles(await call('wardrobe:pickFiles'))

  const fromPlayer = async (e) => {
    e.preventDefault()
    const s = await run('player', () => call('wardrobe:addFromPlayer', player))
    if (s) { setPlayer(''); await reload(s.id); notify(s.duplicate ? t('Esa skin ya estaba en el vestidor') : t('Skin de {name} añadida', { name: s.name })) }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files].filter(f => /\.png$/i.test(f.name)).map(f => window.launcher.filePath(f))
    if (files.length) addFiles(files)
  }

  const skin = data.skins.find(s => s.id === selected)
  const update = async (changes) => {
    if (!skin) return
    await run('update', () => call('wardrobe:update', skin.id, changes))
    reload()
  }
  const apply = async () => {
    const r = await run('apply', () => call('wardrobe:apply', skin.id), t('Skin puesta en tu cuenta. En un servidor se verá al volver a entrar.'))
    if (r) reload()
  }
  const remove = async () => {
    if (!window.confirm(t('¿Quitar «{name}» del vestidor?', { name: skin.name }))) return
    const d = await run('remove', () => call('wardrobe:remove', skin.id))
    if (d) { setData(d); setSelected(d.skins[0]?.id || null) }
  }

  // Capa que se ve en la vista previa
  const capeId = skin?.cape === 'none' ? null : (skin?.cape || account?.capes.find(c => c.active)?.id || null)
  const capeUrl = capeId ? capeImages[capeId] : null

  return (
    <div className={`page wardrobe ${dragging ? 'dropping' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      <div className="page-head">
        <div>
          <h1>{t('Vestidor')}</h1>
          <p className="muted">{tab === 'skins'
            ? t('Guarda tus skins y cambia entre ellas. Al ponerte una, se cambia en tu cuenta de Minecraft y se ve en todos los servidores.')
            : t('Cosméticos de ghost client, todos gratis: capas, mascotas, sombreros, espalda y auras. Solo los ven los jugadores que también usan ghost client.')}</p>
          <div className="tabs wardrobe-tabs">
            <button className={tab === 'skins' ? 'active' : ''} onClick={() => setTab('skins')}><Icon name="shirt" size={15} /> {t('Skins')}</button>
            <button className={tab === 'cosmetics' ? 'active' : ''} onClick={() => setTab('cosmetics')}><Icon name="sparkles" size={15} /> {t('Cosméticos')}</button>
          </div>
        </div>
        {tab === 'skins' && <div className="row">
          <form className="wardrobe-player" onSubmit={fromPlayer}>
            <input value={player} onChange={e => setPlayer(e.target.value)} placeholder={t('Copiar skin de un jugador')} maxLength={16} spellCheck={false} />
            <button className="btn small" disabled={!player.trim() || busy === 'player'}><Icon name="download" size={15} /></button>
          </form>
          <button className="btn primary" onClick={pick} disabled={busy === 'add'}><Icon name="upload" size={17} /> {t('Subir skin')}</button>
        </div>}
      </div>

      {tab === 'cosmetics'
        ? <GhostCosmetics ghost={ghost} onEquip={equipGhost} hover={hover} onHover={setHover}
            skin={data.skins.find(x => x.id === data.active) || accountSkin || data.skins.find(x => x.id === selected)} />
        : data.skins.length === 0
        ? (
          <Empty icon="shirt" title={t('Tu vestidor está vacío')} text={t('Sube una skin (.png de 64x64), arrástrala aquí o copia la de cualquier jugador por su nombre.')}>
            {loggedIn && <button className="btn" onClick={async () => { const s = await run('add', () => call('wardrobe:addCurrent')); if (s) reload(s.id) }}>{t('Guardar mi skin actual')}</button>}
          </Empty>
          )
        : (
          <div className="wardrobe-layout">
            <div className="wardrobe-stage">
              {skin && <SkinPreview key={skin.id} skin={skin.image} variant={skin.variant} cape={capeUrl}
                ghost={ghost.slots} />}
              {skin && (
                <div className="wardrobe-controls">
                  <input className="wardrobe-name" defaultValue={skin.name} key={skin.id + skin.name}
                    onBlur={e => e.target.value.trim() !== skin.name && update({ name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()} aria-label={t('Nombre de la skin')} />
                  <div className="tabs wardrobe-variant">
                    <button className={skin.variant === 'classic' ? 'active' : ''} onClick={() => update({ variant: 'classic' })}>{t('Normal')}</button>
                    <button className={skin.variant === 'slim' ? 'active' : ''} onClick={() => update({ variant: 'slim' })}>{t('Brazos finos')}</button>
                  </div>
                  {account && account.capes.length > 0 && (
                    <select value={skin.cape || ''} onChange={e => update({ cape: e.target.value })} aria-label={t('Capa')}>
                      <option value="">{t('Capa: no cambiarla')}</option>
                      <option value="none">{t('Sin capa')}</option>
                      {account.capes.map(c => <option key={c.id} value={c.id}>{t('Capa: {name}', { name: c.alias })}</option>)}
                    </select>
                  )}
                  <div className="row">
                    {data.active === skin.id
                      ? <button className="btn grow" disabled><Icon name="check" size={16} /> {t('La llevas puesta')}</button>
                      : <button className="btn primary grow" onClick={apply} disabled={!loggedIn || busy === 'apply'}>
                        <Icon name="shirt" size={16} /> {busy === 'apply' ? t('Poniendo…') : t('Ponerme esta skin')}
                      </button>}
                    {data.active === skin.id && <button className="btn" onClick={apply} disabled={!loggedIn || busy === 'apply'} title={t('Volver a subirla (por ejemplo, si cambiaste la capa)')}><Icon name="refresh" size={16} /></button>}
                    <button className="btn" onClick={remove} title={t('Quitar del vestidor')}><Icon name="trash" size={16} /></button>
                  </div>
                  {!loggedIn && <small className="muted">{t('Inicia sesión con tu cuenta de Microsoft para ponerte skins.')}</small>}
                </div>
              )}
            </div>

            <div className="wardrobe-side">
            {SLOTS.some(k => ghost.slots[k]) && <button className="ghost-wearing" onClick={() => setTab('cosmetics')}>
              <img src={CAPE_PREVIEW[ghost.slots.cape || SLOTS.map(k => ghost.slots[k]).find(Boolean)]} className={ghost.slots.cape ? '' : 'square'} alt="" />
              <span><small className="muted">{t('Cosméticos de ghost client')}</small><strong>{SLOTS.map(k => ghost.slots[k]).filter(Boolean).map(id => t(COSMETICS.find(c => c.id === id)?.name || id)).join(' · ')}</strong></span>
              <Icon name="chevron-right" size={16} />
            </button>}
            <div className="wardrobe-grid">
              {data.skins.map(s => (
                <button key={s.id} className={`skin-card ${s.id === selected ? 'selected' : ''}`} onClick={() => setSelected(s.id)}>
                  {data.active === s.id && <span className="skin-on" title={t('La llevas puesta')}><Icon name="check" size={12} /></span>}
                  <SkinThumb image={s.image} slim={s.variant === 'slim'} />
                  <span className="skin-name">{s.name}</span>
                </button>
              ))}
              <button className="skin-card add" onClick={pick}>
                <Icon name="plus" size={26} />
                <span className="skin-name">{t('Añadir')}</span>
              </button>
            </div>
            </div>
          </div>
          )}
      {dragging && <div className="wardrobe-drop"><Icon name="upload" size={34} /> {t('Suelta tus skins aquí')}</div>}
    </div>
  )
}

// Vista 3D de la skin, andando y girando despacio (se puede girar con el ratón)
function SkinPreview ({ skin, variant, cape, ghost }) {
  const canvas = useRef(null)
  const viewer = useRef(null)
  const ghostCape = ghost?.cape
  const extrasKey = ghost ? ['pet', 'hat', 'back', 'aura'].map(k => ghost[k] || '').join('|') : ''

  useEffect(() => {
    const v = new SkinViewer({ canvas: canvas.current, width: 300, height: 380, zoom: 0.6, fov: 40 })
    v.autoRotate = true
    v.autoRotateSpeed = 0.6
    v.animation = new WalkingAnimation()
    v.animation.speed = 0.6
    v.controls.enableZoom = false
    v.background = null
    // Luz de lado (de arriba a la izquierda) para que los cosméticos tengan volumen: una cara iluminada y otra en sombra
    v.globalLight.intensity = 2.2
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(-18, 30, 22)
    v.scene.add(sun)
    viewer.current = v
    return () => v.dispose()
  }, [])

  useEffect(() => {
    viewer.current?.loadSkin(skin, { model: variant === 'slim' ? 'slim' : 'default' })
  }, [skin, variant])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    const frameUrls = ghostCape && CAPE_FRAMES[ghostCape]
    if (!frameUrls) {
      if (cape) v.loadCape(cape)
      else v.resetCape()
      return
    }
    // Capa de ghost client: se cargan los fotogramas y se van pintando en la textura de la capa
    let alive = true
    let timer = null
    Promise.all(frameUrls.filter(Boolean).map(src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src })))
      .then(images => {
        const frames = images.filter(Boolean)
        if (!alive || !frames.length) return
        v.loadCape(frames[0])
        let i = 0
        timer = setInterval(() => {
          i = (i + 1) % frames.length
          const ctx = v.capeCanvas.getContext('2d')
          ctx.clearRect(0, 0, v.capeCanvas.width, v.capeCanvas.height)
          ctx.drawImage(frames[i], 0, 0, v.capeCanvas.width, v.capeCanvas.height)
          if (v.capeTexture) v.capeTexture.needsUpdate = true
        }, 85)
      })
    return () => { alive = false; clearInterval(timer) }
  }, [cape, ghostCape])

  // Mascota, sombrero, espalda y aura
  useEffect(() => {
    const v = viewer.current
    if (!v || !ghost) return
    return attachCosmetics(v, ghost)
  }, [extrasKey])

  return <canvas ref={canvas} className="skin-3d" />
}

// Miniatura plana (de frente) dibujada a partir de la textura de la skin
function SkinThumb ({ image, slim }) {
  const canvas = useRef(null)
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const c = canvas.current
      if (!c) return
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, c.width, c.height)
      const legacy = img.height === 32
      const s = 4
      const aw = slim ? 3 : 4
      const part = (sx, sy, w, h, dx, dy) => g.drawImage(img, sx, sy, w, h, dx * s, dy * s, w * s, h * s)
      const mirror = (sx, sy, w, h, dx, dy) => {
        g.save(); g.translate((dx + w) * s, dy * s); g.scale(-1, 1)
        g.drawImage(img, sx, sy, w, h, 0, 0, w * s, h * s); g.restore()
      }
      // capa base
      part(8, 8, 8, 8, 4, 0) // cabeza
      part(20, 20, 8, 12, 4, 8) // cuerpo
      part(44, 20, aw, 12, 4 - aw, 8) // brazo derecho
      legacy ? mirror(44, 20, aw, 12, 12, 8) : part(36, 52, aw, 12, 12, 8) // brazo izquierdo
      part(4, 20, 4, 12, 4, 20) // pierna derecha
      legacy ? mirror(4, 20, 4, 12, 8, 20) : part(20, 52, 4, 12, 8, 20) // pierna izquierda
      // segunda capa (sombrero, chaqueta...)
      part(40, 8, 8, 8, 4, 0)
      if (!legacy) {
        part(20, 36, 8, 12, 4, 8)
        part(44, 36, aw, 12, 4 - aw, 8)
        part(52, 52, aw, 12, 12, 8)
        part(4, 36, 4, 12, 4, 20)
        part(4, 52, 4, 12, 8, 20)
      }
    }
    img.src = image
  }, [image, slim])
  return <canvas ref={canvas} width={64} height={128} className="skin-thumb" />
}

// Pestaña de cosméticos: tu personaje en 3D a la izquierda; a la derecha, por tipos (capas, mascotas, sombreros, espalda, auras)
function GhostCosmetics ({ ghost, onEquip, hover, onHover, skin }) {
  const disabled = ghost.state !== 'ok'
  // Horas que sabe el servidor (las manda el launcher): desbloquean las capas de medalla
  const hours = ghost.hours || 0
  const lockedOf = (c) => !!c.unlock && hours < c.unlock
  const [slot, setSlot] = useState('cape')
  // Sin conexión o sin sesión: pulsar algo solo lo enseña en la vista previa
  const [preview, setPreview] = useState({})
  const none = noneFor(slot)
  const shownSlots = { ...ghost.slots, ...preview, ...(hover ? { [hover.slot]: hover.id } : {}) }
  const shown = shownSlots[slot]
  const shownInfo = shown ? COSMETICS.find(c => c.id === shown) : none
  const items = COSMETICS.filter(c => c.slot === slot)
  const card = (c) => {
    const on = !disabled && ghost.slots[slot] === c.id
    const busy = ghost.busy === slot + ':' + (c.id || 'none')
    const looking = hover?.id === c.id && hover?.slot === slot
    const locked = lockedOf(c)
    const previewOnly = disabled || locked
    return (
      <button key={c.id || 'none'} style={{ '--cape': c.color }}
        className={`cape-card ${on ? 'on' : ''} ${previewOnly ? 'preview-only' : ''} ${locked ? 'locked' : ''} ${previewOnly && preview[slot] === c.id ? 'previewing' : ''}`} disabled={!!ghost.busy}
        title={locked ? t('Se desbloquea al llegar a {h} horas jugadas (llevas {now} h). Pulsa para verla puesta.', { h: c.unlock, now: hours }) : disabled ? t('Pulsa para verlo puesto') : undefined}
        onClick={() => previewOnly
          ? setPreview(p => { const n = { ...p }; if (n[slot] === c.id) delete n[slot]; else n[slot] = c.id; return n })
          : onEquip(slot, c.id)}
        onMouseEnter={() => onHover({ slot, id: c.id })}>
        <span className="cape-art">
          {!c.id ? <Icon name="x" size={26} />
            : slot === 'cape' ? <img className={`cape-card-img ${looking ? 'tilt' : ''}`} src={CAPE_CARD[c.id]} alt="" />
              : <img className={`cosmetic-icon ${looking ? 'bob' : ''}`} src={CAPE_PREVIEW[c.id]} alt="" />}
        </span>
        <strong>{t(c.name)}</strong>
        <small>{busy ? t('Poniendo…') : on ? t('Puesto') : locked ? t('Con {h} h', { h: c.unlock }) : t(c.sub)}</small>
        {on && <span className="cosmetic-check"><Icon name="check" size={12} /></span>}
        {locked && <span className="cosmetic-lock"><Icon name="lock" size={12} /></span>}
      </button>
    )
  }
  return (
    <div className="wardrobe-layout">
      <div className="wardrobe-stage cosmetics-stage" style={{ '--cape': shownInfo?.color }}>
        {skin
          ? <SkinPreview skin={skin.image} variant={skin.variant} ghost={shownSlots} />
          : <div className="cosmetics-noskin">{!shown ? <Icon name="x" size={40} /> : slot === 'cape' ? <CapeFace id={shown} animated big /> : <img className="cosmetic-icon big" src={CAPE_PREVIEW[shown]} alt="" />}</div>}
        <div className="cosmetics-stage-info">
          <strong>{t(shownInfo?.name || '')}</strong>
          <small className="muted">
            {ghost.state === 'nologin' ? t('Inicia sesión para ponerte cosméticos.')
              : ghost.state === 'error' ? (ghost.error || t('No se puede conectar con el servidor de ghost client.'))
                : shown === ghost.slots[slot] ? (shown ? t('Lo llevas puesto') : t('No llevas nada aquí'))
                  : t('Pulsa para ponértelo')}
          </small>
        </div>
      </div>
      <section className="ghost-cosmetics" onMouseLeave={() => onHover(undefined)}>
        <div className="ghost-cosmetics-head">
          <img src={ghostLogo} alt="" />
          <div>
            <strong>{t('Cosméticos')} <span className="pill">{t('Gratis')}</span></strong>
            <small className="muted">{t('{n} cosméticos gratis; los de medalla se ganan jugando', { n: COSMETICS.length })}</small>
          </div>
        </div>
        <div className="tabs cosmetic-slots">
          {SLOT_TABS.map(([k, label, icon]) => (
            <button key={k} className={slot === k ? 'active' : ''} onClick={() => setSlot(k)}>
              <Icon name={icon} size={14} /> {t(label)}{ghost.slots[k] && <span className="slot-dot" />}
            </button>
          ))}
        </div>
        {slot === 'cape'
          ? (
            <>
              <div className="cape-grid">{[none, ...items.filter(c => !c.group)].map(card)}</div>
              <div className="cosmetics-section">{t('Minimalistas')}</div>
              <div className="cape-grid">{items.filter(c => c.group === 'minimal').map(card)}</div>
              <div className="cosmetics-section">{t('De temporada')}</div>
              <div className="cape-grid">{items.filter(c => c.group === 'season').map(card)}</div>
              <div className="cosmetics-section">{t('De medalla')} <span className="muted section-note">{t('Se desbloquean con tus horas jugadas · llevas {h} h', { h: hours })}</span></div>
              <div className="cape-grid">{items.filter(c => c.group === 'medal').map(card)}</div>
            </>
            )
          : <div className="cape-grid">{[none, ...items].map(card)}</div>}
      </section>
    </div>
  )
}

// La cara de fuera de una capa; animada mientras se mira o está puesta
function CapeFace ({ id, animated, big }) {
  const frames = CAPE_FRAMES[id] || []
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!animated || !frames.length) return
    const timer = setInterval(() => setFrame(f => (f + 1) % frames.length), 85)
    return () => clearInterval(timer)
  }, [animated, id])
  // En la textura de 512x256, la cara de fuera está en (8, 8) y mide 80x128
  if (!animated || !frames[frame]) return <img className={`cape-face-img ${big ? 'big' : ''}`} src={CAPE_PREVIEW[id]} alt="" />
  return <span className={`cape-face ${big ? 'big' : ''}`} style={{ backgroundImage: `url(${frames[frame]})` }} />
}
