import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (import.meta.env.DEV) {
  document.documentElement.dataset.devBuild = String(Date.now())
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // ຖ້າ browser ບໍ່ຮອງຮັບ ຫຼື hosting ບລັອກ, app ຍັງໃຊ້ງານໄດ້ປົກກະຕິ.
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
