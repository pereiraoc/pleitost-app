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

// Pedido do mestre (2026-11-23): "quando eu adiciono implemento, não tá
// mostrando os focos na forma como é armas; pode separar pra ser no início dos
// tesouros os implementos". Cada linha de Inventario.Implementos vira um CARD
// no formato do da arma (figura, implemento, figura + seletor do foco,
// qualidade, item bônus, vender/descartar), no topo do painel de Tesouros.
/** Tesouros do Carlos sem os dois focos soltos (que a migração vira card). */
const SEM_FOCOS = (fm.Inventario.Tesouros as string[]).filter((t) => !/Foco da/.test(t))
const cards = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-implemento]')]
const sel = (card: HTMLElement, label: string) => within(card).getByLabelText(label) as HTMLSelectElement
/** Os cards ficam dentro dos TESOUROS: só editam no ✎ Alterar (#599). */
const alterar = () => fireEvent.click(screen.getByRole('button', { name: '✎ Alterar' }))

describe('Inventário: implementos em card, no início dos tesouros', () => {
  it('Broche A + Intensificação A num card só, antes dos tesouros; o foco sem implemento pede o implemento e grava as DUAS listas', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    const { container } = renderFicha('inventario')
    await waitFor(() => expect(cards(container)).toHaveLength(2))
    alterar()
    const [broche, solto] = cards(container)
    expect(sel(broche!, 'Implemento').value).toBe('Broche Artístico')
    expect(sel(broche!, 'Foco do implemento').value).toBe('Foco da Intensificação')
    // nenhum implemento sobra na lista de tesouros, e os cards vêm ANTES dela
    const linhas = [...container.querySelectorAll<HTMLElement>('[data-tesouro]')]
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.map((l) => l.dataset.tesouro).join(' ')).not.toMatch(/Broche|Foco da/)
    expect(broche!.compareDocumentPosition(linhas[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // foco de ficha antiga sem implemento: o card nasce com o implemento vazio
    expect(sel(solto!, 'Implemento').value).toBe('')
    expect(sel(solto!, 'Foco do implemento').value).toBe('Foco da Repetição')
    fireEvent.change(sel(solto!, 'Implemento'), { target: { value: 'Broche Artístico' } })
    await waitFor(() =>
      expect(salvo()['Inventario.Implementos']?.map((r: any) => `${r.Nome}|${r.Propriedade}`)).toEqual([
        '[[Broche Artístico]]|[[Foco da Intensificação]]',
        '[[Broche Artístico]]|[[Foco da Repetição]]',
      ]),
    )
    expect((salvo()['Inventario.Tesouros'] as string[]).join(' ')).not.toMatch(/Foco da|Broche/)
  })

  it('trocar o foco e a qualidade no card grava a linha certa', async () => {
    semear({
      'Inventario.Tesouros': SEM_FOCOS,
      'Inventario.Implementos': [
        { Nome: '[[Luva do Arcanista]]', Propriedade: '', Categoria: '[[Adepto]]', Fonte: 'Manual' },
        { Nome: '[[Broche Artístico]]', Propriedade: '[[Foco da Repetição]]', Categoria: '[[Adepto]]', Fonte: 'Comércio' },
      ],
    })
    const { container } = renderFicha('inventario')
    await waitFor(() => expect(cards(container)).toHaveLength(2))
    alterar()
    const luva = cards(container).find((c) => sel(c, 'Implemento').value === 'Luva do Arcanista')!
    expect(sel(luva, 'Foco do implemento').value).toBe('')
    fireEvent.change(sel(luva, 'Foco do implemento'), { target: { value: 'Foco da Penetração' } })
    await waitFor(() => expect(salvo()['Inventario.Implementos'][0].Propriedade).toBe('[[Foco da Penetração]]'))
    const m = [...luva.querySelectorAll<HTMLElement>('span')].find((x) => x.textContent === 'M' && x.style.width === '26px')!
    fireEvent.click(m)
    await waitFor(() => expect(salvo()['Inventario.Implementos'][0].Categoria).toBe('[[Mestre]]'))
    expect(salvo()['Inventario.Implementos'][1].Propriedade).toBe('[[Foco da Repetição]]')
  })

  it('implemento adicionado pelo "+ Adicionar Tesouro" aparece em card, pronto pra receber o foco', async () => {
    semear({ 'Inventario.Tesouros': SEM_FOCOS })
    const { container } = renderFicha('inventario')
    await screen.findAllByLabelText('Arma')
    fireEvent.click(screen.getByRole('button', { name: 'EQUIPAMENTOS' }))
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar Tesouro/ }))
    const item = await waitFor(() => {
      const span = [...document.querySelectorAll<HTMLElement>('button span')].find((x) => x.textContent === 'Luva do Arcanista')
      expect(span).toBeTruthy()
      return span!.closest('button')!
    })
    fireEvent.click(item)
    await waitFor(() => expect(cards(container)).toHaveLength(1))
    alterar()
    const card = cards(container)[0]!
    expect(sel(card, 'Implemento').value).toBe('Luva do Arcanista')
    fireEvent.change(sel(card, 'Foco do implemento'), { target: { value: 'Foco da Consistência' } })
    await waitFor(() =>
      expect(salvo()['Inventario.Implementos']).toEqual([
        { Nome: '[[Luva do Arcanista]]', Propriedade: '[[Foco da Consistência]]', Categoria: '[[Adepto]]', Fonte: 'Manual' },
      ]),
    )
  })
})

