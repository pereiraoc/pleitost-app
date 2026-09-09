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
    // abrir o mês: 17.500 → 18 (pra cima) — 50 → 32
    fireEvent.click(screen.getByText(/Abrir o mês/))
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
    // transporte: plano 5.000 + Carajás USADO 4.500 (a nota diz 3.000; usado
    // paga ×1,5 — peça pirata e álcool do mercado negro); moradia: plano
    // 6.000 + kitnet 1.500 (condomínio/IPTU)
    expect(valorEixo('transporte')).toBe('9500')
    expect(valorEixo('moradia')).toBe('7500')
    expect(custoMes()).toBe('17000')
    const carro = screen.getByText('Gurgel Carajás').closest('[data-item]') as HTMLElement
    expect(within(carro).getByText('usado')).toBeTruthy()
    expect(within(carro).getByText('Cz$ 4.500')).toBeTruthy()
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

  it('catálogo agrupado por classe social, de baixo pra cima (ordem dos níveis do contexto), preço crescente dentro do grupo', async () => {
    if (!temDataset) return
    setActiveContexto(def)
    montar()
    await screen.findAllByRole('radio', {}, { timeout: 15000 })
    const transporte = eixo('transporte')
    fireEvent.click(within(transporte).getByText('ver catálogo'))
    const cat = transporte.querySelector('[data-catalogo="transporte"]') as HTMLElement
    const niveis = def.recursos!.niveis
    // cabeçalhos = classes do contexto, em ordem crescente, só as que têm item
    const grupos = Array.from(cat.querySelectorAll('[data-catalogo-grupo]')).map((el) => el.getAttribute('data-catalogo-grupo') ?? '')
    expect(grupos.length).toBeGreaterThan(2)
    const idx = grupos.map((g) => niveis.indexOf(g))
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // "Sem Plano Mensal" (nível 1) é a AUSÊNCIA de mensalidade, não uma faixa
    // de produto: o catálogo começa em Classe Baixa (Carroça com Cavalo).
    expect(grupos[0]).toBe(niveis[1])
    expect(grupos).not.toContain(niveis[0])
    // cada item fica embaixo do cabeçalho da SUA classe: o Carajás (Nível 5) sob Classe Média Alta
    const carajas = cat.querySelector('[data-catalogo-item="Gurgel Carajás"]') as HTMLElement
    let cab: Element | null = carajas
    while (cab && !cab.hasAttribute('data-catalogo-grupo')) cab = cab.previousElementSibling
    expect(cab?.getAttribute('data-catalogo-grupo')).toBe(niveis[4])
    // dentro do grupo, preço crescente: Carajás (400.000) antes da Monza (700.000)
    const nomes = Array.from(cat.querySelectorAll('[data-catalogo-item]')).map((el) => el.getAttribute('data-catalogo-item'))
    expect(nomes.indexOf('Gurgel Carajás')).toBeLessThan(nomes.indexOf('Chevrolet Monza'))
    // o chip de classe sai da linha: a classe é o cabeçalho
    expect(within(carajas).queryByText(niveis[4])).toBeNull()
  }, 30000)
})

/* v4 (2026-09-08): abrir o mês na entrada, dívida nas fontes da vault, eixo
 * pago por terceiro e o que a garagem guarda. Dataset REAL da POA. */
describe('RecursosTab v4 — mês na entrada, dívida e regalia', () => {
  const montarCom = (fmRecursos: Record<string, unknown>, ouro = 500) => {
    setActiveContexto(def)
    writeHeroEdit(CARLOS_ID, 'fm', 'Inventario.Ouro', ouro, { channel: 'imediato', origem: 'test' })
    writeHeroEdit(CARLOS_ID, 'fm', RECURSOS_FM, fmRecursos, { channel: 'imediato', origem: 'test' })
    montar()
  }

  it('o plano cedido por terceiro aparece e não sai do bolso', async () => {
    if (!temDataset) return
    montarCom({ estilos: { transporte: 'TRI Ouro', moradia: 'Moradia Classe Média', alimentacao: null }, pagoPor: { moradia: 'a firma' } })
    await screen.findAllByRole('radio', {}, { timeout: 15000 })
    const moradia = eixo('moradia')
    expect(within(moradia).getByText(/plano pago por a firma/)).toBeTruthy()
    // o eixo mostra o que sai do bolso (0), mas guarda o custo cheio no atributo
    expect(moradia.querySelector('[data-eixo-valor]')!.getAttribute('data-eixo-valor')).toBe('6000')
    expect(moradia.querySelector('[data-eixo-bolso]')!.getAttribute('data-eixo-bolso')).toBe('0')
    expect(custoMes()).toBe('5000') // só o TRI Ouro
  }, 30000)

  it('pega empréstimo numa fonte da vault, mostra a parcela e quita', async () => {
    if (!temDataset) return
    montarCom({ estilos: { transporte: null, moradia: 'Moradia Classe Média', alimentacao: null } }, 0)
    await screen.findAllByRole('radio', {}, { timeout: 15000 })
    const dividas = document.querySelector('[data-secao="dividas"]') as HTMLElement
    expect(dividas).not.toBeNull()
    fireEvent.change(within(dividas).getByLabelText('Fonte de crédito'), { target: { value: 'Agiota da Facção' } })
    fireEvent.change(within(dividas).getByLabelText('Quanto pegar'), { target: { value: '150000' } })
    fireEvent.click(within(dividas).getByText(/Pegar Cz\$ 150\.000/))
    // o principal entra na ficha e a parcela do mês aparece: 20% de 150.000 + um décimo
    expect(screen.getByText(/NA FICHA/).textContent).toContain('Cz$ 150.000')
    const linha = document.querySelector('[data-divida="Agiota da Facção"]') as HTMLElement
    expect(within(linha).getByText('juros Cz$ 30.000')).toBeTruthy()
    expect(within(linha).getByText('amortiza Cz$ 15.000')).toBeTruthy()
    // e entra no total do mês, junto do plano de moradia
    expect(custoMes()).toBe('51000') // 6.000 + 45.000
    fireEvent.click(within(linha).getByText('Quitar'))
    expect(document.querySelector('[data-divida="Agiota da Facção"]')).toBeNull()
    expect(custoMes()).toBe('6000')
  }, 30000)

  it('veículo sem vaga na moradia dorme na rua', async () => {
    if (!temDataset) return
    montarCom({
      estilos: { transporte: null, moradia: 'Moradia Classe Média', alimentacao: null }, // uma vaga
      itens: [
        { nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, pago: 400000 },
        { nome: 'Chevrolet Monza', aba: 'Transporte', qtd: 1, pago: 700000 },
      ],
    })
    await screen.findByText('Chevrolet Monza', {}, { timeout: 15000 })
    const primeiro = screen.getByText('Gurgel Carajás').closest('[data-item]') as HTMLElement
    const segundo = screen.getByText('Chevrolet Monza').closest('[data-item]') as HTMLElement
    expect(within(primeiro).queryByText(/na rua/)).toBeNull()
    expect(within(segundo).getByText(/na rua: sem vaga/)).toBeTruthy()
  }, 30000)
})
