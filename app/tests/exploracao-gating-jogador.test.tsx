// @vitest-environment jsdom
// Report 2026-08-17 (jogador Carlos): o gating de regiões (#40/#41) não era
// APLICADO na exploração do grupo — o dropdown REGIÃO oferecia todas as vistas
// (inclusive Mundo Completo) e o mapa aparecia inteiro sem o overlay por cima
// das regiões que o mestre desabilitou. Aqui: jogador só vê/usa vistas de
// regiões habilitadas; vista salva não-permitida cai na primeira permitida; e
// o overlay clipado cobre as regiões desabilitadas no mapa da exploração.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PanelExploracao } from '../src/grupo/PanelExploracao'
import {
  __resetMapaAtlasForTests,
  __setSeedMapaAtlasForTests,
  getMapaAtlas,
  regioesDesabilitadas,
  setRegioesHabilitadasGrupo,
} from '../src/map/mapa-atlas-store'
import { SEED_MAPA_ATLAS } from '../src/map/seed-mapa-atlas'
import { MAPA_VISTAS, VISTA_MUNDO_COMPLETO, vistasPermitidas } from '../src/map/mapa-vistas'
import { __resetGroupStoreMemoryForTests, setRegiaoAtiva } from '../src/data/group-store'
import { __resetHexMapStoreMemoryForTests } from '../src/data/hexmap-store'
import { __resetSettingsForTests } from '../src/settings'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'
const MUNDO_LIVRE = 'regiao-f3497878'
const PATRIA_AURORA = 'regiao-383f04f6'
const VISTA_MUNDO_LIVRE = 'Atlas/Mundo Livre/Mundo Livre'

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
  __resetSettingsForTests() // mestre OFF — o viewer é JOGADOR
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderPanel() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <PanelExploracao groupId={GROUP_ID} gatingKey={GROUP_ID} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function regiaoSelect(): Promise<HTMLSelectElement> {
  return (await screen.findByLabelText('Região do grupo')) as HTMLSelectElement
}

describe('gating do jogador na exploração (report 2026-08-17)', () => {
  it('vistasPermitidas: região desabilitada some; Mundo Completo exige todas', () => {
    // padrão anti-spoiler do seed: só Mundo Livre habilitada
    const desab = regioesDesabilitadas(getMapaAtlas(), GROUP_ID)
    const nomes = vistasPermitidas(desab).map((v) => v.nome)
    expect(nomes).toEqual(['Mundo Livre'])
    // GM habilita Pátria Aurora também → entra ela; Mundo Completo segue fora
    setRegioesHabilitadasGrupo(GROUP_ID, [MUNDO_LIVRE, PATRIA_AURORA])
    const nomes2 = vistasPermitidas(regioesDesabilitadas(getMapaAtlas(), GROUP_ID)).map((v) => v.nome)
    expect(nomes2).toEqual(['Mundo Livre', 'Pátria Aurora'])
    // tudo habilitado → todas as vistas, inclusive Mundo Completo
    const todas = vistasPermitidas([]).map((v) => v.id)
    expect(todas).toEqual(MAPA_VISTAS.map((v) => v.id))
  })

  it('dropdown do JOGADOR não oferece região desabilitada nem Mundo Completo', async () => {
    setRegioesHabilitadasGrupo(GROUP_ID, [MUNDO_LIVRE, PATRIA_AURORA])
    renderPanel()
    const sel = await regiaoSelect()
    const opts = [...sel.options].map((o) => o.textContent)
    expect(opts).toContain('Mundo Livre')
    expect(opts).toContain('Pátria Aurora')
    expect(opts).not.toContain('Magna Pátria')
    expect(opts).not.toContain('Mundo Completo')
  })

  it('vista salva NÃO-permitida (mundo completo) cai na primeira permitida', async () => {
    setRegioesHabilitadasGrupo(GROUP_ID, [MUNDO_LIVRE, PATRIA_AURORA])
    setRegiaoAtiva(GROUP_ID, VISTA_MUNDO_COMPLETO) // estado herdado de antes do gating
    renderPanel()
    const sel = await regiaoSelect()
    expect(sel.value).toBe(VISTA_MUNDO_LIVRE)
  })

  it('overlay clipado cobre as regiões desabilitadas no mapa da exploração', async () => {
    setRegioesHabilitadasGrupo(GROUP_ID, [MUNDO_LIVRE, PATRIA_AURORA])
    renderPanel()
    await regiaoSelect()
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeTruthy()
  })

  it('MESTRE segue vendo todas as vistas e sem overlay (preview livre)', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    setRegioesHabilitadasGrupo(GROUP_ID, [MUNDO_LIVRE])
    renderPanel()
    const sel = await regiaoSelect()
    expect([...sel.options].map((o) => o.textContent)).toContain('Mundo Completo')
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeNull()
  })
})
