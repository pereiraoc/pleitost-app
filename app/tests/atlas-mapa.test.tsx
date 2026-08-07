// @vitest-environment jsdom
// Mapa do mundo (fase 1 do atlas completo — pedido do mestre): visualizador
// pan/zoom em /mapa com o atlas.webp (mundo inteiro) e card de entrada na
// RAIZ do Atlas no compêndio. O overlay (atlas-overlay.webp) é deployado
// junto mas NÃO renderiza — vira o gating por região do GM na fase 2. A
// exploração (grade do Mundo Livre + trilhas) fica intocada.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AtlasMapaPage, ATLAS_MAPA_ASSET, ATLAS_OVERLAY_ASSET } from '../src/components/compendium/AtlasMapaPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { buildAssetIndex, resolveAsset } from '../src/data/assets'
import { __setSeedMapaAtlasForTests, __resetMapaAtlasForTests } from '../src/map/mapa-atlas-store'
import type { AssetsManifest, IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const assets = buildAssetIndex(
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8')) as AssetsManifest,
)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  __setSeedMapaAtlasForTests(null)
  __resetMapaAtlasForTests()
})
afterEach(cleanup)

describe('mapa do mundo — assets e visualizador', () => {
  it('atlas.webp e atlas-overlay.webp estão no manifest de assets', () => {
    expect(resolveAsset(assets, ATLAS_MAPA_ASSET)?.path).toBe(ATLAS_MAPA_ASSET)
    expect(resolveAsset(assets, ATLAS_OVERLAY_ASSET)?.path).toBe(ATLAS_OVERLAY_ASSET)
  })

  it('/mapa renderiza o mapa (pan/zoom) e NÃO renderiza o overlay (fase 2)', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/mapa']}>
          <Routes>
            <Route path="/mapa" element={<AtlasMapaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const img = (await screen.findByAltText('Mapa do mundo')) as HTMLImageElement
    expect(decodeURIComponent(img.src)).toContain('Mapas/atlas.webp')
    // overlay deployado mas invisível até o gating por região (fase 2)
    const overlays = document.querySelectorAll('img[src*="atlas-overlay"]')
    expect(overlays.length).toBe(0)
    // controles compartilhados do mapa (zoom/fullscreen, issue #80) presentes
    expect(document.querySelector('[data-map-controls]')).toBeTruthy()
  })
})

describe('mapa do mundo — entrada na raiz do Atlas', () => {
  function renderFolder(initial: string) {
    return render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }

  it('raiz do Atlas EMBUTE o mapa (sem card intermediário)', async () => {
    renderFolder('/compendio/Atlas')
    // o mapa renderiza inline; não há mais o card "🗺️ Mapa do Mundo"
    const img = (await screen.findByAltText('Mapa do mundo')) as HTMLImageElement
    expect(decodeURIComponent(img.src)).toContain('Mapas/atlas.webp')
    expect(screen.queryByText('🗺️ Mapa do Mundo')).toBeNull()
  })

  it('trap reverso: subpasta (Mundo Livre) NÃO embute o mapa', async () => {
    renderFolder('/compendio/Atlas/Mundo Livre')
    await screen.findAllByText(/Mundo Livre/)
    expect(document.querySelector('img[alt="Mapa do mundo"]')).toBeNull()
  })
})
