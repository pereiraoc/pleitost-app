// URLs de dados sob a BASE do Vite (#209) — no GitHub Pages de projeto o app
// vive em /pleitost-app/ e caminho absoluto 404-eia fora da base; o registro
// central base-url.ts é a única fonte de prefixo dos fetches de dados.
import { describe, expect, it } from 'vitest'
import { appStateUrl, vaultUrl, withBase } from '../src/data/base-url'

describe('base-url (#209)', () => {
  it('base de projeto (Pages): prefixa /pleitost-app/', () => {
    expect(withBase('vault-data/index.json', '/pleitost-app/')).toBe(
      '/pleitost-app/vault-data/index.json',
    )
  })

  it('base sem barra final ganha a barra', () => {
    expect(withBase('app-state', '/pleitost-app')).toBe('/pleitost-app/app-state')
  })

  it('base raiz (dev/vitest): URLs idênticas às históricas', () => {
    // BASE_URL do vitest é '/' — os fetch fakes dos testes de tela casam
    // com ^/vault-data/ e continuam válidos.
    expect(vaultUrl('index.json')).toBe('/vault-data/index.json')
    expect(vaultUrl('Sistema/Criaturas/Her%C3%B3is/Adriann.json')).toBe(
      '/vault-data/Sistema/Criaturas/Her%C3%B3is/Adriann.json',
    )
    expect(appStateUrl()).toBe('/app-state')
  })
})
