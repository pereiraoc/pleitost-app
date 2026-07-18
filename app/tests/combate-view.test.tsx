// @vitest-environment jsdom
// F5 (#249, épico #243) — visualização de COMBATES no compêndio. Pedido AS-IS:
// "clicar em Combates → visão tipo a do pleitost-autosheet (roster + dificuldade),
// e criar novos combates no Modo Mestre". Verificado sobre COMBATES REAIS da
// vault (Campanhas/Combates/*.json, type='Combate', body com fence
// ```combat-marker-small```) via fetch fake sobre ../vault-data.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { registeredDocViewIds } from '../src/components/compendium/doc-view-registry'
import { registeredLeafViewTypes } from '../src/components/compendium/leaf-view-registry'
import { isCombate } from '../src/components/compendium/CombateView'
import { FENCES } from '../src/markdown/fence-registry'
import { compendiumFolderPath, docPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'
// side-effect: garante o registro do doc-view 'combate' + leaf-view 'Combate'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const VILA_ID = 'Campanhas/Combates/Vila de Goblins'
const EMBOSCADA_ID = 'Campanhas/Combates/Emboscada Goblin'
const COMBATES_FOLDER = 'Campanhas/Combates'
const vila = readDoc(VILA_ID)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function renderFolder(initialPath: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/compendio" element={<FolderView />} />
          <Route path="/compendio/*" element={<FolderView />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('registro do visualizador de Combate (#249)', () => {
  it('o barrel registra o doc-view "combate" e o leaf-view "Combate"', () => {
    expect(registeredDocViewIds()).toContain('combate')
    expect(registeredLeafViewTypes()).toContain('Combate')
  })
  it('isCombate casa pela categoria (type === "Combate")', () => {
    expect(vila.type).toBe('Combate') // sanidade da fixture
    expect(isCombate(vila)).toBe(true)
  })
  it('o fence combat-marker-small é registrado (antes: fallback cru)', () => {
    expect(FENCES['combat-marker-small']).toBeTruthy()
    expect(FENCES['combat-marker']).toBeTruthy()
  })
})

describe('página de um Combate: roster + dificuldade (não o markdown cru)', () => {
  it('/doc/Vila de Goblins mostra o roster (5× Goblin Batedor etc.)', async () => {
    const { container } = renderDoc(vila)
    // NÃO é mais o <pre> cru do fence fallback
    expect(container.querySelector('.fence-combat-marker-small')).toBeNull()
    // roster resolvido (o fence resolve os wikilinks contra o catálogo async)
    await waitFor(() => {
      const roster = container.querySelector('.combat-roster')
      expect(roster, 'roster do combate').toBeTruthy()
      expect(within(roster as HTMLElement).getByText(/5×\s*Goblin Batedor/)).toBeTruthy()
    })
    const roster = container.querySelector('.combat-roster') as HTMLElement
    expect(within(roster).getByText(/5×\s*Goblin Guerreiro/)).toBeTruthy()
    expect(within(roster).getByText(/2×\s*Goblin Piromante/)).toBeTruthy()
    expect(within(roster).getByText(/3×\s*Goblin Soldado/)).toBeTruthy()
  })

  it('mostra a DIFICULDADE computada (badge do classify + pontos de monstro)', async () => {
    const { container } = renderDoc(vila)
    await waitFor(() => {
      // a badge de dificuldade do tracker (skin .gm-enc-difficulty)
      expect(container.querySelector('.combat-difficulty .gm-enc-difficulty')).toBeTruthy()
    })
    // total de pontos de monstro é > 0 (5 T0 + 5 T1 + 2 T1 + 3 T1 = 25 + 100 = ...)
    // Goblin Batedor T0 = 5pts × 5 = 25; T1 = 10pts × 10 = 100 → 125 pts
    const diff = container.querySelector('.combat-difficulty') as HTMLElement
    expect(diff.textContent).toMatch(/125/)
    // o label de classify aparece (TRIVIAL/FÁCIL/DIFICIL/LETAL — fonte de verdade)
    expect(diff.textContent).toMatch(/TRIVIAL|FÁCIL|DIFICIL|LETAL/)
  })

  it('combate simples (Emboscada Goblin: 4 Goblin Batedor) também resolve', async () => {
    const emboscada = readDoc(EMBOSCADA_ID)
    const { container } = renderDoc(emboscada)
    await waitFor(() => {
      const roster = container.querySelector('.combat-roster')
      expect(roster).toBeTruthy()
      expect(within(roster as HTMLElement).getByText(/4×\s*Goblin Batedor/)).toBeTruthy()
    })
  })
})

describe('folha Campanhas/Combates: lista os combates (não o markdown do índice)', () => {
  it('lista Vila de Goblins e Emboscada Goblin como combates linkados', async () => {
    const { container } = renderFolder(compendiumFolderPath(COMBATES_FOLDER))
    // grade dedicada de combates (não a DocTable genérica)
    await waitFor(() => {
      expect(container.querySelector('.combat-grid')).toBeTruthy()
    })
    const cell = [...container.querySelectorAll<HTMLElement>('.combat-grid-cell')].find((c) =>
      within(c).queryByText('Vila de Goblins'),
    )
    expect(cell, 'célula da Vila de Goblins').toBeTruthy()
    expect(cell!.getAttribute('href')).toBe(docPath(VILA_ID))
    // Emboscada Goblin também aparece
    expect(
      [...container.querySelectorAll<HTMLElement>('.combat-grid-cell')].some((c) =>
        within(c).queryByText('Emboscada Goblin'),
      ),
    ).toBe(true)
  })

  it('cada card tem barrinhas de dificuldade e a ordem é fácil→difícil', async () => {
    const { container } = renderFolder(compendiumFolderPath(COMBATES_FOLDER))
    // espera os monstros resolverem (algum card com dificuldade > 0)
    await waitFor(() => {
      const difs = [...container.querySelectorAll<HTMLElement>('[data-enc-dif]')].map((c) =>
        Number(c.getAttribute('data-enc-dif')),
      )
      expect(difs.some((d) => d > 0)).toBe(true)
    })
    expect(container.querySelectorAll('.gm-enc-levelbar').length).toBeGreaterThan(1)
    const difs = [...container.querySelectorAll<HTMLElement>('[data-enc-dif]')].map((c) =>
      Number(c.getAttribute('data-enc-dif')),
    )
    expect(difs).toEqual([...difs].sort((a, b) => a - b))
  })
})
