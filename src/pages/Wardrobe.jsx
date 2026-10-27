import React, { useEffect, useRef, useState } from 'react'
import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d'
import { call } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import { Empty } from '../components/ui.jsx'

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

  const reload = async (select) => {
    const d = await call('wardrobe:list')
    setData(d)
    setSelected(s => select || (d.skins.some(x => x.id === s) ? s : (d.active || d.skins[0]?.id || null)))
    return d
  }

  useEffect(() => { reload().catch(e => notify(e.message, 'error')) }, [])

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
      notify(last.duplicate ? 'Esa skin ya estaba en el vestidor' : 'Skin añadida al vestidor')
    }
  }

  const pick = async () => addFiles(await call('wardrobe:pickFiles'))

  const fromPlayer = async (e) => {
    e.preventDefault()
    const s = await run('player', () => call('wardrobe:addFromPlayer', player))
    if (s) { setPlayer(''); await reload(s.id); notify(s.duplicate ? 'Esa skin ya estaba en el vestidor' : `Skin de ${s.name} añadida`) }
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
    const r = await run('apply', () => call('wardrobe:apply', skin.id), 'Skin puesta en tu cuenta. En un servidor se verá al volver a entrar.')
    if (r) reload()
  }
  const remove = async () => {
    if (!window.confirm(`¿Quitar «${skin.name}» del vestidor?`)) return
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
          <h1>Vestidor</h1>
          <p className="muted">Guarda tus skins y cambia entre ellas. Al ponerte una, se cambia en tu cuenta de Minecraft y se ve en todos los servidores.</p>
        </div>
        <div className="row">
          <form className="wardrobe-player" onSubmit={fromPlayer}>
            <input value={player} onChange={e => setPlayer(e.target.value)} placeholder="Copiar skin de un jugador" maxLength={16} spellCheck={false} />
            <button className="btn small" disabled={!player.trim() || busy === 'player'}><Icon name="download" size={15} /></button>
          </form>
          <button className="btn primary" onClick={pick} disabled={busy === 'add'}><Icon name="upload" size={17} /> Subir skin</button>
        </div>
      </div>

      {data.skins.length === 0
        ? (
          <Empty icon="shirt" title="Tu vestidor está vacío" text="Sube una skin (.png de 64x64), arrástrala aquí o copia la de cualquier jugador por su nombre.">
            {loggedIn && <button className="btn" onClick={async () => { const s = await run('add', () => call('wardrobe:addCurrent')); if (s) reload(s.id) }}>Guardar mi skin actual</button>}
          </Empty>
          )
        : (
          <div className="wardrobe-layout">
            <div className="wardrobe-stage">
              {skin && <SkinPreview key={skin.id} skin={skin.image} variant={skin.variant} cape={capeUrl} />}
              {skin && (
                <div className="wardrobe-controls">
                  <input className="wardrobe-name" defaultValue={skin.name} key={skin.id + skin.name}
                    onBlur={e => e.target.value.trim() !== skin.name && update({ name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()} aria-label="Nombre de la skin" />
                  <div className="tabs wardrobe-variant">
                    <button className={skin.variant === 'classic' ? 'active' : ''} onClick={() => update({ variant: 'classic' })}>Normal</button>
                    <button className={skin.variant === 'slim' ? 'active' : ''} onClick={() => update({ variant: 'slim' })}>Brazos finos</button>
                  </div>
                  {account && account.capes.length > 0 && (
                    <select value={skin.cape || ''} onChange={e => update({ cape: e.target.value })} aria-label="Capa">
                      <option value="">Capa: no cambiarla</option>
                      <option value="none">Sin capa</option>
                      {account.capes.map(c => <option key={c.id} value={c.id}>Capa: {c.alias}</option>)}
                    </select>
                  )}
                  <div className="row">
                    {data.active === skin.id
                      ? <button className="btn grow" disabled><Icon name="check" size={16} /> La llevas puesta</button>
                      : <button className="btn primary grow" onClick={apply} disabled={!loggedIn || busy === 'apply'}>
                        <Icon name="shirt" size={16} /> {busy === 'apply' ? 'Poniendo…' : 'Ponerme esta skin'}
                      </button>}
                    {data.active === skin.id && <button className="btn" onClick={apply} disabled={!loggedIn || busy === 'apply'} title="Volver a subirla (por ejemplo, si cambiaste la capa)"><Icon name="refresh" size={16} /></button>}
                    <button className="btn" onClick={remove} title="Quitar del vestidor"><Icon name="trash" size={16} /></button>
                  </div>
                  {!loggedIn && <small className="muted">Inicia sesión con tu cuenta de Microsoft para ponerte skins.</small>}
                </div>
              )}
            </div>

            <div className="wardrobe-grid">
              {data.skins.map(s => (
                <button key={s.id} className={`skin-card ${s.id === selected ? 'selected' : ''}`} onClick={() => setSelected(s.id)}>
                  {data.active === s.id && <span className="skin-on" title="La llevas puesta"><Icon name="check" size={12} /></span>}
                  <SkinThumb image={s.image} slim={s.variant === 'slim'} />
                  <span className="skin-name">{s.name}</span>
                </button>
              ))}
              <button className="skin-card add" onClick={pick}>
                <Icon name="plus" size={26} />
                <span className="skin-name">Añadir</span>
              </button>
            </div>
          </div>
          )}
      {dragging && <div className="wardrobe-drop"><Icon name="upload" size={34} /> Suelta tus skins aquí</div>}
    </div>
  )
}

// Vista 3D de la skin, andando y girando despacio (se puede girar con el ratón)
function SkinPreview ({ skin, variant, cape }) {
  const canvas = useRef(null)
  const viewer = useRef(null)

  useEffect(() => {
    const v = new SkinViewer({ canvas: canvas.current, width: 300, height: 380, zoom: 0.72, fov: 40 })
    v.autoRotate = true
    v.autoRotateSpeed = 0.6
    v.animation = new WalkingAnimation()
    v.animation.speed = 0.6
    v.controls.enableZoom = false
    v.background = null
    viewer.current = v
    return () => v.dispose()
  }, [])

  useEffect(() => {
    viewer.current?.loadSkin(skin, { model: variant === 'slim' ? 'slim' : 'default' })
  }, [skin, variant])

  useEffect(() => {
    if (cape) viewer.current?.loadCape(cape)
    else viewer.current?.resetCape()
  }, [cape])

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
