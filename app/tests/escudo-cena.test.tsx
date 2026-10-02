// @vitest-environment jsdom
// ESCUDO DO MESTRE — sub-aba CENA (fase 2): a cena ATUAL da aventura em curso
// na mesa, lida do state.aventura da sessão; ANTERIOR/PRÓXIMA gravam a cena
// (irParaCena); aventura trancada neste aparelho manda destravar no compêndio.
// Fixture: a Pós Grenal REAL (cifrada como na vault), destravada pela senha.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { cifrarDoc } from '../../extractor/cifra-doc.mjs'
import { resolveVaultFile } from './fixtures/frozen-heroes'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetSessionStoreForTests } from '../src/data/session-store'
import { getLiveSession, setLiveSession } from '../src/data/session-repo/live-session'
import { __resetDocLocksForTests, unlockWithSenha } from '../src/data/doc-lock'
import { __resetSettingsForTests } from '../src/settings'
import { iniciarAventura, irParaCena } from '../src/aventura/session-actions'
import { heroPath } from '../src/paths'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

// A Pós Grenal cifrada entra no catálogo como na vault (mesmo harness do
// aventura-formato): o escudo só lê o que o compêndio destravou.
const ID = 'Campanhas/Aventuras/Pós Grenal'
const raw = fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'aventuras', 'Pós Grenal.md'), 'utf8')
const { frontmatter, body } = parseFrontmatter(raw) as { frontmatter: Record<string, unknown>; body: string }
const record = {
  id: ID,
  path: `${ID}.md`,
  basename: 'Pós Grenal',
  type: 'Aventura',
  subtype: String(frontmatter['subcategoria']),
  grupo: null,
  frontmatter,
  inlineFields: {},
  ruleElements: [],
  links: [],
  images: [],
  headings: [],
  body,
}
const CIFRADO = cifrarDoc(record, { camposPublicos: ['Chamada', 'rank', 'Formato', 'Duração', 'Jogadores', 'Tom'], senhaDev: 'dev-teste' }) as unknown as VaultDoc
const entry: IndexDocEntry = { id: ID, path: `${ID}.md`, kind: 'content', basename: 'Pós Grenal', type: 'Aventura', subtype: null, protegido: true }
const catalog = buildCatalog({ ...manifest, docs: [...manifest.docs, entry] })

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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    if (rel === `${ID}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(CIFRADO)) }
    const file = resolveVaultFile(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
  __resetSessionStoreForTests()
  __resetDocLocksForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderApp(repo: InMemorySessionRepo) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={{ id: 'gm-1', nome: 'Mestre' }}>
        <DetailProvider>
          <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
              <Route path="/doc/*" element={<div data-rota-doc="">DOC-DO-COMPENDIO</div>} />
            </Routes>
            <RightSidebar drawerOpen onCloseDrawer={() => {}} />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

const escudo = () => document.querySelector('[data-escudo-mestre]') as HTMLElement | null
const abaCena = () => {
  const tabs = within(escudo()!).getAllByRole('button').filter((b) => b.textContent === 'CENA')
  expect(tabs.length).toBeGreaterThan(0)
  fireEvent.click(tabs[0]!)
}
const cenaAtual = () => document.querySelector('[data-escudo-sub="cena"]')?.getAttribute('data-escudo-cena-atual')

async function mesaComAventura(repo: InMemorySessionRepo) {
  fireEvent.click(await screen.findByText('+ Criar'))
  await screen.findByText('⚔ COMBATE')
  await waitFor(() => expect(getLiveSession()).not.toBeNull())
  await iniciarAventura(repo, getLiveSession()!, ID, 'Pós Grenal')
}

describe('ESCUDO — sub-aba CENA', () => {
  it('sem aventura em curso: aviso', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo)
    fireEvent.click(await screen.findByText('+ Criar'))
    await waitFor(() => expect(escudo()).not.toBeNull())
    abaCena()
    expect(await within(escudo()!).findByText(/NENHUMA AVENTURA EM CURSO/)).toBeTruthy()
  })

  it('aventura trancada neste aparelho: aviso + botão pro compêndio (sem vazar o roteiro)', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo)
    await mesaComAventura(repo)
    await waitFor(() => expect(escudo()).not.toBeNull())
    abaCena()
    await waitFor(() => expect(document.querySelector('[data-escudo-cena-trancada]')).toBeTruthy())
    expect(within(escudo()!).queryByText(/Saída do Gre-Nal/)).toBeNull()
    fireEvent.click(within(escudo()!).getByText(/ABRIR A AVENTURA PRA DESTRAVAR/))
    await waitFor(() => expect(document.querySelector('[data-rota-doc]')).toBeTruthy())
  })

  it('destravada: Abertura primeiro; PRÓXIMA/ANTERIOR andam pelas cenas e gravam na sessão; a cena mostra 🔊, registros e combates', async () => {
    await unlockWithSenha(CIFRADO, 'poa1987grenal', false)
    const repo = new InMemorySessionRepo()
    renderApp(repo)
    await mesaComAventura(repo)
    await waitFor(() => expect(escudo()).not.toBeNull())
    abaCena()
    await waitFor(() => expect(cenaAtual()).toBe('abertura'))
    expect(document.querySelector('[data-escudo-abertura]')).toBeTruthy()
    expect((document.querySelector('[data-escudo-cena-anterior]') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(document.querySelector('[data-escudo-cena-proxima]')!)
    await waitFor(() => expect(cenaAtual()).toBe('saida-do-gre-nal'))
    const cena = document.querySelector('[data-escudo-sub="cena"]') as HTMLElement
    expect(cena.querySelector('[data-av-cena="1"]')).toBeTruthy()
    expect(within(cena).getByText('Saída do Gre-Nal')).toBeTruthy()
    // bloco "ler pra mesa" no fluxo da cena + registros/combates da cena
    await waitFor(() => expect(cena.querySelector('.callout')).toBeTruthy())
    expect(cena.querySelector('[data-av-refrow="Personagens"], [data-av-refrow="Local"]')).toBeTruthy()
    // gravou na sessão (state.aventura.cenaAtual)
    await waitFor(() => expect(getLiveSession()?.state?.aventura?.cenaAtual).toBe('saida-do-gre-nal'))

    fireEvent.click(document.querySelector('[data-escudo-cena-proxima]')!)
    await waitFor(() => expect(cenaAtual()).toBe('fuga-subterranea'))
    fireEvent.click(document.querySelector('[data-escudo-cena-anterior]')!)
    await waitFor(() => expect(cenaAtual()).toBe('saida-do-gre-nal'))

    // mudar a cena por FORA (página da aventura) reflete no escudo
    await irParaCena(repo, getLiveSession()!, 'retifica-sertorio')
    await waitFor(() => expect(cenaAtual()).toBe('retifica-sertorio'))
    expect((document.querySelector('[data-escudo-cena-proxima]') as HTMLButtonElement).disabled).toBe(true)
  })
})
