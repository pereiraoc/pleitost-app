// PERSISTÊNCIA da loja por Localização (issues #72/#93) — espelha o padrão dos
// demais stores (leitura síncrona pra hidratar no 1º render, cache em memória +
// notify pra useSyncExternalStore). A rolagem é PERSISTIDA por local: reabrir a
// ficha NÃO re-rola — mostra a última. O GM RE-ROLA (nova) ou TRAVA (fixa).
//
// v2 (#93): o estado guarda PRONTA ENTREGA (estoque, decrementa na compra) e
// ENCOMENDA (só referência do GM). A compra decrementa a quantidade de uma
// entrada da pronta (o débito de ouro / adição ao herói é do hero-store).
//
// Chave: `pleitost.commerce.<locationId>` → { pronta, encomenda, travada, localType }.
import { useSyncExternalStore } from 'react'
import type { ProntaEntry, EncomendaEntry, LocalType, Tier } from './commerce'
import { createStoreChannel } from './store-kit'

export interface ShopState {
  /** Estoque atual (pronta entrega) — quantidade decrementa na compra. */
  pronta: ProntaEntry[]
  /** Disponível por encomenda (referência do GM, sem quantidade). */
  encomenda: EncomendaEntry[]
  /** Rolagem travada pelo GM (re-rolar bloqueado). */
  travada: boolean
  /** Tipo de local efetivo usado na rolagem (subcategoria ou "Iluminada"). */
  localType: LocalType | null
}

const STORE_PREFIX = 'pleitost.commerce.'

const memory = new Map<string, ShopState>()
const channel = createStoreChannel()
const bump = channel.emit

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

export function subscribeCommerce(cb: () => void): () => void {
  return channel.subscribe(cb)
}
export function commerceVersion(): number {
  return channel.version()
}

/** Estado da loja guardado, ou null se o local ainda não foi rolado (ou se o
 *  dado persistido é do formato antigo v1 → re-rola no novo formato). */
export function getShopState(locationId: string): ShopState | null {
  if (memory.has(locationId)) return memory.get(locationId)!
  const raw = safeGet(key(locationId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ShopState>
    // Migração: sem `pronta` array = formato v1 (entries) → trata como não-rolado.
    if (!Array.isArray(parsed.pronta)) return null
    const state: ShopState = {
      pronta: parsed.pronta as ProntaEntry[],
      encomenda: Array.isArray(parsed.encomenda) ? (parsed.encomenda as EncomendaEntry[]) : [],
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
export function setShopRoll(
  locationId: string,
  rolled: { pronta: ProntaEntry[]; encomenda: EncomendaEntry[] },
  localType: LocalType,
): void {
  persist(locationId, { pronta: rolled.pronta, encomenda: rolled.encomenda, travada: false, localType })
}

/** Trava/destrava a rolagem atual (mantém as entradas). */
export function setShopTravada(locationId: string, travada: boolean): void {
  const cur = getShopState(locationId)
  if (!cur) return
  persist(locationId, { ...cur, travada })
}

/** Decrementa a quantidade de uma entrada da PRONTA (compra). Remove quando
 *  chega a 0. Idempotente contra entradas ausentes. Chave = ProntaEntry.key. */
export function decrementProntaEntry(locationId: string, entryKey: string, tier: Tier, by = 1): void {
  const cur = getShopState(locationId)
  if (!cur) return
  const pronta: ProntaEntry[] = []
  for (const e of cur.pronta) {
    if (e.key === entryKey && e.tier === tier) {
      const q = e.quantidade - by
      if (q > 0) pronta.push({ ...e, quantidade: q })
      // q <= 0 → esgotado, some da loja
    } else {
      pronta.push(e)
    }
  }
  persist(locationId, { ...cur, pronta })
}

/** Hook reativo do estado da loja de um local. */
export function useShopState(locationId: string): ShopState | null {
  const v = useSyncExternalStore(subscribeCommerce, commerceVersion, commerceVersion)
  void v // participa das deps (re-render ao bump); leitura sempre fresca.
  return getShopState(locationId)
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload. */
export function __resetCommerceStoreForTests(): void {
  memory.clear()
  channel.resetForTests()
}
