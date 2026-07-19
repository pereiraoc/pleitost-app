// @vitest-environment jsdom
// #266 — encontros de combate mais parecidos com o combat-tracker do plugin.
// Pedido AS-IS do usuário: barrinhas de dificuldade no topo; lista de monstros
// clicável → ficha-resumo na direita; botão "adicionar à sessão" (mestre) →
// entra na iniciativa; toggles SEPARADOS "iniciar invisível" e "iniciar
// disfarçado" que mudam o que os jogadores veem.
//
// Verificado sobre um combate REAL da vault (Campanhas/Combates/Vila de
// Goblins, body com fence combat-marker-small) via fetch fake sobre
// ../vault-data, e sobre o InMemorySessionRepo (mesmo transporte dos testes).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import { DetailProvider, useDetail, type DetailTarget } from '../src/data/detail-context'
import { CombateSheet } from '../src/components/compendium/CombateView'
import { addRosterToInitiative } from '../src/data/session-repo/encounter-actions'
import { __resetSettingsForTests } from '../src/settings'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import type { Encounter, SessionCharacter } from '../src/data/session-repo/contract'
// side-effect: garante o registro do doc-view/leaf-view de Combate
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const VILA = readDoc('Campanhas/Combates/Vila de Goblins')

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
  __resetSettingsForTests()
  __resetLocalStoreForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function mestreOn() {
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
}

/** Sonda que expõe o alvo atual do painel DETALHES pra os asserts. */
let lastDetail: DetailTarget | null = null
function DetailProbe() {
  const detail = useDetail()
  lastDetail = detail?.target ?? null
  return null
}

function renderSheet(opts: { repo?: InMemorySessionRepo | null } = {}) {
  const repo = opts.repo ?? null
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={repo ? { id: 'gm-1', nome: 'Mestre' } : null}>
        <DetailProvider>
          <MemoryRouter>
            <CombateSheet doc={VILA} />
            <DetailProbe />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('#266 barrinhas de dificuldade no topo (espelho do gm-enc-levelbar)', () => {
  it('renderiza o levelbar com 10 segmentos (nível 1..10) coloridos pelo classify', async () => {
    const { container } = renderSheet()
    await waitFor(() => {
      const bar = container.querySelector('.combat-difficulty-bars .gm-enc-levelbar')
      expect(bar, 'barrinhas de dificuldade no topo').toBeTruthy()
    })
    const bar = container.querySelector('.combat-difficulty-bars .gm-enc-levelbar') as HTMLElement
    // 10 quadradinhos, um por nível
    const segs = bar.querySelectorAll('.gm-enc-levelbar-seg')
    expect(segs.length).toBe(10)
    // agrupados em 4 tiers (T1: 1-3, T2: 4-6, T3: 7-9, T4: 10)
    expect(bar.querySelectorAll('.gm-enc-levelbar-tier').length).toBe(4)
    // cada seg tem a classe de tom do classify (fonte de verdade, nada inventado)
    for (const seg of segs) {
      expect(seg.className).toMatch(/is-trivial|is-easy|is-hard|is-lethal/)
    }
    // níveis baixos são mais letais que os altos (125 pts de monstro): o seg do
    // nível 1 NÃO pode ser mais fácil que o do nível 10.
    const nivel1 = bar.querySelector('.gm-enc-levelbar-seg[data-level="1"]') as HTMLElement
    const nivel10 = bar.querySelector('.gm-enc-levelbar-seg[data-level="10"]') as HTMLElement
    expect(nivel1.className).toContain('is-lethal')
    expect(nivel10.className).not.toContain('is-lethal')
  })
})

describe('#266 lista de monstros clicável → ficha-resumo na direita', () => {
  it('clicar num monstro do roster abre o resumo dele no painel DETALHES', async () => {
    const { container } = renderSheet()
    // banners resolvidos (wikilinks contra o catálogo); clica no nome do monstro
    const item = await waitFor(() => {
      const el = [...container.querySelectorAll<HTMLElement>('.combate-monstro-nome')].find((n) =>
        /Goblin Batedor/.test(n.textContent ?? ''),
      )
      expect(el, 'nome clicável do Goblin Batedor').toBeTruthy()
      // só é clicável quando resolveu doc (role=button)
      expect(el!.getAttribute('role')).toBe('button')
      return el!
    })
    expect(lastDetail).toBeNull()
    fireEvent.click(item)
    // abriu o resumo do doc do Goblin Batedor (id do catálogo)
    await waitFor(() => {
      expect(lastDetail?.kind).toBe('resumo')
    })
    const res = catalog.resolve('Goblin Batedor')
    expect(res.kind).toBe('doc')
    expect(lastDetail?.id).toBe(res.kind === 'doc' ? res.id : '')
  })

  it('sem Modo Mestre / sem sessão os controles GM não aparecem', async () => {
    const { container } = renderSheet()
    await waitFor(() => expect(container.querySelector('.combate-monstro-banner')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '+ Adicionar à sessão' })).toBeNull()
    expect(screen.queryByLabelText('Iniciar invisível')).toBeNull()
    // sem Modo Mestre, os botões de velocidade por monstro também não aparecem
    expect(container.querySelector('.combate-monstro-gm')).toBeNull()
  })
})

