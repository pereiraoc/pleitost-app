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

  it('CONDIÇÕES é a última vista: lista inteira com COMBATE primeiro; toque liga/desliga NA HORA sem abrir detalhes; herói só leitura', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { remoteId, heroi, goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    // nada de fila "sempre ativa" em cima: só o chip CONDIÇÕES no fim
    expect(linha(goblin.id).querySelector('[data-escudo-condicoes]')).toBeNull()
    expect(document.querySelector('[data-escudo-condicoes-toggle]')).toBeNull()
    await repo.updateCharacterState(goblin.id, { condicoesAtivas: { Caído: true, Cego: 0 }, efeitosAtivos: { Apressado: true } })
    // o chip mostra a contagem das ligadas (Caído + Apressado; Cego=0 não conta)
    await waitFor(() => expect(linha(goblin.id).querySelector('[data-escudo-vista-chip="condicoes"]')!.textContent).toBe('CONDIÇÕES 2'))

    abrirVista(goblin.id, 'condicoes')
    await waitFor(() => expect(vista(goblin.id)?.getAttribute('data-escudo-vista')).toBe('condicoes'))
    const grupos = [...vista(goblin.id)!.querySelectorAll('[data-escudo-condicoes-grupo]')].map((g) => g.getAttribute('data-escudo-condicoes-grupo'))
    expect(grupos[0]).toBe('combate') // Vantagem de Combate + Acerto Decisivo juntos, no início
    const combate = vista(goblin.id)!.querySelector('[data-escudo-condicoes-grupo="combate"]') as HTMLElement
    expect([...combate.querySelectorAll('[data-escudo-condicao-chip]')].map((e) => e.getAttribute('data-escudo-condicao-chip'))).toEqual(['Vantagem de Combate', 'Acerto Decisivo'])
    expect(grupos).toContain('Positiva')
    expect(grupos).toContain('Negativa')
    const chip = (nome: string) => vista(goblin.id)!.querySelector(`[data-escudo-condicao-chip="${nome}"]`) as HTMLButtonElement
    expect(chip('Caído').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Cego').getAttribute('aria-pressed')).toBe('false')
    expect(chip('Apressado').getAttribute('aria-pressed')).toBe('true') // efeito ligado, grupo EFEITOS
    // Vantagem de Combate NÃO se repete nas positivas
    expect(vista(goblin.id)!.querySelectorAll('[data-escudo-condicao-chip="Vantagem de Combate"]').length).toBe(1)

    // ligar Cego reflete NA HORA; nada abriu nos DETALHES
    fireEvent.click(chip('Cego'))
    expect(chip('Cego').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('[data-detail-kind]')).toBeNull()
    // toque DUPLO rápido na MESMA condição (off → on) reflete os dois, antes de qualquer refetch
    fireEvent.click(chip('Cego'))
    expect(chip('Cego').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip('Cego'))
    expect(chip('Cego').getAttribute('aria-pressed')).toBe('true')
    // rajada: Atordoado on + Caído off antes de qualquer refetch — nenhum toque se perde
    fireEvent.click(chip('Atordoado'))
    fireEvent.click(chip('Caído'))
    expect(chip('Caído').getAttribute('aria-pressed')).toBe('false')
    await waitFor(async () => {
      const st = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === goblin.id)!.state
      expect(st.condicoesAtivas['Cego']).toEqual({ value: 1 })
      expect(st.condicoesAtivas['Atordoado']).toEqual({ value: 1 })
      expect('Caído' in st.condicoesAtivas).toBe(false)
    })
    // depois do refetch segue igual (overlay soltou sem piscar); contagem 3 (Cego, Atordoado, Apressado)
    await waitFor(() => expect(linha(goblin.id).querySelector('[data-escudo-vista-chip="condicoes"]')!.textContent).toBe('CONDIÇÕES 3'))
    expect(chip('Caído').getAttribute('aria-pressed')).toBe('false')

    // herói: CONDIÇÕES só existe com algo ligado, e só leitura
    fireEvent.click(document.querySelector('[data-escudo-filtro="todos"]')!)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeTruthy())
    const chipH = () => linha(heroi.id).querySelector('[data-escudo-vista-chip="condicoes"]') as HTMLButtonElement
    // a ficha congelada do Carlos pode ter estados salvos: o chip só é clicável se há algo ligado
    const temAlgo = Object.values({ ...heroi.state.condicoesAtivas, ...heroi.state.efeitosAtivos }).some((v) => !!v)
    expect(chipH().disabled).toBe(!temAlgo)
    await repo.updateCharacterState(heroi.id, { condicoesAtivas: { Caído: { value: 1 } } })
    await waitFor(() => expect(chipH().disabled).toBe(false))
    expect(chipH().textContent).toMatch(/^CONDIÇÕES [1-9]\d*$/)
    abrirVista(heroi.id, 'condicoes')
    await waitFor(() => expect(vista(heroi.id)?.querySelector('[data-escudo-condicao-chip="Caído"]')).toBeTruthy())
    expect((vista(heroi.id)!.querySelector('[data-escudo-condicao-chip="Caído"]') as HTMLButtonElement).disabled).toBe(true)
    expect(vista(heroi.id)!.querySelector('[data-escudo-condicao-chip="Cego"]')).toBeNull() // só as ligadas
  })

  it('pedido 2026-10-08: classe embaixo do nome — monstro com Tier, herói com Nível', async () => {
    modoMestre(true)
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { heroi, goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(linha(goblin.id)).toBeTruthy())
    expect(linha(goblin.id).querySelector('[data-combatente-classe]')!.textContent).toBe('Batedor · Tier 0')
    fireEvent.click(document.querySelector('[data-escudo-filtro="todos"]')!)
    await waitFor(() => expect(linha(heroi.id)).toBeTruthy())
    // nome da classe no mundo ativo (o reskin troca Menestrel → Trovador)
    expect(linha(heroi.id).querySelector('[data-combatente-classe]')!.textContent).toMatch(
      /^\S+ Inspirador de Luta Artística · Nível 7$/,
    )
  })

  it('linha: defesas sempre embaixo da vida (sem toggle 🛡️); vista POR LINHA (goblin ATAQUES desc, herói PERTENCES sem armas); chip vazio desabilitado; chip ativo fecha', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { remoteId, heroi, goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    // defesas/sentidos/movimento SEMPRE na linha (formato do toggle), e o toggle não existe no escudo
    expect(linha(goblin.id).querySelector('[data-escudo-stats]')).toBeTruthy()
    // a linha publicada é mascarada (stats zerados): o número vem do segredo do GM
    const statsReais = readDisguiseSecret(remoteId, goblin.id)!.summary.stats
    expect(linha(goblin.id).textContent).toContain(`🛡️${statsReais.defesa}`)
    expect(within(linha(goblin.id)).queryByTitle('Ver defesas/stats')).toBeNull()
    // a cópia da sidebar mantém o toggle
    const sidebar = document.querySelector('[data-combate-da-sala="sidebar"]') as HTMLElement
    expect(within(sidebar).getAllByTitle('Ver defesas/stats').length).toBeGreaterThan(0)
    // nada aberto de saída: só os chips; sem chip de DEFESAS
    expect(linha(goblin.id).querySelector('[data-escudo-vistas]')).toBeTruthy()
    expect(linha(goblin.id).querySelector('[data-escudo-vista-chip="defesas"]')).toBeNull()
    expect(vista(goblin.id)).toBeNull()
    // goblin: MAGIAS (tudo N) e PERTENCES (só armas) vazios → desabilitados; ATAQUES/PERÍCIAS/HABILIDADES ativos
    const chip = (id: string, v: string) => linha(id).querySelector(`[data-escudo-vista-chip="${v}"]`) as HTMLButtonElement
    expect(chip(goblin.id, 'magias').disabled).toBe(true)
    expect(chip(goblin.id, 'pertences').disabled).toBe(true)
    expect(chip(goblin.id, 'ataques').disabled).toBe(false)
    expect(chip(goblin.id, 'pericias').disabled).toBe(false)
    expect(chip(goblin.id, 'habilidades').disabled).toBe(false)
    fireEvent.click(chip(goblin.id, 'magias'))
    expect(vista(goblin.id)).toBeNull()

    // ATAQUES do goblin: o painel da aba Combate dentro da LINHA dele, do maior pro menor acerto
    abrirVista(goblin.id, 'ataques')
    await waitFor(() => expect(vista(goblin.id)?.querySelector('[data-ataque-linha]')).toBeTruthy())
    expect(linha(goblin.id).querySelectorAll('[data-escudo-vista]').length).toBe(1)
    const mods = [...vista(goblin.id)!.querySelectorAll('[data-ataque-linha]')].map((e) => Number(e.getAttribute('data-ataque-mod')))
    expect(mods.length).toBeGreaterThan(0)
    expect(mods).toEqual([...mods].sort((a, b) => b - a))
    // lista COMPACTA: sem figuras nem fila de chips do painel da ficha
    expect(within(vista(goblin.id)!).queryByText('Vantagem de Combate')).toBeNull()
    const modAntes = mods[0]!
    const danoAntes = vista(goblin.id)!.querySelector('[data-ataque-linha]')!.getAttribute('data-ataque-dano')
    const primeiro = () => vista(goblin.id)!.querySelector('[data-ataque-linha]')!
    // Vantagem de Combate + Acerto Decisivo ligados na vista CONDIÇÕES (grupo COMBATE)…
    abrirVista(goblin.id, 'condicoes')
    await waitFor(() => expect(vista(goblin.id)?.querySelector('[data-escudo-condicao-chip="Vantagem de Combate"]')).toBeTruthy())
    fireEvent.click(vista(goblin.id)!.querySelector('[data-escudo-condicao-chip="Vantagem de Combate"]')!)
    fireEvent.click(vista(goblin.id)!.querySelector('[data-escudo-condicao-chip="Acerto Decisivo"]')!)
    await waitFor(async () => {
      const st = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === goblin.id)!.state
      expect(st.condicoesAtivas['Vantagem de Combate']).toEqual({ value: 1 })
      expect(st.efeitosAtivos['Acerto Decisivo']).toEqual({ on: true })
    })
    // …e em ATAQUES o acerto sobe +2 (VC) e o dano muda (+1 dado da arma), como na tela de combate
    abrirVista(goblin.id, 'ataques')
    await waitFor(() => expect(Number(primeiro().getAttribute('data-ataque-mod'))).toBe(modAntes + 2))
    expect(primeiro().getAttribute('data-ataque-dano')).not.toBe(danoAntes)

    // Regressão (report 2026-10-02: "tirei Vantagem de Combate e o dano continuou d6 verdinho"): a FICHA
    // grava a VC nos DOIS mapas; desligar no Escudo tem que apagar dos dois (dual-delete), senão a
    // engine (que lê o OR) mantém a Vantagem — e o Apunhalante — presos.
    await repo.updateCharacterState(goblin.id, {
      condicoesAtivas: { 'Vantagem de Combate': { value: 1 } },
      efeitosAtivos: { 'Vantagem de Combate': { on: true } },
    })
    abrirVista(goblin.id, 'condicoes')
    // espera o live refletir o state externo (Acerto Decisivo saiu) antes de mexer
    await waitFor(() => expect(vista(goblin.id)?.querySelector('[data-escudo-condicao-chip="Acerto Decisivo"]')?.getAttribute('aria-pressed')).toBe('false'))
    expect(vista(goblin.id)!.querySelector('[data-escudo-condicao-chip="Vantagem de Combate"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(vista(goblin.id)!.querySelectorAll('[data-escudo-condicao-chip="Vantagem de Combate"]').length).toBe(1)
    fireEvent.click(vista(goblin.id)!.querySelector('[data-escudo-condicao-chip="Vantagem de Combate"]')!)
    expect(vista(goblin.id)!.querySelector('[data-escudo-condicao-chip="Vantagem de Combate"]')!.getAttribute('aria-pressed')).toBe('false')
    await waitFor(async () => {
      const st = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === goblin.id)!.state
      expect('Vantagem de Combate' in st.condicoesAtivas).toBe(false)
      expect('Vantagem de Combate' in st.efeitosAtivos).toBe(false)
      expect('Acerto Decisivo' in st.efeitosAtivos).toBe(false)
    })
    abrirVista(goblin.id, 'ataques')
    await waitFor(() => expect(Number(primeiro().getAttribute('data-ataque-mod'))).toBe(modAntes))
    expect(primeiro().getAttribute('data-ataque-dano')).toBe(danoAntes)

    // TODOS → o herói entra com a SUA vista independente; PERTENCES sem a arma (Punhal fica em ATAQUES)
    fireEvent.click(document.querySelector('[data-escudo-filtro="todos"]')!)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeTruthy())
    expect(vista(heroi.id)).toBeNull()
    expect(chip(heroi.id, 'pertences').disabled).toBe(false)
    abrirVista(heroi.id, 'pertences')
    await waitFor(() => expect(within(vista(heroi.id)!).getByText('// TESOUROS')).toBeTruthy())
    expect(within(vista(heroi.id)!).queryByText('Punhal')).toBeNull()
    expect(within(vista(heroi.id)!).queryByText('Armadura Leve')).toBeNull()
    expect(within(vista(heroi.id)!).getByText('// CONSUMÍVEIS')).toBeTruthy()
    // ordem pedida dos chips: Ataques, Perícias, Habilidades, Pertences, Magias
    expect([...linha(heroi.id).querySelectorAll('[data-escudo-vista-chip]')].map((e) => e.getAttribute('data-escudo-vista-chip'))).toEqual([
      'ataques',
      'pericias',
      'habilidades',
      'pertences',
      'magias',
      'condicoes',
    ])
    expect(vista(goblin.id)?.getAttribute('data-escudo-vista')).toBe('ataques')

    // PERÍCIAS do herói: desc
    abrirVista(heroi.id, 'pericias')
    await waitFor(() => expect(vista(heroi.id)?.querySelector('[data-pericia-mod]')).toBeTruthy())
    const pmods = [...vista(heroi.id)!.querySelectorAll('[data-pericia-mod]')].map((e) => Number(e.getAttribute('data-pericia-mod')))
    expect(pmods).toEqual([...pmods].sort((a, b) => b - a))

    // MAGIAS do herói (Bardo): seção presente
    abrirVista(heroi.id, 'magias')
    await waitFor(() => expect(within(vista(heroi.id)!).getByText('// MAGIAS')).toBeTruthy())

    // clicar o chip ATIVO fecha a vista daquela linha, a outra fica
    abrirVista(heroi.id, 'magias')
    await waitFor(() => expect(vista(heroi.id)).toBeNull())
    expect(vista(goblin.id)?.getAttribute('data-escudo-vista')).toBe('ataques')
  })

  it('clicar numa arma com imbuição abre nos DETALHES a carta da arma COM a imbuição do personagem (kind item)', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { heroi, goblin } = await mesaComCombate(repo)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${goblin.id}"]`)).toBeTruthy())
    fireEvent.click(document.querySelector('[data-escudo-filtro="todos"]')!)
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-combatente-id="${heroi.id}"]`)).toBeTruthy())
    abrirVista(heroi.id, 'ataques')
    await waitFor(() => expect(vista(heroi.id)?.querySelector('[data-ataque-linha^="Punhal"]')).toBeTruthy())
    const rowPunhal = vista(heroi.id)!.querySelector('[data-ataque-linha^="Punhal"]') as HTMLElement
    // o primeiro hover da linha é o NOME da arma (ItemHover arma + imbuição)
    await waitFor(() => expect(rowPunhal.querySelector('.dv-breakdown-hover')).toBeTruthy())
    fireEvent.click(rowPunhal.querySelector('.dv-breakdown-hover')!)
    // painel DETALHES troca pro alvo `item`: arma base + imbuição (Relampejante, Experiente)
    await waitFor(() => expect(document.querySelector('[data-detail-kind="item"]')).toBeTruthy())
    const det = document.querySelector('[data-detail-kind="item"]') as HTMLElement
    await waitFor(() => expect(det.querySelectorAll('.shc-card').length).toBe(2))
    const nomes = [...det.querySelectorAll('.shc-name')].map((e) => e.textContent ?? '')
    expect(nomes[0]).toContain('Punhal')
    expect(nomes[1]).toContain('Relampejante')
    // a MESMA carta concisa do hover: sem a prosa completa (nem tabela, nem o título repetido no corpo)
    expect(det.querySelector('.shc-card--wide')).toBeNull()
    expect(det.querySelector('.shc-tbl, table')).toBeNull()
    expect([...det.querySelectorAll('h1, h2, h3')].length).toBe(0)
    // no painel lateral as cartas ocupam a largura disponível (uma por linha, 100%), não os 174px do hover
    const wrap = det.querySelector('.item-detail') as HTMLElement
    expect(wrap).toBeTruthy()
    const css = [...wrap.querySelectorAll('style')].map((e) => e.textContent ?? '').join('\n')
    expect(css).toContain('.item-detail .shc-card{width:100%')
    expect(css).toContain('.item-detail .shc-wrap{flex-direction:column')
    expect((det.querySelector('[data-item-detail]') as HTMLElement).getAttribute('data-item-detail-tier')).toBe('E')
  })

  it('ESCUDO do combatente embaixo das defesas: dureza/integridade e danificar/reparar escrevem o state do NPC', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' })
    const { remoteId } = await mesaComCombate(repo)
    await addMonsterToInitiative({
      repo,
      catalog,
      live: { sessionId: remoteId, gmUserId: 'gm-1', state: null, characters: [], members: [], encounters: [] },
      memberId: 'gm-1',
      sourcePath: 'Sistema/Criaturas/Bestiário/Goblin Soldado.md',
      label: 'Goblin Soldado',
    })
    const soldado = (await repo.findCharactersBySession(remoteId)).find((c) => c.kind === 'npc' && readDisguiseSecret(remoteId, c.id)?.summary.nome === 'Goblin Soldado')!
    await waitFor(() => expect(sub('vida')?.querySelector(`[data-escudo-escudo="${soldado.id}"]`)).toBeTruthy())
    const bloco = () => linha(soldado.id).querySelector('[data-escudo-escudo]') as HTMLElement
    // Escudo (danos:: 4), sem dano volátil → integridade 4/4, dureza 4; Reparar desabilitado
    expect(bloco().querySelector('[data-escudo-nome]')!.textContent).toBe('Escudo') // sem [[ ]]
    expect(within(bloco()).getByLabelText('Danificar escudo').textContent).toBe('💢−1')
    expect(within(bloco()).getByLabelText('Reparar escudo').textContent).toBe('🔧+1')
    expect(bloco().querySelector('[data-escudo-dureza]')!.textContent).toBe('4')
    expect(bloco().querySelector('[data-escudo-integridade]')!.getAttribute('data-escudo-integridade')).toBe('4/4')
    expect((within(bloco()).getByLabelText('Reparar escudo') as HTMLButtonElement).disabled).toBe(true)
    // danificar → state.recursosRestantes.escudoDano = 1 → 3/4 (vida preservada no write)
    fireEvent.click(within(bloco()).getByLabelText('Danificar escudo'))
    await waitFor(() => expect(bloco().getAttribute('data-escudo-dano')).toBe('1'))
    expect(bloco().querySelector('[data-escudo-integridade]')!.getAttribute('data-escudo-integridade')).toBe('3/4')
    const st = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === soldado.id)!.state.recursosRestantes
    expect(st.escudoDano).toBe(1)
    expect(st.vitalidade).toBe(soldado.state.recursosRestantes.vitalidade)
    // reparar volta pra 0 → 4/4
    fireEvent.click(within(bloco()).getByLabelText('Reparar escudo'))
    await waitFor(() => expect(bloco().getAttribute('data-escudo-dano')).toBe('0'))
    expect(bloco().querySelector('[data-escudo-integridade]')!.getAttribute('data-escudo-integridade')).toBe('4/4')
    // goblin sem escudo: nenhum bloco
    const batedor = (await repo.findCharactersBySession(remoteId)).find((c) => c.kind === 'npc' && c.id !== soldado.id)!
    expect(linha(batedor.id).querySelector('[data-escudo-escudo]')).toBeNull()
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

  it('2026-10-08: a face SESSÃO não tem mais o atalho do escudo (fica só na barra esquerda)', async () => {
    const repo = new InMemorySessionRepo()
    renderApp(repo, { id: 'gm-1', nome: 'Mestre' }, heroPath(CARLOS_ID))
    await mesaComCombate(repo)
    await screen.findByText(/FICHA DO GRUPO/)
    expect(screen.queryByTitle('Abrir o Escudo do Mestre')).toBeNull()
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
