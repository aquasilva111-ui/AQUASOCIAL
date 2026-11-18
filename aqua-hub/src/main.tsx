import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { ensureCreateEntry } from './create/route'
import { applyScheme, readScheme } from './create/scheme'
import './style.css'

ensureCreateEntry()
applyScheme(readScheme())

createRoot(document.getElementById('root')!).render(<App />)
