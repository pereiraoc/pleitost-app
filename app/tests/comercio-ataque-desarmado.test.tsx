// @vitest-environment jsdom
// Report 2026-09-08: "continua aparecendo Ataque Desarmado em comércios" — a
// loja rolada ANTES do filtro de armas sem mão ficou salva por local; agora o
// filtro vale na LEITURA (ComercioTab) e não só na rolagem. Canto Alto real +
// loja semeada no store com o combo velho.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { LocationSheet } from '../src/components/compendium/LocationSheet'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { __resetCommerceStoreForTests, setShopRoll } from '../src/data/commerce-store'
import { __resetSettingsForTests } from '../src/settings'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const cantoAlto = readDoc('Atlas/Mundo Livre/Principado das Flores/Canto Alto')
const DESARMADO = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Ataque Desarmado'
const ADAGA = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
beforeEach(() => {
  __resetCommerceStoreForTests()
  __resetSettingsForTests()
  for (const k of Object.keys({ ...localStorage })) if (k.startsWith('pleitost.commerce.')) localStorage.removeItem(k)
})
afterEach(cleanup)

describe('Ataque Desarmado fora da vitrine', () => {
  it('índice: a arma sem mão está marcada (mãos 0) e a Adaga não', () => {
    expect(catalog.entryById.get(DESARMADO)?.maos).toBe(0)
    expect(catalog.entryById.get(ADAGA)?.maos).toBe(1)
  })
  it('loja SALVA com o combo velho: o combo some na leitura, a Adaga fica', async () => {
    setShopRoll(
      cantoAlto.id,
      {
        pronta: [
          { key: `${DESARMADO}|obra-prima`, nome: 'Ataque Desarmado Obra-prima', label: 'Ataque Desarmado Obra-prima', tier: 'A', quantidade: 1, preco: 10, armaTarget: DESARMADO, propriedadeBase: 'Arma Obra-prima' },
          { key: `${ADAGA}|obra-prima`, nome: 'Adaga Obra-prima', label: 'Adaga Obra-prima', tier: 'A', quantidade: 1, preco: 10, armaTarget: ADAGA, propriedadeBase: 'Arma Obra-prima' },
        ],
        encomenda: [{ key: `${DESARMADO}|obra-prima|E`, label: 'Ataque Desarmado Obra-prima', tier: 'E', preco: 40, armaTarget: DESARMADO, propriedadeBase: 'Arma Obra-prima' }],
      },
      'Grande Cidade',
    )
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <LocationSheet doc={cantoAlto} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Comércio' }))
    await screen.findByText(/Adaga Obra-prima/, {}, { timeout: 15000 })
    expect(screen.queryByText(/Ataque Desarmado/)).toBeNull()
  }, 30000)
})
