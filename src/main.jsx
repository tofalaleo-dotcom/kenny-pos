import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (import.meta.env.DEV) {
  document.documentElement.dataset.devBuild = String(Date.now())
}

/*
  GitHub Pages was sometimes serving an old POS screen from the previous PWA cache.
  For the shop POS we prefer always-fresh screens over offline caching, so remove
  old service workers and caches whenever the app opens.
*/
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {})
  })
}

if ('caches' in window) {
  window.addEventListener('load', () => {
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
