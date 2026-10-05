/// <reference lib="dom" />
import {type PickerImage} from '#/lib/media/picker.shared'

/**
 * Turns a File from a drop into the shape the upload pipeline expects: a data
 * URI plus its mime type, byte size and pixel size.
 */
export function fileToPickerImage(file: Blob): Promise<PickerImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.onload = () => {
      const path = String(reader.result)
      const img = new Image()
      img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'))
      img.onload = () =>
        resolve({
          path,
          mime: file.type || 'image/jpeg',
          size: file.size,
          width: img.naturalWidth,
          height: img.naturalHeight,
        })
      img.src = path
    }
    reader.readAsDataURL(file)
  })
}