/** Sala fake ATIVA (sem encounter iniciado) — o gate GM do "Adicionar à
 *  sessão" pede repo + user + live. */
function fakeLive(sessionId: string, chars: SessionCharacter[] = [], encounters: Encounter[] = []) {
  setLiveSession({
    sessionId,
    state: null,
    gmUserId: 'gm-1',
    characters: chars,
    members: [],
    encounters,
  })
}

describe('#266 controles do Mestre: adicionar à sessão + toggles invisível/disfarçado', () => {
  it('os toggles aparecem no gate GM; "disfarçado" começa marcado, "invisível" desmarcado', async () => {
    mestreOn()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC266' })
    fakeLive(sess.id)
    renderSheet({ repo })

    const inv = (await screen.findByLabelText('Iniciar invisível')) as HTMLInputElement
    const dis = screen.getByLabelText('Iniciar disfarçado') as HTMLInputElement
    // default: NPC nasce disfarçado (mascarado) e visível na lista
    expect(inv.checked).toBe(false)
    expect(dis.checked).toBe(true)
    expect(screen.getByRole('button', { name: '+ Adicionar à sessão' })).toBeTruthy()
  })

  it('adicionar com padrão (disfarçado, visível): NPCs entram na iniciativa NÃO revelados e visíveis', async () => {
    mestreOn()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC267' })
    fakeLive(sess.id)
    renderSheet({ repo })

    fireEvent.click(await screen.findByRole('button', { name: '+ Adicionar à sessão' }))

    // criou 1 encounter ATIVO com os NPCs do roster na ordem de iniciativa
    await waitFor(() => expect(repo.encounters.size).toBe(1))
    const enc = [...repo.encounters.values()][0]
    expect(enc.status).toBe('active')
    const chars = await repo.findCharactersBySession(sess.id)
    const npcs = chars.filter((c) => c.kind === 'npc')
    // Vila de Goblins: 5+5+2+3 = 15 NPCs
    expect(npcs.length).toBe(15)
    expect(enc.turnState?.order.length).toBe(15)
    // padrão: nenhum revelado (todos disfarçados) e todos visíveis
    expect(enc.revealedCharacterIds.length).toBe(0)
    expect(npcs.every((c) => c.visibility === 'visible')).toBe(true)
  })

  it('toggle "iniciar invisível" → NPCs entram com visibility hidden (some da lista dos players)', async () => {
    mestreOn()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC268' })
    fakeLive(sess.id)
    renderSheet({ repo })

    fireEvent.click(await screen.findByLabelText('Iniciar invisível'))
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar à sessão' }))

    await waitFor(() => expect(repo.encounters.size).toBe(1))
    const chars = await repo.findCharactersBySession(sess.id)
    const npcs = chars.filter((c) => c.kind === 'npc')
    expect(npcs.length).toBeGreaterThan(0)
    expect(npcs.every((c) => c.visibility === 'hidden')).toBe(true)
    // invisível NÃO revela: continuam disfarçados também
    const enc = [...repo.encounters.values()][0]
    expect(enc.revealedCharacterIds.length).toBe(0)
  })

  it('desmarcar "iniciar disfarçado" → NPCs entram REVELADOS (jogador vê o nome real)', async () => {
    mestreOn()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC269' })
    fakeLive(sess.id)
    renderSheet({ repo })

    // desliga o disfarce (nasce ligado)
    fireEvent.click(await screen.findByLabelText('Iniciar disfarçado'))
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar à sessão' }))

    await waitFor(() => expect(repo.encounters.size).toBe(1))
    const enc = [...repo.encounters.values()][0]
    const chars = await repo.findCharactersBySession(sess.id)
    const npcs = chars.filter((c) => c.kind === 'npc')
    // todos revelados; e visíveis (invisível ficou desmarcado)
    expect(enc.revealedCharacterIds.length).toBe(npcs.length)
    expect(npcs.every((c) => enc.revealedCharacterIds.includes(c.id))).toBe(true)
    expect(npcs.every((c) => c.visibility === 'visible')).toBe(true)
  })
})

