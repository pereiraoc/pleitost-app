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
import { buildCharacterState, buildCharacterSummary } from './publish'
import type {
  CharacterState,
  CharacterSummary,
  Encounter,
  EncounterRosterEntry,
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
        npcs.push({
          memberId,
          kind: 'npc',
          characterPath: doc.id,
          summary: buildCharacterSummary(doc),
          state: buildCharacterState(doc),
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
 *  turnState inicial do plugin (heróis primeiro, NPCs depois; round 1). */
export async function startEncounterFromRoster(
  repo: SessionRepo,
  catalog: Catalog,
  encounter: Encounter,
  memberId: string,
): Promise<void> {
  const npcs = await npcInputsFromRoster(catalog, encounter.roster.entries, memberId)
  await repo.startEncounter(encounter.id, npcs)
  const chars = await repo.findCharactersBySession(encounter.sessionId)
  const dentro = chars.filter((c) => c.encounterId === encounter.id)
  const order = [
    ...dentro.filter((c) => c.kind !== 'npc').map((c) => c.id),
    ...dentro.filter((c) => c.kind === 'npc').map((c) => c.id),
  ]
  await repo.updateEncounterTurnState(encounter.id, {
    order,
    currentIndex: 0,
    round: 1,
    started: true,
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
}): Promise<void> {
  const { repo, catalog, live, memberId, sourcePath, label } = opts
  const entry: EncounterRosterEntry = { sourcePath, label, qty: 1 }
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
    await startEncounterFromRoster(repo, catalog, enc, memberId)
    return
  }
  const [npc] = await npcInputsFromRoster(catalog, [entry], memberId)
  const char = await repo.insertCharacter({
    sessionId: live.sessionId,
    memberId,
    kind: 'npc',
    tutorCharacterId: null,
    characterPath: npc.characterPath,
    visibility: 'visible',
    summary: npc.summary,
    state: npc.state,
    encounterId: ativo.id,
    createdByEncounterId: ativo.id,
  })
  const ts = ativo.turnState
  await repo.updateEncounterTurnState(
    ativo.id,
    ts
      ? { ...ts, order: [...ts.order, char.id] }
      : { order: [char.id], currentIndex: 0, round: 1, started: true },
  )
}
