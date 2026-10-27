const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const os = require('os')
const store = require('./store')
const paths = require('./paths')
const auth = require('./auth')
const versions = require('./versions')
const profiles = require('./profiles')
const modrinth = require('./modrinth')
const launcher = require('./launch')
const java = require('./java')
const modpacks = require('./modpacks')
const builtins = require('./builtins')
const resolver = require('./resolver')

let win = null
// "npm run dev" activa la recarga en vivo; si no, se carga la interfaz compilada
const isDev = process.env.ML_DEV === '1'

function createWindow () {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b0b12',
    title: 'Ghost Launcher',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  // Para depurar: los errores de la interfaz salen por la consola del proceso principal
  if (process.env.ML_SCREENSHOT || process.env.ML_DEV) win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') console.log('[interfaz]', e.message) })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // Los enlaces externos se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

const send = (event, data) => win && !win.isDestroyed() && win.webContents.send(event, data)

// Registra un canal y convierte los errores en mensajes legibles para la interfaz
function handle (channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (e) {
      console.error(`[${channel}]`, e)
      return { ok: false, error: e.message || String(e) }
    }
  })
}

// Ventana
handle('window:minimize', () => win.minimize())
handle('window:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
handle('window:close', () => win.close())

// Sistema
handle('system:info', () => ({
  totalRam: Math.floor(os.totalmem() / 1024 / 1024),
  platform: process.platform,
  version: app.getVersion(),
  dataDir: paths.base(),
  javas: java.installedJavas()
}))
handle('system:openFolder', (sub) => {
  const target = sub ? path.join(paths.base(), sub) : paths.base()
  require('fs').mkdirSync(target, { recursive: true })
  return shell.openPath(target)
})
handle('system:openUrl', (url) => /^https:\/\//.test(url) && shell.openExternal(url))
// Muestra el icono del fantasma (512 px) para subirlo a la aplicación de Discord
handle('system:showDiscordIcon', () => {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, 'ghost-discord-icon.png')
    : path.join(__dirname, '..', 'resources', 'ghost-discord-icon.png')
  shell.showItemInFolder(icon)
})

// Ajustes
handle('settings:get', () => store.get().settings)
handle('medals:milestones', () => require('./medals').MILESTONES)

// Vestidor (skins)
const wardrobe = require('./wardrobe')
handle('wardrobe:list', () => wardrobe.list())
handle('wardrobe:pickFiles', async () => {
  const { dialog } = require('electron')
  const res = await dialog.showOpenDialog(win, {
    title: 'Elegir skins',
    filters: [{ name: 'Skin de Minecraft', extensions: ['png'] }],
    properties: ['openFile', 'multiSelections']
  })
  return res.canceled ? [] : res.filePaths
})
handle('wardrobe:addFile', (file, name) => wardrobe.addFile(file, name))
handle('wardrobe:addFromPlayer', (name) => wardrobe.addFromPlayer(name))
handle('wardrobe:addCurrent', () => wardrobe.addCurrent())
handle('wardrobe:account', () => wardrobe.account())
handle('wardrobe:capeImage', (url) => wardrobe.capeImage(url))
handle('wardrobe:update', (id, changes) => wardrobe.update(id, changes))
handle('wardrobe:remove', (id) => wardrobe.remove(id))
handle('wardrobe:apply', (id) => wardrobe.apply(id))

// Pantalla de carga personalizada
const loadingscreen = require('./loadingscreen')
handle('loading:info', () => loadingscreen.info())
handle('loading:pickFile', async () => {
  const { dialog } = require('electron')
  const res = await dialog.showOpenDialog(win, {
    title: 'Elegir imagen, GIF o vídeo',
    filters: [{ name: 'Imagen, GIF o vídeo', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv'] }],
    properties: ['openFile']
  })
  return res.canceled ? null : res.filePaths[0]
})
handle('loading:readFile', (file) => {
  const fs = require('fs')
  if (fs.statSync(file).size > 300 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máximo 300 MB)')
  return fs.readFileSync(file)
})
handle('loading:begin', () => loadingscreen.begin())
handle('loading:frame', (i, data) => loadingscreen.frame(i, data))
handle('loading:finish', (meta) => loadingscreen.finish(meta))
handle('loading:clear', () => loadingscreen.clear())
handle('settings:set', (changes) => store.update(s => Object.assign(s.settings, changes)).settings)

// Cuentas
handle('auth:list', () => auth.accounts())
handle('auth:login', async () => { await auth.login(); return auth.accounts() })
handle('auth:select', (uuid) => auth.select(uuid))
handle('auth:logout', (uuid) => auth.logout(uuid))

// Versiones
handle('versions:list', () => versions.listVersions())
handle('versions:fabric', () => versions.fabricGameVersions())

// Perfiles
handle('profiles:list', () => profiles.list())
handle('profiles:create', (data) => profiles.create(data))
handle('profiles:update', (id, changes) => profiles.update(id, changes))
handle('profiles:remove', (id, deleteFiles) => profiles.remove(id, deleteFiles))
handle('profiles:openFolder', (id, sub) => {
  const target = sub ? path.join(paths.instance(id), sub) : paths.instance(id)
  require('fs').mkdirSync(target, { recursive: true })
  return shell.openPath(target)
})

// Contenido (Modrinth y archivos propios)
handle('content:search', (params) => modrinth.search(params))
handle('content:install', async (profileId, projectId, type) => {
  const profile = profiles.list().find(p => p.id === profileId)
  try {
    const installed = await modrinth.install(profile, projectId, type, p => send('content:progress', p))
    if (type === 'mod') await resolver.resolve(profile, p => send('content:progress', p)).catch(() => {})
    return installed
  } finally {
    send('content:progress', null)
  }
})

// Mods integrados
handle('builtins:catalog', () => builtins.catalog())
handle('builtins:apply', async (profileId, slugs) => {
  const profile = profiles.list().find(p => p.id === profileId)
  try {
    return await builtins.apply(profile, slugs || builtins.defaultSelection(), p => send('builtins:progress', p))
  } finally {
    send('builtins:progress', null)
  }
})
handle('builtins:check', async (profileId) => {
  const profile = profiles.list().find(p => p.id === profileId)
  return resolver.resolve(profile)
})

// Los modpacks importados también reciben los mods integrados elegidos en Ajustes (y Capes).
// Si el modpack ya trae alguno, se quita su copia y se queda el nuestro. AxolotlClient se cambia por ghost client.
async function withBuiltins (result) {
  if (result.profile.loader !== 'fabric') return result
  const slugs = builtins.defaultSelection()
  if (!slugs.length) return result
  if (slugs.includes('ghost-client')) {
    for (const item of modrinth.list(result.profile.id)) {
      if (item.projectId === 'p2rxzX0q' || /axolotlclient/i.test(item.file)) modrinth.remove(result.profile.id, item.type, item.file)
    }
  }
  const profile = profiles.list().find(p => p.id === result.profile.id)
  result.builtins = await builtins.apply(profile, slugs, importProgress, { replace: true }).catch(() => null)
  return result
}
handle('content:list', (profileId) => modrinth.list(profileId))
handle('content:toggle', (profileId, type, file, enabled) => modrinth.toggle(profileId, type, file, enabled))
handle('content:remove', (profileId, type, file) => modrinth.remove(profileId, type, file))
handle('content:addFiles', async (profileId, files) => {
  modrinth.addFiles(profileId, files)
  await modrinth.identify(profileId).catch(() => {})
})

// Fotos de perfil: la interfaz manda un PNG ya recortado como data URL
handle('profiles:setIcon', (id, dataUrl) => {
  if (!dataUrl) return profiles.setIcon(id, null)
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('Imagen no válida')
  return profiles.setIcon(id, Buffer.from(m[1], 'base64'))
})

// Modpacks
const importProgress = (p) => send('import:progress', p)
handle('modpacks:pickFile', async () => {
  const { dialog } = require('electron')
  const res = await dialog.showOpenDialog(win, {
    title: 'Elegir modpack de Modrinth',
    filters: [{ name: 'Modpack de Modrinth', extensions: ['mrpack', 'zip'] }],
    properties: ['openFile']
  })
  return res.canceled ? null : res.filePaths[0]
})
handle('modpacks:importFile', async (file) => {
  const profile = await modpacks.importMrpack(file, {}, importProgress)
  return withBuiltins({ profile, icon: null })
})
handle('modpacks:installModrinth', async (projectId) => withBuiltins(await modpacks.installModrinthPack(projectId, importProgress)))
handle('modpacks:listLunar', () => modpacks.listLunar())
handle('modpacks:importLunar', async (folder, options) => withBuiltins(await modpacks.importLunar(folder, options, importProgress)))

// Modrinth App: instancias con sus horas jugadas
// Actualizar un perfil a otra versión de Minecraft (copia con los mods actualizados)
handle('profiles:upgrade', async (sourceId, options) => {
  try {
    return await require('./upgrade').upgrade(sourceId, options, p => send('upgrade:progress', p))
  } finally {
    send('upgrade:progress', null)
  }
})

handle('modrinthApp:list', () => require('./modrinthapp').list())
handle('modrinthApp:import', async (id, options) => {
  const result = await withBuiltins(await require('./modrinthapp').importInstance(id, options, importProgress))
  result.medals = require('./medals').sync(result.profile.id)
  return result
})
handle('modrinthApp:addHours', (profileId, id) => {
  const seconds = require('./modrinthapp').addHours(profileId, id)
  return { seconds, medals: require('./medals').sync(profileId) }
})

// Juego
handle('game:launch', async (profileId) => {
  await launcher.launch(profileId, (event, data) => {
    send(`game:${event}`, data)
    if (event === 'started' && store.get().settings.closeOnLaunch) win.hide()
    if (event === 'closed' && !win.isVisible()) win.show()
  })
})
handle('game:stop', (profileId) => launcher.stop(profileId))

// Actualizaciones del launcher
const updater = require('./updater')
handle('update:status', () => updater.get())
handle('update:check', () => updater.check())
handle('update:install', () => {
  if (launcher.runningIds().length) throw new Error('Cierra el juego antes de actualizar')
  updater.install()
})
handle('game:running', () => launcher.runningIds())

// Solo para desarrollo: ML_DATA cambia la carpeta de datos y ML_SCREENSHOT guarda una captura y cierra
// Misma carpeta de datos tanto instalado como con "npm start"
app.setPath('userData', process.env.ML_DATA || path.join(app.getPath('appData'), 'ghost-launcher'))

app.whenReady().then(() => {
  // Importaciones que quedaron a medias (el launcher se cerró mientras copiaba): se borran
  try {
    for (const p of profiles.list().filter(x => x.importing)) {
      console.log('[import] Borrando importación incompleta:', p.name)
      profiles.remove(p.id, true)
    }
  } catch (e) { console.error('[import]', e) }
  // Medallas pendientes (por ejemplo, si se importaron horas jugadas)
  try { require('./medals').sync() } catch (e) { console.error('[medals]', e) }
  createWindow()
  updater.init(send)
  if (process.env.ML_SCREENSHOT) {
    win.webContents.once('did-finish-load', async () => {
      const pages = (process.env.ML_PAGES || 'home').split(',')
      await new Promise(r => setTimeout(r, 2500)) // a que la interfaz cargue sus datos
      if (process.env.ML_EVAL) console.log('[eval]', await win.webContents.executeJavaScript(process.env.ML_EVAL).catch(e => 'ERROR ' + e.message))
      // Formato: "Página" o "Página>Texto de un botón a pulsar"
      for (const p of pages) {
        const [nav, ...buttons] = p.split('>')
        await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); [...document.querySelectorAll('.nav-item')].find(b => b.textContent.trim() === ${JSON.stringify(nav)})?.click()`).catch(() => {})
        await new Promise(r => setTimeout(r, 1200))
        for (const button of buttons) {
          // "=Texto" busca el texto exacto
          const exact = button.startsWith('=')
          const text = JSON.stringify(exact ? button.slice(1) : button)
          const byTitle = button.startsWith('@')
          const t2 = JSON.stringify(button.slice(1))
          await win.webContents.executeJavaScript(byTitle ? `[...document.querySelectorAll('button')].find(b => b.title === ${t2})?.click()` : `[...document.querySelectorAll('button')].find(b => ${exact} ? b.textContent.trim() === ${text} : b.textContent.trim().includes(${text}))?.click()`).catch(() => {})
          await new Promise(r => setTimeout(r, 2000))
        }
        await new Promise(r => setTimeout(r, Number(process.env.ML_WAIT || 2500)))
        if (process.env.ML_SCROLL) await win.webContents.executeJavaScript('document.querySelector(".main").scrollTop = 1e6').catch(() => {})
        if (process.env.ML_SCROLL) await new Promise(r => setTimeout(r, 600))
        const img = await win.webContents.capturePage()
        require('fs').writeFileSync(`${process.env.ML_SCREENSHOT}-${p.replace(/[^\w]+/g, '_')}.png`, img.toPNG())
      }
      app.quit()
    })
  }
})
app.on('window-all-closed', () => app.quit())
