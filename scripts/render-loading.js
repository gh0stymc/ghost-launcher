// Renderiza la animación por defecto de la pantalla de carga de ghost client (scripts/loading-scene.html)
// a fotogramas JPG en resources/loading-screen/. Uso: npx electron scripts/render-loading.js [fps] [ancho] [alto]
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const [fps = 30, w = 960, h = 540] = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number)
const out = path.join(__dirname, '..', 'resources', 'loading-screen')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: w, height: h, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } })
  await win.loadFile(path.join(__dirname, 'loading-scene.html'), { query: { w: String(w), h: String(h) } })
  for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!window.ready')); i++) await new Promise(r => setTimeout(r, 100))
  const loop = await win.webContents.executeJavaScript('window.LOOP')
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const frames = Math.round(loop * fps)
  for (let i = 0; i < frames; i++) {
    const url = await win.webContents.executeJavaScript(`window.renderFrame(${i / fps}) && document.querySelector('canvas').toDataURL('image/jpeg', 0.9)`)
    fs.writeFileSync(path.join(out, `frame_${String(i).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'))
  }
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify({ fps, frames, width: w, height: h, loop: true }, null, 2))
  console.log(`${frames} fotogramas en ${out}`)
  app.quit()
})
