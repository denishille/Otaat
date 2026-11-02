import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAuth, loadLocal } from './lib/store'
import './styles/app.css'

loadLocal()
initAuth()

// Safari auf iOS ignoriert user-scalable=no und zoomt trotzdem per Pinch.
// Die Gesten-Events gibt es nur dort, anderswo laufen sie ins Leere.
for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
