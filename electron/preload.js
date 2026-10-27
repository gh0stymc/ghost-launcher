const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Lo único que la interfaz puede pedirle al proceso principal
contextBridge.exposeInMainWorld('launcher', {
  call: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (event, fn) => {
    const handler = (_e, data) => fn(data)
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },
  filePath: (file) => webUtils.getPathForFile(file)
})
