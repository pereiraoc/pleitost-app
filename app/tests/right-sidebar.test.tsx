// @vitest-environment jsdom
// Sidebar direita (#87): face SESSÃO mostra o herói selecionado; empurrar um
// alvo pelo DetailContext renderiza na face DETALHES sem sair da tela.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail } from '../src/data/detail-context'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import {
  __resetSelectedCreatureForTests,
  setSelectedCreature,
} from '../src/data/selected-creature-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const KRASNOGOR_ID = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage?.clear()
  __resetSelectedCreatureForTests()
})
afterEach(() => {
  cleanup()
  __resetSelectedCreatureForTests()
})

function Opener({ id }: { id: string }) {
  const d = useDetail()!
  return <button onClick={() => d.open({ kind: 'doc', id })}>abrir doc</button>
}

function renderSidebar() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DetailProvider>
          <Opener id={KRASNOGOR_ID} />
          <RightSidebar drawerOpen onCloseDrawer={() => {}} />
        </DetailProvider>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#87 sidebar direita (Sessão / Detalhes)', () => {
  it('SESSÃO mostra o herói selecionado; abrir um doc renderiza nos DETALHES', async () => {
    setSelectedCreature(CARLOS_ID)
    const { container } = renderSidebar()
    const bar = container.querySelector('[data-right-sidebar]') as HTMLElement
    expect(bar).toBeTruthy()

    // face SESSÃO (padrão) mostra o Carlos selecionado
    await waitFor(() => expect(within(bar).getByText(/Carlos/)).toBeTruthy())

    // empurrar um doc → foca DETALHES e renderiza o doc (sem navegar)
    fireEvent.click(screen.getByText('abrir doc'))
    await waitFor(() => {
      const panel = bar.querySelector('[data-detail-kind="doc"]') as HTMLElement
      expect(panel).toBeTruthy()
      expect(within(panel).getByText('Krasnogor')).toBeTruthy()
    })
  })

  it('sem seleção, a SESSÃO mostra o vazio', () => {
    const { container } = renderSidebar()
    const bar = container.querySelector('[data-right-sidebar]') as HTMLElement
    expect(within(bar).getByText(/Nenhum personagem selecionado/)).toBeTruthy()
  })
})
