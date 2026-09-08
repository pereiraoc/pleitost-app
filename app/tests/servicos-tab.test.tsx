// @vitest-environment jsdom
// Aba SERVIÇOS de um local (v3): colapsável POR LUGAR (a cidade mostra cada
// bairro) e, dentro, POR ESTABELECIMENTO — PoI com Serviços ou tipo genérico
// do comércio de rua; transporte avulso não aparece; comprar grava no herói.
// Dataset REAL da POA como oráculo (pula se ausente).
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
import { parseOfertas, parseOfertasAgrupadas, rollOfertas } from '../src/recursos/ofertas'
import { comprarNoEstabelecimento } from '../src/recursos/comprar'
import { recursosDoFm } from '../src/recursos/hero-recursos'
import { __resetOfertasStoreForTests } from '../src/recursos/ofertas-store'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const heroesDir = path.join(appDir, 'tests', 'fixtures', 'heroes')
const CONCESSIONARIA = "Atlas/Porto Alegre/Passo D'Areia/Concessionária Gurgel"
const SUCATA = 'Atlas/Porto Alegre/Zona Deserta/Depósito de Sucata'
const BAIRRO = "Atlas/Porto Alegre/Passo D'Areia/Passo D'Areia"
const CIDADE = 'Atlas/Porto Alegre/Porto Alegre'
const temDataset = fs.existsSync(path.join(cyberDir, `${CONCESSIONARIA}.json`)) && fs.existsSync(path.join(cyberDir, 'Contexto/Recursos/Transporte/TRI Prata.json'))
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

function montar(doc: VaultDoc, Comp: typeof ServicosTab | typeof LocationSheet = ServicosTab) {
  return render(
    <MemoryRouter>
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <Comp doc={doc} />
        </DetailProvider>
      </CatalogProvider>
    </MemoryRouter>,
  )
}

