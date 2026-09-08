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
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json')) && fs.existsSync(path.join(cyberDir, 'Contexto/Malha de Transportes/Malha de Transportes.json'))

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
    await screen.findByText('// VISTA', {}, { timeout: 20000 })
    const vistas = screen.getAllByRole('radio')
    expect(vistas.map((v) => v.textContent)).toEqual(['TRI Bronze', 'TRI Prata', 'TRI Ouro', 'TRI Platina'])
    expect(vistas[0]!.getAttribute('aria-checked')).toBe('true')
    const linhasBronze = document.querySelectorAll('[data-malha-mapa] path[data-linha]')
    // na mão (Kombis 3, balsa, caravana — barqueiro e lancha não são coletivo) + as 6 linhas do turno
    expect(linhasBronze.length).toBe(11)
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
    expect(document.querySelector('[data-malha-mapa] g[data-bairro="Nova Sarandi"]')).not.toBeNull()
    expect(document.querySelector('[data-malha-mapa] g[data-bairro="Zona Leste"] text')?.textContent).toBe('ZONA LESTE')
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
    await screen.findByText('// VISTA', {}, { timeout: 20000 })
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
