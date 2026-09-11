// @vitest-environment jsdom
// Aba TRANSPORTE (2026-09-08): mapa esquemático da malha por VISTA (plano
// TRI), plano + veículos do herói, legenda e parada a parada com baldeações.
// Dataset REAL da POA como oráculo (pula se ausente).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { TransporteTab } from '../src/components/ficha/TransporteTab'
import { abaFichaVisivel } from '../src/data/familia'
import { CHAR_TABS } from '../src/components/layout/design-nav'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const heroesDir = path.join(appDir, 'tests', 'fixtures', 'heroes')
// Guard do dataset: a nota do mapa é achada pelo BASENAME no index.json, não
// por caminho fixo — a malha já mudou de pasta uma vez (Atlas → Contexto/
// Recursos/Transporte) e o guard antigo, apontando pro caminho velho, deixou
// estes 4 testes passando VAZIOS. Pelo basename, mover a pasta não os mata.
const docPathPorBasename = (basename: string): string | null => {
  const idx = path.join(cyberDir, 'index.json')
  if (!fs.existsSync(idx)) return null
  const m = JSON.parse(fs.readFileSync(idx, 'utf8')) as IndexManifest
  const achado = m.docs.find((d) => d.basename === basename)
  return achado ? path.join(cyberDir, `${achado.id}.json`) : null
}
const mapaJson = docPathPorBasename('Malha de Transportes')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json')) && !!mapaJson && fs.existsSync(mapaJson)

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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
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
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <TransporteTab doc={carlos} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('aba TRANSPORTE (dataset real da POA)', () => {
  it('a aba existe abaixo de RECURSOS e só aparece com `transporte` no contexto', () => {
    const ids = CHAR_TABS.map((t) => t.id)
    expect(ids.indexOf('transporte')).toBe(ids.indexOf('recursos') + 1)
    setActiveContexto(null)
    expect(abaFichaVisivel('Heroi', 'transporte')).toBe(false)
    if (!temDataset) return
    setActiveContexto(def)
    expect(abaFichaVisivel('Heroi', 'transporte')).toBe(true)
  })

  it('vistas = só os TRI que alguma linha pede (sem A Pé, sem motorista); padrão = a menor sem plano; trocar de vista muda o mapa', async () => {
    if (!temDataset) return
    montar()
    await screen.findByText('// FILTRO', {}, { timeout: 20000 })
    const vistas = screen.getAllByRole('radio')
    expect(vistas.map((v) => v.textContent)).toEqual(['TRI Bronze', 'TRI Prata', 'TRI Ouro', 'TRI Platina'])
    expect(vistas[0]!.getAttribute('aria-checked')).toBe('true')
    const linhasBronze = document.querySelectorAll('[data-malha-mapa] path[data-linha]')
    // na mão (Kombis 3, balsa, caravana) + as 11 linhas de turno do Bronze (radiais, transversais de operário, anfíbios das palafitas e do cais)
    expect(linhasBronze.length).toBe(16)
    // sem plano: sem cartão; nada de veículos, táxi ou "a pé" na aba
    expect(document.querySelector('[data-cartao=""]')?.textContent).toContain('sem cartão')
    expect(document.querySelector('[data-veiculos]')).toBeNull()
    expect(screen.queryByText(/A Pé/)).toBeNull()
    // mapa com viewport compartilhada: zoom −/+, TUDO (enquadrar) e tela cheia
    expect(document.querySelector('[data-malha-mapa] [data-zoom-out]')).not.toBeNull()
    expect(document.querySelector('[data-malha-mapa] [data-zoom-in]')).not.toBeNull()
    expect(document.querySelector('[data-malha-mapa] [data-mostrar-tudo]')).not.toBeNull()
    expect(document.querySelector('[data-malha-mapa] [data-fullscreen-toggle]')).not.toBeNull()
    // bairros: por trás das linhas, ligados pelo botão
    expect(document.querySelector('[data-malha-mapa] g[data-bairro]')).toBeNull()
    fireEvent.click(document.querySelector('[data-malha-mapa] [data-bairros]') as HTMLElement)
    expect(document.querySelectorAll('[data-malha-mapa] g[data-bairro="Nova Sarandi"] rect').length).toBeGreaterThan(3)
    expect(document.querySelectorAll('[data-malha-mapa] g[data-bairro="Jardim Botânico"] rect').length).toBeGreaterThan(3) // uma parada só, mas visível
    // "Zona Leste" não é bairro (2026-09-09): o mapa dos bairros põe a região
    // leste dentro do Jardim Botânico, e a vila operária é parte dele.
    expect(document.querySelector('[data-malha-mapa] g[data-bairro="Zona Leste"]')).toBeNull()
    expect(document.querySelector('[data-malha-mapa] g[data-bairro="Jardim Botânico"] text')?.textContent).toBe('JARDIM BOTÂNICO')
    // legenda: a Kombi mostra o traço pontilhado, o VALOR como chip e a nota de pagamento embaixo
    const kombi = document.querySelector('[data-legenda] [data-modo="Kombi"]') as HTMLElement
    expect(kombi.querySelector('svg[data-swatch="pontilhado"]')).not.toBeNull()
    expect(within(kombi).getAllByText('Cz$ 80 · viagem').length).toBeGreaterThan(0)
    expect(within(kombi).getAllByText(/o dobro depois das 23h/).length).toBeGreaterThan(0)
    const balsa = document.querySelector('[data-legenda] [data-modo="Balsa"]') as HTMLElement
    expect(balsa.querySelector('svg[data-swatch="tracejado"]')).not.toBeNull()
    expect(screen.queryByText('L1 POPULAR NORTE')).toBeNull()
    expect(document.querySelector('[data-malha-mapa] svg')?.getAttribute('data-paleta')).toBe('papel')
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Prata' }))
    const linhasPopular = document.querySelectorAll('[data-malha-mapa] path[data-linha]')
    expect(linhasPopular.length).toBeGreaterThan(20)
    expect(document.querySelectorAll('[data-malha-mapa] g[data-baldeacao]').length).toBeGreaterThan(8)
    // nada ao sul: Ipanema só na Executiva
    expect(document.querySelector('[data-malha-mapa] g[data-parada="Estação Ipanema"]')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Platina' }))
    expect(document.querySelector('[data-malha-mapa] g[data-parada="Estação Ipanema"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-malha-mapa] path[data-linha]').length).toBeGreaterThan(linhasPopular.length)
  })

  it('legenda seleciona a linha → parada a parada na ordem, com as baldeações como botões', async () => {
    if (!temDataset) return
    montar()
    await screen.findByText('// FILTRO', {}, { timeout: 20000 })
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Prata' }))
    const legenda = document.querySelector('[data-legenda]') as HTMLElement
    // agrupada por modo, na ordem do contexto (Aeromóvel antes de Ônibus…)
    const modos = Array.from(legenda.querySelectorAll('[data-modo]')).map((g) => g.getAttribute('data-modo'))
    expect(modos.slice(0, 3)).toEqual(['Aeromóvel', 'Ônibus', 'Ônibus Anfíbio'])
    expect(within(legenda.querySelector('[data-modo="Aeromóvel"]') as HTMLElement).getByText('L1 POPULAR NORTE')).toBeTruthy()
    const l1 = within(legenda).getByText('L1 POPULAR NORTE').closest('button') as HTMLButtonElement
    fireEvent.click(l1)
    const bloco = document.querySelector('[data-parada-a-parada]') as HTMLElement
    expect(bloco).not.toBeNull()
    const paradas = Array.from(bloco.querySelectorAll('ol[data-paradas] > li')).map((li) => li.querySelector('a')?.textContent ?? li.textContent)
    expect(paradas.slice(0, 3)).toEqual(['Estação Zaffari', 'Estação Sarandi', "Estação Passo D'Areia"])
    expect(paradas.at(-1)).toBe('Estação Central')
    // baldeação na Central: ônibus e anfíbios param lá
    const central = bloco.querySelectorAll('ol[data-paradas] > li')[5] as HTMLElement
    const baldeacoes = Array.from(central.querySelectorAll('button[data-baldeacao]')).map((b) => b.textContent)
    expect(baldeacoes).toContain('A1 CENTRO ALAGADO')
    expect(baldeacoes).toContain('SARANDI — CENTRO')
    // a linha fechada aparece só na legenda, sem traço no mapa
    expect(document.querySelector('[data-linha-fechada]')?.textContent).toContain('RAMAL COSTA E SILVA')
    expect(document.querySelectorAll('[data-malha-mapa] path[data-linha$="RAMAL COSTA E SILVA"]').length).toBe(0)
  })
})

describe('planejador de trajeto', () => {
  it('de onde pra onde → até 3 rotas ranqueadas, com pernas, no cartão da vista; a rota escolhida acende no mapa', async () => {
    if (!temDataset) return
    montar()
    await screen.findByText('// TRAJETO', {}, { timeout: 20000 })
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Prata' }))
    // seletores hierárquicos (como a naturalidade): cabeçalho do bairro desabilitado, parada indentada embaixo
    const de = screen.getByLabelText('De onde') as HTMLSelectElement
    const opcoes = Array.from(de.options)
    const iSarandi = opcoes.findIndex((o) => o.textContent?.trim() === 'Nova Sarandi' && o.disabled)
    const iZaffari = opcoes.findIndex((o) => o.value === 'Estação Zaffari')
    expect(iSarandi).toBeGreaterThan(0)
    expect(iZaffari).toBeGreaterThan(iSarandi)
    expect(opcoes[iZaffari]!.textContent!.startsWith('\u00a0\u00a0')).toBe(true)
    expect(opcoes.some((o) => o.textContent?.trim() === 'Porto Alegre' && o.disabled)).toBe(true)
    expect(opcoes.some((o) => o.value === 'Estação Ipanema')).toBe(false) // fora da vista Prata
    fireEvent.change(de, { target: { value: 'Estação Zaffari' } })
    fireEvent.change(screen.getByLabelText('Pra onde') as HTMLSelectElement, { target: { value: 'Estação Jardim Botânico' } })
    const rotas = document.querySelectorAll('[data-rotas] > li')
    expect(rotas.length).toBeGreaterThan(0)
    expect(rotas.length).toBeLessThanOrEqual(3)
    const primeira = rotas[0]!.querySelector('button') as HTMLButtonElement
    const minutos = Number(primeira.querySelector('[data-minutos]')!.getAttribute('data-minutos'))
    expect(minutos).toBeGreaterThan(10)
    expect(minutos).toBeLessThan(180)
    // Zaffari→Central pela L1 e Central→Jardim Botânico pela L2: uma baldeação, e é a mais rápida
    expect(primeira.textContent).toContain('L1 POPULAR NORTE')
    expect(primeira.textContent).toContain('L2 POPULAR SUL')
    expect(primeira.textContent).toContain('1 baldeação')
    // itinerário passo a passo: A, perna por perna com "desce em", baldeação, B
    expect(primeira.querySelectorAll('[data-itinerario] [data-perna]').length).toBe(2)
    expect(primeira.querySelectorAll('[data-passo="baldeacao"]').length).toBe(1)
    expect(primeira.textContent).toContain('desce em Estação Central')
    expect(primeira.textContent).toContain('espera')
    // report 2026-09-10: do lado de CADA opção, quanto seria a pé (a régua do
    // mestre pra decidir se o grupo pega o ônibus ou encara a rua)
    for (const li of Array.from(rotas)) {
      const aPe = li.querySelector('[data-a-pe-minutos]')
      expect(aPe, 'toda opção mostra o tempo a pé').not.toBeNull()
      expect(aPe!.textContent).toMatch(/a pé/)
      const deOnibus = Number(li.querySelector('[data-minutos]')!.getAttribute('data-minutos'))
      expect(Number(aPe!.getAttribute('data-a-pe-minutos'))).toBeGreaterThan(deOnibus)
    }
    // as rotas vêm em ordem de tempo
    const tempos = Array.from(document.querySelectorAll('[data-rotas] [data-minutos]')).map((e) => Number(e.getAttribute('data-minutos')))
    expect([...tempos].sort((a, b) => a - b)).toEqual(tempos)
    // no mapa: A/B marcados e só as linhas da rota acesas
    expect(document.querySelector('[data-malha-mapa] g[data-parada="Estação Zaffari"]')?.getAttribute('data-ponta')).toBe('A')
    expect(document.querySelector('[data-malha-mapa] g[data-parada="Estação Jardim Botânico"]')?.getAttribute('data-ponta')).toBe('B')
    const acesas = Array.from(document.querySelectorAll('[data-malha-mapa] path[data-na-rota]')).map((p) => p.getAttribute('data-linha'))
    expect(acesas.some((id) => id?.endsWith('L1 POPULAR NORTE'))).toBe(true)
    expect(acesas.length).toBe(2)
    // no pico, ônibus demora mais; o aeromóvel não — a rota de trilho segue na frente
    fireEvent.change(document.querySelector('[data-periodo]') as HTMLSelectElement, { target: { value: '0' } })
    expect((document.querySelector('[data-rotas] button') as HTMLElement).textContent).toContain('L1 POPULAR NORTE')
    // com o Bronze (sem Aeromóvel) a viagem precisa de ônibus, ou não existe
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Bronze' }))
    const depois = document.querySelectorAll('[data-rotas] > li')
    if (depois.length) expect(depois[0]!.textContent).not.toContain('L1 POPULAR NORTE')
    else expect(document.querySelector('[data-sem-rota]')).not.toBeNull()
  })
})

// Pedido 2026-09-10: escolher no mapa vira um MODO por campo — o botão 🗺️ ao
// lado do dropdown arma o campo, o clique no mapa preenche AQUELE, e sem
// nenhum armado o clique volta a ser leitura (abre o lugar nos detalhes).
describe('escolher a ponta do trajeto pelo mapa', () => {
  it('o botão arma o campo, só um por vez, e o clique no mapa preenche o armado', async () => {
    if (!temDataset) return
    montar()
    await screen.findByText('// TRAJETO', {}, { timeout: 20000 })
    const btnDe = screen.getByLabelText('Escolher a origem no mapa')
    const btnPara = screen.getByLabelText('Escolher o destino no mapa')
    expect(btnDe.getAttribute('aria-pressed')).toBe('false')
    // sem armar, clicar numa parada do mapa NÃO mexe no trajeto
    const parada = document.querySelector('[data-malha-mapa] g[data-parada="Estação Zaffari"]') as SVGGElement
    expect(parada).toBeTruthy()
    fireEvent.click(parada)
    expect((screen.getByLabelText('De onde') as HTMLSelectElement).value).toBe('')
    // arma a ORIGEM → o clique preenche o DE e desarma
    fireEvent.click(btnDe)
    expect(btnDe.getAttribute('aria-pressed')).toBe('true')
    // armar o outro desliga o primeiro
    fireEvent.click(btnPara)
    expect(btnDe.getAttribute('aria-pressed')).toBe('false')
    expect(btnPara.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(document.querySelector('[data-malha-mapa] g[data-parada="Estação Zaffari"]') as SVGGElement)
    expect((screen.getByLabelText('Pra onde') as HTMLSelectElement).value).toBe('Estação Zaffari')
    expect(btnPara.getAttribute('aria-pressed')).toBe('false')
  }, 30000)
})
