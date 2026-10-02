// ESCUDO DO MESTRE (2026-10-02) — lista de combatentes do encontro ATIVO da
// sala, na ordem do turno, com o doc sintético de cada um. Lê o `fmBlob`
// publicado (que JÁ é o FM derivado — publish.ts) via synthDocFromCharacter;
// nunca roda useHeroRules por combatente (custo), nem trata a linha mascarada
// de NPC como ficha: pro GM, comSegredo sobrepõe identidade + fmBlob reais do
// segredo deste aparelho (#486). Sem segredo e sem fmBlob → `semFicha`.
import { useMemo } from 'react'
import type { Encounter, SessionCharacter } from '../../../data/session-repo/contract'
import { synthDocFromCharacter, useLiveSession, type LiveSession } from '../../../data/session-repo/live-session'
import { useSessionUser } from '../../../data/session-repo/provider'
import { comSegredo } from '../../../data/session-repo/disguise-secrets'
import { ladoDoCombatente } from '../../../data/session-repo/combatente'
import type { Lado } from '../../../data/initiative-blocks'
import type { VaultDoc } from '../../../data/types'

export type FiltroEscudo = 'inimigos' | 'todos'

export interface CombatenteVM {
  c: SessionCharacter
  doc: VaultDoc
  lado: Lado
  vezAtual: boolean
  escondido: boolean
  /** fmBlob vazio neste aparelho (NPC disfarçado sem segredo aqui, ou herói
   *  que nunca publicou) — as sub-abas de ficha degradam pro summary. */
  semFicha: boolean
}

export interface Combatentes {
  live: LiveSession | null
  isGm: boolean
  ativo: Encounter | null
  /** Combatentes aprovados pelo filtro, na ordem do turno. */
  lista: CombatenteVM[]
  /** Todos os combatentes do encontro (sem filtro), na ordem do turno. */
  todos: CombatenteVM[]
  vezDe: CombatenteVM | null
}

const VAZIO: Combatentes = { live: null, isGm: false, ativo: null, lista: [], todos: [], vezDe: null }

export function montarCombatentes(
  live: LiveSession,
  isGm: boolean,
  filtro: FiltroEscudo,
): Omit<Combatentes, 'live' | 'isGm'> {
  const ativo = live.encounters.find((e) => e.status === 'active') ?? null
  const charById = new Map(live.characters.map((c) => [c.id, c]))
  const order = ativo?.turnState?.order ?? []
  const hidden = new Set(ativo?.turnState?.hidden ?? [])
  const idx = ativo?.turnState?.currentIndex ?? -1
  const todos: CombatenteVM[] = []
  order.forEach((id, i) => {
    const raw = charById.get(id)
    if (!raw) return
    const c = isGm ? comSegredo(raw, live.sessionId) : raw
    todos.push({
      c,
      doc: synthDocFromCharacter(c),
      lado: ladoDoCombatente(raw, charById),
      vezAtual: i === idx,
      escondido: hidden.has(id),
      semFicha: Object.keys(c.fmBlob ?? {}).length === 0,
    })
  })
  const lista = filtro === 'todos' ? todos : todos.filter((v) => v.lado === 'inimigo')
  return { ativo, lista, todos, vezDe: todos.find((v) => v.vezAtual) ?? null }
}

export function useCombatentes(filtro: FiltroEscudo): Combatentes {
  const live = useLiveSession()
  const user = useSessionUser()
  return useMemo(() => {
    if (!live) return VAZIO
    const isGm = !!user && live.gmUserId === user.id
    return { live, isGm, ...montarCombatentes(live, isGm, filtro) }
  }, [live, user, filtro])
}
