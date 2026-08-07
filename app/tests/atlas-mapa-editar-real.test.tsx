// @vitest-environment jsdom
// Report "não to conseguindo editar" (#422): edição por pintura sobre o blob
// REAL do mestre (fixtures/mapa-atlas-mestre.json — 3 regiões migradas com
// cells+aneis). Garante que a migração do sanitize + ✎ + toggle funcionam
// sobre os dados de produção, não só sobre fixtures sintéticas.
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AtlasMapaPage } from '../src/components/compendium/AtlasMapaPage'
import { atlasHexCenter } from '../src/map/atlas-grid'
import {
  __resetMapaAtlasForTests,
  __setSeedMapaAtlasForTests,
  getMapaAtlas,
} from '../src/map/mapa-atlas-store'
import { __resetSettingsForTests } from '../src/settings'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const BLOB = JSON.parse(fs.readFileSync(path.join(appDir, 'tests/fixtures/mapa-atlas-mestre.json'), 'utf8'))

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, clear: () => data.clear(), getItem: (k: string) => data.get(k) ?? null, key: (i: number) => [...data.keys()][i] ?? null, removeItem: (k: string) => void data.delete(k), setItem: (k: string, v: string) => void data.set(k, String(v)) }
}
beforeAll(() => {
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  __setSeedMapaAtlasForTests(null)
  window.localStorage.clear()
  window.localStorage.setItem('pleitost.mapaAtlas', JSON.stringify(BLOB))
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetMapaAtlasForTests()
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => { cleanup(); setLiveSession(null) })

it('repro: mestre com o blob real → ✎ → tap num hex adiciona à região', async () => {
  const { container } = render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/mapa']}>
        <Routes><Route path="/mapa" element={<AtlasMapaPage />} /></Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
  await screen.findByAltText('Mapa do mundo')
  console.log('regioes carregadas:', getMapaAtlas().regioes.map((r) => `${r.nome}:${r.cells.length}`))
  const editBtn = screen.getByLabelText('Editar hexes de Magna Pátria')
  fireEvent.click(editBtn)
  await screen.findByText('✓ CONCLUIR EDIÇÃO')
  // mocka o rect e toca numa célula QUE PERTENCE à região (independente da
  // geografia do blob, que o mestre segue ajustando): tap remove, tap devolve.
  const W = 744, H = 526.2
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  mapa.getBoundingClientRect = () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }) as DOMRect
  const regiao = () => getMapaAtlas().regioes.find((r) => r.nome === 'Magna Pátria')!
  const antes = regiao().cells.length
  const alvo = regiao().cells[0]!
  const c = atlasHexCenter(alvo.col, alvo.row)
  const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
  fireEvent.click(viewport, { clientX: c.x / 10, clientY: c.y / 10 })
  await waitFor(() => expect(regiao().cells.length).toBe(antes - 1))
  fireEvent.click(viewport, { clientX: c.x / 10, clientY: c.y / 10 })
  await waitFor(() => {
    expect(regiao().cells.length).toBe(antes)
    expect(regiao().cells.some((x) => x.col === alvo.col && x.row === alvo.row)).toBe(true)
  })
}, 30000)
