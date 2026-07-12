// @vitest-environment jsdom
// Linha "Database" do CONFIG (issue #190): o rodapé PLEITOST COMPANION//OS
// mostra o stamp da database embutida (vault-data/db-version.json, gravado
// pelo extract) — data da extração + contagem de docs. Fetch lazy ao montar;
// sem stamp (build antigo) a linha simplesmente não existe.
//
// Stamp INLINE no mock de fetch (não lê o arquivo real): o teste precisa ser
// verde também em checkout cuja vault-data ainda não foi re-extraída.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const STAMP = { extractedAt: '2026-07-12T20:57:37.378Z', docCount: 1192 }
let stampOk = true

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    if (url.endsWith('/vault-data/db-version.json')) {
      return {
        ok: stampOk,
        status: stampOk ? 200 : 404,
        json: async () => STAMP,
      }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as typeof fetch
})

/** Mesmo polyfill de localStorage dos demais testes (vitest 4 + jsdom). */
function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})

afterEach(cleanup)

// import dinâmico DEPOIS dos mocks (padrão dos testes de persistência)
async function renderConfig() {
  const { ConfigPage } = await import('../src/components/config/ConfigPage')
  return render(<ConfigPage />)
}

describe('CONFIG › linha Database (issue #190)', () => {
  it('mostra data da extração e contagem de docs vindas do db-version.json', async () => {
    stampOk = true
    await renderConfig()
    const linha = await screen.findByText(/DATABASE · .+ · 1192 DOCS/)
    // a data renderizada vem do extractedAt do stamp (formato pt-BR local)
    const quando = new Date(STAMP.extractedAt).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
    expect(linha.textContent).toBe(`DATABASE · ${quando} · 1192 DOCS`)
    // rodapé continua presente (a linha é seção do rodapé, não substituto)
    expect(screen.getByText(/PLEITOST COMPANION\/\/OS/)).toBeTruthy()
  })

  it('sem stamp (404): rodapé fica sem a linha — nada inventado', async () => {
    stampOk = false
    await renderConfig()
    expect(await screen.findByText(/PLEITOST COMPANION\/\/OS/)).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByText(/DATABASE ·/)).toBeNull()
    })
  })
})
