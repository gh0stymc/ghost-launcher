// Prueba de los importadores. Uso: npx electron scripts/test-import.js <carpeta-temporal>
const { app } = require('electron')
app.setPath('userData', process.argv[2])

app.whenReady().then(async () => {
  const modpacks = require('../electron/modpacks')
  const modrinth = require('../electron/modrinth')
  const log = (...a) => console.log('[test]', ...a)
  try {
    const lunar = await modpacks.listLunar()
    log('Lunar encontrado:', lunar.found)
    for (const p of lunar.profiles) log(`  ${p.folder} -> ${p.name} | ${p.version} | ${p.loader} | ${p.mods} mods | ${p.resourcepacks} texturas`)

    const pick = lunar.profiles.find(p => p.folder === 'uku-s-pvp-modpack') || lunar.profiles[0]
    const r = await modpacks.importLunar(pick.folder, {}, () => {})
    const items = modrinth.list(r.profile.id)
    log(`Importado Lunar "${r.profile.name}" ${r.profile.version}: ${items.length} elementos, reconocidos ${items.filter(i => !i.manual).length}, icono: ${!!r.icon}`)
    log('  ejemplo:', items.slice(0, 4).map(i => `${i.title}${i.enabled ? '' : ' (off)'}`).join(', '))

    // Fabulously Optimized
    const m = await modpacks.installModrinthPack('1KVo5zza', () => {})
    const mi = modrinth.list(m.profile.id)
    log(`Importado Modrinth "${m.profile.name}" ${m.profile.version} fabric ${m.profile.loaderVersion}: ${mi.length} elementos, icono: ${m.icon?.mime}`)
    app.exit(0)
  } catch (e) {
    console.error('[test] ERROR', e)
    app.exit(1)
  }
})
