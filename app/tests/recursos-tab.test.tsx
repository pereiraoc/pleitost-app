// @vitest-environment jsdom
// Aba RECURSOS v3 (2026-09-08): custo de vida numa tela só — três seções
// colapsáveis (ordem do contexto) que mostram o total do eixo mesmo fechadas;
// dentro, os planos em lista vertical (linha-rádio, valor alinhado) e a
// POSSE com a manutenção da nota; total do mês + fechar o mês no topo. Sem
// "ouro", sem número de classe, sem estoque, sem saldo de TRI. Dataset REAL
// da POA como oráculo (pula se ausente).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import { abaFichaVisivel } from '../src/data/familia'
import { CHAR_TABS, TITLES } from '../src/components/layout/design-nav'
import { RecursosTab } from '../src/components/ficha/RecursosTab'
import { RECURSOS_FM } from '../src/recursos/hero-recursos'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const heroesDir = path.join(appDir, 'tests', 'fixtures', 'heroes')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json')) && fs.existsSync(path.join(cyberDir, 'Contexto/Recursos/Transporte/TRI Prata.json'))

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
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

function montar() {
  return render(
    <MemoryRouter>
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <RecursosTab doc={carlos} />
        </DetailProvider>
      </CatalogProvider>
    </MemoryRouter>,
  )
}
const custoMes = () => (document.querySelector('[data-custo-mes]') as HTMLElement).dataset.custoMes
const eixo = (papel: string) => document.querySelector(`[data-eixo="${papel}"]`) as HTMLElement
const valorEixo = (papel: string) => (eixo(papel).querySelector('[data-eixo-valor]') as HTMLElement).dataset.eixoValor

describe('gate da aba RECURSOS', () => {
  it('CHAR_TABS/TITLES declaram a aba logo abaixo de ANOTAÇÕES; visível só com recursos no contexto', () => {
    const ids = CHAR_TABS.map((t) => t.id)
    expect(ids.indexOf('recursos')).toBe(ids.indexOf('anotacoes') + 1)
    expect(TITLES.recursos).toBe('RECURSOS')
    setActiveContexto(null)
    expect(abaFichaVisivel('Heroi', 'recursos')).toBe(false)
    if (!temDataset) return
    setActiveContexto(def)
    expect(abaFichaVisivel('Heroi', 'recursos')).toBe(true)
    expect(abaFichaVisivel('CompanheiroAnimal', 'recursos')).toBe(false)
  })
})

