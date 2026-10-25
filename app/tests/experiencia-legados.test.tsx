// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)


beforeAll(() => {
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

function renderFicha(id: string, tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

// REGISTROS DE LEGADOS (2026-10-25): na EXPERIÊNCIA, acima dos Registros de
// Reconhecimentos — linhas { Região, texto } (FM Experiencia.Legados), que só
// se marcam a partir do nível 7.
const MERA_ID = 'Sistema/Criaturas/Heróis/Mera' // nível 7
const LEONEL_ID = 'Sistema/Criaturas/Heróis/Leonel Bravolla' // nível 3

describe('Registros de Legados', () => {
  it('aparece acima dos Reconhecimentos e, no nível 7, edita Região + texto', async () => {
    renderFicha(MERA_ID)
    fireEvent.click(await screen.findByText('EXPERIÊNCIA'))
    const leg = await screen.findByText('Registros de Legados')
    const rec = screen.getByText('Registros de Reconhecimentos')
    expect(leg.compareDocumentPosition(rec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Alterar legados' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar legado' }))
    const regiao = screen.getByLabelText('Legado 1 região') as HTMLSelectElement
    expect([...regiao.options].map((o) => o.textContent)).toContain('Pedra Fina')
    fireEvent.change(regiao, { target: { value: '[[Pedra Fina]]' } })
    fireEvent.change(screen.getByLabelText('Legado 1 texto'), { target: { value: 'Salvou Baar\'Shava' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concluir legados' }))
    expect(screen.getByText('Pedra Fina')).toBeTruthy()
    expect(screen.getByText("Salvou Baar'Shava")).toBeTruthy()
  })

  it('antes do nível 7 fica travado', async () => {
    renderFicha(LEONEL_ID)
    fireEvent.click(await screen.findByText('EXPERIÊNCIA'))
    expect(await screen.findByText('Registros de Legados')).toBeTruthy()
    expect(screen.getByText(/a partir do nível 7/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Alterar legados' })).toBeNull()
  })
})
