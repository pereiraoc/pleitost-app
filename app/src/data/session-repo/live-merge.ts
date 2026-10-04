// MERGE da sala viva ("atualizar só o que mudou") — cada evento realtime
// re-busca as tabelas e o transporte devolve objetos TODOS novos
// (mapCharacter/mapEncounter/...). Sem structural sharing, toda ficha aberta e
// todo consumidor do live re-renderizava a cada refetch. Aqui o snapshot novo
// reaproveita, POR ID, as referências do anterior quando o conteúdo é igual:
// personagem igual = mesmo objeto (e summary/fmBlob/state reaproveitados um a
// um quando só parte mudou); arrays reaproveitados quando todos os elementos
// foram; nada mudou = o próprio `prev`. Igualdade por stableStringify (o jsonb
// não preserva a ordem das chaves).
//
// Identidade MUDA sempre que o conteúdo muda — o backflow do usePublicacao
// (meuChar) depende disso (state carrega o rev do write).
import { stableStringify } from '../stable-stringify'
import type { LiveSession } from './live-session'
import type { SessionCharacter } from './contract'

function igual(a: unknown, b: unknown): boolean {
  return a === b || stableStringify(a) === stableStringify(b)
}

function reusa<T>(prev: T, next: T): T {
  return igual(prev, next) ? prev : next
}

function semBlobs(c: SessionCharacter): Omit<SessionCharacter, 'summary' | 'fmBlob' | 'state'> {
  const { summary: _s, fmBlob: _f, state: _st, ...resto } = c
  return resto
}

function mergeCharacter(p: SessionCharacter, n: SessionCharacter): SessionCharacter {
  if (p === n) return p
  const summary = reusa(p.summary, n.summary)
  const fmBlob = reusa(p.fmBlob, n.fmBlob)
  const state = reusa(p.state, n.state)
  if (summary === p.summary && fmBlob === p.fmBlob && state === p.state && igual(semBlobs(p), semBlobs(n))) return p
  return { ...n, summary, fmBlob, state }
}

function mergeById<T>(
  prev: readonly T[],
  next: readonly T[],
  key: (x: T) => string,
  mergeOne: (p: T, n: T) => T,
): T[] {
  if (prev === next) return prev as T[]
  const byId = new Map(prev.map((x) => [key(x), x]))
  let todosReusados = prev.length === next.length
  const out = next.map((n, i) => {
    const p = byId.get(key(n))
    const m = p ? mergeOne(p, n) : n
    if (m !== prev[i]) todosReusados = false
    return m
  })
  return todosReusados ? (prev as T[]) : out
}

export function mergeLive(prev: LiveSession, next: LiveSession): LiveSession {
  if (prev === next) return prev
  if (prev.sessionId !== next.sessionId) return next
  const characters = mergeById(prev.characters, next.characters, (c) => c.id, mergeCharacter)
  const encounters = mergeById(prev.encounters, next.encounters, (e) => e.id, reusa)
  const members = mergeById(prev.members, next.members, (m) => m.userId, reusa)
  const state = reusa(prev.state, next.state)
  if (
    characters === prev.characters &&
    encounters === prev.encounters &&
    members === prev.members &&
    state === prev.state &&
    prev.gmUserId === next.gmUserId
  )
    return prev
  return { ...next, characters, encounters, members, state }
}
