// iOS home-screen PWAs miscompute the fixed-positioning containing block and
// CSS viewport units (vh/svh/dvh) in standalone mode: they stop short of the
// true screen bottom, reserving phantom space where the Safari toolbar would
// be. That leaves a gap below the bottom dock. `window.innerHeight` reports the
// real usable height in standalone, so we mirror it into a CSS variable and
// size the app shell against that instead of relying on the buggy viewport.
function setAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}

export function installAppHeight() {
  setAppHeight()
  window.addEventListener('resize', setAppHeight)
  window.addEventListener('orientationchange', setAppHeight)
  // Fires when the app is restored from the back/forward cache or relaunched
  // from the home-screen icon, when innerHeight may not be settled on load.
  window.addEventListener('pageshow', setAppHeight)
  window.visualViewport?.addEventListener('resize', setAppHeight)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setAppHeight()
  })
}
