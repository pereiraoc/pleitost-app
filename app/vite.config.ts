import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { vaultData } from './vite/vault-data'
import { appState } from './vite/app-state'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Aceita o Host de túneis Cloudflare (acesso pelo celular via
  // cloudflared tunnel --url) tanto no dev quanto no preview do build.
  server: { host: true, allowedHosts: ['.trycloudflare.com'] },
  preview: { host: true, allowedHosts: ['.trycloudflare.com'] },
  plugins: [
    react(),
    vaultData(path.resolve(dirname, '..', 'vault-data')),
    // Persistência server-side (#84): caminhos/fichas/personagens no disco.
    appState(path.resolve(dirname, '..', 'app-state.json')),
    VitePWA({
      registerType: 'autoUpdate',
      // SW só em build: dev roda sem secure context na LAN (http) sem perder nada
      devOptions: { enabled: false },
      manifest: {
        name: 'Pleitost',
        short_name: 'Pleitost',
        description: 'Companion app do sistema Pleitost',
        display: 'standalone',
        background_color: '#1e1e2e',
        theme_color: '#1e1e2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // NUNCA precachear o conteúdo da vault (254MB) — cache em runtime,
        // doc a doc, conforme navegado
        globIgnores: ['vault-data/**'],
        navigateFallback: 'index.html',
        // /app-state e /vault-data NUNCA caem no fallback SPA nem em cache.
        navigateFallbackDenylist: [/^\/vault-data\//, /^\/app-state/],
        runtimeCaching: [
          {
            // Estado do usuário: SEMPRE rede (nunca cachear — é a fonte durável).
            urlPattern: ({ url }) => url.pathname.startsWith('/app-state'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/vault-data/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'vault-data',
              expiration: { maxEntries: 2000 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 24 },
            },
          },
        ],
      },
    }),
  ],
})
