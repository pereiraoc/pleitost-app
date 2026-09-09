// @vitest-environment jsdom
// A MALHA são LINHAS, não lugares (2026-09-09): as notas `categoria: Linha`
// moram em Contexto/Recursos/Transporte, agrupadas por modo; as PARADAS é que
// são lugares do Atlas, dentro de cada bairro. Quem abre a pasta das linhas
// quer o MAPA, então a pasta manda pra aba TRANSPORTE do herói selecionado.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { FolderView } from '../src/components/compendium/FolderView'
import { compendiumFolderPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'
import type { ContextoDef } from '../src/data/context-def'
import { setActiveContexto } from '../src/data/reskin'
import { setSelectedCreature, __resetSelectedCreatureForTests } from '../src/data/selected-creature-store'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const PASTA = 'Contexto/Recursos/Transporte'
const temDataset = fs.existsSync(path.join(cyberDir, `${PASTA}/Malha de Transportes.json`))
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
  __resetSelectedCreatureForTests()
})

function montar(folderPath: string) {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  return render(
    <CatalogProvider catalog={buildCatalog(manifest)}>
      <DetailProvider>
        <MemoryRouter initialEntries={[compendiumFolderPath(folderPath)]}>
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
            <Route path="/heroi/*" element={<div data-rota-heroi />} />
          </Routes>
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('a malha mora em Recursos/Transporte e leva à aba TRANSPORTE', () => {
  it('as linhas não estão mais no Atlas', () => {
    if (!temDataset) return
    expect(fs.existsSync(path.join(cyberDir, 'Atlas/Porto Alegre/Malha de Transportes'))).toBe(false)
    // e continuam agrupadas por modo
    expect(fs.existsSync(path.join(cyberDir, `${PASTA}/Aeromóvel`))).toBe(true)
    expect(fs.existsSync(path.join(cyberDir, `${PASTA}/Ônibus`))).toBe(true)
  })

  it('abrir a pasta das linhas manda pro mapa na ficha do herói selecionado', async () => {
    if (!temDataset) return
    const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
    setActiveContexto(def)
    setSelectedCreature(CARLOS_ID)
    const { container } = montar(PASTA)
    await waitFor(() => expect(container.querySelector('[data-rota-heroi]')).not.toBeNull(), { timeout: 15000 })
  }, 30000)

  it('sem herói selecionado, a pasta abre normal (os modos como cards)', async () => {
    if (!temDataset) return
    const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
    setActiveContexto(def)
    const { container } = montar(PASTA)
    await waitFor(() => expect(container.querySelectorAll('.type-card').length).toBeGreaterThan(3), { timeout: 15000 })
    const cards = Array.from(container.querySelectorAll('.type-card-name')).map((el) => el.textContent)
    expect(cards).toContain('Aeromóvel')
    expect(container.querySelector('[data-rota-heroi]')).toBeNull()
  }, 30000)
})
