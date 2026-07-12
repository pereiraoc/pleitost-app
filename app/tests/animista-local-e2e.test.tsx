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

describe('Animista LOCAL: pick de essência ao vivo → magias no card (bug #4c)', () => {
  it('escolher Essência Flamejante Adepta pelo dropdown adiciona as magias no card', { timeout: 30000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Teste', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Animista]]')
    renderHero(id)

    // 1. Alterar no painel Habilidades
    const heading = await screen.findByText('Habilidades')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))

    // 2. dropdowns de essência da Magias Anima aparecem (rules resolvidas)
    const dds = (await screen.findAllByLabelText(/Essência Elemental/i, undefined, {
      timeout: 8000,
    })) as HTMLSelectElement[]
    expect(dds.length).toBeGreaterThanOrEqual(3)

    // 3. pick da Essência Flamejante Adepta no 1º dropdown
    const flamejante = [...dds[0].options].find((o) =>
      o.textContent?.includes('Essência Flamejante Adepta'),
    )!
    expect(flamejante).toBeTruthy()
    fireEvent.change(dds[0], { target: { value: flamejante.value } })

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
  // se pegou uma em um, no outro não pode. Agora quando eu vou criar um aparece
  // todos os dropdowns com a mesma coisa."
  it('dropdowns irmãos nascem VAZIOS e a opção escolhida some das irmãs', { timeout: 30000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Teste 2', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Animista]]')
    renderHero(id)
    const heading = await screen.findByText('Habilidades')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    const dds = (await screen.findAllByLabelText(/Essência Elemental/i, undefined, {
      timeout: 8000,
    })) as HTMLSelectElement[]
    expect(dds.length).toBeGreaterThanOrEqual(3)

    // sem NENHUM pick salvo: todos vazios (nada de default options[0] nem
    // de 1 pick "vazando" pros irmãos)
    for (const dd of dds) expect(dd.value).toBe('')

    // pick no 1º dropdown
    const flamejante = [...dds[0].options].find((o) =>
      o.textContent?.includes('Essência Flamejante Adepta'),
    )!
    fireEvent.change(dds[0], { target: { value: flamejante.value } })

    await waitFor(() => {
      const now = screen.getAllByLabelText(/Essência Elemental/i) as HTMLSelectElement[]
      // o 1º tem o pick; as irmãs continuam vazias
      expect(now[0].value).toContain('Essência Flamejante Adepta')
      expect(now[1].value).toBe('')
      expect(now[2].value).toBe('')
      // a opção escolhida SOME das irmãs, mas continua no próprio dropdown
      const opts = (dd: HTMLSelectElement) => [...dd.options].map((o) => o.textContent)
      expect(opts(now[0])).toContain('Essência Flamejante Adepta')
      expect(opts(now[1])).not.toContain('Essência Flamejante Adepta')
      expect(opts(now[2])).not.toContain('Essência Flamejante Adepta')
    })
  })

  // "não tem subclasses, e aí o tamanho do bloco de escolha dele ta pequeno,
  // mas ele tem que ocupar o espaço todo quando não tem nenhuma subclasse"
  it('classe SEM subclasse: o select de classe ocupa a linha inteira', { timeout: 30000 }, async () => {
    const id = createLocalEntity('Heroi', 'Animista Teste 3', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Animista]]')
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
