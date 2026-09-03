// @vitest-environment jsdom
// Report 2026-09-02 (curadoria de imagens): quando os BYTES de um asset mudam
// mas o NOME não (arte substituída no lugar), o purge por stamp limpa o cache
// do SW, mas o cache HTTP do navegador ainda pode servir o arquivo velho por
// minutos. As URLs de vault-data agora levam `?v=<carimbo do dataset>` — o
// carimbo muda a cada extract, a URL muda junto e TODO cache (SW + HTTP)
// falha pro conteúdo novo. Sem carimbo visto (1ª visita) → URL limpa.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { vaultUrl } from '../src/data/base-url'

beforeAll(() => {
  if (!window.localStorage) {
    const data = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, String(v)),
        removeItem: (k: string) => void data.delete(k),
        clear: () => data.clear(),
        key: () => null,
        get length() {
          return data.size
        },
      },
    })
  }
})
afterEach(() => window.localStorage.clear())

describe('vaultUrl com carimbo de frescor (?v=)', () => {
  it('sem carimbo visto: URL limpa (1ª visita/teste)', () => {
    expect(vaultUrl('assets/x.png')).toBe('/vault-data/assets/x.png')
  })

  it('carimbo da fantasia visto: URL versionada', () => {
    window.localStorage.setItem('pleitost.dbVersionVista', '2026-09-02T10:56:39.240Z')
    const url = vaultUrl('assets/x.png')
    expect(url.startsWith('/vault-data/assets/x.png?v=')).toBe(true)
    // o valor é derivado do carimbo — dois carimbos diferentes ≠ mesma URL
    window.localStorage.setItem('pleitost.dbVersionVista', '2026-09-03T00:00:00.000Z')
    expect(vaultUrl('assets/x.png')).not.toBe(url)
  })
})
