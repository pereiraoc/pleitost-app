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

  it('vista padrão = plano do herói (sem plano: A Pé → só o que se paga na mão); trocar de vista muda o mapa', async () => {
    if (!temDataset) return
    montar()
    await screen.findByText('// VISTA', {}, { timeout: 20000 })
    const vistas = screen.getAllByRole('radio')
    expect(vistas.map((v) => v.textContent)).toEqual(['A Pé', 'TRI Vale-Transporte', 'TRI Popular', 'TRI Integrado', 'TRI Executivo', 'TRI Corporativo'])
    expect(vistas[0]!.getAttribute('aria-checked')).toBe('true')
    const linhasNaMao = document.querySelectorAll('[data-malha-mapa] path[data-linha]')
    // Kombis (3), balsa, barqueiro, caravana — nada de TRI
    expect(linhasNaMao.length).toBe(6)
    expect(screen.queryByText('L1 POPULAR NORTE')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Popular' }))
    const linhasPopular = document.querySelectorAll('[data-malha-mapa] path[data-linha]')
    expect(linhasPopular.length).toBeGreaterThan(20)
    expect(document.querySelectorAll('[data-malha-mapa] g[data-baldeacao]').length).toBeGreaterThan(8)
    // nada ao sul: Ipanema só na Executiva
    expect(document.querySelector('[data-malha-mapa] g[data-parada="Estação Ipanema"]')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Executivo' }))
    expect(document.querySelector('[data-malha-mapa] g[data-parada="Estação Ipanema"]')).not.toBeNull()
    expect(document.querySelectorAll('[data-malha-mapa] path[data-linha]').length).toBeGreaterThan(linhasPopular.length)
  })

  it('legenda seleciona a linha → parada a parada na ordem, com as baldeações como botões', async () => {
    if (!temDataset) return
    montar()
    await screen.findByText('// VISTA', {}, { timeout: 20000 })
    fireEvent.click(screen.getByRole('radio', { name: 'TRI Popular' }))
    const legenda = document.querySelector('[data-legenda]') as HTMLElement
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
