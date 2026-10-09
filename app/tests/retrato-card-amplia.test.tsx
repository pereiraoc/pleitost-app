// @vitest-environment jsdom
// Pedido do mestre (2026-10-09): "quando tem imagem eu quero poder clicar na
// imagem pra ver ela maior … se eu clico no resto do cartão, pode manter como
// tá". Clique no RETRATO do card abre o Lightbox (versão cheia) SEM navegar;
// clique no resto do card segue abrindo a ficha.
// (setup abaixo herdado do teste #381)
// Report #381: "Quando eu uso voltar, eu não sou mandado de volta pra uma
// tela considerando a aba. Tipo, se eu clico em criaturas, bestiário e depois
// em alguma criatura, se eu uso o voltar (tipo celular) eu não sou mandado
// pra bestiário, eu vejo criatura/pessoas." — a aba ativa da página CRIATURAS
// vivia em useState local: navegar pra ficha e voltar remontava a página na
// aba default (PESSOAS). Fix: a aba vive na URL (`?tab=`, mesmo padrão do
// FichaPage/SessaoFichaPage/#249), trocada com replace (clicar em abas não
// empilha histórico) — o back físico volta pra /npcs?tab=bestiario.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import { __resetLocalStoreForTests, createLocalEntity, emptyHeroFrontmatter } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
  // BESTIÁRIO é aba gated do Modo Mestre (issue #35) — sem isso o clique na
  // aba é no-op (:disabled) e o cenário do report nem começa.
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

/** Botão "voltar do celular": navigate(-1), como o back físico do browser. */
function VoltarFisico() {
  const nav = useNavigate()
  return (
    <button type="button" onClick={() => nav(-1)}>
      voltar-fisico
    </button>
  )
}

/** Eco da URL corrente pra assertar pathname+search após navegações. */
function LocationEcho() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderApp(initialEntries: string[]) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/npcs" element={<NpcsPage />} />
          {/* ficha da criatura (heroPath) e uma tela "anterior" genérica */}
          <Route path="/herois" element={<HeroisPage />} />
          <Route path="/heroi/*" element={<div>FICHA DA CRIATURA</div>} />
          <Route path="/inicio" element={<div>TELA INICIAL</div>} />
        </Routes>
        <VoltarFisico />
        <LocationEcho />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const abaBestiario = () => screen.getByRole('button', { name: 'BESTIÁRIO' })

async function cardGoblin(): Promise<HTMLElement> {
  const el = await waitFor(() => {
    const hit = screen.getAllByText('Goblin Batedor').find((e) => e.classList.contains('npc-nome'))
    expect(hit).toBeTruthy()
    return hit!
  })
  return el.closest('.npc-card') as HTMLElement
}

describe('retrato do card amplia (pedido 2026-10-09)', () => {
  it('bestiário: clicar na imagem abre o lightbox e NÃO abre a ficha; o resto do card abre', async () => {
    renderApp(['/npcs'])
    fireEvent.click(abaBestiario())
    const card = await cardGoblin()
    const retrato = await waitFor(() => {
      const r = card.querySelector('[data-retrato-ampliavel]') as HTMLElement | null
      expect(r).toBeTruthy()
      return r!
    })
    fireEvent.click(retrato)
    expect(screen.getByRole('dialog', { name: 'Imagem ampliada: Goblin Batedor' })).toBeTruthy()
    expect(screen.getByTestId('loc').textContent).toBe('/npcs?tab=bestiario')
    // fecha o lightbox: continua na lista
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('loc').textContent).toBe('/npcs?tab=bestiario')
    // o resto do card segue abrindo a ficha
    fireEvent.click(card.querySelector('.npc-nome') as HTMLElement)
    await screen.findByText('FICHA DA CRIATURA')
  }, 30000)

  it('heróis: clicar no retrato amplia; o nome abre a ficha', async () => {
    createLocalEntity('Heroi', 'Retrato Local', { ...emptyHeroFrontmatter(), Classe: '[[Bardo]]' })
    renderApp(['/herois'])
    const nome = await screen.findByText('Retrato Local')
    const card = nome.closest('.hero-card') as HTMLElement
    const retrato = await waitFor(() => {
      const r = card.querySelector('[data-retrato-ampliavel]') as HTMLElement | null
      expect(r).toBeTruthy()
      return r!
    })
    fireEvent.click(retrato)
    expect(screen.getByRole('dialog', { name: 'Imagem ampliada: Retrato Local' })).toBeTruthy()
    expect(screen.getByTestId('loc').textContent).toBe('/herois')
    fireEvent.click(screen.getByRole('dialog'))
    fireEvent.click(nome)
    await screen.findByText('FICHA DA CRIATURA')
  }, 30000)
})
