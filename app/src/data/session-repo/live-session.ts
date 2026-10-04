// Estado VIVO da sala (#186) — cache observável dos personagens/membros da
// sessão remota ativa. A SessaoPage alimenta (fetch + realtime); a sidebar de
// DETALHES lê daqui pra montar a ficha RESUMO de personagens REMOTOS (que não
// têm doc local). Um único slot: só existe UMA sala ativa por vez.
import { useRef, useSyncExternalStore } from 'react'
import { mergeLive } from './live-merge'
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

/** Troca o snapshot da sala. SEMPRE passa pelo mergeLive (structural sharing
 *  por id — "atualizar só o que mudou"): o refetch do realtime devolve objetos
 *  todos novos, e sem o merge cada evento re-renderizava toda ficha aberta.
 *  Snapshot igual ao atual = nem notifica. Callers otimistas
 *  (`{ ...live, encounters: [...] }`) seguem funcionando: o que é a mesma ref
 *  passa direto. */
export function setLiveSession(next: LiveSession | null): void {
  const merged = live && next ? mergeLive(live, next) : next
  if (merged === live) return
  live = merged
  for (const l of listeners) l()
}

function subscribeLive(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function getLiveSession(): LiveSession | null {
  return live
}

export function useLiveSession(): LiveSession | null {
  return useSyncExternalStore(subscribeLive, () => live)
}

/** Lê só uma FATIA da sala viva: o componente re-renderiza apenas quando o
 *  valor selecionado muda (por `eq`, default Object.is). Com o structural
 *  sharing do setLiveSession, selecionar `l?.encounters` ou um personagem por
 *  id já é estável por referência; seletor que monta array novo passa
 *  `shallowArrayEq`. */
export function useLiveSelector<T>(
  sel: (l: LiveSession | null) => T,
  eq: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ src: LiveSession | null; sel: (l: LiveSession | null) => T; val: T } | null>(null)
  const getSnapshot = (): T => {
    const c = cache.current
    if (c && c.src === live && c.sel === sel) return c.val
    const v = sel(live)
    if (c && eq(c.val, v)) {
      cache.current = { src: live, sel, val: c.val }
      return c.val
    }
    cache.current = { src: live, sel, val: v }
    return v
  }
  return useSyncExternalStore(subscribeLive, getSnapshot)
}

/** Igualdade rasa de arrays (mesmo tamanho, elementos ===). */
export function shallowArrayEq<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function liveCharacter(charId: string): SessionCharacter | null {
  return live?.characters.find((c) => c.id === charId) ?? null
}

/** #378: o doc (herói/CA local ou da vault) está PUBLICADO na sessão viva?
 *  `characterPath` guarda o id de origem do personagem publicado. */
export function characterNaSessao(sess: LiveSession | null, docId: string): boolean {
  return !!sess?.characters.some((c) => c.characterPath === docId)
}

/** Nome da MESA = apelidos dos heróis (sem NPC/companheiro) em ordem alfabética
 *  (#235), ex.: "Baitaca, Carlos, Drauzio". Fonte única do nome do grupo da
 *  sessão — usada no GrupoView e na lista de grupos (Heróis). */
export function mesaApelidos(characters: readonly SessionCharacter[]): string[] {
  return characters
    .filter((c) => c.kind !== 'npc' && c.kind !== 'companheiro')
    .map((c) => {
      const bio = (c.fmBlob?.['Biografia'] ?? {}) as Record<string, unknown>
      const ap = typeof bio['Apelido'] === 'string' ? bio['Apelido'].trim() : ''
      return ap || (c.summary.nome.split(/\s+/)[0] ?? c.summary.nome)
    })
    .sort((a, b) => a.localeCompare(b, 'pt'))
}

/** Doc SINTÉTICO de um personagem remoto: fmBlob + vida/volátil do state —
 *  o ResumoDetail (useVidaLocal lê fm.Interativa) renderiza sem saber que o
 *  personagem não é local. */
const synthCache = new WeakMap<SessionCharacter, VaultDoc>()

/** Memo por REFERÊNCIA do personagem (o setLiveSession mantém a ref enquanto o
 *  conteúdo não muda): sem isso cada render re-clonava o fmBlob inteiro. O doc
 *  devolvido é COMPARTILHADO — quem consome não pode mutá-lo. */
export function synthDocFromCharacter(c: SessionCharacter): VaultDoc {
  let doc = synthCache.get(c)
  if (!doc) {
    doc = buildSynthDoc(c)
    synthCache.set(c, doc)
  }
  return doc
}

function buildSynthDoc(c: SessionCharacter): VaultDoc {
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
        ...(c.state.recursosRestantes?.escudoDano !== undefined ? { Escudo_Dano: c.state.recursosRestantes.escudoDano } : {}),
      },
      Condicoes_Ativas: c.state.condicoesAtivas ?? {},
      Efeitos_Ativos: c.state.efeitosAtivos ?? {},
      ...(c.state.usosRecursos ? { Usos_Recursos: c.state.usosRecursos } : {}),
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
