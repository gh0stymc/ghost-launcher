// Convierte cualquier imagen (PNG, JPG, WebP, GIF...) en un PNG cuadrado de 256 px.
// Lo hace el navegador, que entiende más formatos que el proceso principal.
export async function toSquarePng (blob, size = 256) {
  const bitmap = await createImageBitmap(blob)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  // Las imágenes pixeladas pequeñas (estilo Minecraft) se escalan sin difuminar
  ctx.imageSmoothingEnabled = side >= 96
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

export function base64ToBlob (base64, mime) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

export function pickImage () {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files[0] || null)
    input.click()
  })
}
