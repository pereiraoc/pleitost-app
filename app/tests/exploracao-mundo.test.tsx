// @vitest-environment jsdom
// Trilhas de grupo PORTADAS pro mapa-múndi (pedido do mestre):
//   • group-store migra blobs da grade antiga do Mundo Livre pra grade do
//     MUNDO (shift +44,+5 — atlas-grid) na leitura: local antigo (hydrate) e
//     remoto de cliente antigo (setGroupStateFull). `grade:'mundo'` marca o
//     blob migrado; nunca migra duas vezes.
//   • VISTAS (mapa-vistas.ts) recortam o viewport: Mundo Livre = só a parte à
//     DIREITA do hex mais à direita da Magna Pátria; Magna Pátria = a parte à
//     ESQUERDA; Pátria Aurora = zoom na caixa dos hexes; Mundo Completo = tudo.
//     O corte deriva das CÉLULAS das regiões do mapa do mestre (seed).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PanelExploracao } from '../src/grupo/PanelExploracao'
import {
  __resetGroupStoreMemoryForTests,
  getGroupState,
  groupStateJson,
  setGroupStateFull,
  type GroupState,
} from '../src/data/group-store'
import {
  ATLAS_COL_SHIFT,
  ATLAS_GRID_H,
  ATLAS_GRID_W,
  ATLAS_HEX_SIZE,
  ATLAS_ROW_SHIFT,
  atlasHexCenter,
} from '../src/map/atlas-grid'
import {
  CROP_MUNDO,
  MAPA_VISTAS,
  VISTA_MUNDO_COMPLETO,
  vistaCrop,
  vistaGridPath,
} from '../src/map/mapa-vistas'
import { getMapaAtlas, __resetMapaAtlasForTests } from '../src/map/mapa-atlas-store'
import { __resetHexMapStoreMemoryForTests } from '../src/data/hexmap-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'
const STORE_KEY = `pleitost.groupState.${GROUP_ID}`

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
  __resetMapaAtlasForTests()
  __resetGroupStoreMemoryForTests()
  __resetHexMapStoreMemoryForTests()
})
afterEach(cleanup)

// ── migração de grade: Mundo Livre → mundo (shift +44,+5) ───────────────────
describe('group-store — blobs antigos migram pra grade do mundo', () => {
  it('hydrate: blob SEM grade (coords ML) shifta +44,+5 e marca grade; reload não re-shifta', () => {
    // blob salvo por versão antiga do app: trilha do Mundo Livre
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        hexes: [
          { id: 'a', col: 2, row: 11, localId: 'X' },
          { id: 'b', col: 5, row: 7, kind: 'caminho' },
        ],
        atualId: 'a',
        regiaoAtiva: 'Atlas/Mundo Livre/Mundo Livre',
      }),
    )
    const s = getGroupState(GROUP_ID)
    expect(s.grade).toBe('mundo')
    expect(s.hexes).toEqual([
      { id: 'a', col: 2 + ATLAS_COL_SHIFT, row: 11 + ATLAS_ROW_SHIFT, localId: 'X' },
      { id: 'b', col: 5 + ATLAS_COL_SHIFT, row: 7 + ATLAS_ROW_SHIFT, kind: 'caminho' },
    ])
    expect(s.atualId).toBe('a')
    expect(s.regiaoAtiva).toBe('Atlas/Mundo Livre/Mundo Livre')
    // "reload": memória zerada, storage MIGRADO já gravado? A migração é na
    // LEITURA — o storage antigo só regrava numa edição. Reidratar o blob
    // antigo dá o MESMO resultado (determinístico, nunca dupla-migração).
    __resetGroupStoreMemoryForTests()
    expect(getGroupState(GROUP_ID).hexes[0]).toMatchObject({ col: 46, row: 16 })
  })

  it('hydrate: blob COM grade mundo NÃO shifta', () => {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ hexes: [{ id: 'a', col: 46, row: 16 }], grade: 'mundo' }),
    )
    expect(getGroupState(GROUP_ID).hexes[0]).toMatchObject({ col: 46, row: 16 })
  })

  it('setGroupStateFull: remoto de cliente ANTIGO (sem grade) migra; remoto novo não', () => {
    setGroupStateFull(GROUP_ID, { hexes: [{ id: 'r', col: 10, row: 10 }] } as GroupState)
    expect(getGroupState(GROUP_ID).hexes[0]).toMatchObject({
      col: 10 + ATLAS_COL_SHIFT,
      row: 10 + ATLAS_ROW_SHIFT,
    })
    setGroupStateFull(GROUP_ID, {
      hexes: [{ id: 'r', col: 10, row: 10 }],
      grade: 'mundo',
    } as GroupState)
    expect(getGroupState(GROUP_ID).hexes[0]).toMatchObject({ col: 10, row: 10 })
  })

  it('groupStateJson: grade acompanha hexes; estado VAZIO serializa igual ao sentinel do sync', () => {
    // vazio ≡ EMPTY do GrupoView (#379: vazio nunca "parece diferente")
    expect(groupStateJson({ hexes: [], grade: 'mundo' })).toBe(groupStateJson({ hexes: [] }))
    // com hexes o marcador viaja no push
    const j = groupStateJson({ hexes: [{ id: 'a', col: 46, row: 16 }], grade: 'mundo' })
    expect(JSON.parse(j).grade).toBe('mundo')
  })
})