describe('RecursosTab v3 (dataset real da POA)', () => {
  it('três seções na ordem do contexto com o total no sumário; planos em linhas-rádio; classe só pelo nome; fechar o mês', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 50, { channel: 'imediato', origem: 'test' })
    montar()
    await screen.findAllByRole('radio', {}, { timeout: 15000 })
    // ordem do contexto: Moradia, Transporte, Alimentação — cada uma um <details> com valor no sumário
    const secoes = [...document.querySelectorAll('details[data-eixo]')].map((d) => d.getAttribute('data-eixo'))
    expect(secoes).toEqual(['moradia', 'transporte', 'alimentacao'])
    expect(valorEixo('transporte')).toBe('0')
    // seis planos de transporte (planos TRI) com nome de classe SEM número
    const linhas = within(eixo('transporte')).getAllByRole('radio')
    expect(linhas.map((l) => l.getAttribute('data-classe'))).toEqual(['1', '2', '3', '4', '5', '6'])
    // nível 1 = "Sem Plano Mensal", Cz$ 0 (o nome da nota não repete o rótulo)
    expect(within(linhas[0]!).getByText(/Sem Plano Mensal/)).toBeTruthy()
    expect(within(linhas[0]!).getByText('Cz$ 0')).toBeTruthy()
    expect(within(linhas[0]!).queryByText(/de Transporte/)).toBeNull()
    // figura do recurso (embed da nota) ou o emoji do Tipo em cada linha de plano
    expect(within(eixo('transporte')).getAllByRole('radio').every((l) => l.querySelector('[data-recurso-figura]'))).toBe(true)
    expect(within(linhas[1]!).getByText(/Classe Baixa/)).toBeTruthy()
    expect(within(linhas[1]!).getByText(/TRI Bronze/)).toBeTruthy()
    expect(within(linhas[1]!).getByText('Cz$ 1.500')).toBeTruthy()
    expect(screen.queryByText(/classe 2/i)).toBeNull()
    expect(screen.queryByText(/Humilde/)).toBeNull()
    fireEvent.click(linhas[2]!) // TRI Prata — Classe Média Baixa
    expect(linhas[2]!.getAttribute('aria-checked')).toBe('true')
    expect(valorEixo('transporte')).toBe('2500')
    expect(custoMes()).toBe('2500')
    fireEvent.click(within(eixo('moradia')).getAllByRole('radio')[3]!) // Classe Média
    expect(valorEixo('moradia')).toBe('6000')
    fireEvent.click(within(eixo('alimentacao')).getAllByRole('radio')[4]!) // Classe Média Alta
    expect(custoMes()).toBe('17500')
    // fechar o mês: 17.500 → 18 (pra cima) — 50 → 32
    fireEvent.click(screen.getByText(/Fechar o mês/))
    expect(screen.getByText(/NA FICHA/).textContent).toContain('Cz$ 32.000')
    // nenhum "ouro" à mostra, nenhum saldo de TRI, nenhum estoque
    expect(document.body.textContent).not.toMatch(/\bouro\b/i)
    expect(document.querySelector('[data-tri]')).toBeNull()
  }, 30000)

  it('posse dentro do eixo com a manutenção da nota; vender devolve metade', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 20, { channel: 'imediato', origem: 'test' })
    writeHeroEdit(
      CARLOS_ID,
      'fm',
      RECURSOS_FM,
      {
        estilos: { transporte: 'TRI Ouro', moradia: 'Moradia Classe Média', alimentacao: null },
        itens: [
          { nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, estado: 'usado', pago: 150000 },
          { nome: 'Kitnet do Aeromóvel', aba: 'Moradia', qtd: 1, pago: 600000 },
        ],
      },
      { channel: 'imediato', origem: 'test' },
    )
    montar()
    await screen.findByText('Gurgel Carajás', {}, { timeout: 15000 })
    // transporte: plano 5.000 + Carajás 3.000 de manutenção; moradia: plano 6.000 + kitnet 1.500 (condomínio/IPTU)
    expect(valorEixo('transporte')).toBe('8000')
    expect(valorEixo('moradia')).toBe('7500')
    expect(custoMes()).toBe('15500')
    const carro = screen.getByText('Gurgel Carajás').closest('[data-item]') as HTMLElement
    expect(within(carro).getByText('usado')).toBeTruthy()
    expect(within(carro).getByText('Cz$ 3.000')).toBeTruthy()
    fireEvent.click(within(carro).getByText(/Vender \+Cz\$ 75\.000/))
    expect(screen.queryByText('Gurgel Carajás')).toBeNull()
    expect(valorEixo('transporte')).toBe('5000')
    expect(screen.getByText(/NA FICHA/).textContent).toContain('Cz$ 95.000')
    // alimentação não tem posse nem estoque
    expect(within(eixo('alimentacao')).queryByText(/POSSE/)).toBeNull()
  }, 30000)
})

describe('catálogo de posse (veículos e imóveis, com onde comprar)', () => {
  it('VEÍCULOS PRÓPRIOS / IMÓVEIS PRÓPRIOS aparecem mesmo sem posse; ver catálogo lista os recursos com preço e onde', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    montar()
    await screen.findAllByRole('radio', {}, { timeout: 15000 })
    const transporte = eixo('transporte')
    expect(within(transporte).getByText(/VEÍCULOS PRÓPRIOS/)).toBeTruthy()
    expect(within(eixo('moradia')).getByText(/IMÓVEIS PRÓPRIOS/)).toBeTruthy()
    expect(within(eixo('alimentacao')).queryByText(/POSSE|PRÓPRIOS/)).toBeNull()
    fireEvent.click(within(transporte).getByText('ver catálogo'))
    const itens = transporte.querySelectorAll('[data-catalogo="transporte"] [data-catalogo-item]')
    expect(itens.length).toBeGreaterThan(20)
    const carajas = transporte.querySelector('[data-catalogo-item="Gurgel Carajás"]') as HTMLElement
    expect(within(carajas).getByText('Cz$ 400.000')).toBeTruthy() // preço de NOVO, sem usado
    expect(within(carajas).queryByText(/usado/)).toBeNull()
    expect(within(carajas).getByText('Concessionária Gurgel').closest('a')).not.toBeNull() // onde comprar
    expect(carajas.querySelector('[data-recurso-figura]')).not.toBeNull()
    // ordem por preço, do mais barato
    const precos = Array.from(itens).map((el) => el.textContent ?? '')
    expect(precos[0]).not.toContain('Cz$ 400.000')
    const moradia = eixo('moradia')
    fireEvent.click(within(moradia).getByText('ver catálogo'))
    const kitnet = moradia.querySelector('[data-catalogo-item="Kitnet do Aeromóvel"]') as HTMLElement
    expect(within(kitnet).getByText(/compra Cz\$ 600\.000/)).toBeTruthy()
    expect(within(kitnet).getByText(/Cz\$ 1\.500 \/ mês/)).toBeTruthy()
  }, 30000)
})
