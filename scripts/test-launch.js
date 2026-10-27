// Comprueba que un perfil existente arranca (sin cuenta, solo para pruebas locales).
// Uso: npx electron scripts/test-launch.js <carpeta-de-datos> <nombre-del-perfil>
const { app } = require('electron')
app.setPath('userData', process.argv[2])

app.whenReady().then(async () => {
  const profiles = require('../electron/profiles')
  const versions = require('../electron/versions')
  const java = require('../electron/java')
  const paths = require('../electron/paths')
  const { Client, Authenticator } = require('minecraft-launcher-core')
  const log = (...a) => console.log('[test]', ...a)
  try {
    const p = profiles.list().find(x => x.name === process.argv[3])
    const javaPath = await java.ensureJava(await versions.requiredJava(p.version))
    const version = { number: p.version, type: 'release' }
    if (p.loader === 'fabric') version.custom = (await versions.ensureFabric(p.version, p.loaderVersion)).id
    const client = new Client()
    let ok = false
    client.on('data', line => {
      if (/Loading \d+ mods/.test(line)) log(line.trim().split('\n')[0])
      if (/ERROR|Exception|crash/i.test(line) && !/twitch/i.test(line)) process.stdout.write('  | ' + line)
      if (!ok && /Sound engine started|Created: \d+x\d+/i.test(line)) {
        ok = true
        log('✅ EL JUEGO HA ARRANCADO')
        setTimeout(() => { proc.kill(); app.exit(0) }, 2000)
      }
    })
    const proc = await client.launch({
      authorization: Authenticator.getAuth('Prueba'), root: paths.root(), version, javaPath,
      memory: { max: '4G', min: '1G' },
      overrides: { gameDirectory: paths.instance(p.id), cwd: paths.instance(p.id), maxSockets: 16 }
    })
    proc.on('close', c => { log('cerrado', c); app.exit(ok ? 0 : 1) })
    setTimeout(() => { log('❌ tiempo agotado'); proc.kill(); app.exit(1) }, 300000)
  } catch (e) { console.error('[test] ERROR', e); app.exit(1) }
})
