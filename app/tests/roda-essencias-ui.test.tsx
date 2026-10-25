// @vitest-environment jsdom
// RODA DAS ESSÊNCIAS na ficha (2026-10-25): o Animista escolhe as Essências
// Elementais pela roda do ciclo — começa pela pura da sintonia, caminha de
// vizinha em vizinha; o anel das Experientes só aparece quando há escolha nele.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { HabilidadesArvorePanel } from '../src/components/ficha/HabilidadesTab'
import { useHeroRefs } from '../src/components/ficha/useHeroRefs'
import type { VaultDoc } from '../src/data/types'
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

function Painel({ doc }: { doc: VaultDoc }) {
  const refs = useHeroRefs(doc)
  return <HabilidadesArvorePanel doc={doc} refs={refs} forceEdit />
}

function renderHeroi(extra: Record<string, unknown>) {
  const id = createLocalEntity('Heroi', 'Animista', {
    ...emptyHeroFrontmatter(),
    Classe: '[[Animista]]',
    Sintonia: '[[Traço Elemental do Fogo]]',
    Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
    ...extra,
  })
  render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <TipProvider>
          <Painel doc={getLocalDoc(id)!} />
        </TipProvider>
      </DetailProvider>
    </CatalogProvider>,
  )
  return id
}
const no = (k: string) => document.querySelector(`[data-roda-no="${k}"]`) as SVGGElement | null
const estado = (k: string) => no(k)?.getAttribute('data-roda-estado')

describe('Roda das Essências', () => {
  it('nível 1: só a pura abre; escolher a pura acende as vizinhas', async () => {
    const id = renderHeroi({ Nível: 1 })
    await waitFor(() => expect(no('A:Essência Flamejante')).toBeTruthy(), { timeout: 15000 })
    expect(estado('A:Essência Flamejante')).toBe('livre')
    expect(estado('A:Essência Explosiva')).toBe('fechado')
    expect(estado('A:Essência Hidratante')).toBe('oposto')
    expect(no('E:Essência Flamejante')).toBeNull() // sem Elementalista, sem anel E
    fireEvent.click(no('A:Essência Flamejante')!)
    await waitFor(() => {
      const lista = ((getLocalDoc(id)!.frontmatter['Habilidades'] as Record<string, unknown>)['Lista'] ?? []) as Record<string, unknown>[]
      const row = lista.find((r) => Object.keys(r)[0] === '[[Essência Flamejante Adepta]]')
      expect(String(row && Object.values(row)[0])).toMatch(/^Escolha\.\d\d\.\[\[Magias Anima\]\]$/)
    })
    await waitFor(() => expect(estado('A:Essência Flamejante')).toBe('tem'), { timeout: 15000 })
    expect(estado('A:Essência Explosiva')).toBe('livre')
    expect(estado('A:Essência Incendiária')).toBe('livre')
    expect(estado('A:Essência Mineral')).toBe('fechado')
    // os dropdowns de essência saíram da árvore
    expect(screen.queryByLabelText('Essência Elemental Adepta')).toBeNull()
  }, 40000)

  it('nível 4: o anel das Experientes aparece', async () => {
    renderHeroi({
      Nível: 4,
      Habilidades: { Lista: [{ '[[Essência Flamejante Adepta]]': 'Escolha.01.[[Magias Anima]]' }] },
    })
    await waitFor(() => expect(no('E:Essência Flamejante')).toBeTruthy(), { timeout: 15000 })
    await waitFor(() => expect(estado('E:Essência Flamejante')).toBe('livre'), { timeout: 15000 })
    expect(estado('E:Essência Explosiva')).toBe('fechado')
    expect(no('M:Essência Flamejante')).toBeNull()
  }, 40000)
})
