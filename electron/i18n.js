// Traducciones del launcher. El texto se escribe en español en el código y aquí se pasa al idioma elegido.
// El diccionario inglés está en locales/en.json (lo usan también las pantallas, src/i18n.js).
const en = require('./locales/en.json')

function language () {
  try { return require('./store').get().settings.language === 'en' ? 'en' : 'es' } catch { return 'es' }
}

// t('Hola, {name}', { name: 'Ana' })
function t (text, vars) {
  let out = language() === 'en' ? (en[text] ?? text) : text
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return out
}

// Código de idioma de Minecraft (options.txt → lang)
const minecraftLang = () => (language() === 'en' ? 'en_us' : 'es_es')

module.exports = { t, language, minecraftLang }
