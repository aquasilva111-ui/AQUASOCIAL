export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore {
  const data = {...initial}
  return {
    get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    },
    set(key, value) {
      data[key] = value
    },
    remove(key) {
      delete data[key]
    },
  }
}

export function webStorage(storage: {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}): KeyValueStore {
  return {
    get(key) {
      return storage.getItem(key)
    },
    set(key, value) {
      storage.setItem(key, value)
    },
    remove(key) {
      storage.removeItem(key)
    },
  }
}

export function sessionBrowserStore(): KeyValueStore {
  if (typeof sessionStorage === 'undefined') return memoryStore()
  return webStorage(sessionStorage)
}

export function localBrowserStore(): KeyValueStore {
  if (typeof localStorage === 'undefined') return memoryStore()
  return webStorage(localStorage)
}
