// @vitest-environment jsdom
// PERÍCIA DE CLASSE na UI (2026-10-25): o painel de Perícias mostra a escolha
// declarada na nota da classe (Ladino: Furtividade ou Ladinagem) e grava o pick
// como incremento tagueado `Escolha.[[Ladino]]` na linha da perícia.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { PericiasProfPanel } from '../src/components/ficha/HabilidadesTab'
import { TipProvider } from '../src/components/ficha/tooltips'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest)

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

describe('Perícia de Classe no painel de Perícias', () => {
  it('Ladino escolhe Ladinagem e o pick vira incremento tagueado', async () => {
    const id = createLocalEntity('Heroi', 'Ladra', {
      ...emptyHeroFrontmatter(),
      Classe: '[[Ladino]]',
      Atributos: { Principal: 'AGI', FOR: 1, AGI: 3, INT: 2, PRE: 0 },
    })
    render(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <TipProvider>
            <PericiasProfPanel doc={getLocalDoc(id)!} forceEdit />
          </TipProvider>
        </DetailProvider>
      </CatalogProvider>,
    )
    const sel = (await screen.findByLabelText('Perícia de Classe', undefined, { timeout: 15000 })) as HTMLSelectElement
    // sem opção vazia: o padrão da classe (Furtividade) já aparece escolhido,
    // com o ícone da perícia no rótulo
    expect([...sel.options].map((o) => o.value)).toEqual(['[[Furtividade]]', '[[Ladinagem]]'])
    expect(sel.value).toBe('[[Furtividade]]')
    expect([...sel.options].every((o) => /^\S+ \S/.test(o.textContent ?? ''))).toBe(true)
    fireEvent.change(sel, { target: { value: '[[Ladinagem]]' } })
    await waitFor(() => {
      const lista = ((getLocalDoc(id)!.frontmatter['Pericias'] as Record<string, unknown>)['Lista'] ?? []) as Record<
        string,
        unknown
      >[]
      const row = lista.find((p) => p['Nome'] === 'Ladinagem')
      expect(row?.['Incrementos']).toEqual([{ A: 'Escolha.[[Ladino]]' }])
    })
  }, 30000)
})
