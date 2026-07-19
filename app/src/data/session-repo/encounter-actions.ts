// AÇÕES DE ENCOUNTER da sala — código COMPARTILHADO entre o INICIAR do
// CombateDaSala (#196, SessaoPage.tsx) e o caminho direto do bestiário
// (#229: "adicionar à iniciativa" no card do monstro, Modo Mestre):
// resolver o roster em NPCs reais (summary/state do doc do bestiário via
// buildCharacterSummary/State) e montar o turnState com a semântica do
// combat-tracker do plugin (heróis primeiro, NPCs depois; round 1).
// Extraído do iniciar pra não duplicar a resolução sourcePath → catálogo.
import type { Catalog } from '../catalog'
import type { VaultDoc } from '../types'
import { vaultUrl } from '../base-url'
import { getLocalDoc } from '../local-entities'
import { buildCharacterState, buildCharacterSummary, effectiveFmForPublish } from './publish'
import { maskSummaryForDisguise } from './disguise'
import { stashDisguiseSecret, readDisguiseSecret } from './disguise-secrets'
import type { SpeedTier } from '../initiative-blocks'
import type {
  CharacterState,
  CharacterSummary,
  Encounter,
  EncounterRosterEntry,
  EncounterTurnState,
  SessionCharacter,
  SessionRepo,
} from './contract'
import type { LiveSession } from './live-session'

/** Input de criação de NPC (shape do startEncounter/insertCharacter). */
export interface NpcInsertInput {
  memberId: string
  kind: 'npc'
  characterPath: string
  summary: CharacterSummary
  state: CharacterState
}

/** Placeholder do characterPath publicado pro NPC disfarçado — o path real tem
 *  o NOME (`Monstros/Goblin Assassino`), então não vai pra linha; fica no
 *  segredo do GM (disguise-secrets). */
const MASKED_CHARACTER_PATH = '(disfarçado)'

/** #291 (segurança): insere um NPC no combate aplicando a máscara. NPC que entra
 *  DISFARÇADO (visível e não-revelado — o padrão de todo NPC) publica só a
 *  projeção mascarada (summary sem identidade/stats; characterPath placeholder) e
 *  guarda o real no user_state do GM; o jogador nunca recebe os dados reais, nem
 *  por devtools. Invisível → `hidden` (a RLS nem entrega). Revelado
 *  (disfarçado=false) publica o real de saída. Retorna o char (id pro turnState). */
export async function insertNpc(
  repo: SessionRepo,
  sessionId: string,
  encounterId: string,
  npc: NpcInsertInput,
  mask: NpcMaskOptions | undefined,
): Promise<SessionCharacter> {
  const invisivel = !!mask?.invisivel
  const revelado = mask?.disfarcado === false
  const disfarcado = !invisivel && !revelado
  const char = await repo.insertCharacter({
    sessionId,
    memberId: npc.memberId,
    kind: 'npc',
    tutorCharacterId: null,
    characterPath: disfarcado ? MASKED_CHARACTER_PATH : npc.characterPath,
    visibility: invisivel ? 'hidden' : 'visible',
    summary: disfarcado ? maskSummaryForDisguise(npc.summary) : npc.summary,
    state: npc.state,
    encounterId,
    createdByEncounterId: encounterId,
  })
  if (disfarcado) {
    stashDisguiseSecret(sessionId, char.id, {
      summary: npc.summary,
      fmBlob: {},
      characterPath: npc.characterPath,
    })
  }
  return char
}

/** #291: alterna o reveal de um NPC disfarçado. Ao REVELAR, re-publica o NOME
 *  real (do segredo do GM) — stats/ficha continuam ocultos pro jogador ("vê só a
 *  estimativa + o nome"). Ao DES-revelar, volta a mascarar o nome. Usar no lugar
 *  do repo.toggleRevealCharacter cru na UI do mestre. */
export async function toggleRevealDisguisedNpc(
  repo: SessionRepo,
  sessionId: string,
  encounterId: string,
  characterId: string,
): Promise<string[]> {
  const revealedIds = await repo.toggleRevealCharacter(encounterId, characterId)
  const secret = readDisguiseSecret(sessionId, characterId)
  if (secret) {
    const nowRevealed = revealedIds.includes(characterId)
    await repo.updateCharacterSummary(characterId, { nome: nowRevealed ? secret.summary.nome : '' })
  }
  return revealedIds
}

