// @vitest-environment jsdom
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
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
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

/** Card do Goblin Batedor na lista do bestiário (o .npc-nome do card). */
async function cardGoblin(): Promise<HTMLElement> {
  const el = await waitFor(() => {
    const hit = screen
      .getAllByText('Goblin Batedor')
      .find((e) => e.classList.contains('npc-nome'))
    expect(hit).toBeTruthy()
    return hit!
  })
  return el.closest('.npc-card') as HTMLElement
}

describe('#381 — voltar físico preserva a aba ativa de CRIATURAS', () => {
  it('bestiário → criatura → voltar cai em /npcs?tab=bestiario com a aba BESTIÁRIO ativa', async () => {
    renderApp(['/npcs'])
    fireEvent.click(abaBestiario())
    expect(abaBestiario().className).toContain('on')

    // abre a ficha da criatura (empilha /heroi/... no histórico)
    fireEvent.click(await cardGoblin())
    await screen.findByText('FICHA DA CRIATURA')

    // back físico: volta pra CRIATURAS **na aba bestiário** (o report via
    // "criatura/pessoas" porque a aba morava em useState e resetava)
    fireEvent.click(screen.getByText('voltar-fisico'))
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/npcs?tab=bestiario')
      expect(abaBestiario().className).toContain('on')
    })
  }, 30000)

  it('trocar de aba usa replace: um único voltar sai de /npcs (não repassa por cada aba)', async () => {
    renderApp(['/inicio', '/npcs'])
    // três trocas de aba…
    fireEvent.click(abaBestiario())
    fireEvent.click(screen.getByRole('button', { name: 'COMPANHEIROS ANIMAIS' }))
    fireEvent.click(abaBestiario())
    expect(abaBestiario().className).toContain('on')
    // …e UM voltar já sai da página (as trocas não empilharam histórico)
    fireEvent.click(screen.getByText('voltar-fisico'))
    await screen.findByText('TELA INICIAL')
  }, 30000)

  it('deep-links intactos: /npcs sem query abre PESSOAS; ?tab=combate (#249) segue valendo', async () => {
    const { unmount } = renderApp(['/npcs'])
    expect(screen.getByRole('button', { name: 'PESSOAS' }).className).toContain('on')
    unmount()

    renderApp(['/npcs?tab=combate'])
    expect(screen.getByRole('button', { name: 'COMBATE' }).className).toContain('on')
  }, 30000)
})
