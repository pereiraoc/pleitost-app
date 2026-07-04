// @vitest-environment jsdom
// Navegação por pastas + heróis/NPCs renderizando sobre o índice REAL da
// vault; fetch stubado lê os JSONs do disco (mesma fonte do dev server).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import { COMPENDIUM_SECTIONS, visibleCount } from '../src/components/compendium/sections'
import { compendiumFolderPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  // serve /vault-data/** do disco, como o dev server faz (objeto plain em vez
  // de Response — o ambiente jsdom não garante o global do node)
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
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

function renderAt(initialPath: string, routes: React.ReactElement) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const folderRoutes = (
  <>
    <Route path="/compendio" element={<FolderView />} />
    <Route path="/compendio/*" element={<FolderView />} />
  </>
)

describe('FolderView', () => {
  it('raiz mostra as seções registradas com contagens visíveis', () => {
    renderAt('/compendio', folderRoutes)
    for (const section of COMPENDIUM_SECTIONS) {
      const node = catalog.folderByPath.get(section)!
      const card = screen
        .getAllByRole('link')
        .find((c) => within(c).queryByText(section))
      expect(card, `card da seção ${section}`).toBeDefined()
      expect(within(card!).getByText(String(visibleCount(node)))).toBeTruthy()
    }
  })

  it('Sistema mostra subpastas mas esconde Criaturas', () => {
    renderAt(compendiumFolderPath('Sistema'), folderRoutes)
    for (const name of ['Criação de Personagem', 'Equipamento', 'Regras']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    expect(screen.queryByText('Criaturas')).toBeNull()
  })

  it('pasta homogênea de Itens vira tabela com colunas dos inline fields', async () => {
    renderAt(
      compendiumFolderPath('Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples'),
      folderRoutes,
    )
    expect(screen.getByRole('columnheader', { name: 'dano' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Adaga' })).toBeTruthy()
    expect((await screen.findAllByText('d4+2')).length).toBeGreaterThan(0)
  })

  it('pasta oculta responde como não encontrada', () => {
    renderAt(compendiumFolderPath('Sistema/Criaturas'), folderRoutes)
    expect(screen.getByText(/não encontrada/)).toBeTruthy()
  })
})

describe('Heróis e NPCs', () => {
  it('HERÓIS lista todos os docs de Sistema/Criaturas/Heróis', async () => {
    renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    const herois = catalog.folderByPath.get('Sistema/Criaturas/Heróis')!
    for (const entry of herois.docs) {
      expect(screen.getAllByRole('link', { name: entry.basename }).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('columnheader', { name: 'Nível' })).toBeTruthy()
  })

  it('NPCS agrupa as demais subpastas de Criaturas (Bestiário etc.)', () => {
    renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    const criaturas = catalog.folderByPath.get('Sistema/Criaturas')!
    const groups = criaturas.folders.filter((f) => f.name !== 'Heróis')
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      expect(screen.getByRole('heading', { name: group.name })).toBeTruthy()
    }
    expect(screen.queryByRole('heading', { name: 'Heróis' })).toBeNull()
  })
})
