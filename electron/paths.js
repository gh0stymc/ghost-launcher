const { app } = require('electron')
const path = require('path')

// Todo vive dentro de la carpeta de datos del launcher (%APPDATA%/ghost-launcher)
const base = () => app.getPath('userData')

module.exports = {
  base,
  // Archivos compartidos por todos los perfiles: versiones, librerías, assets
  root: () => path.join(base(), 'minecraft'),
  // Una carpeta de juego por perfil (mods, mundos, opciones...)
  instances: () => path.join(base(), 'instances'),
  instance: (id) => path.join(base(), 'instances', id),
  // Java descargado automáticamente, una carpeta por versión mayor
  java: () => path.join(base(), 'java'),
  data: (file) => path.join(base(), file)
}