/** Pré-seleção de máscara dos NPCs ao entrar no combate (#266) — dois eixos
 *  INDEPENDENTES, iguais aos do combat-tracker/sync:
 *   - `invisivel` → `visibility: 'hidden'`: a RLS do Supabase nem entrega o
 *     row pros jogadores (o NPC some da lista deles); é a "invisibilidade"
 *     literal (character-cards.ts:72 do sync, session.ts:207).
 *   - `disfarcado` → identidade mascarada: jogador vê o rótulo genérico
 *     numerado (maskedNames) em vez do nome real. É o ESTADO PADRÃO de todo
 *     NPC (revealedCharacterIds vazio), então "disfarçado = true" não muda
 *     nada; "disfarçado = false" REVELA o NPC de saída (toggleRevealCharacter).
 *  Ausência de ambos = comportamento anterior (visível na lista, disfarçado). */
export interface NpcMaskOptions {
  invisivel?: boolean
  disfarcado?: boolean
}

/** #330: prep POR INSTÂNCIA de monstro (velocidade + estados) que o GM definiu na
 *  página do combate (compêndio, encounter-speeds). Alinhada 1:1 com a ordem de
 *  expansão do roster (npcInputsFromRoster: cada entrada × qty), pra carregar pra
 *  sessão o que foi definido lá — antes isto era descartado. */
export interface RosterInstancePrep {
  /** Velocidade de iniciativa → turnState.speeds. null/ausente = padrão (lento). */
  speed?: SpeedTier | null
  /** Escondido dos jogadores → turnState.hidden (mesmo 🙈 do modo iniciativa). */
  escondido?: boolean
  /** Disfarçado → soma ao disfarce; nunca REVELA um marcado (segurança #291). */
  disfarcado?: boolean
}

/** Disfarce EFETIVO de uma instância: o global (default disfarçado=true, NPC
 *  nasce mascarado) OU o disfarce marcado no prep. NUNCA revela quem o GM marcou
 *  como disfarçado — só o `false` explícito do global (sem prep) revela. */
function effectiveDisfarcado(global: NpcMaskOptions | undefined, prep: RosterInstancePrep | undefined): boolean {
  return (global?.disfarcado ?? true) || !!prep?.disfarcado
}

/** Máscara de UMA instância: invisível vem do global (o prep não tem esse eixo);
 *  disfarce é o efetivo. */
function maskForInstance(global: NpcMaskOptions | undefined, prep: RosterInstancePrep | undefined): NpcMaskOptions {
  return { invisivel: global?.invisivel, disfarcado: effectiveDisfarcado(global, prep) }
}

/** speeds/hidden do turnState a partir dos ids criados (na ordem) + preps. */
function turnExtrasFromPreps(
  ids: readonly string[],
  preps: readonly RosterInstancePrep[] | undefined,
): { speeds?: Record<string, SpeedTier>; hidden?: string[] } {
  if (!preps) return {}
  const speeds: Record<string, SpeedTier> = {}
  const hidden: string[] = []
  ids.forEach((id, k) => {
    const p = preps[k]
    if (p?.speed) speeds[id] = p.speed
    if (p?.escondido) hidden.push(id)
  })
  const extras: { speeds?: Record<string, SpeedTier>; hidden?: string[] } = {}
  if (Object.keys(speeds).length) extras.speeds = speeds
  if (hidden.length) extras.hidden = hidden
  return extras
}

/** Insere os NPCs (mascarados por instância), devolve os ids na ordem e revela na
 *  entrada os que o disfarce efetivo deixou visíveis. Compartilhado pelos 3
 *  caminhos (iniciar prepared, roster novo, roster em combate ativo). */
async function insertNpcsWithPreps(
  repo: SessionRepo,
  sessionId: string,
  encounterId: string,
  npcs: readonly NpcInsertInput[],
  mask: NpcMaskOptions | undefined,
  preps: readonly RosterInstancePrep[] | undefined,
): Promise<string[]> {
  const ids: string[] = []
  for (let k = 0; k < npcs.length; k++) {
    const im = maskForInstance(mask, preps?.[k])
    ids.push((await insertNpc(repo, sessionId, encounterId, npcs[k]!, im)).id)
  }
  // reveal de saída: NPC cujo disfarce efetivo é false já entrou com dado REAL
  // (insertNpc); aqui só marca o revealed no encounter.
  for (let k = 0; k < ids.length; k++) {
    if (!effectiveDisfarcado(mask, preps?.[k])) await repo.toggleRevealCharacter(encounterId, ids[k]!)
  }
  return ids
}

