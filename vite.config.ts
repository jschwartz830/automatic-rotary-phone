import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repoName = 'automatic-rotary-phone'

function gitInfo(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim() || fallback
  } catch {
    return fallback
  }
}

// Version stamp derived from the latest commit at build time -- on the
// deployed site this is the "Merge pull request #NNN..." commit that
// landed on main, giving Settings a way to show exactly what's live.
const appVersion = gitInfo("git log -1 --date=format:'%Y.%m.%d.%H%M' --format=%cd", 'dev')
const appVersionTitle = gitInfo('git log -1 --format=%s', 'Local development build')

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_VERSION_TITLE__: JSON.stringify(appVersionTitle),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        name: 'Nannager',
        short_name: 'Nannager',
        start_url: `/${repoName}/`,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  base: process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/',
})
