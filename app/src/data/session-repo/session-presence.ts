// Presença ao vivo da sala ATIVA (#294) — cache observável dos userIds
// conectados AGORA, alimentado pelo canal de presença do SessionRealtime
// (subscribePresence) e lido pelo painel MEMBROS pra marcar quem está online.
// Um único slot: só existe UMA sala ativa por vez (igual ao live-session).
import { useSyncExternalStore } from 'react'

let connected: readonly string[] = []
const EMPTY_SET: ReadonlySet<string> = new Set()
let connectedSet: ReadonlySet<string> = EMPTY_SET
const listeners = new Set<() => void>()

/** Substitui o conjunto de conectados (chamado a cada sync/join/leave). */
export function setConnectedUserIds(ids: readonly string[]): void {
  connected = ids
  connectedSet = ids.length ? new Set(ids) : EMPTY_SET
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Set (estável entre renders sem mudança) dos userIds conectados agora. */
export function useConnectedUserIds(): ReadonlySet<string> {
  useSyncExternalStore(subscribe, () => connected)
  return connectedSet
}
