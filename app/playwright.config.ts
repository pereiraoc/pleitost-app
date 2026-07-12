// Infra de E2E de TELA (plano-mestre F2): browser real contra o BUILD servido
// pelo `vite preview` — o mais perto do deploy que dá pra rodar local. O
// webServer builda antes (tsc -b + vite build copia a vault-data pra dist) e
// serve na porta 4273 (não-padrão de propósito: não colide com dev/preview
// abertos na 5173/4173). vault-data/ precisa existir na raiz do repo
// (`npm run extract` ou symlink) — o build falha cedo sem index.json.
import { defineConfig } from '@playwright/test'

const PORT = 4273
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Specs daqui NÃO rodam no vitest (exclude e2e/** no vitest.config.ts) —
  // e vice-versa: este runner só olha ./e2e.
  reporter: 'list',
  use: {
    baseURL,
    // Evidência em falha (DoD do plano-mestre): screenshot lido da tela.
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Build ANTES do preview: o preview serve dist/ (SPA fallback do vite) e
    // o middleware pleitost:vault-data/app-state continua ativo no preview.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: baseURL,
    // build inclui tsc -b + cópia da vault-data (~275MB) → folga generosa.
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
})
