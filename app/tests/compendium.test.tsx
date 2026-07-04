// @vitest-environment jsdom
// Componentes do compêndio renderizando sobre o índice REAL da vault.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { TypeGrid } from '../src/components/compendium/TypeGrid'
import { DocList } from '../src/components/compendium/DocList'
import { compendiumTypePath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(
  fs.readFileSync(path.join(path.dirname(appDir), 'vault-data', 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

afterEach(cleanup)

describe('TypeGrid', () => {
  it('mostra um card por tipo do byType, com a contagem real', () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <TypeGrid />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const cards = screen.getAllByRole('link')
    expect(cards).toHaveLength(Object.keys(manifest.byType).length)
    for (const [type, count] of Object.entries(manifest.byType)) {
      const card = cards.find((c) => within(c).queryByText(type))
      expect(card, `card do tipo ${type}`).toBeDefined()
      expect(within(card!).getByText(String(count))).toBeTruthy()
    }
  })
})

describe('DocList', () => {
  it('lista todos os docs de um tipo sem colunas (nomes vêm do índice)', () => {
    // um tipo real sem config de colunas
    const type = Object.keys(manifest.byType).find(
      (t) => t !== 'Item' && manifest.byType[t] <= 30,
    )!
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[compendiumTypePath(type)]}>
          <Routes>
            <Route path="/compendio/:type" element={<DocList />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const expected = catalog.docsByType.get(type)!
    // toda entrada vira um link com o basename
    for (const entry of expected) {
      expect(
        screen.getAllByRole('link', { name: entry.basename }).length,
        entry.id,
      ).toBeGreaterThan(0)
    }
  })
})
