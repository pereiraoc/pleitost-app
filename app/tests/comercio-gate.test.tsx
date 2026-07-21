// @vitest-environment jsdom
// F7 do plano #347 — report a751ea41: "estou conseguindo acessar comércios de
// locais que não estou… deveria apenas conseguir ver a aba de comércio se eu
// estiver na posição de parada daquele local (a menos que eu seja o mestre)".
// Gate no data-layer (group-store.podeComerciar): algum grupo com o hex ATUAL
// ligado ao doc do local (localId) libera; Modo Mestre sempre pode. O
// compêndio (Detalhes) segue aberto — só a AÇÃO de comprar é gateada.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { LocationSheet } from '../src/components/compendium/LocationSheet'
import {
  addGroupHex,
  getGroupState,
  podeComerciar,
  setGroupStateFull,
  __resetGroupStoreMemoryForTests,
} from '../src/data/group-store'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CIDADE_ID = 'Atlas/Mundo Livre/Federação Áurea/Campos do Provento/Lilá' // Pequena Cidade
const cidade = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CIDADE_ID}.json`), 'utf8'),
) as VaultDoc

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
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
  __resetGroupStoreMemoryForTests()
  __resetSettingsForTests()
})
afterEach(cleanup)

function renderSheet() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <LocationSheet doc={cidade} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Grupo parado NA cidade: hex com localId do doc marcado como atual. */
function grupoParadoNaCidade() {
  addGroupHex('mesa-teste', { col: 1, row: 1, label: 'Lilá', localId: CIDADE_ID })
  const s = getGroupState('mesa-teste')
  setGroupStateFull('mesa-teste', { ...s, atualId: s.hexes[0]!.id })
}

describe('F7 — comércio gateado pela parada atual (#347)', () => {
  it('podeComerciar: false sem grupo parado; true com hex atual no local', () => {
    expect(podeComerciar(CIDADE_ID)).toBe(false)
    grupoParadoNaCidade()
    expect(podeComerciar(CIDADE_ID)).toBe(true)
    // outro local continua bloqueado
    expect(podeComerciar('Atlas/Mundo Livre/Federação Áurea/Campos do Provento/Rharos')).toBe(false)
  })

  it('aba Comércio DESABILITADA sem parada (com o motivo); Detalhes segue aberta', async () => {
    renderSheet()
    const aba = (await screen.findByRole('tab', { name: 'Comércio' })) as HTMLButtonElement
    expect(aba.disabled).toBe(true)
    expect(aba.title).toContain('parada atual')
    expect(((await screen.findByRole('tab', { name: 'Detalhes' })) as HTMLButtonElement).disabled).toBe(false)
  })

  it('grupo PARADO no local habilita a aba', async () => {
    grupoParadoNaCidade()
    renderSheet()
    const aba = (await screen.findByRole('tab', { name: 'Comércio' })) as HTMLButtonElement
    expect(aba.disabled).toBe(false)
  })

  it('Modo Mestre sempre pode', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    renderSheet()
    const aba = (await screen.findByRole('tab', { name: 'Comércio' })) as HTMLButtonElement
    expect(aba.disabled).toBe(false)
  })
})
