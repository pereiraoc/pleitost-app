// @vitest-environment jsdom
// Aba RECURSOS (2026-09-07): só existe em mundo que declara `recursos`
// (POA); lista as notas de Recurso por aba/tipo com preço na moeda do mundo,
// compra desconta ouro em milhares e grava o estado no FM salvo; o custo do
// mês soma os três eixos. Dataset REAL da POA como oráculo (pula se ausente).
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

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const heroesDir = path.join(appDir, 'tests', 'fixtures', 'heroes')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json')) && fs.existsSync(path.join(cyberDir, 'Contexto/Recursos/Transporte/Gurgel Carajás.json'))

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
  // o CatalogProvider (re)ativa o contexto do catálogo — o do mundo vai junto
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

describe('RecursosTab (dataset real da POA)', () => {
  it('sem recursos no contexto: painel vazio', () => {
    if (!temDataset) return
    const semRecursos = { ...def, recursos: undefined }
    setActiveContexto(semRecursos)
    render(
      <MemoryRouter>
        <CatalogProvider catalog={{ ...catalog, contextoDef: semRecursos }}>
          <DetailProvider>
            <RecursosTab doc={carlos} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/NÃO DECLARA RECURSOS/)).toBeTruthy()
  })

  it('lista Transporte por tipo em Cz$; comprar usado desconta ouro em milhares; TRI e mês', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 200, { channel: 'imediato', origem: 'test' })
    render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <RecursosTab doc={carlos} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    // abas na ordem do contexto (botões da TabStrip; o custo do mês repete os nomes)
    const abas = screen.getAllByRole('button').filter((b) => ['TRANSPORTE', 'MORADIA', 'ALIMENTAÇÃO'].includes(b.textContent ?? ''))
    expect(abas.map((b) => b.textContent)).toEqual(['TRANSPORTE', 'MORADIA', 'ALIMENTAÇÃO'])
    const linha = await screen.findByText('Gurgel Carajás', {}, { timeout: 15000 })
    const row = linha.closest('[data-recurso]') as HTMLElement
    expect(within(row).getByText('Cz$ 400.000')).toBeTruthy()
    // ouro 200 (= Cz$ 200.000): usado (150.000) cabe, novo (400.000) não
    const usado = within(row).getByText(/Usado −Cz\$ 150\.000/)
    const novo = within(row).getByText(/Novo −Cz\$ 400\.000/)
    expect((novo.closest('button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(usado)
    expect(screen.getByText(/OURO NA FICHA/).textContent).toContain('Cz$ 50.000')
    // veículo aparece em "o que você tem" com a manutenção mensal no custo do mês
    expect(screen.getByText('usado')).toBeTruthy()
    expect((document.querySelector('[data-custo-mes]') as HTMLElement).dataset.custoMes).toBe('3000')
    // TRI: +1.000 sai 1 de ouro; passagem de ônibus (Cz$ 50) sai do TRI
    fireEvent.click(screen.getByText('+1.000'))
    expect((document.querySelector('[data-tri]') as HTMLElement).dataset.tri).toBe('1000')
    const onibus = screen.getByText('Passagem de Ônibus').closest('[data-recurso]') as HTMLElement
    fireEvent.click(within(onibus).getByText(/Usar/))
    expect((document.querySelector('[data-tri]') as HTMLElement).dataset.tri).toBe('950')
    // régua do bairro: Restinga (Pequena Cidade ×0,7) → Carajás novo Cz$ 280.000
    const select = screen.getByLabelText('Bairro onde está comprando') as HTMLSelectElement
    const restinga = [...select.options].find((o) => o.textContent?.startsWith('Restinga'))!
    fireEvent.change(select, { target: { value: restinga.value } })
    // (o nome agora também aparece em "o que você tem" — pega a linha da lista)
    const rowRestinga = document.querySelector('[data-recurso="Gurgel Carajás"]') as HTMLElement
    expect(within(rowRestinga).getByText('Cz$ 280.000')).toBeTruthy()
  }, 30000)

  it('Moradia: alugar entra no mês; Alimentação: estilo entra no mês e nível = menor eixo', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', 50, { channel: 'imediato', origem: 'test' })
    render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <RecursosTab doc={carlos} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Gurgel Carajás', {}, { timeout: 15000 })
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === 'MORADIA')!)
    const kitnet = (await screen.findByText('Kitnet do Aeromóvel')).closest('[data-recurso]') as HTMLElement
    fireEvent.click(within(kitnet).getByText('Alugar'))
    expect((document.querySelector('[data-custo-mes]') as HTMLElement).dataset.custoMes).toBe('6000')
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === 'ALIMENTAÇÃO')!)
    const pf = (await screen.findByText('PF de Cantina')).closest('[data-recurso]') as HTMLElement
    fireEvent.click(within(pf).getByText('Escolher'))
    expect((document.querySelector('[data-custo-mes]') as HTMLElement).dataset.custoMes).toBe('9000')
    expect(screen.getByText(/NÍVEL 3 · OPERÁRIO/)).toBeTruthy()
    // miudeza: Polar (nível 2) está "no seu estilo"; uísque (nível 5) fora
    const polar = screen.getByText('Polar Tradicional').closest('[data-recurso]') as HTMLElement
    expect(within(polar).getByText('no seu estilo')).toBeTruthy()
    // fechar o mês: 9.000 → 9 de ouro (50 → 41)
    fireEvent.click(screen.getByText(/Fechar o mês/))
    expect(screen.getByText(/OURO NA FICHA/).textContent).toContain('Cz$ 41.000')
  }, 30000)
})
