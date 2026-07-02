import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { installAppHeight } from './lib/appHeight'

// Pin a real-screen-height CSS variable before React paints so the app shell
// fills the true viewport on installed iOS home-screen apps.
installAppHeight()

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      // Force a fresh check for a newer deploy whenever the app is
      // foregrounded -- the exact moment someone relaunches the
      // home-screen icon after an update has shipped.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
