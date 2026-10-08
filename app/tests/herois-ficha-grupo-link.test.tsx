// @vitest-environment jsdom
// Report 2026-10-08: com a página HERÓIS já aberta (aba CONTRATADOS), o botão
// FICHA DO GRUPO da sessão troca a URL pra ?grupo=… mas a tela não mudava — a
// aba só era lida de `?grupo` na montagem.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const GRUPO = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

describe('HERÓIS: FICHA DO GRUPO com a página já aberta', () => {
  it('?grupo= chegando depois da montagem abre a aba GRUPOS', async () => {
    const { container, getByText } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/herois']}>
          <Link to={`/herois?grupo=${encodeURIComponent(GRUPO)}`}>abrir grupo</Link>
          <Routes>
            <Route path="/herois" element={<HeroisPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(container.querySelector('.npc-tab.on')!.textContent).toMatch(/CONTRATADOS|HER/)
    fireEvent.click(getByText('abrir grupo'))
    await waitFor(() => expect(container.querySelector('.npc-tab.on')!.textContent).toBe('GRUPOS'))
  })
})
