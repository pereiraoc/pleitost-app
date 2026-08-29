// HERÓI/NPC ATUALMENTE SELECIONADO (#86) — a seleção do personagem vivia só na
// ROTA (/heroi/<id>): ao voltar pra tela de seleção, a topbar e as abas de
// personagem sumiam/desabilitavam. Aqui a seleção passa a ser um estado
// PERSISTIDO (padrão useSyncExternalStore + localStorage dos outros stores):
// continua "como se o mesmo personagem estivesse selecionado" até escolher
// outro. Chave `pleitost.selectedCreature` — no namespace pleitost.*, então já
// é durável (espelhada no servidor pelo #84).
import { useSyncExternalStore } from 'react'
import { createStoreChannel } from './store-kit'
import { activeWorld, onWorldChange, type WorldId } from './world'

const KEY = 'pleitost.selectedCreature'

interface Selecao {
  id: string
  /** MUNDO em que a seleção foi feita (#519). Ausente no blob = legado =
   *  fantasia. A LEITURA filtra pelo mundo ativo — o blob é espelhado no
   *  servidor (#84) e pode chegar de outro device/mundo sem evento algum
   *  (report 2026-08-29: boot no poa1987 com o Carlos da fantasia ativo). */
  world: WorldId
}

// undefined = ainda não hidratado; null = ninguém selecionado.
let memory: Selecao | null | undefined
const channel = createStoreChannel()
// Trocar de MUNDO AO VIVO limpa a seleção (#519/#520 follow-up — decisão
// explícita: mundo novo começa sem seleção; não restaura ao voltar). O emit é
// incondicional: mesmo quando a leitura filtrada já era null, os consumidores
// precisam re-ler (o valor visível pode ter mudado com o mundo).
onWorldChange(() => {
  memory = null
  try {
    storage()?.removeItem(KEY)
  } catch {
    /* noop */
  }
  channel.emit()
})

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

function hydrate(): Selecao | null {
  if (memory !== undefined) return memory
  let sel: Selecao | null = null
  try {
    const raw = storage()?.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: unknown; world?: unknown }
      if (parsed && typeof parsed.id === 'string' && parsed.id) {
        sel = {
          id: parsed.id,
          world: parsed.world === 'cyberpunk' ? 'cyberpunk' : 'fantasia',
        }
      }
    }
  } catch {
    /* sem storage → memória */
  }
  memory = sel
  return sel
}

/** Id do herói/NPC selecionado NO MUNDO ATIVO, ou null. Seleção carimbada de
 *  outro mundo lê como null (o raw fica intacto — pode ter vindo do sync). */
export function getSelectedCreature(): string | null {
  const sel = hydrate()
  return sel && sel.world === activeWorld() ? sel.id : null
}

/** Define (ou limpa, com null) o personagem selecionado — carimbado com o
 *  mundo ativo. */
export function setSelectedCreature(id: string | null): void {
  if (getSelectedCreature() === id && (id !== null || hydrate() === null)) return
  memory = id ? { id, world: activeWorld() } : null
  try {
    if (id) storage()?.setItem(KEY, JSON.stringify({ id, world: activeWorld() }))
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
