// @vitest-environment jsdom
// Pedido do mestre (2026-10-29): foco só existe trabalhado num implemento
// ("Broche Artístico da Intensificação"), com o (A) tier-colorido ao lado como
// nos equipamentos; e a arma é "Punhal Relampejante", nunca "Punhal Imbuição
// Relampejante" (link da imbuição gravado sem alias).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { ITEM_TIER_BTN } from '../src/components/ficha/registry'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const STORE_KEY = `pleitost.heroEdits.${CARLOS_ID}`
const carlos = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8')) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>
const BROCHE = '[[Broche Artístico|Broche Artístico (Adepto)]]'

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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

const semear = (over: Record<string, unknown>) =>
  window.localStorage.setItem(STORE_KEY, JSON.stringify({ fm: over, session: {} }))
const salvo = () => JSON.parse(window.localStorage.getItem(STORE_KEY)!).fm as Record<string, any>
function renderFicha(tab: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('Inventário: foco preso ao implemento', () => {
  it('Broche A + Intensificação A viram um item só; a Repetição pede o implemento e grava as DUAS listas', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    renderFicha('inventario')
    expect(await screen.findByText('Broche Artístico da Intensificação')).toBeTruthy()
    expect(screen.queryByText('Foco da Intensificação')).toBeNull()
    const sel = await screen.findByLabelText('Implemento do Foco da Repetição')
    fireEvent.change(sel, { target: { value: 'Broche Artístico' } })
    await waitFor(() => expect(screen.getByText('Broche Artístico da Repetição')).toBeTruthy())
    const s = salvo()
    expect((s['Inventario.Tesouros'] as string[]).join(' ')).not.toMatch(/Foco da|Broche/)
    expect(s['Inventario.Implementos'].map((r: any) => `${r.Nome}|${r.Propriedade}`)).toEqual([
      '[[Broche Artístico]]|[[Foco da Intensificação]]',
      '[[Broche Artístico]]|[[Foco da Repetição]]',
    ])
  })

})

describe('Combate: rótulos', () => {
  it('implemento com foco: nome do combo + (A) na cor do tier', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    renderFicha('combate')
    const nome = await screen.findByText('Broche Artístico da Intensificação')
    const tier = within(nome).getByText('(A)')
    expect(tier.style.color).toBe(hexToRgb(ITEM_TIER_BTN.A.bd))
  })
  it('imbuição gravada sem alias: "Punhal Relampejante (E)", nunca "Punhal Imbuição Relampejante"', async () => {
    const arma = { ...fm.Inventario.Armas.Lista[0], Propriedade: '[[Imbuição Relampejante]]' }
    semear({ 'Inventario.Armas.Lista': [arma] })
    renderFicha('combate')
    expect(await screen.findByText('Punhal Relampejante (E)')).toBeTruthy()
    expect(screen.queryByText(/Punhal Imbuição/)).toBeNull()
  })
})

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

// "Tá faltando mostrar o ícone do foco junto com o do implemento, como imbuição
// e arma" (mestre, 2026-10-29): figura do FOCO pequena no canto da do implemento.
describe('figura do foco sobre a do implemento', () => {
  const seloDo = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('[aria-label="Foco"]')].map((e) =>
      decodeURIComponent(e.style.backgroundImage),
    )
  for (const tab of ['inventario', 'combate']) {
    it(`${tab}: Broche Artístico da Intensificação leva a figura do Foco da Intensificação; foco sem implemento não`, async () => {
      semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
      const { container } = renderFicha(tab)
      if (tab === 'combate') {
        const tabs = await screen.findAllByText('TESOUROS')
        fireEvent.click(tabs.find((el) => el.closest('button'))!)
      }
      await screen.findByText('Broche Artístico da Intensificação')
      await waitFor(() => expect(seloDo(container)).toHaveLength(1))
      expect(seloDo(container)[0]).toContain('Foco da Intensificação')
    })
  }
})

// "No inventário, o mouse na figura do Broche mostra ele certo mas sem o foco;
// no texto aparece o foco mas o Broche sem o (Adepto) — no combate também"
// (mestre, 2026-10-29). Figura e nome: as DUAS cartas, ambas com a qualidade.
describe('tooltip do implemento com foco', () => {
  const confere = async (alvo: HTMLElement) => {
    const html = await waitFor(() => {
      const h = alvo.closest<HTMLElement>('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ?? ''
      expect(h).toContain('Foco da Intensificação')
      return h
    })
    expect(html).toContain('Broche Artístico')
    expect(html.match(/class="shc-tier">\(Adepto\)/g)?.length).toBe(2)
  }
  it('Inventário: figura e nome mostram Broche (Adepto) + Foco (Adepto)', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    const { container } = renderFicha('inventario')
    const nome = await screen.findByText('Broche Artístico da Intensificação')
    await confere(nome)
    const selo = await waitFor(() => {
      const s = container.querySelector<HTMLElement>('[aria-label="Foco"]')
      expect(s).toBeTruthy()
      return s!
    })
    await confere(selo.parentElement!)
  })
  it('Combate: a figura mostra as duas cartas com a qualidade', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    const { container } = renderFicha('combate')
    const tabs = await screen.findAllByText('TESOUROS')
    fireEvent.click(tabs.find((el) => el.closest('button'))!)
    await screen.findByText('Broche Artístico da Intensificação')
    const selo = await waitFor(() => {
      const s = container.querySelector<HTMLElement>('[aria-label="Foco"]')
      expect(s).toBeTruthy()
      return s!
    })
    await confere(selo.parentElement!)
  })
})
