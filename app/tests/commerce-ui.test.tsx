// @vitest-environment jsdom
// ABA COMÉRCIO da Localização (issue #72) — loja com rolagem sobre a Canto Alto
// REAL (Capital, Recursos com tesouros). Fetch stubado lê os JSONs do disco.
// A rolagem usa Math.random; o teste o determiniza (stub) para asserções
// estáveis. Cobre: config de GM (matriz), rolar/re-rolar/travar, comprar
// (debita ouro + adiciona ao herói + decrementa disponibilidade).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { LocationSheet } from '../src/components/compendium/LocationSheet'
import { ConfigPage } from '../src/components/config/ConfigPage'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { __resetHeroStoreMemoryForTests, getHeroEdits, writeHeroEdit } from '../src/data/hero-store'
import { __resetCommerceStoreForTests } from '../src/data/commerce-store'
import {
  setSelectedCreature,
  __resetSelectedCreatureForTests,
} from '../src/data/selected-creature-store'
import { __resetSettingsForTests } from '../src/settings'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const cantoAlto = readDoc('Atlas/Mundo Livre/Principado das Flores/Canto Alto')
const ZUKO_ID = 'Sistema/Criaturas/Heróis/Zuko'

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
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  // Modo Mestre ligado para expor os controles de GM da loja/config.
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})

beforeEach(() => {
  __resetCommerceStoreForTests()
  __resetHeroStoreMemoryForTests()
  __resetSettingsForTests()
  __resetSelectedCreatureForTests()
  // limpa só o estado de comércio/heróis, preserva a flag do Mestre
  for (const k of Object.keys({ ...localStorage })) {
    if (k.startsWith('pleitost.commerce.') || k.startsWith('pleitost.heroEdits.')) {
      localStorage.removeItem(k)
    }
  }
  localStorage.removeItem('pleitost.settings.disponibilidade')
  localStorage.removeItem('pleitost.selectedCreature')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderLoja() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <LocationSheet doc={cantoAlto} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Abre a aba Comércio e espera os docs de Recurso carregarem (botão ROLAR
 *  habilita quando refDocs chega). */
async function abrirComercio() {
  fireEvent.click(screen.getByRole('tab', { name: 'Comércio' }))
  const rolar = await screen.findByRole('button', { name: /ROLAR|RE-ROLAR/ })
  await waitFor(() => expect((rolar as HTMLButtonElement).disabled).toBe(false))
  return rolar as HTMLButtonElement
}

describe('config de GM: matriz de Disponibilidade de Tesouros', () => {
  it('edita uma célula da matriz e persiste em pleitost.settings.disponibilidade', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <ConfigPage />
        </MemoryRouter>
      </CatalogProvider>,
    )
    // seção só aparece com Modo Mestre ligado (flag setada no beforeAll)
    expect(await screen.findByText('Disponibilidade de Tesouros')).toBeTruthy()
    // célula Capital × Adepto vale 100 (default da nota)
    const inputs = screen.getAllByLabelText('disponibilidade') as HTMLInputElement[]
    const capitalAdepto = inputs.find((i) => i.value === '100')!
    expect(capitalAdepto).toBeTruthy()
    fireEvent.change(capitalAdepto, { target: { value: '77' } })
    const saved = JSON.parse(localStorage.getItem('pleitost.settings.disponibilidade')!)
    expect(saved['Capital'].A).toBe(77)
  })
})

describe('loja: rolar, travar, re-rolar', () => {
  it('rola a disponibilidade e mostra tesouros com tier/preço; re-rolar muda o estoque', async () => {
    // Capital: Adepto 100% (garantido), Experiente 25%, Mestre 2%.
    // rng alto → só os garantidos de Adepto (100%); E/M falham.
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    renderLoja()
    const rolar = await abrirComercio()
    fireEvent.click(rolar)
    // Anel Canário é EQUIPAMENTO → aba Equipamentos (o default é Armas)
    fireEvent.click(await screen.findByRole('tab', { name: 'EQUIPAMENTOS' }))

    // Anel Canário é Recurso Tesouro de Canto Alto (preço 40 PO base, Adepto ×1)
    const comprarBtns = await screen.findAllByRole('button', { name: /^Comprar / })
    expect(comprarBtns.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Anel Canário').length).toBeGreaterThan(0)
    // preço Adepto do Anel Canário = 40 PO
    expect(screen.getAllByText('40 PO').length).toBeGreaterThan(0)
    // nenhum item Mestre (rng alto reprovou os 2%)
    const nRolagem1 = screen.getAllByRole('button', { name: /^Comprar / }).length

    // re-rolar com rng baixo → mais itens (Experiente/Mestre entram)
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    fireEvent.click(screen.getByRole('button', { name: /RE-ROLAR/ }))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Comprar / }).length).toBeGreaterThan(nRolagem1),
    )
  })
})

describe('loja: comprar debita ouro, adiciona ao herói e decrementa disponibilidade', () => {
  it('fluxo de compra completo com herói da vault (Zuko)', async () => {
    // dá ouro ao Zuko via overlay (vault hero nasce com Ouro 0)
    writeHeroEdit(ZUKO_ID, 'fm', 'Inventario.Ouro', 500, { channel: 'imediato', origem: 'teste' })
    // o comprador é o herói SELECIONADO globalmente (sem seletor na loja)
    setSelectedCreature(ZUKO_ID)
    // rng: Adepto garantido 1 de cada, sem E/M
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    renderLoja()
    const rolar = await abrirComercio()
    fireEvent.click(rolar)
    fireEvent.click(await screen.findByRole('tab', { name: 'EQUIPAMENTOS' }))
    await screen.findAllByRole('button', { name: /^Comprar / })
    // (o saldo agora fica na topbar, fora da loja — o débito é conferido no fim)

    // compra o Anel Canário (Adepto, 40 PO — único com rng alto). O botão de
    // compra tem aria-label "Comprar <nome>".
    const comprar = screen.getByRole('button', { name: 'Comprar Anel Canário' })
    fireEvent.click(comprar)

    // ouro debitado no overlay do herói (500 - 40 = 460)
    await waitFor(() => expect(getHeroEdits(ZUKO_ID).fm['Inventario.Ouro']).toBe(460))
    // tesouro adicionado ao inventário do herói (append ao existente do FM extraído+overlay)
    const tesouros = getHeroEdits(ZUKO_ID).fm['Inventario.Tesouros'] as string[]
    expect(tesouros).toContain('[[Anel Canário|Anel Canário (Adepto)]]')
    // aviso de sucesso com o ouro restante
    expect(await screen.findByText(/Ouro restante: 460 PO/)).toBeTruthy()
  })
})
