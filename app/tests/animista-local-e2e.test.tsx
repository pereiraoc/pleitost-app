// @vitest-environment jsdom
// Bug #4c (report do usuário): "fiz um personagem animista e quando eu
// selecionei as essências, não apareceram as magias na aba de magias."
// Este teste refaz o fluxo VIVO inteiro num herói LOCAL criado no app:
// createLocalEntity(emptyHeroFrontmatter) → Classe [[Animista]] → pick de
// essência PELO DROPDOWN da árvore de Habilidades → as magias da essência
// devem aparecer no card de Magias (via projeção ao vivo).
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  emptyHeroFrontmatter,
  setLocalEntityFm,
  getLocalDoc,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

function renderHero(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Entra no Alterar do painel "Magias" (onde mora o Círculo das Essências). */
async function abrirMagias() {
  await waitFor(() => {
    const h = screen.getAllByText('Magias').find((el) => el.parentElement && within(el.parentElement).queryByText('✎ Alterar'))
    expect(h).toBeTruthy()
    fireEvent.click(within(h!.parentElement!).getByText('✎ Alterar'))
  }, { timeout: 15000 })
}

describe('Animista LOCAL: pick de essência ao vivo → magias no card (bug #4c)', () => {
  // 2026-10-25: as essências saíram dos dropdowns pra RODA DAS ESSÊNCIAS — o
  // pick é um clique no nó do ciclo (data-roda-no="A:Essência X").
  it('escolher Essência Flamejante Adepta pela roda adiciona as magias no card', { timeout: 30000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Teste', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Animista]]')
    // #480: escolhas de essência são condicionais à Sintonia
    setLocalEntityFm(id, 'Sintonia', '[[Traço Elemental do Fogo|Fogo]]')
    renderHero(id)

    // 1. Alterar no painel Magias (Círculo das Essências)
    await abrirMagias()

    // 2. o círculo aparece com a pura da sintonia acesa (rules resolvidas)
    const no = (k: string) => document.querySelector(`[data-roda-no="${k}"]`)
    await waitFor(() => expect(no('A:Essência Flamejante')?.getAttribute('data-roda-estado')).toBe('livre'), {
      timeout: 8000,
    })

    // 3. pick da Essência Flamejante Adepta
    fireEvent.click(no('A:Essência Flamejante')!)

    // 4. o pick persiste no FM local
    await waitFor(() => {
      const fm = getLocalDoc(id)!.frontmatter as any
      expect(JSON.stringify(fm.Habilidades?.Lista ?? [])).toContain('Essência Flamejante Adepta')
    })

    // 5. as magias da essência aparecem no card de Magias (Raio Flamejante +
    //    Cone de Fogo, concedidas por Complementar Magias.Lista)
    await waitFor(
      () => {
        expect(screen.getAllByText('Raio Flamejante').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Cone de Fogo').length).toBeGreaterThan(0)
      },
      { timeout: 5000 },
    )
  })

  // Bug #4d: "não pode deixar o cara repetir escolha nos dropdowns de essencia,
  // se pegou uma em um, no outro não pode." Na roda: nada nasce escolhido, e a
  // essência escolhida ocupa UMA vaga só.
  it('a roda nasce sem escolha e a essência escolhida ocupa uma vaga só', { timeout: 30000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Teste 2', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Animista]]')
    setLocalEntityFm(id, 'Sintonia', '[[Traço Elemental do Fogo|Fogo]]')
    renderHero(id)
    await abrirMagias()
    const no = (k: string) => document.querySelector(`[data-roda-no="${k}"]`)
    const contador = () => document.querySelector('[data-roda-contador="A"]')?.textContent
    await waitFor(() => expect(contador()).toMatch(/0\/\d/), { timeout: 8000 })
    expect(document.querySelectorAll('[data-roda-estado="tem"]').length).toBe(0)

    fireEvent.click(no('A:Essência Flamejante')!)
    await waitFor(() => expect(no('A:Essência Flamejante')?.getAttribute('data-roda-estado')).toBe('tem'))
    expect(contador()).toMatch(/^ADEPTA 1\//)
    const lista = JSON.stringify((getLocalDoc(id)!.frontmatter as any).Habilidades?.Lista ?? [])
    expect(lista.split('Essência Flamejante Adepta').length - 1).toBe(1)
  })

  it('classe SEM subclasse: o select de classe ocupa a linha inteira', { timeout: 30000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Teste 3', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Animista]]')
    // #480: escolhas de essência são condicionais à Sintonia
    setLocalEntityFm(id, 'Sintonia', '[[Traço Elemental do Fogo|Fogo]]')
    renderHero(id)
    const classeSel = (await screen.findByLabelText('CLASSE INICIAL', undefined, {
      timeout: 8000,
    })) as HTMLElement
    // aguarda as rules assentarem (Animista não tem subclassChoices) e o grid
    // colapsar pra coluna única — mesma largura da Sintonia abaixo.
    await waitFor(() => {
      let grid: HTMLElement | null = classeSel.parentElement
      while (grid && grid.style.display !== 'grid') grid = grid.parentElement
      expect(grid).toBeTruthy()
      expect(grid!.style.gridTemplateColumns).toBe('minmax(0,1fr)')
    })
  })
})
