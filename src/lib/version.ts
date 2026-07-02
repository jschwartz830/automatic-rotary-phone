// Injected at build time from the latest git commit -- see vite.config.ts.
export const APP_VERSION = __APP_VERSION__
export const APP_VERSION_TITLE = __APP_VERSION_TITLE__

// Unregisters any service workers and clears their caches, then forces a
// fresh network load so the device can't keep serving a stale build.
export async function forceRefreshApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_refresh', Date.now().toString())
  window.location.replace(url.toString())
}
