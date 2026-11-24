// Traducciones de la interfaz. El texto se escribe en español y el diccionario lo pasa al idioma elegido.
// Diccionario compartido con el proceso principal: electron/locales/en.json
// Para ver qué frases faltan por traducir: node scripts/check-i18n.js
import en from '../electron/locales/en.json'

let lang = 'es'

export const getLang = () => lang
export const setLang = (l) => {
  lang = l === 'en' ? 'en' : 'es'
  document.documentElement.lang = lang
}

// Formato de fechas y números según el idioma
export const locale = () => (lang === 'en' ? 'en-US' : 'es-ES')

// t('Hola, {name}', { name: 'Ana' })
export function t (text, vars) {
  let out = lang === 'en' ? (en[text] ?? text) : text
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return out
}
