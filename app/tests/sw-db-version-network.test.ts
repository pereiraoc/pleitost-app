// Report 2026-09-02 (ilustrações da POA "não aparecem" com bundle novo): o
// ensureFreshVaultData busca db-version.json com cache:'no-store', mas isso
// só pula o cache HTTP — o SERVICE WORKER interceptava e servia o stamp STALE
// (rota vault-data* StaleWhileRevalidate). Resultado: o purge por stamp só
// disparava na SEGUNDA recarga, e deploy de conteúdo parecia não chegar.
// A rota db-version.json precisa existir ANTES das rotas vault-data* (workbox
// casa a primeira) e ir na REDE (NetworkFirst; offline cai no cache).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const config = fs.readFileSync(path.join(appDir, 'vite.config.ts'), 'utf8')

describe('service worker: stamp de frescor sempre na rede', () => {
  it('rota db-version.json é NetworkFirst e vem antes das rotas vault-data*', () => {
    const dbRoute = config.search(/db-version\.json[\s\S]{0,200}handler:\s*'NetworkFirst'/)
    expect(dbRoute).toBeGreaterThan(-1)
    const vaultRoute = config.search(/vault-data\/`\)[\s\S]{0,80}handler:\s*'StaleWhileRevalidate'/)
    expect(vaultRoute).toBeGreaterThan(-1)
    expect(dbRoute).toBeLessThan(vaultRoute)
  })
})
