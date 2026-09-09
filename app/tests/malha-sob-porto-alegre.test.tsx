// @vitest-environment jsdom
// Malha de Transportes mudou de Contexto/ pra Atlas/Porto Alegre/ (2026-09-08):
// as paradas são dos bairros, então a malha mora dentro da cidade. A página de
// uma Localização não repete as subpastas-lugares (AtlasChildren já lista os
// bairros), mas uma subpasta que NÃO é lugar — a malha — precisa continuar
// aparecendo como card, igual aparecia dentro de Contexto.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'Atlas/Porto Alegre/Malha de Transportes/Malha de Transportes.json'))

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

function renderFolder(folderPath: string) {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const catalog = buildCatalog(manifest)
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter initialEntries={[compendiumFolderPath(folderPath)]}>
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('Malha de Transportes dentro de Porto Alegre', () => {
  it('a página de Porto Alegre mostra a malha como card de subpasta, sem repetir os bairros', async () => {
    if (!temDataset) return
    const { container } = renderFolder('Atlas/Porto Alegre')
    await waitFor(() => expect(screen.getAllByText(/LUGARES DENTRO DE PORTO ALEGRE/i).length).toBeGreaterThan(0), { timeout: 15000 })
    const cards = Array.from(container.querySelectorAll('.type-card')).map((el) => el.querySelector('.type-card-name')?.textContent ?? el.textContent ?? '')
    expect(cards).toContain('Malha de Transportes')
    expect(cards).not.toContain('Bom Fim') // bairro é "lugar dentro", não card de pasta
    const link = Array.from(container.querySelectorAll('a.type-card')).find((a) => a.textContent?.includes('Malha de Transportes')) as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('Atlas/Porto%20Alegre/Malha%20de%20Transportes')
  }, 30000)

  it('a pasta da malha abre com os modos como cards (Aeromóvel, Ônibus…)', async () => {
    if (!temDataset) return
    const { container } = renderFolder('Atlas/Porto Alegre/Malha de Transportes')
    await waitFor(() => expect(container.querySelectorAll('.type-card').length).toBeGreaterThan(3), { timeout: 15000 })
    const cards = Array.from(container.querySelectorAll('.type-card-name')).map((el) => el.textContent)
    expect(cards).toContain('Aeromóvel')
    expect(cards).toContain('Ônibus')
  }, 30000)
})
