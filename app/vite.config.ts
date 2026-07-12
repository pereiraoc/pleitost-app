import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { vaultData } from './vite/vault-data'
import { appState } from './vite/app-state'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// #189: base configurável pra deploy em subcaminho (GitHub Pages de projeto
// serve em /<repo>/). Ex.: `VITE_BASE=/pleitost-app/ npm run build`.
// Default '/' preserva dev/preview/deploys em raiz. Sempre com barra final.
const rawBase = process.env.VITE_BASE ?? '/'
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
// base escapada pra uso em RegExp (workbox denylist abaixo).
const baseRe = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** #189: SPA fallback pro GitHub Pages — Pages responde 404.html em rota
 *  desconhecida; uma CÓPIA do index.html faz deep-links (/heroi/..., /doc/...)
 *  caírem no router do app em vez do 404 do Pages. */
function spaFallback404(): Plugin {
  let outDir = ''
  return {
    name: 'pleitost:spa-fallback-404',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html')
      if (!fs.existsSync(index)) return
      fs.copyFileSync(index, path.join(outDir, '404.html'))
      console.log('[spa-404] index.html copiado para 404.html')
    },
  }
}

export default defineConfig({
  base,
  // Aceita o Host de túneis Cloudflare (acesso pelo celular via
  // cloudflared tunnel --url) tanto no dev quanto no preview do build.
  server: { host: true, allowedHosts: ['.trycloudflare.com'] },
  preview: { host: true, allowedHosts: ['.trycloudflare.com'] },
  plugins: [
    react(),
    vaultData(path.resolve(dirname, '..', 'vault-data')),
    // Persistência server-side (#84): caminhos/fichas/personagens no disco.
    appState(path.resolve(dirname, '..', 'app-state.json')),
    spaFallback404(),
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
        // Prefixados pela `base` (#189): sob /pleitost-app/ os pathnames são
        // /pleitost-app/vault-data/... — o padrão precisa acompanhar.
        navigateFallbackDenylist: [
          new RegExp(`^${baseRe}vault-data/`),
          new RegExp(`^${baseRe}app-state`),
        ],
        runtimeCaching: [
          {
            // Estado do usuário: SEMPRE rede (nunca cachear — é a fonte durável).
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}app-state`),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}vault-data/`),
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
