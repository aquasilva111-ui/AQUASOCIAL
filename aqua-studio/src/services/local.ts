import { IUpload } from "~/interfaces/editor"

/**
 * Uploads live on this device (localStorage, as data URLs) until the Studio
 * stores them in the user's PDS. No third-party backend.
 */
const KEY = "aquaStudio:uploads"
const MAX_BYTES = 4 * 1024 * 1024

function read(): IUpload[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as IUpload[]) : []
  } catch {
    return []
  }
}

function write(list: IUpload[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage full or blocked: uploads still work for this session.
  }
}

export const localUploads = {
  list(): IUpload[] {
    return read()
  },

  async add(file: File): Promise<IUpload> {
    if (file.size > MAX_BYTES) throw new Error("file_too_large")
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const item: IUpload = {
      id: `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      contentType: file.type,
      folder: "",
      name: file.name,
      type: file.type.startsWith("video") ? "video" : "image",
      url,
    }
    write([item, ...read()])
    return item
  },

  remove(id: string) {
    write(read().filter((u) => u.id !== id))
  },
}
