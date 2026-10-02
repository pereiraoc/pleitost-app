// @vitest-environment jsdom
// ESCUDO DO MESTRE (2026-10-02) — a aba COMBATE da ficha em MODO MESTRE vira o
// painel do mestre: cabeçalho (turno/vez/dificuldade), o combate da sala com
// todos os combatentes do encontro ativo (filtro padrão INIMIGOS, chip TODOS,
// condições na linha) e, POR COMBATENTE, chips que abrem embaixo da linha a
// vista escolhida: DEFESAS, ATAQUES (desc), MAGIAS, PERÍCIAS (desc),
// HABILIDADES (sem modificadores de bestiário) e PERTENCES — cada linha com a
// sua. Jogador (mestre off) segue vendo o COMBATE.
// Harness: FichaPage do Carlos (fixture congelada) + RightSidebar (face
// SESSÃO cria a mesa e mantém o live), repo em memória.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { __resetSessionStoreForTests, listSessions } from '../src/data/session-store'
import { setLiveSession } from '../src/data/session-repo/live-session'
import { __resetSettingsForTests } from '../src/settings'
import { addMonsterToInitiative } from '../src/data/session-repo/encounter-actions'
import { readDisguiseSecret } from '../src/data/session-repo/disguise-secrets'
import { buildCharacterState, buildCharacterSummary } from '../src/data/session-repo/publish'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(fs.readFileSync(resolveVaultFile(vaultDataDir, `${CARLOS_ID}.json`), 'utf8')) as VaultDoc
const GOBLIN_PATH = 'Sistema/Criaturas/Bestiário/Goblin Batedor.md'

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
    const file = resolveVaultFile(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
  __resetSessionStoreForTests()
  setLiveSession(null)
})
/** O settings cacheia o localStorage no módulo — depois de gravar a chave do
 *  modo mestre, recarrega pro próximo render enxergar. */
