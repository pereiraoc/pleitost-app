// HERÓI/NPC ATUALMENTE SELECIONADO (#86) — a seleção do personagem vivia só na
// ROTA (/heroi/<id>): ao voltar pra tela de seleção, a topbar e as abas de
// personagem sumiam/desabilitavam. Aqui a seleção passa a ser um estado
// PERSISTIDO (padrão useSyncExternalStore + localStorage dos outros stores):
// continua "como se o mesmo personagem estivesse selecionado" até escolher
// outro. Chave `pleitost.selectedCreature` — no namespace pleitost.*, então já
// é durável (espelhada no servidor pelo #84).
import { useSyncExternalStore } from 'react'
import { createStoreChannel } from './store-kit'

const KEY = 'pleitost.selectedCreature'

// undefined = ainda não hidratado; null = ninguém selecionado; string = id.
let memory: string | null | undefined
const channel = createStoreChannel()

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

function hydrate(): string | null {
  if (memory !== undefined) return memory
  let id: string | null = null
  try {
    const raw = storage()?.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: unknown }
      if (parsed && typeof parsed.id === 'string' && parsed.id) id = parsed.id
    }
  } catch {
    /* sem storage → memória */
  }
  memory = id
  return id
}

/** Id do herói/NPC selecionado, ou null. */
export function getSelectedCreature(): string | null {
  return hydrate()
}

/** Define (ou limpa, com null) o personagem selecionado. */
export function setSelectedCreature(id: string | null): void {
  if (hydrate() === id) return
  memory = id
  try {
    if (id) storage()?.setItem(KEY, JSON.stringify({ id }))
    else storage()?.removeItem(KEY)
  } catch {
    /* noop */
  }
  channel.emit()
}

export function subscribeSelectedCreature(cb: () => void): () => void {
  return channel.subscribe(cb)
}

/** Hook reativo do personagem selecionado. */
export function useSelectedCreature(): string | null {
  return useSyncExternalStore(subscribeSelectedCreature, getSelectedCreature, getSelectedCreature)
}

/** SÓ testes: zera a memória (não o localStorage). */
export function __resetSelectedCreatureForTests(): void {
  memory = undefined
}
