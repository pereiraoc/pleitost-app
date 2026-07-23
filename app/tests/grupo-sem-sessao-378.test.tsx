// @vitest-environment jsdom
// Report #378: "personagem que não está em nenhuma sessão (portanto sem
// grupo): se eu clicar em grupo, vai pra alguma outra sessão. Prefiro que não
// deixe clicável a ficha de grupo nesse caso."
// Raiz: o #342 fez a aba GRUPOS mostrar SEMPRE a mesa quando há sessão viva —
// mesmo com o personagem aberto FORA daquela sessão. Fix: o branch da mesa
// exige o personagem PUBLICADO na sessão (characterPath === doc.id); sem
// grupo nem sessão, o botão GRUPO da nav fica desabilitado.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import type { SessionCharacter } from '../src/data/session-repo/contract'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

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
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

/** Sessão viva mínima com UM personagem publicado (characterPath dado). */
function liveCom(characterPath: string): LiveSession {
  const char = {
    id: 'c1',
    sessionId: 's1',
    memberId: 'm1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath,
    visibility: 'party',
    summary: { nome: 'Outro Herói', family: 'Heroi' },
    state: {},
    fmBlob: {},
    updatedAt: '2026-07-23T00:00:00.000Z',
  } as unknown as SessionCharacter
  return {
    sessionId: 's1',
    state: null,
    gmUserId: null,
    characters: [char],
    members: [],
    encounters: [],
  }
}

function renderFicha(id: string, tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, tab)]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#378 — aba GRUPOS não vaza a mesa de outra sessão', () => {
  it('sessão viva SEM o personagem: aba grupos mostra vazio, não a mesa', async () => {
    const id = createLocalEntity('Heroi', 'Solitário', emptyHeroFrontmatter())
    setLiveSession(liveCom('local:Heroi:outro-qualquer'))
    renderFicha(id, 'grupos')
    // empty state do GruposTab (o bug renderizava o GrupoView da MESA)
    expect(await screen.findByText('// NENHUM REGISTRO NESTA CATEGORIA')).toBeTruthy()
  }, 30000)

  it('personagem PUBLICADO na sessão: aba grupos segue mostrando a mesa (#342)', async () => {
    const id = createLocalEntity('Heroi', 'Membro da Mesa', emptyHeroFrontmatter())
    setLiveSession(liveCom(id))
    renderFicha(id, 'grupos')
    // a mesa monta (grupo-screen), não o empty state
    await screen.findByTestId('topbar-avatar')
    expect(screen.queryByText('// NENHUM REGISTRO NESTA CATEGORIA')).toBeNull()
    expect(document.querySelector('.grupo-screen')).toBeTruthy()
  }, 30000)
})

describe('#378 — botão GRUPO da nav desabilitado sem grupo nem sessão', () => {
  it('sem grupo e sem sessão: GRUPO vem desabilitado e o clique não navega', async () => {
    const id = createLocalEntity('Heroi', 'Solitário', emptyHeroFrontmatter())
    renderFicha(id, 'combate')
    const btn = (await screen.findByText('GRUPO')).closest('button')!
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    // segue na aba combate (não navegou pra grupos)
    expect(document.querySelector('.grupo-screen')).toBeNull()
  }, 30000)

  it('Carlos (grupo da vault no FM): GRUPO segue clicável (trap reverso)', async () => {
    renderFicha(CARLOS_ID, 'combate')
    const btn = (await screen.findByText('GRUPO')).closest('button')!
    expect(btn.disabled).toBe(false)
  }, 30000)

  it('sem grupo MAS publicado na sessão viva: GRUPO clicável (vai pra mesa)', async () => {
    const id = createLocalEntity('Heroi', 'Membro da Mesa', emptyHeroFrontmatter())
    setLiveSession(liveCom(id))
    renderFicha(id, 'combate')
    const btn = (await screen.findByText('GRUPO')).closest('button')!
    expect(btn.disabled).toBe(false)
  }, 30000)
})
