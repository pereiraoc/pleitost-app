// @vitest-environment jsdom
// #89: info do LOCAL na sidebar DETALHES + "Ver comércio" abre a loja ali mesmo
// (comprador = herói selecionado).
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
const CANTO_ALTO_ID = 'Atlas/Mundo Livre/Principado das Flores/Canto Alto'

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

function Opener() {
  const d = useDetail()!
  return <button onClick={() => d.open({ kind: 'local', id: CANTO_ALTO_ID })}>abrir local</button>
}

describe('#89 local + comércio na sidebar direita', () => {
  it('abrir LOCAL → info; "Ver comércio" → loja no mesmo painel', async () => {
    setSelectedCreature(CARLOS_ID)
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DetailProvider>
            <Opener />
            <RightSidebar drawerOpen onCloseDrawer={() => {}} />
          </DetailProvider>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const bar = container.querySelector('[data-right-sidebar]') as HTMLElement

    fireEvent.click(screen.getByText('abrir local'))
    // info do local na face DETALHES
    await waitFor(() => {
      const panel = bar.querySelector('[data-detail-kind="local"]') as HTMLElement
      expect(panel).toBeTruthy()
      expect(within(panel).getByText('Canto Alto')).toBeTruthy()
    })

    // "Ver comércio" abre a loja no MESMO painel
    fireEvent.click(bar.querySelector('[data-ver-comercio]') as HTMLElement)
    await waitFor(() => {
      expect(bar.querySelector('[data-detail-kind="comercio"]')).toBeTruthy()
      expect(within(bar).getAllByText(/LOJA/).length).toBeGreaterThan(0)
    })
  })
})