describe('estabelecimentos da vault', () => {
  it('a concessionária lista Gurgel novos; o ferro-velho lista usados; o bairro lista comércio de rua por tipo', () => {
    if (!temDataset) return
    const campo = def.recursos!.ofertas.campo
    const conc = readDoc(CONCESSIONARIA)
    const of = parseOfertas(conc.frontmatter as Record<string, unknown>, campo)
    expect(of.map((o) => o.nome)).toContain('Gurgel Carajás')
    expect(of.every((o) => o.estado !== 'usado')).toBe(true)
    const suc = parseOfertas(readDoc(SUCATA).frontmatter as Record<string, unknown>, campo)
    expect(suc.find((o) => o.nome === 'Gurgel Carajás')?.estado).toBe('usado')
    // v4: o comércio de rua virou estabelecimento com dono — o bairro em si não lista mais ofertas
    expect(parseOfertasAgrupadas(readDoc(BAIRRO).frontmatter as Record<string, unknown>, campo)).toEqual([])
    expect(readDoc("Atlas/Porto Alegre/Passo D'Areia/Lancheria do Passo").frontmatter['Dono']).toBe('Seu Adair Bastos')
    const porNome = new Map(of.map((o) => o.nome).map((n) => [n, parseRecurso(readDoc(`Contexto/Recursos/Transporte/${n}`))!]))
    const rolado = rollOfertas(of, porNome, 'Grande Cidade', def.recursos!, 1000, 1, `${conc.id}|dia`)
    const carajas = rolado.find((o) => o.recurso.nome === 'Gurgel Carajás')!
    expect(carajas.preco).toBe(400000)
    expect(carajas.acao).toBe('comprar')
    expect(carajas.disponivel).toBe(true)
  })

  it('comprarNoEstabelecimento grava a posse e o saldo no herói; miudeza não registra', () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 200, { channel: 'imediato', origem: 'test' })
    const campo = def.recursos!.ofertas.campo
    const of = parseOfertas(readDoc(SUCATA).frontmatter as Record<string, unknown>, campo)
    const porNome = new Map(of.map((o) => o.nome).map((n) => [n, parseRecurso(readDoc(`Contexto/Recursos/Transporte/${n}`))!]))
    const oferta = rollOfertas(of, porNome, 'Pequena Cidade', def.recursos!, 1000, 0.7, 'x').find((o) => o.key === 'Gurgel Carajás#usado')!
    expect(oferta.preco).toBe(105000)
    const r = comprarNoEstabelecimento(CARLOS_ID, carlos, def.recursos!, 1000, oferta)
    expect(r.ok).toBe(true)
    expect(heroOuro(CARLOS_ID, carlos)).toBe(200 - 105)
    expect(recursosDoFm(currentFm(CARLOS_ID, carlos)).itens).toEqual([{ nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, estado: 'usado', pago: 105000 }])
    const r2 = comprarNoEstabelecimento(CARLOS_ID, carlos, def.recursos!, 1000, { ...oferta, preco: 400000 })
    expect(r2.ok).toBe(false)
    expect(heroOuro(CARLOS_ID, carlos)).toBe(95)
    // miudeza: sai do bolso, sem registro
    const polar = parseRecurso(readDoc('Contexto/Recursos/Alimentação/Polar Tradicional'))!
    const r3 = comprarNoEstabelecimento(CARLOS_ID, carlos, def.recursos!, 1000, { key: 'Polar Tradicional#', recurso: polar, qtd: 5, preco: 40, acao: 'miudeza', disponivel: true })
    expect(r3.ok).toBe(true)
    expect(heroOuro(CARLOS_ID, carlos)).toBe(95)
    expect(recursosDoFm(currentFm(CARLOS_ID, carlos)).itens.length).toBe(1)
  })

  it('num PoI: vitrine com quantidade e preço; sem comprador o botão fica desabilitado; LocationSheet ganha a aba', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    const conc = readDoc(CONCESSIONARIA)
    montar(conc)
    const linha = await screen.findByText('Gurgel Carajás', {}, { timeout: 15000 })
    const row = linha.closest('[data-oferta]') as HTMLElement
    expect(within(row).getByText('Cz$ 400.000')).toBeTruthy()
    expect(within(row).getByText(/^×\d+$/)).toBeTruthy()
    expect(within(row).getByText(/Cz\$ 3\.000 \/ mês de manutenção/)).toBeTruthy()
    // emoji por Tipo pela cascata dos links (seletor Tipo=Veículo do Obsidian)
    expect(linha.closest('a')?.getAttribute('data-link-icon')).toBe('🚗')
    expect(screen.getByText(/escolha um herói no topo direito/)).toBeTruthy()
    expect((within(row).getByText(/Comprar −Cz\$ 400\.000/).closest('button') as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    montar(conc, LocationSheet)
    expect(screen.getByRole('tab', { name: def.recursos!.ofertas.aba })).toBeTruthy()
  }, 30000)

  it('num bairro: um lugar com o comércio de rua (por tipo) e os estabelecimentos dentro; nada de transporte avulso', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    montar(readDoc(BAIRRO))
    await screen.findByText('Concessionária Gurgel', {}, { timeout: 15000 })
    const lugares = [...document.querySelectorAll('details[data-lugar]')].map((d) => d.getAttribute('data-lugar'))
    expect(lugares).toEqual(["Passo D'Areia"])
    const caixas = [...document.querySelectorAll('[data-estabelecimento]')].map((e) => e.getAttribute('data-estabelecimento'))
    expect(caixas).toContain('Lancheria do Passo')
    expect(caixas).toContain('Banca do Aeromóvel')
    expect(caixas).toContain('Moto Center Assis Brasil')
    expect(caixas).toContain('Concessionária Gurgel')
    expect(caixas).toContain("Zaffari do Passo D'Areia")
    expect(screen.getAllByText(/dono:/).length).toBeGreaterThan(3)
    expect(screen.queryByText(/Usar TRI/)).toBeNull()
    expect(screen.queryByText('Passagem de Ônibus')).toBeNull()
    expect(screen.queryByText('Aeromóvel Linha Popular')).toBeNull()
  }, 30000)

  it('na cidade: um <details> por bairro (colapsado), com os estabelecimentos dentro', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    montar(readDoc(CIDADE))
    await screen.findByText(/lugares · /, {}, { timeout: 20000 })
    const lugares = [...document.querySelectorAll('details[data-lugar]')]
    expect(lugares.length).toBeGreaterThan(10)
    expect(lugares.every((d) => !(d as HTMLDetailsElement).open)).toBe(true)
    // figura do recurso (ou emoji do Tipo) ao lado de cada oferta, como no Comércio
    expect(document.querySelectorAll('[data-oferta] [data-recurso-figura]').length).toBeGreaterThan(20)
    const bomFim = lugares.find((d) => d.getAttribute('data-lugar') === 'Bom Fim') as HTMLElement
    expect(within(bomFim).getByText('Bicicletaria do Alemão')).toBeTruthy()
    // a pensão aparece como estabelecimento E como marca da oferta de pernoite
    expect(within(bomFim).getAllByText('Pensão Farroupilha').length).toBeGreaterThan(0)
  }, 40000)
})
