// Prueba de extremo a extremo del núcleo (sin interfaz).
// Uso: npx electron scripts/selftest.js <carpeta-temporal> [version]
const { app } = require('electron')
const path = require('path')

const dir = process.argv[2] || path.join(require('os').tmpdir(), 'mi-launcher-test')
app.setPath('userData', dir)

app.whenReady().then(async () => {
  const versions = require('../electron/versions')
  const java = require('../electron/java')
  const profiles = require('../electron/profiles')
  const modrinth = require('../electron/modrinth')
  const paths = require('../electron/paths')
  const { Client, Authenticator } = require('minecraft-launcher-core')
  const log = (...a) => console.log('[test]', ...a)

  try {
    const list = await versions.listVersions()
    const id = process.argv[3] || list.latest.release
    log('última release:', list.latest.release, '| probando:', id)

    const major = await versions.requiredJava(id)
    log('Java requerido:', major)
    let last = 0
    const javaPath = await java.ensureJava(major, p => {
      if (Date.now() - last > 3000) { last = Date.now(); log(p.stage, p.total ? Math.round(p.current / p.total * 100) + '%' : '') }
    })
    log('Java en:', javaPath)

    const vanilla = process.argv[4] === 'vanilla'
    const fabric = vanilla ? null : await versions.ensureFabric(id)
    log('Fabric:', fabric ? fabric.id : '(vanilla)')

    const profile = profiles.create({ name: 'Prueba', version: id, loader: vanilla ? 'vanilla' : 'fabric' })
    if (!vanilla) {
    const res = await modrinth.search({ query: 'sodium', type: 'mod', gameVersion: id, loader: 'fabric' })
    log('Búsqueda sodium:', res.total_hits, 'resultados; primero:', res.hits[0]?.title)
    log('Instalado:', await modrinth.install(profile, 'AANobbMI', 'mod')) // Sodium
    log('Instalado:', await modrinth.install(profile, 'P7dR8mSH', 'mod')) // Fabric API
    log('Contenido:', modrinth.list(profile.id).map(i => `${i.title} ${i.versionNumber}`).join(', '))
    }

    // Solo para comprobar que el juego arranca; el launcher real usa la cuenta Microsoft
    const client = new Client()
    let started = false
    client.on('progress', e => { if (Date.now() - last > 3000) { last = Date.now(); log('descarga', e.type, `${e.task}/${e.total}`) } })
    client.on('data', line => {
      process.stdout.write('  | ' + line)
      if (!started && /LWJGL Version|Sound engine started|Created: \d+x\d+|Loaded \d+ recipes|OpenGL/i.test(line)) {
        started = true
        log('✅ EL JUEGO HA ARRANCADO — cerrando prueba')
        setTimeout(() => { proc.kill(); app.exit(0) }, 3000)
      }
    })
    const proc = await client.launch({
      authorization: Authenticator.getAuth('Prueba'),
      root: paths.root(),
      version: fabric ? { number: id, type: 'release', custom: fabric.id } : { number: id, type: 'release' },
      javaPath,
      memory: { max: '3G', min: '1G' },
      overrides: { gameDirectory: paths.instance(profile.id), cwd: paths.instance(profile.id), maxSockets: 16 }
    })
    if (!proc) throw new Error('launch devolvió null')
    log('Proceso del juego iniciado, PID', proc.pid)
    proc.on('close', code => { log('el juego se cerró con código', code); app.exit(started ? 0 : 1) })
    setTimeout(() => { log('❌ tiempo agotado'); proc.kill(); app.exit(1) }, 240000)
  } catch (e) {
    console.error('[test] ERROR', e)
    app.exit(1)
  }
})