describe('badge da SUA MESA: dificuldade vs os heróis reais da mesa (só GM)', () => {
  const heroi = (id: string, nivel: number): SessionCharacter => ({
    id,
    sessionId: 's',
    memberId: 'gm-1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: `local/${id}`,
    visibility: 'visible',
    summary: {
      nome: id,
      family: 'Heroi',
      nivel,
      atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
      vitalidadeMax: 10,
      stats: { defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 },
    },
    state: { recursosRestantes: { vitalidade: 10, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} },
    fmBlob: {},
    updatedAt: '',
    encounterId: null,
  })

  it('mestre + mesa com heróis → aparece a badge da mesa', async () => {
    mestreOn()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'PARTY1' })
    fakeLive(sess.id, [heroi('Ana', 3), heroi('Beto', 5)])
    const { container } = renderSheet({ repo })
    await waitFor(() => expect(container.querySelector('.combat-party-badge')).toBeTruthy())
  })

  it('sem mesa (só compêndio) → não aparece a badge da mesa', async () => {
    mestreOn()
    const { container } = renderSheet()
    await waitFor(() => expect(container.querySelector('.combate-monstro-banner')).toBeTruthy())
    expect(container.querySelector('.combat-party-badge')).toBeNull()
  })
})

describe('#266 addRosterToInitiative: injeta num combate JÁ ativo sem perder ids', () => {
  it('com combate ativo, o roster inteiro entra no turnState existente (sem sobrescrever)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC270' })
    // combate ativo já rodando com 1 herói na ordem
    const heroi = await repo.insertCharacter({
      sessionId: sess.id,
      memberId: 'gm-1',
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: 'local/heroi',
      visibility: 'visible',
      summary: { nome: 'H', family: 'Heroi', nivel: 3, atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 }, vitalidadeMax: 10, stats: { defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 } },
      state: { recursosRestantes: { vitalidade: 10, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} },
    })
    const enc = await repo.insertEncounter({
      sessionId: sess.id,
      sourceNotePath: '',
      name: 'Rolando',
      roster: { entries: [] },
      difficulty: null,
    })
    await repo.startEncounter(enc.id)
    await repo.updateEncounterTurnState(enc.id, { order: [heroi.id], currentIndex: 0, round: 2, started: true })
    const encAtivo = (await repo.listEncountersBySession(sess.id)).find((e) => e.status === 'active')!

    // duas entradas (2 + 3) → 5 novos ids, todos APÓS o herói
    await addRosterToInitiative({
      repo,
      catalog,
      live: {
        sessionId: sess.id,
        state: null,
        gmUserId: 'gm-1',
        characters: [heroi],
        members: [],
        encounters: [encAtivo],
      },
      memberId: 'gm-1',
      name: 'Reforços',
      entries: [
        { sourcePath: null, label: 'Orc', qty: 2 },
        { sourcePath: null, label: 'Kobold', qty: 3 },
      ],
      mask: { invisivel: false, disfarcado: true },
    })

    // não criou novo encounter (usou o ativo)
    expect((await repo.listEncountersBySession(sess.id)).length).toBe(1)
    const enc2 = (await repo.listEncountersBySession(sess.id))[0]
    // ordem: herói + 5 NPCs, sem perder nenhum (o bug do live stale)
    expect(enc2.turnState?.order.length).toBe(6)
    expect(enc2.turnState?.order[0]).toBe(heroi.id)
    expect(enc2.round).toBe(undefined) // sanity: round vive no turnState
    expect(enc2.turnState?.round).toBe(2) // preservou o round em andamento
  })
})