/** Doc real de um sourcePath do roster: entidade LOCAL (monstro criado no
 *  app — o id é o próprio path) OU doc da vault resolvido no catálogo. */
async function docFromSourcePath(catalog: Catalog, sourcePath: string): Promise<VaultDoc | null> {
  const semMd = sourcePath.replace(/\.md$/i, '')
  const local = getLocalDoc(semMd)
  if (local) return local
  const res = catalog.resolve(semMd)
  if (res.kind !== 'doc') return null
  try {
    return (await (
      await fetch(vaultUrl(`${res.id.split('/').map(encodeURIComponent).join('/')}.json`))
    ).json()) as VaultDoc
  } catch {
    return null // doc indisponível — o chamador cai no genérico
  }
}

/** NPCs de um roster: resolve cada sourcePath → summary/state do doc real do
 *  bestiário; genéricos (sourcePath null/não resolvido) entram "crus". */
export async function npcInputsFromRoster(
  catalog: Catalog,
  entries: readonly EncounterRosterEntry[],
  memberId: string,
): Promise<NpcInsertInput[]> {
  const npcs: NpcInsertInput[] = []
  for (const entry of entries) {
    for (let i = 0; i < Math.max(1, entry.qty); i++) {
      const doc = entry.sourcePath ? await docFromSourcePath(catalog, entry.sourcePath) : null
      if (doc) {
        // #323/#326: FM derivado (vida/defesas máx das regras, não o 0 do cru).
        const efm = await effectiveFmForPublish(doc, catalog)
        npcs.push({
          memberId,
          kind: 'npc',
          characterPath: doc.id,
          summary: buildCharacterSummary(doc, efm),
          state: buildCharacterState(doc, efm),
        })
        continue
      }
      npcs.push({
        memberId,
        kind: 'npc',
        characterPath: entry.sourcePath ?? `generico:${entry.label}`,
        summary: {
          nome: entry.label,
          family: 'Monstro',
          nivel: 0,
          atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
          vitalidadeMax: 0,
          stats: { defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 },
        },
        state: {
          recursosRestantes: { vitalidade: 0, moral: 0, em: 0, moralTemp: 0 },
          condicoesAtivas: {},
          efeitosAtivos: {},
          invocacoesAtivas: {},
        },
      })
    }
  }
  return npcs
}

/** INICIAR do CombateDaSala: prepared → active criando os NPCs do roster, e
 *  turnState inicial do plugin (heróis primeiro, NPCs depois; round 1).
 *  `mask` (#266) pré-seleciona invisível/disfarçado dos NPCs de saída. */
export async function startEncounterFromRoster(
  repo: SessionRepo,
  catalog: Catalog,
  encounter: Encounter,
  memberId: string,
  mask?: NpcMaskOptions,
  preps?: readonly RosterInstancePrep[],
): Promise<void> {
  const npcs = await npcInputsFromRoster(catalog, encounter.roster.entries, memberId)
  // #291: startEncounter só ATIVA (move heróis/companheiros); os NPCs entram um a
  // um por insertNpc (mascarados quando disfarçados), pra o real nunca ir pra a
  // linha publicada — nem por um instante de realtime.
  await repo.startEncounter(encounter.id, [])
  const novos = await insertNpcsWithPreps(repo, encounter.sessionId, encounter.id, npcs, mask, preps)
  const chars = await repo.findCharactersBySession(encounter.sessionId)
  const naoNpc = chars.filter((c) => c.encounterId === encounter.id && c.kind !== 'npc').map((c) => c.id)
  // #330: velocidade/estado que o GM definiu no combate viram speeds/hidden do turno.
  await repo.updateEncounterTurnState(encounter.id, {
    order: [...naoNpc, ...novos],
    currentIndex: 0,
    round: 1,
    started: true,
    ...turnExtrasFromPreps(novos, preps),
  })
}

/** #229 (b): caminho DIRETO do mestre — monstro do bestiário → iniciativa da
 *  sessão ativa. Com combate ativo, o NPC entra NELE (insertCharacter +
 *  append no turnState.order — arquiva junto, createdByEncounterId); sem
 *  combate ativo, um combate com o nome do monstro é criado e INICIADO
 *  (mesmo fluxo do CombateDaSala.iniciar). */
