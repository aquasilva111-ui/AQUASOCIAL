import {useEffect, useState} from 'react'

export type Mode = 'light' | 'dark'

const THEME_KEY = 'aqua-docs:theme'

function initialMode(): Mode {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Tema claro/escuro do chrome: persiste em localStorage, padrão segue o sistema. */
export function useThemeMode(): {mode: Mode; toggle: () => void} {
  const [mode, setMode] = useState<Mode>(initialMode)

  useEffect(() => {
    localStorage.setItem(THEME_KEY, mode)
    document.documentElement.dataset.theme = mode
  }, [mode])

  return {mode, toggle: () => setMode(m => (m === 'dark' ? 'light' : 'dark'))}
}

export function useUrlParams(): {host: string | null; room: string | null} {
  const [params] = useState(() => {
    const search = new URLSearchParams(window.location.search)
    return {host: search.get('host'), room: search.get('room')}
  })
  return params
}
