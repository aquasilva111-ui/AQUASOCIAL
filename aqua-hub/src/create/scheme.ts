/** Day / night for AQUA Create. Same key as the rest of AQUA. */

export const SCHEME_KEY = 'aqua:color-scheme'

export type Scheme = 'light' | 'night'

export function readScheme(): Scheme {
  try {
    const saved = localStorage.getItem(SCHEME_KEY)
    if (saved === 'light' || saved === 'night') return saved
  } catch {
    /* private mode: fall through to the OS, then try to persist */
  }
  const night = window.matchMedia('(prefers-color-scheme: dark)').matches
  const scheme: Scheme = night ? 'night' : 'light'
  try {
    localStorage.setItem(SCHEME_KEY, scheme)
  } catch {
    /* still apply the choice for this visit */
  }
  return scheme
}

export function applyScheme(scheme: Scheme) {
  document.documentElement.dataset.scheme = scheme
  document.documentElement.style.colorScheme = scheme === 'night' ? 'dark' : 'light'
}

export function writeScheme(scheme: Scheme) {
  try {
    localStorage.setItem(SCHEME_KEY, scheme)
  } catch {
    /* the attribute still flips for this visit */
  }
  applyScheme(scheme)
}
