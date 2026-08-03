// @vitest-environment jsdom
// Report #401 ("Quando mudo meu atributo principal pra outro, não tá
// recalculando as armas que tem Precisa. Precisei tirar e voltar pra mudar o
// atributo pra AGI"): o Atributo da arma é DERIVADO só no momento da escolha
// (deriveArmaAtributo em addArma/setNome — snapshot no FM salvo) e nunca
// re-derivado quando os Atributos mudam. Como NÃO existe escolha manual de
// FOR/AGI na UI (o campo é 100% derivado), o swap de atributos agora re-deriva
// o Atributo salvo de TODAS as armas da lista (rederiveArmasAtributos).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { rederiveArmasAtributos } from '../src/components/ficha/arma-atributo-sync'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import { applyFmEdits, getHeroEdits, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { heroPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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

const armaRow = (nome: string, atributo: string) => ({
  Nome: `[[${nome}]]`,
  Atributo: atributo,
  Bonus_Item: 0,
  Bonus_Especial: 0,
  Categoria: '',
  Propriedade: '',
  Fonte: 'Manual',
})

describe('#401 rederiveArmasAtributos (unit)', () => {
  it('Punhal (Precisa): AGI vira maior → re-deriva pra AGI', async () => {
    const lista = [armaRow('Punhal', 'FOR')]
    const next = await rederiveArmasAtributos(catalog, lista, { FOR: 2, AGI: 3, INT: 1, PRE: 0 })
    expect(next?.[0]?.['Atributo']).toBe('AGI')
  })
  it('nada muda → null (sem write inútil)', async () => {
    const lista = [armaRow('Punhal', 'FOR')]
    expect(await rederiveArmasAtributos(catalog, lista, { FOR: 3, AGI: 2, INT: 1, PRE: 0 })).toBeNull()
  })
  it('trap reverso: arma SEM Precisa segue FOR mesmo com AGI maior', async () => {
    const lista = [armaRow('Espada Bastarda', 'FOR')]
    expect(await rederiveArmasAtributos(catalog, lista, { FOR: 2, AGI: 3, INT: 1, PRE: 0 })).toBeNull()
  })
  it('linha vazia/arma desconhecida mantém como está', async () => {
    const lista = [armaRow('', 'FOR'), armaRow('Arma Inventada Xyz', 'FOR')]
    expect(await rederiveArmasAtributos(catalog, lista, { FOR: 2, AGI: 3, INT: 1, PRE: 0 })).toBeNull()
  })
})

describe('#401 integração — swap de atributos re-deriva o Atributo salvo da arma', () => {
  it('Caçador com Punhal: Principal FOR→AGI atualiza a arma pra AGI sem re-adicionar', async () => {
    const fm = emptyHeroFrontmatter()
    fm['Classe'] = '[[Caçador]]'
    const inv = fm['Inventario'] as Record<string, unknown>
    const armas = inv['Armas'] as Record<string, unknown>
    armas['Lista'] = [armaRow('Punhal', 'FOR')]
    const id = createLocalEntity('Heroi', 'Caçador Teste', fm)

    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // Célula do rank 3 editável (Restringir Atributos.Principal FOR, AGI do
    // Caçador) — troca o principal pra AGI, como o jogador do report.
    const sel = (await screen.findByLabelText('Atributo rank 3')) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'AGI' } })

    await waitFor(() => {
      const base = getLocalDoc(id)!
      const merged = applyFmEdits(base.frontmatter as Record<string, unknown>, getHeroEdits(id).fm)
      const lista = (
        (merged['Inventario'] as Record<string, unknown>)['Armas'] as Record<string, unknown>
      )['Lista'] as Record<string, unknown>[]
      expect(lista[0]!['Atributo']).toBe('AGI')
    })
  })
})
