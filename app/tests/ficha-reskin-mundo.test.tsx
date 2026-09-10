// @vitest-environment jsdom
// RESKIN NA FICHA (report 2026-09-10, criação de criatura no POA 1987):
//   "nas competências aparece SINTONIA em vez do fator"
//   "no + de adicionar arma aparecem os nomes de arma da fantasia"
// A regra do #519 é que NENHUM nome de fantasia chega ao display do mundo
// ativo — o guarda de reskin já cobria compêndio/classes, mas a FICHA tinha
// dois call sites com string crua (rótulo da Sintonia no painel de classe;
// nomes do catálogo de armas do FAB). Cada surface aqui rende com o
// Contexto-Def REAL da POA.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarContextoAosDocs, buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { setActiveContexto } from '../src/data/reskin'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { ContextoDef } from '../src/data/context-def'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { loadDoc } from '../src/data/useDoc'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const temMundo = fs.existsSync(cybContexto) && fs.existsSync(path.join(vaultDataDir, 'index.json'))

const GOBLIN_ID = 'Sistema/Criaturas/Bestiário/Goblin Batedor'

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

describe.skipIf(!temMundo)('ficha no POA 1987 — nada de nome de fantasia no display', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
  ) as IndexManifest
  // o CatalogProvider ativa o reskin a partir do `contextoDef` do catálogo
  // injetado — é assim que o mundo chega no display.
  const def = JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef
  // …e o mesmo filtro de disponibilidade que o app aplica antes de montar o
  // catálogo (é ele que tira do mundo o que a POA não tem).
  const docs = aplicarContextoAosDocs(manifest.docs, def)
  const catalog = { ...buildCatalog({ ...manifest, docs }), contextoDef: def }

  beforeAll(() => {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
    }
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
      const file = path.join(vaultDataDir, rel)
      const ok = fs.existsSync(file)
      return {
        ok,
        status: ok ? 200 : 404,
        json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
      }
    }) as typeof fetch
    setActiveContexto(def)
  })
  afterAll(() => setActiveContexto(null))
  beforeEach(() => {
    window.localStorage.clear()
    __resetLocalStoreForTests()
    __resetHeroStoreMemoryForTests()
  })
  afterEach(cleanup)

  function renderFicha(tab: string) {
    return render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(GOBLIN_ID, tab)]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }

  it('COMPETÊNCIAS: o rótulo da Sintonia é o do mundo (Tipagem)', async () => {
    renderFicha('habilidades')
    expect(await screen.findByText(/TIPAGEM/, undefined, { timeout: 20000 })).toBeTruthy()
    expect(screen.queryByText(/SINTONIA/)).toBeNull()
  }, 30000)

  it('INVENTÁRIO: o catálogo do "+ Adicionar Arma" usa os nomes do mundo', async () => {
    renderFicha('inventario')
    const fabs = await screen.findAllByText(/\+ Adicionar Arma/, undefined, { timeout: 20000 })
    fireEvent.click(fabs[0]!)
    // Besta de Mão → Pistola de Dardos no Contexto-Def da POA (o nome também
    // aparece no dropdown da linha de arma — o que não pode é o de fantasia)
    expect((await screen.findAllByText('Pistola de Dardos')).length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Besta de Mão')).toEqual([])
  }, 30000)

  it('criador de criatura: em Porto Alegre só existe Humano e Incomum', async () => {
    const goblin = JSON.parse(
      fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8'),
    ) as VaultDoc
    const { projection } = await projectHeroRules(goblin.frontmatter as never, catalog, loadDoc)
    expect(projection.racas.map((o) => o.label).sort()).toEqual(['Humano', 'Incomum'])
    // e é o Contexto-Def que faz o corte: sem ele, o bestiário oferece as oito
    const semMundo = buildCatalog(manifest)
    const { projection: fantasia } = await projectHeroRules(
      goblin.frontmatter as never,
      semMundo,
      loadDoc,
    )
    expect(fantasia.racas.length).toBeGreaterThan(2)
  }, 30000)
})
