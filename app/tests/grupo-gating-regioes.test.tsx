// @vitest-environment jsdom
// #41 — GATING de regiões na ficha do grupo (mestre-only). O mestre escolhe
// quais regiões os JOGADORES deste grupo/sessão veem no Atlas; a chave é a
// MESMA que o jogador resolve como viewer (grupoPersistente ?? DEFAULT_VIEWER),
// então o que o mestre marca aqui é exatamente o que o jogador passa a ver.
// Padrão anti-spoiler: só Mundo Livre.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PanelExploracao } from '../src/grupo/PanelExploracao'
import {
  DEFAULT_VIEWER,
  getMapaAtlas,
  regioesDesabilitadas,
  __resetMapaAtlasForTests,
  __setSeedMapaAtlasForTests,
} from '../src/map/mapa-atlas-store'
import { SEED_MAPA_ATLAS } from '../src/map/seed-mapa-atlas'
import { __resetGroupStoreMemoryForTests } from '../src/data/group-store'
import { __resetHexMapStoreMemoryForTests } from '../src/data/hexmap-store'
import { __resetSettingsForTests } from '../src/settings'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'
const MUNDO_LIVRE = 'regiao-f3497878'
const MAGNA_PATRIA = 'regiao-e5e8309d'

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
  __setSeedMapaAtlasForTests(SEED_MAPA_ATLAS)
  __resetMapaAtlasForTests()
  __resetGroupStoreMemoryForTests()
  __resetHexMapStoreMemoryForTests()
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderPanel(gatingKey: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <PanelExploracao groupId={GROUP_ID} gatingKey={gatingKey} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#41 — gating de regiões na ficha do grupo', () => {
  it('mestre vê o controle; padrão = só Mundo Livre marcado (anti-spoiler)', async () => {
    const { container } = renderPanel('grupo-alfa')
    const box = await screen.findByText('// MAPAS VISÍVEIS PRO GRUPO')
    const sec = box.closest('[data-gating-grupo]') as HTMLElement
    // Mundo Livre marcado; Magna Pátria e Pátria Aurora desmarcados
    const ml = within(sec).getByLabelText('Habilitar Mundo Livre') as HTMLInputElement
    const mp = within(sec).getByLabelText('Habilitar Magna Pátria') as HTMLInputElement
    expect(ml.checked).toBe(true)
    expect(mp.checked).toBe(false)
    void container
  })

  it('habilitar Magna Pátria pro grupo NÃO derruba o Mundo Livre + alinha com o viewer', async () => {
    const gatingKey = 'grupo-alfa'
    renderPanel(gatingKey)
    const sec = (await screen.findByText('// MAPAS VISÍVEIS PRO GRUPO')).closest(
      '[data-gating-grupo]',
    ) as HTMLElement
    fireEvent.click(within(sec).getByLabelText('Habilitar Magna Pátria'))
    // habilitadas do grupo passa a ter Mundo Livre + Magna Pátria (não perdeu ML)
    const hab = getMapaAtlas().habilitadas[gatingKey]
    expect(hab).toBeTruthy()
    expect([...hab].sort()).toEqual([MAGNA_PATRIA, MUNDO_LIVRE].sort())
    // ALINHAMENTO: um jogador com viewer = gatingKey vê Magna Pátria liberada
    const desab = regioesDesabilitadas(getMapaAtlas(), gatingKey).map((r) => r.nome)
    expect(desab).toEqual(['Pátria Aurora'])
    // outro grupo sem config segue só Mundo Livre (Magna Pátria coberta)
    expect(regioesDesabilitadas(getMapaAtlas(), 'grupo-beta').map((r) => r.nome).sort()).toEqual([
      'Magna Pátria',
      'Pátria Aurora',
    ])
  })

  it('"Mundo Completo" liga todas; desmarcar deixa nada visível pro grupo', async () => {
    const gatingKey = 'grupo-alfa'
    renderPanel(gatingKey)
    const sec = (await screen.findByText('// MAPAS VISÍVEIS PRO GRUPO')).closest(
      '[data-gating-grupo]',
    ) as HTMLElement
    fireEvent.click(within(sec).getByLabelText('Todas as regiões'))
    expect(regioesDesabilitadas(getMapaAtlas(), gatingKey)).toHaveLength(0) // tudo visível
    // desmarca "Mundo Completo" → nada visível (escolha explícita do mestre)
    fireEvent.click(within(sec).getByLabelText('Todas as regiões'))
    expect(regioesDesabilitadas(getMapaAtlas(), gatingKey)).toHaveLength(3)
  })

  it('jogador (não-mestre) NÃO vê o controle de gating', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'false')
    __resetSettingsForTests()
    renderPanel(DEFAULT_VIEWER)
    await screen.findByText('// EXPLORAÇÃO')
    expect(screen.queryByText('// MAPAS VISÍVEIS PRO GRUPO')).toBeNull()
  })
})
