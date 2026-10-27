// Comprueba el reintento automático: con una opción de Java inválida el juego se cae al arrancar,
// y el launcher debe reintentarlo una sola vez. Uso: npx electron scripts/test-retry.js <carpeta-de-datos> <perfil>
const { app } = require('electron')
app.setPath('userData', process.argv[2])

app.whenReady().then(async () => {
  const profiles = require('../electron/profiles')
  const auth = require('../electron/auth')
  const { Authenticator } = require('minecraft-launcher-core')
  auth.authorization = async () => Authenticator.getAuth('Prueba')
  const launcher = require('../electron/launch')
  const p = profiles.list().find(x => x.name === process.argv[3])
  const before = p.jvmArgs
  profiles.update(p.id, { jvmArgs: '-XX:MaxMetaspaceSize=16m' })
  let retries = 0
  let starts = 0
  await launcher.launch(p.id, (event, data) => {
    if (event !== 'log') console.log('[test] evento', event, JSON.stringify(data).slice(0, 150))
    else if (retries) console.log('[test] log', String(data).slice(0, 200))
    if (event === 'started') starts++
    if (event === 'log' && /Volviendo a intentarlo/.test(data)) { retries++; console.log('[test] reintento detectado') }
    if (event === 'closed') {
      console.log(`[test] cerrado (código ${data.code}) · arranques: ${starts} · reintentos: ${retries}`)
      console.log(starts === 2 && retries === 1 ? '[test] ✅ OK' : '[test] ❌ FALLO')
      profiles.update(p.id, { jvmArgs: before })
      app.exit(0)
    }
  }).catch(e => { console.log('[test] error', e.message); profiles.update(p.id, { jvmArgs: before }); app.exit(1) })
})
