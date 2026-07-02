// iOS home-screen PWAs miscompute the fixed-positioning containing block and
// CSS viewport units (vh/svh/dvh) in standalone mode: they can stop short of
// the true screen bottom, reserving phantom space where the Safari toolbar
// would be. `window.innerHeight` / visualViewport report the real usable
// height (and iOS sometimes only settles it a beat after launch), so we mirror
// it into a CSS variable and size the app shell against that. The bottom dock
// is additionally pinned to the real screen edge with position:fixed, so it
// stays flush even if this measurement is briefly off.
function setAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}

export function installAppHeight() {
  setAppHeight()
  // iOS often reports a pre-chrome height on first paint and only corrects it a
  // frame or two later, without firing a resize. Re-measure a few times as the
  // standalone viewport settles.
  requestAnimationFrame(setAppHeight)
  for (const delay of [50, 150, 300, 600, 1000]) setTimeout(setAppHeight, delay)

  window.addEventListener('load', setAppHeight)
  window.addEventListener('resize', setAppHeight)
  window.addEventListener('orientationchange', setAppHeight)
  // Fires when the app is restored from the back/forward cache or relaunched
  // from the home-screen icon.
  window.addEventListener('pageshow', setAppHeight)
  window.visualViewport?.addEventListener('resize', setAppHeight)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setAppHeight()
  })
}