// ── vistas: recortes do mapa-múndi derivados das regiões do mestre ──────────
describe('mapa-vistas — crop por vista (regiões do seed do mestre)', () => {
  const regioes = () => getMapaAtlas().regioes

  it('Mundo Livre: só a parte à DIREITA do hex mais à direita da Magna Pátria', () => {
    const crop = vistaCrop(MAPA_VISTAS[0]!.id, regioes())
    const magna = regioes().find((r) => r.nome === 'Magna Pátria')!
    const corte = Math.max(
      ...magna.cells.map((c) => atlasHexCenter(c.col, c.row).x + ATLAS_HEX_SIZE),
    )
    expect(crop.x).toBeCloseTo(corte, 5)
    expect(crop.x + crop.w).toBe(ATLAS_GRID_W)
    expect(crop.y).toBe(0)
    expect(crop.h).toBe(ATLAS_GRID_H)
  })

  it('Magna Pátria: o INVERSO (a parte à esquerda do mesmo corte)', () => {
    const ml = vistaCrop(MAPA_VISTAS[0]!.id, regioes())
    const mp = vistaCrop('Atlas/Magna Pátria/Magna Pátria', regioes())
    expect(mp.x).toBe(0)
    expect(mp.x + mp.w).toBeCloseTo(ml.x, 5)
    expect(mp.h).toBe(ATLAS_GRID_H)
  })

  it('Pátria Aurora: zoom na caixa dos hexes da região (contém todos os centros)', () => {
    const crop = vistaCrop('vista:patria-aurora', regioes())
    const pa = regioes().find((r) => r.nome === 'Pátria Aurora')!
    for (const c of pa.cells) {
      const p = atlasHexCenter(c.col, c.row)
      expect(p.x).toBeGreaterThanOrEqual(crop.x)
      expect(p.x).toBeLessThanOrEqual(crop.x + crop.w)
      expect(p.y).toBeGreaterThanOrEqual(crop.y)
      expect(p.y).toBeLessThanOrEqual(crop.y + crop.h)
    }
    // é um ZOOM de verdade: bem menor que o mundo
    expect(crop.w).toBeLessThan(ATLAS_GRID_W / 2)
    expect(crop.h).toBeLessThan(ATLAS_GRID_H / 2)
  })

  it('Mundo Completo / vista desconhecida / região ausente → mundo inteiro', () => {
    expect(vistaCrop(VISTA_MUNDO_COMPLETO, regioes())).toEqual(CROP_MUNDO)
    expect(vistaCrop('vista:nao-existe', regioes())).toEqual(CROP_MUNDO)
    expect(vistaCrop(MAPA_VISTAS[0]!.id, [])).toEqual(CROP_MUNDO)
  })

  it('vistaGridPath cobre o crop (malha não-vazia, 1 cadeia por célula)', () => {
    const crop = vistaCrop('vista:patria-aurora', regioes())
    const d = vistaGridPath(crop)
    expect(d.startsWith('M')).toBe(true)
    expect(d.split('M').length).toBeGreaterThan(50)
  })
})

// ── UI: trocar a vista recorta o mapa (viewBox + janela da imagem) ──────────
describe('PanelExploracao — troca de vista recorta o mapa-múndi', () => {
  const renderPanel = () =>
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <PanelExploracao groupId={GROUP_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )

  it('Pátria Aurora dá zoom (viewBox = bbox) e Mundo Completo mostra tudo', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(container.querySelector('[data-mapa]')).toBeTruthy())
    const sel = screen.getByLabelText('Região do grupo') as HTMLSelectElement
    const svg = () => container.querySelector('[data-mapa] svg') as SVGSVGElement

    fireEvent.change(sel, { target: { value: 'vista:patria-aurora' } })
    const cropPA = vistaCrop('vista:patria-aurora', getMapaAtlas().regioes)
    await waitFor(() =>
      expect(svg().getAttribute('viewBox')).toBe(
        `${cropPA.x} ${cropPA.y} ${cropPA.w} ${cropPA.h}`,
      ),
    )
    // a janela da imagem acompanha (offsets negativos posicionam o mundo)
    const img = container.querySelector('[data-mapa-img]') as HTMLImageElement
    expect(img.style.height).toBe(`${(ATLAS_GRID_H / cropPA.h) * 100}%`)
    expect(img.style.left).toBe(`${(-cropPA.x / cropPA.w) * 100}%`)

    fireEvent.change(sel, { target: { value: VISTA_MUNDO_COMPLETO } })
    await waitFor(() =>
      expect(svg().getAttribute('viewBox')).toBe(`0 0 ${ATLAS_GRID_W} ${ATLAS_GRID_H}`),
    )
  })
})
