// @vitest-environment jsdom
// Report e5067c43: "Combate/tesouros não está mostrando os itens de forma que
// se eu clicar no nome, ele abre no painel da direita em detalhes de forma
// completa" — o nome do tesouro no painel TESOUROS do Combate agora é
// clicável e abre o doc COMPLETO nos detalhes (kind 'doc' → DocView, que
// renderiza carta + corpo da nota). Carlos real como oráculo.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail } from '../src/data/detail-context'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

/** Espião do painel de detalhes: expõe o alvo aberto. */
const alvo: { atual: { kind: string; id: string } | null } = { atual: null }
function EspiaoDetail() {
  const d = useDetail()
  alvo.atual = d?.target ?? null
  return null
}

describe('report e5067c43 — tesouro do combate abre nos detalhes (doc completo)', () => {
  it('clicar no nome do Anel da Resistência abre kind=doc com o id do tesouro', async () => {
    alvo.atual = null
    render(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Routes>
          </MemoryRouter>
          <EspiaoDetail />
        </DetailProvider>
      </CatalogProvider>,
    )
    const tabs = await screen.findAllByText('TESOUROS')
    fireEvent.click(tabs.find((el) => el.closest('button'))!)
    const nome = await screen.findByText('Anel da Resistência (A)')
    expect(nome.style.cursor).toBe('pointer')
    fireEvent.click(nome)
    expect(alvo.atual?.kind).toBe('doc')
    expect(alvo.atual?.id).toContain('Anel da Resistência')
  }, 30000)
})
