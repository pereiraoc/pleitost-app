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

describe('Heróis e NPCs (telas do design com dados reais)', () => {
  it('HERÓIS: um card desenhado por herói, com Classe do frontmatter', async () => {
    renderAt('/herois', <Route path="/herois" element={<HeroisPage />} />)
    const herois = catalog.folderByPath
      .get('Sistema/Criaturas/Heróis')!
      .docs.filter((d) => d.basename !== 'Heróis')
    for (const entry of herois) {
      // card do design é um button com nome + classe + NVL
      expect(
        screen.getAllByRole('button', { name: new RegExp(entry.basename!.slice(0, 6)) }).length,
        entry.id,
      ).toBeGreaterThan(0)
    }
    // classe alias do FM real (Adriann → Mago) aparece após o load
    expect(await screen.findAllByText('Mago')).toBeTruthy()
    expect(screen.getAllByText('NVL').length).toBe(herois.length)
  })

  it('NPCS: abas do design; bestiário com cards; PESSOAS vazio com o texto desenhado', async () => {
    renderAt('/npcs', <Route path="/npcs" element={<NpcsPage />} />)
    for (const label of ['PESSOAS', 'COMPANHEIROS ANIMAIS', 'BESTIÁRIO']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    // cards do bestiário (subtítulo composto de Raça/Classe reais)
    expect(await screen.findAllByText(/Goblin \(Pequeno\)/)).toBeTruthy()
    // aba sem pasta na vault mostra o empty state verbatim do design
    expect(screen.getByText('// NENHUM REGISTRO NESTA CATEGORIA')).toBeTruthy()
    // heróis não aparecem em NPCS
    expect(screen.queryByText('Adriann')).toBeNull()
  })
})
