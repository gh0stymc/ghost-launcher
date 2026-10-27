// Instala los mods integrados en un perfil nuevo y comprueba que el juego arranca.
// Uso: npx electron scripts/test-builtins.js <carpeta-temporal> <version> [todos]
const { app } = require('electron')
app.setPath('userData', process.argv[2])

app.whenReady().then(async () => {
  const profiles = require('../electron/profiles')
  const builtins = require('../electron/builtins')
  const modrinth = require('../electron/modrinth')
  const versions = require('../electron/versions')
  const java = require('../electron/java')
  const paths = require('../electron/paths')
  const { Client, Authenticator } = require('minecraft-launcher-core')
  const log = (...a) => console.log('[test]', ...a)
  try {
    const version = process.argv[3]
    const p = profiles.create({ name: `Test ${version}`, version, loader: 'fabric' })
    const slugs = process.argv[4] === 'todos' ? [...builtins.BUILTINS.map(b => b.slug), 'capes'] : builtins.defaultSelection()
    const t = Date.now()
    const r = await builtins.apply(p, slugs)
    log(`${version}: ${r.installed.length} instalados en ${Math.round((Date.now() - t) / 1000)}s, saltados: ${r.skipped.join(', ') || 'ninguno'}`)
    if (r.adjusted?.length) log('ajustados:', r.adjusted.join(' | '))
    log('archivos en mods:', modrinth.list(p.id).length)

    const javaPath = await java.ensureJava(await versions.requiredJava(version))
    const fabric = await versions.ensureFabric(version)
    const client = new Client()
    let ok = false
    client.on('data', line => {
      const m = line.match(/Loading (\d+) mods/)
      if (m) log('Fabric carga', m[1], 'mods')
      if (/Incompatible mod set|Mod resolution failed|requires|Mixin apply failed|Exception in thread|Crash report saved|---- Minecraft Crash Report/.test(line)) process.stdout.write('  ! ' + line.slice(0, 1500))
      if (!ok && /Sound engine started|Created: \d+x\d+/i.test(line)) {
        ok = true
        setTimeout(() => { log('✅ ARRANCA con todos los mods'); proc.kill(); app.exit(0) }, 8000)
      }
    })
    const proc = await client.launch({
      authorization: Authenticator.getAuth('Prueba'), root: paths.root(),
      version: { number: version, type: 'release', custom: fabric.id }, javaPath,
      memory: { max: '4G', min: '1G' },
      overrides: { gameDirectory: paths.instance(p.id), cwd: paths.instance(p.id), maxSockets: 16 }
    })
    proc.on('close', c => { log('el juego se cerró, código', c); app.exit(ok ? 0 : 1) })
    setTimeout(() => { log('❌ tiempo agotado'); proc.kill(); app.exit(1) }, 420000)
  } catch (e) { console.error('[test] ERROR', e); app.exit(1) }
})