function modoMestre(on: boolean) {
  window.localStorage.setItem('pleitost.settings.mestre', String(on))
  __resetSettingsForTests()
}
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderApp(repo: InMemorySessionRepo, user: { id: string; nome: string }, rota = heroPath(CARLOS_ID, 'combate')) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={user}>
        <DetailProvider>
          <MemoryRouter initialEntries={[rota]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Routes>
            <RightSidebar drawerOpen onCloseDrawer={() => {}} />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

/** GM cria a mesa pela face SESSÃO; publica o Carlos como herói da mesa e põe
 *  um Goblin Batedor na iniciativa (cria+inicia o combate — o herói entra no
 *  order pelo startEncounter). Devolve ids remotos. */
async function mesaComCombate(repo: InMemorySessionRepo) {
  fireEvent.click(await screen.findByText('+ Criar'))
  await screen.findByText('⚔ COMBATE')
  const remoteId = (await repo.findSessionByCode(listSessions()[0]!.codigo))!.id
  const heroi = await repo.insertCharacter({
    sessionId: remoteId,
    memberId: 'gm-1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: CARLOS_ID,
    visibility: 'visible',
    summary: buildCharacterSummary(carlos),
    state: buildCharacterState(carlos),
    fmBlob: carlos.frontmatter,
  })
  await addMonsterToInitiative({
    repo,
    catalog,
    live: { sessionId: remoteId, gmUserId: 'gm-1', state: null, characters: [], members: [], encounters: [] },
    memberId: 'gm-1',
    sourcePath: GOBLIN_PATH,
    label: 'Goblin Batedor',
  })
  const chars = await repo.findCharactersBySession(remoteId)
  const goblin = chars.find((c) => c.kind === 'npc')!
  return { remoteId, heroi, goblin }
}

const escudo = () => document.querySelector('[data-escudo-mestre]') as HTMLElement | null
const sub = (id: string) => document.querySelector(`[data-escudo-sub="${id}"]`) as HTMLElement | null
/** Linha de um combatente no combate do ESCUDO (não a cópia da sidebar). */
const linha = (id: string) => sub('vida')!.querySelector(`[data-combatente-id="${id}"]`) as HTMLElement
/** Abre a vista `v` NA LINHA do combatente `id` (chip individual). */
const abrirVista = (id: string, v: string) => {
  const chip = linha(id).querySelector(`[data-escudo-vista-chip="${v}"]`) as HTMLButtonElement | null
  expect(chip, `chip ${v} na linha ${id}`).toBeTruthy()
  fireEvent.click(chip!)
}
const vista = (id: string) => linha(id).querySelector('[data-escudo-vista]') as HTMLElement | null

describe('ESCUDO DO MESTRE — gate pelo modo mestre', () => {
  it('mestre OFF: a aba combate é o COMBATE de sempre (nada do escudo)', async () => {
    modoMestre(false)
    renderApp(new InMemorySessionRepo(), { id: 'p-1', nome: 'Ana' })
    await waitFor(() => expect(document.querySelector('.loading')).toBeNull())
    await waitFor(() => expect(screen.getAllByText('ATAQUES').length).toBeGreaterThan(0))
    expect(escudo()).toBeNull()
  })

  it('mestre ON na ficha de um MONSTRO da vault: COMBATE próprio da criatura, não o escudo (#229 a)', async () => {
    modoMestre(true)
    renderApp(new InMemorySessionRepo(), { id: 'gm-1', nome: 'Mestre' }, heroPath('Sistema/Criaturas/Bestiário/Goblin Batedor', 'combate'))
    await waitFor(() => expect(document.querySelector('.loading')).toBeNull())
    await waitFor(() => expect(screen.getByText('VITALIDADE')).toBeTruthy())
    expect(escudo()).toBeNull()
  })

  it('mestre ON sem mesa: casca do escudo com aviso e cabeçalho sem combate', async () => {
    modoMestre(true)
    renderApp(new InMemorySessionRepo(), { id: 'gm-1', nome: 'Mestre' })
    await waitFor(() => expect(escudo()).not.toBeNull())
    expect(within(escudo()!).getByText(/SEM MESA/)).toBeTruthy()
    expect(within(escudo()!).getByText(/SEM COMBATE ATIVO/)).toBeTruthy()
    expect(document.querySelector('[data-escudo-filtro="inimigos"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('[data-escudo-cena-toggle]')).toBeTruthy()
  })
})

describe('ESCUDO DO MESTRE — combate ativo na mesa', () => {
  beforeEach(() => modoMestre(true))

  it('VIDA: só inimigos por padrão (combate da sala filtrado), TODOS traz o herói; cabeçalho turno/vez/dificuldade', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { heroi, goblin } = await mesaComCombate(repo)

    // VIDA = CombateDaSala variante escudo com a linha do goblin, sem o herói
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    expect(sub('vida')!.querySelector('[data-combate-da-sala="escudo"]')).toBeTruthy()
    expect(sub('vida')!.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeNull()
    // a cópia da sidebar continua inteira (herói + goblin) — estados independentes
    const sidebar = document.querySelector('[data-combate-da-sala="sidebar"]') as HTMLElement
    expect(sidebar.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeTruthy()
    // sem o rótulo "⚔ COMBATE" nem "Turno" na cópia do escudo (cabeçalho próprio)
    expect(within(sub('vida')!).queryByText('⚔ COMBATE')).toBeNull()
    expect(within(sub('vida')!).queryByText(/^Turno \d/)).toBeNull()

    // cabeçalho: TURNO 1, vez do primeiro da ordem, dificuldade ao vivo (T0 vs nível 7)
    expect(document.querySelector('[data-escudo-turno]')!.textContent).toBe('TURNO 1')
    expect(document.querySelector('[data-escudo-vez]')!.textContent).not.toBe('—')
    await waitFor(() => expect(document.querySelector('[data-escudo-dificuldade]')).toBeTruthy())
    expect(document.querySelector('[data-escudo-dificuldade]')!.getAttribute('data-escudo-dificuldade')).toBe('TRIVIAL')

    // TODOS → herói aparece no combate do escudo
    fireEvent.click(document.querySelector('[data-escudo-filtro="todos"]')!)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeTruthy())
  })

  it('VIDA: condição ligada no state do combatente vira chip dentro da linha', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    await repo.updateCharacterState(goblin.id, { condicoesAtivas: { Caído: true, Cego: 0 }, efeitosAtivos: { Apressado: true } })
    await waitFor(() => expect(sub('vida')!.querySelector('[data-escudo-condicao="Caído"]')).toBeTruthy())
    const linha = sub('vida')!.querySelector(`[data-combatente-id="${goblin.id}"]`) as HTMLElement
    expect(linha.querySelector('[data-escudo-condicao="Caído"]')).toBeTruthy()
    expect(linha.querySelector('[data-escudo-condicao="Apressado"]')?.getAttribute('data-escudo-condicao-tipo')).toBe('efeito')
    expect(linha.querySelector('[data-escudo-condicao="Cego"]')).toBeNull() // 0 = desligada
  })

  it('vista POR LINHA: cada combatente abre a sua (goblin ATAQUES desc, herói PERTENCES); chip ativo fecha; ordem desc', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { heroi, goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    // nada aberto de saída: só a linha de vida + os chips
    expect(linha(goblin.id).querySelector('[data-escudo-vistas]')).toBeTruthy()
    expect(vista(goblin.id)).toBeNull()

    // DEFESAS do goblin: grid do resumo dentro da LINHA dele
    abrirVista(goblin.id, 'defesas')
    await waitFor(() => expect(vista(goblin.id)?.getAttribute('data-escudo-vista')).toBe('defesas'))
    expect(vista(goblin.id)!.querySelector('[data-resumo-statgrid="defesas"]')).toBeTruthy()
    expect(vista(goblin.id)!.querySelector('[data-escudo-sem-ficha]')).toBeNull()

    // troca pra ATAQUES: só uma vista por linha, do maior pro menor
    abrirVista(goblin.id, 'ataques')
    await waitFor(() => expect(vista(goblin.id)?.querySelector('[data-resumo-ataque]')).toBeTruthy())
    expect(linha(goblin.id).querySelectorAll('[data-escudo-vista]').length).toBe(1)
    const mods = [...vista(goblin.id)!.querySelectorAll('[data-resumo-ataque]')].map((e) => Number(e.getAttribute('data-ataque-mod')))
    expect(mods.length).toBeGreaterThan(0)
    expect(mods).toEqual([...mods].sort((a, b) => b - a))

    // TODOS → o herói entra com a SUA vista independente (PERTENCES), o goblin segue em ATAQUES
    fireEvent.click(document.querySelector('[data-escudo-filtro="todos"]')!)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeTruthy())
    expect(vista(heroi.id)).toBeNull()
    abrirVista(heroi.id, 'pertences')
    await waitFor(() => expect(within(vista(heroi.id)!).getByText('Punhal')).toBeTruthy())
    expect(vista(goblin.id)?.getAttribute('data-escudo-vista')).toBe('ataques')

    // PERÍCIAS do herói: desc
    abrirVista(heroi.id, 'pericias')
    await waitFor(() => expect(vista(heroi.id)?.querySelector('[data-pericia-mod]')).toBeTruthy())
    const pmods = [...vista(heroi.id)!.querySelectorAll('[data-pericia-mod]')].map((e) => Number(e.getAttribute('data-pericia-mod')))
    expect(pmods).toEqual([...pmods].sort((a, b) => b - a))

    // MAGIAS do herói (Bardo) tem seção; do goblin (nada proficiente) não
    abrirVista(heroi.id, 'magias')
    await waitFor(() => expect(within(vista(heroi.id)!).getByText('// MAGIAS')).toBeTruthy())
    abrirVista(goblin.id, 'magias')
    await waitFor(() => expect(vista(goblin.id)?.getAttribute('data-escudo-vista')).toBe('magias'))
    expect(within(vista(goblin.id)!).queryByText('// MAGIAS')).toBeNull()

    // clicar o chip ATIVO fecha a vista daquela linha, as outras ficam
    abrirVista(goblin.id, 'magias')
    await waitFor(() => expect(vista(goblin.id)).toBeNull())
    expect(vista(heroi.id)?.getAttribute('data-escudo-vista')).toBe('magias')
  })

  it('HABILIDADES: mostra o que a criatura FAZ; esconde os modificadores de bestiário (Evolução Básica de Monstro, Competente/Solo/Elite)', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { remoteId, goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    // a ficha REAL do goblin (segredo do disfarce) TEM a Evolução Básica de Monstro
    // (modificador) e a Escaramuça Goblin (habilidade racial) — só a segunda aparece
    const lista = (readDisguiseSecret(remoteId, goblin.id)!.fmBlob['Habilidades'] as { Lista: Record<string, unknown>[] }).Lista
    const nomes = lista.flatMap((h) => Object.keys(h))
    expect(nomes.some((n) => n.includes('Evolução Básica de Monstro'))).toBe(true)
    expect(nomes.some((n) => n.includes('Escaramuça Goblin'))).toBe(true)
    abrirVista(goblin.id, 'habilidades')
    await waitFor(() => expect(within(vista(goblin.id)!).getByText('Escaramuça Goblin')).toBeTruthy())
    expect(within(vista(goblin.id)!).queryByText('Evolução Básica de Monstro')).toBeNull()
    expect(within(vista(goblin.id)!).queryByText('Competente')).toBeNull()
  })

  it('atalho ESCUDO DO MESTRE na face SESSÃO leva o GM pra aba combate da ficha', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' }, heroPath(CARLOS_ID))
    await mesaComCombate(repo)
    const atalho = await screen.findByTitle('Abrir o Escudo do Mestre')
    fireEvent.click(atalho)
    await waitFor(() => expect(escudo()).not.toBeNull())
  })

  it('jogador na mesma mesa: aba combate segue sendo o COMBATE e a face SESSÃO não tem o atalho', async () => {
    modoMestre(false)
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'p-1', nome: 'Ana' })
    await waitFor(() => expect(document.querySelector('.loading')).toBeNull())
    expect(escudo()).toBeNull()
    expect(screen.queryByTitle('Abrir o Escudo do Mestre')).toBeNull()
  })
})
