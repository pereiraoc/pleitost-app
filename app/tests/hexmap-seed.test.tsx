// @vitest-environment jsdom
// SEED CANÔNICO DO MAPA (#214) — req do usuário: hex que TEM nome (Safira
// etc.) mostrava "Hex col,row" na lista de caminho/parada. Causa: o
// mapeamento célula→Localização vivia só no navegador onde o mestre pintou o
// mapa. Fix em duas partes, ambas verificadas aqui:
//   1. o mapeamento REAL exportado do editor (pleitost-mapas.json) é
//      versionado como seed (seed-hexmaps.ts) — navegador novo resolve nomes;
//   2. o popover da parada (HexInfo) resolve pelo MESMO hexLabel da lista
//      (célula mapeada), não só pelo localId carimbado no GroupHex.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PanelExploracao } from '../src/grupo/PanelExploracao'
import {
  cellAt,
  getHexMapState,
  setHexLocal,
  __resetHexMapStoreMemoryForTests,
} from '../src/data/hexmap-store'
import { addGroupHex, __resetGroupStoreMemoryForTests } from '../src/data/group-store'
import { createLocalEntity, __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const REGIAO = 'Atlas/Mundo Livre/Mundo Livre'
const SAFIRA = 'Atlas/Mundo Livre/Federação Áurea/Planaltina/Safira'

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
  // navegador NOVO: storage vazio, memórias zeradas, seed padrão ATIVO
  window.localStorage.clear()
  __resetHexMapStoreMemoryForTests()
  __resetGroupStoreMemoryForTests()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

describe('seed canônico do mapa do Mundo Livre (#214)', () => {
  it('navegador novo: Safira resolvível em (22,32) direto do seed versionado', () => {
    const state = getHexMapState(REGIAO)
    expect(state.cells.length).toBeGreaterThan(0)
    expect(cellAt(state.cells, 22, 32)?.localId).toBe(SAFIRA)
  })

  it('estado salvo NESTE navegador vence o seed (edição do usuário manda)', () => {
    // usuário remapeia: persiste o estado inteiro (seed + edição)…
    setHexLocal(REGIAO, 5, 5, SAFIRA)
    // …"reload" (memória zerada, storage mantido): o salvo hidrata, não o seed
    __resetHexMapStoreMemoryForTests()
    const state = getHexMapState(REGIAO)
    expect(cellAt(state.cells, 5, 5)?.localId).toBe(SAFIRA)
    // e o seed continua lá dentro do salvo (a 1ª edição partiu dele)
    expect(cellAt(state.cells, 22, 32)?.localId).toBe(SAFIRA)
  })

  it('lista de caminho/parada mostra "Safira", não "Hex 22,32"; popover idem', async () => {
    const gid = createLocalEntity('Grupo', 'Grupo Teste', {
      categoria: 'Grupo',
      subcategoria: 'Aventureiros',
    })
    // parada criada no hex mapeado — SEM carimbar localId no GroupHex (o
    // clique no mapa não carimba; a resolução tem que vir da célula)
    addGroupHex(gid, { col: 22, row: 32, kind: 'parada' })
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <PanelExploracao groupId={gid} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    // lista lateral do caminho
    const rows = await screen.findAllByText('Safira')
    expect(rows.length).toBeGreaterThan(0)
    expect(screen.queryByText('Hex 22,32')).toBeNull()
    // popover da parada (HexInfo): clicar na linha do caminho seleciona e o
    // nome tem que vir da MESMA resolução (célula mapeada), não do GroupHex
    fireEvent.click(rows[0])
    const popover = document.querySelector('[data-hex-info]')
    expect(popover).toBeTruthy()
    expect(popover!.textContent).toContain('Safira')
    expect(popover!.textContent).not.toContain('Hex 22,32')
  })
})
