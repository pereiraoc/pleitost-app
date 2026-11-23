// @vitest-environment jsdom
// Pedido do mestre (2026-11-23): "Corrige iluminada. […] Quero poder taggear
// lugares com comércio aberto sem consequências de população e tal." A nota
// Disponibilidade de Tesouros tem linha própria pra Iluminada (150/50/5%), mas
// a Localização é `subcategoria: Capital` (a população é de capital) e a loja
// rolava como Capital comum. A TAG `Comércio:` no FM do lugar escolhe a linha
// da régua da loja e vence a subcategoria, sem mexer no que ela significa.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { LocationSheet } from '../src/components/compendium/LocationSheet'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { localTypeOfDoc } from '../src/data/commerce'
import { __resetCommerceStoreForTests, getShopState, setShopRoll } from '../src/data/commerce-store'
import { __resetSettingsForTests } from '../src/settings'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const ILUMINADA = 'Atlas/Mundo Livre/Federação Áurea/Campos do Provento/Iluminada'
const TORRE = 'Atlas/Mundo Livre/Federação Áurea/Campos do Provento/Torre dos Magos'

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

describe('tag Comércio: escolhe a linha da régua e vence a subcategoria', () => {
  it('Capital com Comércio: Iluminada → Iluminada; tag inválida não apaga a subcategoria', () => {
    expect(localTypeOfDoc({ subtype: 'Capital', frontmatter: { 'Comércio': 'Iluminada' } })).toBe('Iluminada')
    expect(localTypeOfDoc({ subtype: 'Capital', frontmatter: { 'Comércio': 'Mega' } })).toBe('Capital')
    expect(localTypeOfDoc({ subtype: 'Capital', frontmatter: { 'Comércio': '' } })).toBe('Capital')
  })

  it('Ponto de Interesse (sem população de cidade) abre comércio pela tag', () => {
    expect(localTypeOfDoc({ subtype: 'Ponto de Interesse', frontmatter: {} })).toBe(null)
    expect(localTypeOfDoc({ subtype: 'Ponto de Interesse', frontmatter: { 'Comércio': 'Capital' } })).toBe('Capital')
    // a Torre dos Magos da vault ainda não tem a tag (o mestre marca depois)
    expect(readDoc(TORRE).subtype).toBe('Ponto de Interesse')
  })

  it('vault: Iluminada continua Capital na subcategoria e rola na linha Iluminada', () => {
    const doc = readDoc(ILUMINADA)
    expect(doc.subtype).toBe('Capital')
    expect(localTypeOfDoc(doc)).toBe('Iluminada')
  })
})

describe('RE-ROLAR usa a linha ATUAL do lugar, não a da rolagem salva', () => {
  it('loja salva como Capital → o mestre re-rola e passa a valer Iluminada', async () => {
    const doc: VaultDoc = {
      ...readDoc(ILUMINADA),
      frontmatter: { ...readDoc(ILUMINADA).frontmatter, 'Comércio': 'Iluminada' },
    }
    setShopRoll(doc.id, { pronta: [], encomenda: [] }, 'Capital')
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <LocationSheet doc={doc} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Comércio' }))
    const rerolar = await screen.findByRole('button', { name: 'RE-ROLAR' })
    await waitFor(() => expect((rerolar as HTMLButtonElement).disabled).toBe(false), { timeout: 20000 })
    fireEvent.click(rerolar)
    expect(getShopState(doc.id)?.localType).toBe('Iluminada')
  }, 40000)
})