// Reportado por @thallesagm (#599): "Está sendo possível editar o tesouro sem
// clicar no modo Alterar dentro dos tesouros do inventário."
describe('#599: card do implemento só edita no Alterar dos tesouros', () => {
  it('fora do Alterar: nomes e qualidade à mostra, sem seletor, qualidade, vender nem descartar', async () => {
    semear({
      'Inventario.Tesouros': SEM_FOCOS,
      'Inventario.Implementos': [
        { Nome: '[[Broche Artístico]]', Propriedade: '[[Foco da Repetição]]', Categoria: '[[Experiente]]', Fonte: 'Comércio' },
      ],
    })
    const { container } = renderFicha('inventario')
    await waitFor(() => expect(cards(container)).toHaveLength(1))
    const card = cards(container)[0]!
    expect(card.querySelector('select')).toBeNull()
    expect(within(card).queryByTitle(/Vender/)).toBeNull()
    expect(within(card).queryByText('QUALIDADE')).toBeNull()
    expect(within(card).getByText('Broche Artístico')).toBeTruthy()
    expect(within(card).getByText('Foco da Repetição')).toBeTruthy()
    expect(within(card).getByText('(E)')).toBeTruthy()
    alterar()
    expect(sel(cards(container)[0]!, 'Implemento').value).toBe('Broche Artístico')
    expect(within(cards(container)[0]!).getByText('QUALIDADE')).toBeTruthy()
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
  it('combate: Broche Artístico da Intensificação leva a figura do Foco da Intensificação; foco sem implemento não', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    const { container } = renderFicha('combate')
    const tabs = await screen.findAllByText('TESOUROS')
    fireEvent.click(tabs.find((el) => el.closest('button'))!)
    await screen.findByText('Broche Artístico da Intensificação')
    await waitFor(() => expect(seloDo(container)).toHaveLength(1))
    expect(seloDo(container)[0]).toContain('Foco da Intensificação')
  })
  it('inventário: o card mostra a figura do foco ao lado do seletor, como a imbuição na arma', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    const { container } = renderFicha('inventario')
    const fig = await waitFor(() => {
      const f = container.querySelector<HTMLElement>('[data-implemento] [data-figura-foco]')
      expect(decodeURIComponent(f?.style.backgroundImage ?? '')).toContain('Foco da Intensificação')
      return f!
    })
    expect(fig).toBeTruthy()
  })
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
  it('Inventário: a figura do card mostra Broche (Adepto) + Foco (Adepto)', async () => {
    semear({ 'Inventario.Tesouros': [...fm.Inventario.Tesouros, BROCHE] })
    const { container } = renderFicha('inventario')
    const fig = await waitFor(() => {
      const f = container.querySelector<HTMLElement>('[data-implemento] [data-figura-implemento]')
      expect(f).toBeTruthy()
      return f!
    })
    await confere(fig)
  })
  // Reportado por @thallesagm (#600): "quando não é escolhido foco para o
  // Bracelete Elemental, o bracelete aparece duas vezes ao deixar o cursor".
  it('#600 Combate: implemento SEM foco mostra uma carta só', async () => {
    semear({
      'Inventario.Tesouros': SEM_FOCOS,
      'Inventario.Implementos': [{ Nome: '[[Bracelete Elemental]]', Propriedade: '', Categoria: '[[Adepto]]', Fonte: 'Manual' }],
    })
    renderFicha('combate')
    const tabs = await screen.findAllByText('TESOUROS')
    fireEvent.click(tabs.find((el) => el.closest('button'))!)
    const nome = await screen.findByText('Bracelete Elemental')
    const linha = nome.closest<HTMLElement>('div[style*="padding: 12px 15px"]')!
    const html = await waitFor(() => {
      const h = linha.querySelector<HTMLElement>('[data-breakdown-html]')?.getAttribute('data-breakdown-html') ?? ''
      expect(h).toContain('Bracelete Elemental')
      return h
    })
    expect(html.match(/class="shc-tier">\(Adepto\)/g)?.length).toBe(1)
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
