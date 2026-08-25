// @vitest-environment jsdom
// Aba PLANEJAMENTO (Biografia) — timeline vertical nível 1..10 estilo
// Pathbuilder. Cobre: cards com ganhos por nível (Guerreiro real), escolha
// futura gravando no bloco FM Planejamento (inerte pra engine), e o sync ao
// subir o nível (pick do plano vira pick real pelo caminho existente).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  getLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

const bardoFm = (nivel: number) => ({
  ...(emptyHeroFrontmatter() as Record<string, unknown>),
  Classe: '[[Bardo]]',
  'Nível': nivel,
  Atributos: { FOR: 1, AGI: 2, INT: 3, PRE: 4 },
})

function renderBiografia(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirPlanejamento() {
  fireEvent.click(await screen.findByText('PLANEJAMENTO'))
  await waitFor(() => expect(screen.getByText('NÍVEL 1')).toBeTruthy(), { timeout: 20000 })
}

describe('aba Planejamento — timeline 1..10', () => {
  it('cards 1..10 com ganhos do Guerreiro nos níveis certos', async () => {
    const id = createLocalEntity('Heroi', 'Planejador', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Guerreiro]]',
      'Nível': 3,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    for (let n = 1; n <= 10; n++) expect(screen.getByText(`NÍVEL ${n}`)).toBeTruthy()
    expect(screen.getByText('← ATUAL')).toBeTruthy()
    // ganhos por nível (regras reais): Veterano N4, Campeão N7, Maestria N10
    const cardDe = (n: number) =>
      document.querySelector(`[data-nivel="${n}"]`) as HTMLElement
    expect(cardDe(4).textContent).toContain('Veterano')
    expect(cardDe(7).textContent).toContain('Campeão')
    expect(cardDe(10).textContent).toContain('Maestria em Arma')
    expect(cardDe(1).textContent).toContain('Evolução Básica')
  }, 40000)

  it('escolha FUTURA grava no bloco Planejamento; subir o nível materializa o pick', async () => {
    // Bardo N1: Magias Anima não é do Bardo — usa a escolha de magia do
    // próprio Bardo? Mantém genérico: Guerreiro e a escolha da Especialização
    // é SUBCLASSE (read-only aqui). Usa Animista: escolhas de essência N2/N3.
    const id = createLocalEntity('Heroi', 'Planejador Animista', {
      ...(emptyHeroFrontmatter() as Record<string, unknown>),
      Classe: '[[Animista]]',
      'Nível': 1,
      Sintonia: '[[Traço Elemental do Fogo|Fogo]]',
      Atributos: { FOR: 1, AGI: 2, INT: 3, PRE: 4 },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // N2 abre uma escolha de essência (Magias Anima, gate 2) — FUTURA no N1
    const card2 = document.querySelector('[data-nivel="2"]') as HTMLElement
    const selects = card2.querySelectorAll('select')
    expect(selects.length).toBeGreaterThan(0)
    const sel = selects[0] as HTMLSelectElement
    const opcao = [...sel.options].map((o) => o.value).find((v) => v.includes('Essência'))
    expect(opcao).toBeTruthy()
    fireEvent.change(sel, { target: { value: opcao } })
    // gravou no PLANO (não nas listas ativas)
    await waitFor(() => {
      const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const picks = ((fm['Planejamento'] as Record<string, unknown>)?.['picks'] ?? {}) as Record<string, string>
      expect(Object.values(picks)).toContain(opcao)
      expect(JSON.stringify(fm['Habilidades'] ?? {})).not.toContain(opcao)
    })
    // sobe o nível pra 2 → o sync aplica o pick do plano nas listas reais
    cleanup()
    setLocalEntityFm(id, 'Nível', 2)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => {
        const fm = getLocalEntity(id)!.frontmatter as Record<string, unknown>
        expect(JSON.stringify(fm['Habilidades'] ?? {})).toContain(opcao!)
        const picks = ((fm['Planejamento'] as Record<string, unknown>)?.['picks'] ?? {}) as Record<string, string>
        expect(Object.values(picks)).not.toContain(opcao)
      },
      { timeout: 20000 },
    )
  }, 60000)
})
