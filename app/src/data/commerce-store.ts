// PERSISTÊNCIA da loja por Localização (issue #72) — espelha o padrão dos
// demais stores do app (leitura síncrona pra hidratar no 1º render, cache em
// memória + notify pra useSyncExternalStore, canal imediato). A rolagem da
// disponibilidade é PERSISTIDA por local: abrir a ficha do lugar NÃO re-rola —
// mostra a última rolagem. O GM pode RE-ROLAR (nova rolagem) ou TRAVAR (marca
// a rolagem como fixa; enquanto travada, o botão de re-rolar fica bloqueado).
//
// A compra decrementa a quantidade disponível de uma entrada da rolagem
// guardada aqui (o débito de ouro / adição ao herói é do hero-store).
//
// Chave: `pleitost.commerce.<locationId>` → { entries, travada, localType }.
import { useSyncExternalStore } from 'react'
import type { ShopEntry, LocalType, Tier } from './commerce'

export interface ShopState {
  /** Itens rolados como disponíveis (com quantidade corrente, decrementada por
   *  compra). */
  entries: ShopEntry[]
  /** Rolagem travada pelo GM (re-rolar bloqueado). */
  travada: boolean
  /** Tipo de local efetivo usado na rolagem (subcategoria ou "Iluminada" por
   *  override do GM) — permite re-rolar sem re-derivar. */
  localType: LocalType | null
}

const STORE_PREFIX = 'pleitost.commerce.'

const memory = new Map<string, ShopState>()
const listeners = new Set<() => void>()
let version = 0

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}
function safeGet(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}
function safeSet(key: string, value: string): void {
  try {
    storage()?.setItem(key, value)
  } catch {
    /* memória continua a fonte da sessão */
  }
}

function key(locationId: string): string {
  return STORE_PREFIX + locationId
}

function bump(): void {
  version++
  for (const cb of listeners) cb()
}

export function subscribeCommerce(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
export function commerceVersion(): number {
  return version
}

/** Estado da loja guardado, ou null se o local ainda não foi rolado. */
export function getShopState(locationId: string): ShopState | null {
  if (memory.has(locationId)) return memory.get(locationId)!
  const raw = safeGet(key(locationId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ShopState>
    const state: ShopState = {
      entries: Array.isArray(parsed.entries) ? (parsed.entries as ShopEntry[]) : [],
      travada: parsed.travada === true,
      localType: (parsed.localType ?? null) as LocalType | null,
    }
    memory.set(locationId, state)
    return state
  } catch {
    return null
  }
}

function persist(locationId: string, state: ShopState): void {
  memory.set(locationId, state)
  safeSet(key(locationId), JSON.stringify(state))
  bump()
}

/** Grava uma rolagem nova (RE-ROLAR / primeira rolagem). Destrava. */
export function setShopRoll(locationId: string, entries: ShopEntry[], localType: LocalType): void {
  persist(locationId, { entries, travada: false, localType })
}

/** Trava/destrava a rolagem atual (mantém as entradas). */
export function setShopTravada(locationId: string, travada: boolean): void {
  const cur = getShopState(locationId)
  if (!cur) return
  persist(locationId, { ...cur, travada })
}

/** Decrementa a quantidade disponível de uma entrada (compra). Remove a
 *  entrada quando chega a 0. Idempotente contra entradas ausentes. */
export function decrementShopEntry(locationId: string, target: string, tier: Tier, by = 1): void {
  const cur = getShopState(locationId)
  if (!cur) return
  const entries: ShopEntry[] = []
  for (const e of cur.entries) {
    if (e.target === target && e.tier === tier) {
      const q = e.quantidade - by
      if (q > 0) entries.push({ ...e, quantidade: q })
      // q <= 0 → entrada esgotada, some da loja
    } else {
      entries.push(e)
    }
  }
  persist(locationId, { ...cur, entries })
}

/** Hook reativo do estado da loja de um local. */
export function useShopState(locationId: string): ShopState | null {
  const v = useSyncExternalStore(subscribeCommerce, commerceVersion, commerceVersion)
  // v participa das deps implicitamente (re-render ao bump); leitura sempre fresca.
  void v
  return getShopState(locationId)
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload. */
export function __resetCommerceStoreForTests(): void {
  memory.clear()
  version = 0
  listeners.clear()
}
