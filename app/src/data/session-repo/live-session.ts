// Estado VIVO da sala (#186) — cache observável dos personagens/membros da
// sessão remota ativa. A SessaoPage alimenta (fetch + realtime); a sidebar de
// DETALHES lê daqui pra montar a ficha RESUMO de personagens REMOTOS (que não
// têm doc local). Um único slot: só existe UMA sala ativa por vez.
import { useSyncExternalStore } from 'react'
import type { VaultDoc } from '../types'
import type { Encounter, SessionCharacter, SessionMember } from './contract'

/** Id sintético do grupo da MESA nas telas de grupos (#213/#225). */
export const MESA_GRUPO_ID = 'sessao:mesa'

export interface LiveSession {
  sessionId: string
  /** state da sessão (#235: imagem do grupo da mesa etc.). */
  state: import('./contract').SessionState | null
  /** Dono da sessão (gmUserId) — deriva o papel: quem é o GM vê ficha
   *  completa readonly dos jogadores (#188). */
  gmUserId: string | null
  characters: SessionCharacter[]
  members: SessionMember[]
  encounters: Encounter[]
}

let live: LiveSession | null = null
const listeners = new Set<() => void>()

export function setLiveSession(next: LiveSession | null): void {
  live = next
  for (const l of listeners) l()
}

export function getLiveSession(): LiveSession | null {
  return live
}

export function useLiveSession(): LiveSession | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => live,
  )
}

export function liveCharacter(charId: string): SessionCharacter | null {
  return live?.characters.find((c) => c.id === charId) ?? null
}

/** Doc SINTÉTICO de um personagem remoto: fmBlob + vida/volátil do state —
 *  o ResumoDetail (useVidaLocal lê fm.Interativa) renderiza sem saber que o
 *  personagem não é local. */
export function synthDocFromCharacter(c: SessionCharacter): VaultDoc {
  const fm: Record<string, unknown> = {
    ...structuredClone(c.fmBlob),
    Vida: {
      Vitalidade: c.summary.vitalidadeMax,
      Moral: c.summary.moralMax ?? 0,
      ...((c.fmBlob['Vida'] as Record<string, unknown>) ?? {}),
    },
    Interativa: {
      Recursos_Restantes: {
        Vitalidade: c.state.recursosRestantes?.vitalidade,
        Moral: c.state.recursosRestantes?.moral,
        Moral_Temporaria: c.state.recursosRestantes?.moralTemp,
        EM: c.state.recursosRestantes?.em,
      },
      Condicoes_Ativas: c.state.condicoesAtivas ?? {},
    },
  }
  return {
    id: `sessao:${c.id}`,
    path: c.characterPath,
    basename: c.summary.nome,
    type: 'Criatura',
    subtype: c.summary.family === 'CompanheiroAnimal' ? 'Companheiro Animal' : c.summary.family,
    grupo: null,
    kind: 'content',
    frontmatter: fm,
    body: '',
    inlineFields: {},
    ruleElements: [],
  } as unknown as VaultDoc
}
