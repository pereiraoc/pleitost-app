// @vitest-environment jsdom
// Aba SERVIÇOS de um local (2026-09-07b): vitrine dos estabelecimentos com
// quantidade/disponibilidade pela régua e compra no herói selecionado; a
// compra pura (comprarNoEstabelecimento) grava no store do herói. Dataset
// REAL da POA como oráculo (pula se ausente).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { __resetHeroStoreMemoryForTests, writeHeroEdit } from '../src/data/hero-store'
import { heroOuro, currentFm } from '../src/data/purchase'
import { ServicosTab } from '../src/components/compendium/ServicosTab'
import { LocationSheet } from '../src/components/compendium/LocationSheet'
import { parseRecurso } from '../src/recursos/parse-recurso'
import { parseOfertas, rollOfertas } from '../src/recursos/ofertas'
import { comprarNoEstabelecimento } from '../src/recursos/comprar'
import { recursosDoFm } from '../src/recursos/hero-recursos'
import { __resetOfertasStoreForTests } from '../src/recursos/ofertas-store'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const heroesDir = path.join(appDir, 'tests', 'fixtures', 'heroes')
const CONCESSIONARIA = "Atlas/Porto Alegre/Passo D'Areia/Concessionária Gurgel"
const SUCATA = 'Atlas/Porto Alegre/Zona Deserta/Depósito de Sucata'
const temDataset = fs.existsSync(path.join(cyberDir, `${CONCESSIONARIA}.json`))
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

const readDoc = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

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

let catalog: ReturnType<typeof buildCatalog>
let def: ContextoDef
let carlos: VaultDoc

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  if (!temDataset) return
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  catalog = { ...buildCatalog(manifest), contextoDef: def }
  carlos = JSON.parse(fs.readFileSync(path.join(heroesDir, 'Carlos Facão de Andradas.json'), 'utf8')) as VaultDoc
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
  __resetOfertasStoreForTests()
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

describe('estabelecimentos da vault', () => {
  it('a concessionária lista Gurgel novos; o ferro-velho lista usados; a linha vem do bairro', () => {
    if (!temDataset) return
    const conc = readDoc(CONCESSIONARIA)
    const of = parseOfertas(conc.frontmatter as Record<string, unknown>, def.recursos!.ofertas.campo)
    expect(of.map((o) => o.nome)).toContain('Gurgel Carajás')
    expect(of.every((o) => o.estado !== 'usado')).toBe(true)
    const suc = parseOfertas(readDoc(SUCATA).frontmatter as Record<string, unknown>, def.recursos!.ofertas.campo)
    expect(suc.find((o) => o.nome === 'Gurgel Carajás')?.estado).toBe('usado')
    // rolagem sobre as notas reais
    const porNome = new Map(of.map((o) => o.nome).map((n) => [n, parseRecurso(readDoc(`Contexto/Recursos/Transporte/${n}`))!]))
    const rolado = rollOfertas(of, porNome, 'Grande Cidade', def.recursos!, 1000, 1, `${conc.id}|dia`)
    const carajas = rolado.find((o) => o.recurso.nome === 'Gurgel Carajás')!
    expect(carajas.preco).toBe(400000)
    expect(carajas.acao).toBe('comprar')
    expect(carajas.disponivel).toBe(true) // nível 5 em Grande Cidade [2,5]
  })

  it('comprarNoEstabelecimento grava o item e o ouro no herói (vault id + store)', () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 200, { channel: 'imediato', origem: 'test' })
    const suc = readDoc(SUCATA)
    const of = parseOfertas(suc.frontmatter as Record<string, unknown>, def.recursos!.ofertas.campo)
    const porNome = new Map(of.map((o) => o.nome).map((n) => [n, parseRecurso(readDoc(`Contexto/Recursos/Transporte/${n}`))!]))
    const oferta = rollOfertas(of, porNome, 'Pequena Cidade', def.recursos!, 1000, 0.7, 'x').find((o) => o.key === 'Gurgel Carajás#usado')!
    expect(oferta.preco).toBe(105000)
    const r = comprarNoEstabelecimento(CARLOS_ID, carlos, def.recursos!, 1000, oferta, { mult: 0.7 })
    expect(r.ok).toBe(true)
    expect(heroOuro(CARLOS_ID, carlos)).toBe(200 - 105)
    expect(recursosDoFm(currentFm(CARLOS_ID, carlos)).itens).toEqual([{ nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, estado: 'usado', pago: 105000 }])
    // sem ouro: nega sem gravar
    const r2 = comprarNoEstabelecimento(CARLOS_ID, carlos, def.recursos!, 1000, { ...oferta, preco: 400000 }, { mult: 1 })
    expect(r2.ok).toBe(false)
    expect(heroOuro(CARLOS_ID, carlos)).toBe(95)
  })

  it('ServicosTab renderiza a vitrine com quantidade, preço e pedido de comprador; LocationSheet ganha a aba', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    const conc = readDoc(CONCESSIONARIA)
    render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <ServicosTab doc={conc} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    const linha = await screen.findByText('Gurgel Carajás', {}, { timeout: 15000 })
    const row = linha.closest('[data-oferta]') as HTMLElement
    expect(within(row).getByText('Cz$ 400.000')).toBeTruthy()
    expect(within(row).getByText(/^×\d+$/)).toBeTruthy()
    expect(screen.getByText(/escolha um herói no topo direito/)).toBeTruthy()
    expect((within(row).getByText(/Comprar −Cz\$ 400\.000/).closest('button') as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <LocationSheet doc={conc} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('tab', { name: def.recursos!.ofertas.aba })).toBeTruthy()
  }, 30000)
})
