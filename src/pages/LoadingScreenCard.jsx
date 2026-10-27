import React, { useEffect, useState } from 'react'
import { call } from '../api.js'
import { Icon } from '../components/Icon.jsx'
import ghostPreview from '../../resources/loading-screen/frame_0015.jpg'

// Pantalla de carga de ghost client (la que sale en lugar de la roja de Mojang al abrir el juego)
const MODES = [
  { id: 'ghost', label: 'ghost client', hint: 'Animación 3D del fantasma' },
  { id: 'custom', label: 'Personalizada', hint: 'Tu imagen, GIF o vídeo' },
  { id: 'classic', label: 'Clásica', hint: 'La de Minecraft' }
]
const MAX_W = 1280
const MAX_H = 720
const MAX_SECONDS = 15
const VIDEO_FPS = 24
const MAX_FRAMES = 360

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' }

function makeCanvas (w, h) {
  const scale = Math.min(1, MAX_W / w, MAX_H / h)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * scale))
  c.height = Math.max(1, Math.round(h * scale))
  return c
}
const snap = (c) => c.toDataURL('image/jpeg', 0.86)

// Convierte una imagen, GIF o vídeo en fotogramas JPG que ghost client reproduce en la pantalla de carga
async function convert (file, onProgress) {
  const ext = file.split('.').pop().toLowerCase()
  const type = TYPES[ext]
  if (!type) throw new Error('Formato no compatible')
  const bytes = await call('loading:readFile', file)
  const blob = new Blob([bytes], { type })
  await call('loading:begin')

  if (type.startsWith('video/')) {
    const url = URL.createObjectURL(blob)
    try {
      const video = document.createElement('video')
      video.muted = true
      video.preload = 'auto'
      video.src = url
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve
        video.onerror = () => reject(new Error('No se pudo abrir el vídeo (prueba con MP4 o WebM)'))
      })
      // Algunos WebM no guardan la duración: se averigua saltando al final
      if (!Number.isFinite(video.duration)) {
        video.currentTime = 1e9
        await new Promise(resolve => { video.onseeked = resolve })
        video.currentTime = 0
        await new Promise(resolve => { video.onseeked = resolve })
      }
      const seconds = Math.min(MAX_SECONDS, Number.isFinite(video.duration) ? video.duration : MAX_SECONDS)
      const total = Math.max(1, Math.floor(seconds * VIDEO_FPS))
      const c = makeCanvas(video.videoWidth, video.videoHeight)
      const g = c.getContext('2d')
      for (let i = 0; i < total; i++) {
        video.currentTime = i / VIDEO_FPS
        await new Promise(resolve => { video.onseeked = resolve })
        g.drawImage(video, 0, 0, c.width, c.height)
        await call('loading:frame', i, snap(c))
        onProgress((i + 1) / total)
      }
      return call('loading:finish', { fps: VIDEO_FPS, width: c.width, height: c.height, source: 'video' })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (type === 'image/gif' && 'ImageDecoder' in window) {
    const decoder = new window.ImageDecoder({ data: blob.stream(), type })
    await decoder.tracks.ready
    const count = Math.min(MAX_FRAMES, decoder.tracks.selectedTrack.frameCount)
    let c = null
    let micros = 0
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      c = c || makeCanvas(image.displayWidth, image.displayHeight)
      const g = c.getContext('2d')
      g.fillStyle = '#000'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(image, 0, 0, c.width, c.height)
      micros += image.duration || 100000
      image.close()
      await call('loading:frame', i, snap(c))
      onProgress((i + 1) / count)
    }
    decoder.close()
    const fps = Math.max(1, Math.min(60, count / (micros / 1e6)))
    return call('loading:finish', { fps, width: c.width, height: c.height, source: 'gif' })
  }

  // Imagen fija
  const bmp = await createImageBitmap(blob)
  const c = makeCanvas(bmp.width, bmp.height)
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height)
  await call('loading:frame', 0, snap(c))
  onProgress(1)
  return call('loading:finish', { fps: 1, width: c.width, height: c.height, source: 'image' })
}

// Para las pruebas automáticas
window.ghostConvertLoading = convert

export default function LoadingScreenCard ({ settings, updateSettings, notify }) {
  const mode = settings.loadingScreen || 'ghost'
  const [info, setInfo] = useState(null)
  const [progress, setProgress] = useState(null)

  useEffect(() => { call('loading:info').then(setInfo).catch(() => {}) }, [])

  const upload = async () => {
    const file = await call('loading:pickFile')
    if (!file) return
    setProgress(0)
    try {
      const i = await convert(file, setProgress)
      setInfo(i)
      updateSettings({ loadingScreen: 'custom' })
      notify(i.frames > 1 ? `Pantalla de carga lista (${i.frames} fotogramas)` : 'Pantalla de carga lista')
    } catch (e) {
      notify(e.message, 'error')
    } finally {
      setProgress(null)
    }
  }

  const remove = async () => {
    setInfo(await call('loading:clear'))
    if (mode === 'custom') updateSettings({ loadingScreen: 'ghost' })
  }

  const preview = mode === 'ghost' ? ghostPreview : mode === 'custom' ? info?.preview : null

  return (
    <section className="card">
      <h3 className="card-title"><Icon name="film" /> Pantalla de carga</h3>
      <p className="muted small-text" style={{ margin: 0 }}>
        La que sale al abrir el juego, en lugar de la roja de Mojang. Puedes poner una imagen, un GIF o un vídeo
        (los vídeos se recortan a {MAX_SECONDS} segundos).
      </p>
      <div className={`loading-preview ${mode}`}>
        {preview ? <img src={preview} alt="" /> : <span>{mode === 'classic' ? 'MOJANG' : 'Sin archivo todavía'}</span>}
        {progress !== null && (
          <div className="loading-progress">
            <span>Preparando… {Math.round(progress * 100)}%</span>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="tabs loading-modes">
        {MODES.map(m => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} title={m.hint}
            disabled={m.id === 'custom' && !info}
            onClick={() => updateSettings({ loadingScreen: m.id })}>{m.label}</button>
        ))}
      </div>
      <div className="row">
        <button className="btn small" onClick={upload} disabled={progress !== null}><Icon name="upload" size={15} /> Subir imagen, GIF o vídeo</button>
        {info && <button className="btn small ghost" onClick={remove} disabled={progress !== null}><Icon name="trash" size={15} /> Quitar la mía</button>}
      </div>
      <small className="muted">Dentro del juego también puedes cambiarla en ghost client → Ajustes generales.</small>
    </section>
  )
}