describe('#330 prep por instância (velocidade/estado do combate) → turnState.speeds/hidden', () => {
  it('carrega a VELOCIDADE e o ESCONDIDO que o GM definiu por monstro pra a sessão', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'PREP01' })
    // sem combate ativo → cria+inicia; roster genérico (2 Orc + 3 Kobold). preps
    // alinham 1:1 com a expansão [orc1, orc2, kobold1, kobold2, kobold3].
    await addRosterToInitiative({
      repo,
      catalog,
      live: { sessionId: sess.id, state: null, gmUserId: 'gm-1', characters: [], members: [], encounters: [] },
      memberId: 'gm-1',
      name: 'Emboscada',
      entries: [
        { sourcePath: null, label: 'Orc', qty: 2 },
        { sourcePath: null, label: 'Kobold', qty: 3 },
      ],
      preps: [
        { speed: 'super' },
        { speed: 'rapido', escondido: true },
        { speed: 'lento' },
        {},
        { escondido: true },
      ],
      mask: { invisivel: false, disfarcado: true },
    })

    const enc = (await repo.listEncountersBySession(sess.id)).find((e) => e.status === 'active')!
    const order = enc.turnState!.order
    expect(order.length).toBe(5)
    const speeds = enc.turnState!.speeds ?? {}
    expect(speeds[order[0]!]).toBe('super')
    expect(speeds[order[1]!]).toBe('rapido')
    expect(speeds[order[2]!]).toBe('lento')
    expect(speeds[order[3]!]).toBeUndefined() // sem prep → padrão (lento no display)
    const hidden = enc.turnState!.hidden ?? []
    expect(hidden).toContain(order[1]!)
    expect(hidden).toContain(order[4]!)
    expect(hidden).not.toContain(order[0]!)
  })

  it('disfarce por instância: com global disfarçado=false, o marcado no prep NÃO é revelado (segurança)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'PREP02' })
    await addRosterToInitiative({
      repo,
      catalog,
      live: { sessionId: sess.id, state: null, gmUserId: 'gm-1', characters: [], members: [], encounters: [] },
      memberId: 'gm-1',
      name: 'Emboscada',
      entries: [{ sourcePath: null, label: 'Orc', qty: 2 }],
      preps: [{ disfarcado: true }, {}],
      mask: { invisivel: false, disfarcado: false }, // GM quer revelar de saída…
    })
    const enc = (await repo.listEncountersBySession(sess.id)).find((e) => e.status === 'active')!
    const order = enc.turnState!.order
    // …mas o orc #1 foi marcado disfarçado no prep → continua mascarado (não
    // revelado); o orc #2 (sem prep) é revelado normalmente.
    expect(enc.revealedCharacterIds).not.toContain(order[0]!)
    expect(enc.revealedCharacterIds).toContain(order[1]!)
  })
})
