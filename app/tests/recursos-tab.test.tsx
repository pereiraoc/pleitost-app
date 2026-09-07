// @vitest-environment jsdom
// Aba RECURSOS v2 (2026-09-07b): custo de vida em cima (três eixos por
// classe, escolhidos entre os estilos da vault), total do mês claro, fechar o
// mês; embaixo só o que o herói TEM. Compra é nos estabelecimentos (ver
// servicos-tab.test). Dataset REAL da POA como oráculo (pula se ausente).
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
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json')) && fs.existsSync(path.join(cyberDir, 'Contexto/Recursos/Transporte/Transporte Classe Média.json'))

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

describe('RecursosTab v2 (dataset real da POA)', () => {
  it('custo de vida em cima: três eixos com as seis classes do contexto; total soma; classe = menor eixo', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 50, { channel: 'imediato', origem: 'test' })
    montar()
    await screen.findAllByRole('radio', {}, { timeout: 15000 })
    // lista VERTICAL por eixo: 6 linhas-rádio, nome à esquerda e dinheiro na coluna da direita
    const transp = eixo('transporte')
    const linhas = within(transp).getAllByRole('radio')
    expect(linhas.map((l) => l.getAttribute('data-classe'))).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(within(linhas[0]!).getByText('Miserável')).toBeTruthy()
    expect(within(linhas[0]!).getByText('Cz$ 100')).toBeTruthy()
    expect(within(linhas[5]!).getByText('Cz$ 20.000')).toBeTruthy()
    fireEvent.click(linhas[2]!) // Classe Média Baixa — a linha inteira seleciona
    expect(linhas[2]!.getAttribute('aria-checked')).toBe('true')
    expect(custoMes()).toBe('2000')
    fireEvent.click(within(eixo('moradia')).getAllByRole('radio')[3]!) // Classe Média
    expect(custoMes()).toBe('8000')
    fireEvent.click(within(eixo('alimentacao')).getAllByRole('radio')[4]!) // Classe Média Alta
    expect(custoMes()).toBe('17000')
    expect(screen.getAllByText(/classe 3 · Classe Média Baixa/i).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText(/Fechar o mês/))
    expect(screen.getByText(/OURO NA FICHA/).textContent).toContain('Cz$ 33.000')
    expect(screen.getByText(/a pé, de ônibus ou de carona/)).toBeTruthy()
    expect(screen.queryByText('Gurgel Carajás')).toBeNull()
  }, 30000)

  it('o que o herói tem aparece por aba: veículo comprado (vender), moradia alugada substitui o eixo, estoque consome', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 20, { channel: 'imediato', origem: 'test' })
    writeHeroEdit(
      CARLOS_ID,
      'fm',
      RECURSOS_FM,
      {
        estilos: { transporte: 'Transporte Classe Média', moradia: 'Moradia Classe Média', alimentacao: null },
        tri: 1000,
        itens: [
          { nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, estado: 'usado', pago: 150000 },
          { nome: 'Uísque de Contrabando', aba: 'Alimentação', qtd: 2, pago: 4000 },
        ],
        moradia: { nome: 'Kitnet do Aeromóvel', modo: 'aluguel' },
        imoveis: [],
      },
      { channel: 'imediato', origem: 'test' },
    )
    montar()
    await screen.findByText('Gurgel Carajás', {}, { timeout: 15000 })
    expect(within(eixo('moradia')).getByText('aluguel')).toBeTruthy()
    expect(within(eixo('moradia')).getAllByRole('radio').length).toBe(1) // só a moradia específica, marcada
    expect(custoMes()).toBe('10000')
    expect((document.querySelector('[data-tri]') as HTMLElement).dataset.tri).toBe('1000')
    fireEvent.click(screen.getByText(/Passagem de Ônibus −Cz\$ 50/))
    expect((document.querySelector('[data-tri]') as HTMLElement).dataset.tri).toBe('950')
    const carro = screen.getByText('Gurgel Carajás').closest('[data-item]') as HTMLElement
    expect(within(carro).getByText('usado')).toBeTruthy()
    fireEvent.click(within(carro).getByText(/Vender \+75/))
    expect(screen.queryByText('Gurgel Carajás')).toBeNull()
    expect(screen.getByText(/OURO NA FICHA/).textContent).toContain('Cz$ 95.000')
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === 'ALIMENTAÇÃO')!)
    const uisque = (await screen.findByText('Uísque de Contrabando')).closest('[data-item]') as HTMLElement
    expect(within(uisque).getByText('×2')).toBeTruthy()
    fireEvent.click(within(uisque).getByText('Consumir'))
    expect(within(screen.getByText('Uísque de Contrabando').closest('[data-item]') as HTMLElement).getByText('×1')).toBeTruthy()
    fireEvent.click(within(eixo('moradia')).getByText('Sair'))
    expect(custoMes()).toBe('10000')
    expect(within(eixo('moradia')).getAllByRole('radio').length).toBe(6)
    expect(within(eixo('moradia')).getAllByRole('radio')[3]!.getAttribute('aria-checked')).toBe('true')
  }, 30000)
})