export async function addMonsterToInitiative(opts: {
  repo: SessionRepo
  catalog: Catalog
  live: LiveSession
  memberId: string
  /** Path da nota do monstro (`doc.path`/`entry.path` — vault com .md;
   *  entidade local usa o próprio id). */
  sourcePath: string
  label: string
  /** Quantidade (#266: o roster do combate pode adicionar N de uma vez). */
  qty?: number
  /** Pré-seleção invisível/disfarçado ao entrar no combate (#266). */
  mask?: NpcMaskOptions
}): Promise<void> {
  const { repo, catalog, live, memberId, sourcePath, label, qty, mask } = opts
  const entry: EncounterRosterEntry = { sourcePath, label, qty: Math.max(1, Math.floor(qty ?? 1) || 1) }
  const ativo = live.encounters.find((e) => e.status === 'active') ?? null
  if (!ativo) {
    const enc = await repo.insertEncounter({
      sessionId: live.sessionId,
      // combate criado do card não nasce de nota da vault — sem source path
      sourceNotePath: '',
      name: label,
      roster: { entries: [entry] },
      difficulty: null,
    })
    await startEncounterFromRoster(repo, catalog, enc, memberId, mask)
    return
  }
  const npcs = await npcInputsFromRoster(catalog, [entry], memberId)
  const ts = ativo.turnState
  const novos = await insertNpcsWithPreps(repo, live.sessionId, ativo.id, npcs, mask, undefined)
  await repo.updateEncounterTurnState(
    ativo.id,
    ts
      ? { ...ts, order: [...ts.order, ...novos] }
      : { order: novos, currentIndex: 0, round: 1, started: true },
  )
}

/** #266: ROSTER inteiro (visualizador de combate) → iniciativa da sessão
 *  ativa, com a pré-seleção invisível/disfarçado. Reusa o mesmo caminho do
 *  #229 (startEncounterFromRoster / insertCharacter+turnState), NÃO
 *  reimplementa: sem combate ativo, cria+inicia UM combate com o roster todo
 *  (uma chamada só, evitando o erro de "já ativo"); com combate ativo, injeta
 *  cada entrada nele (addMonsterToInitiative, respeitando qty). */
export async function addRosterToInitiative(opts: {
  repo: SessionRepo
  catalog: Catalog
  live: LiveSession
  memberId: string
  name: string
  entries: readonly EncounterRosterEntry[]
  mask?: NpcMaskOptions
  /** #330: prep por instância (velocidade/estado) alinhada à expansão do roster
   *  — carrega o que o GM definiu na página do combate. */
  preps?: readonly RosterInstancePrep[]
}): Promise<void> {
  const { repo, catalog, live, memberId, name, entries, mask, preps } = opts
  if (entries.length === 0) return
  const ativo = live.encounters.find((e) => e.status === 'active') ?? null
  if (!ativo) {
    const enc = await repo.insertEncounter({
      sessionId: live.sessionId,
      sourceNotePath: '',
      name,
      roster: { entries: entries.map((e) => ({ ...e })) },
      difficulty: null,
    })
    await startEncounterFromRoster(repo, catalog, enc, memberId, mask, preps)
    return
  }
  // Combate ativo: um insert por NPC (qty expandido em npcInputsFromRoster) e
  // UM patch de turnState com todos os novos ids. NÃO reusamos
  // addMonsterToInitiative por entrada — ele lê o turnState do `live` (stale)
  // e sobrescreveria os ids da entrada anterior. Aqui acumulamos de uma vez.
  const npcs = await npcInputsFromRoster(catalog, entries, memberId)
  const novos = await insertNpcsWithPreps(repo, live.sessionId, ativo.id, npcs, mask, preps)
  const ts = ativo.turnState
  // #330: velocidade/estado definidos no combate → mescla nos speeds/hidden do turno
  // (preserva os já existentes; só adiciona os que o prep trouxe).
  const extras = turnExtrasFromPreps(novos, preps)
  const merged: EncounterTurnState = ts
    ? {
        ...ts,
        order: [...ts.order, ...novos],
        ...(extras.speeds ? { speeds: { ...(ts.speeds ?? {}), ...extras.speeds } } : {}),
        ...(extras.hidden ? { hidden: [...(ts.hidden ?? []), ...extras.hidden] } : {}),
      }
    : { order: novos, currentIndex: 0, round: 1, started: true, ...extras }
  await repo.updateEncounterTurnState(ativo.id, merged)
}
