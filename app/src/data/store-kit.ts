// KIT DE STORE REATIVO (#291) — o denominador comum dos stores de módulo do app.
// Todos seguem o mesmo padrão useSyncExternalStore: um Set de listeners, um par
// subscribe/emit e (na maioria) um contador de versão. Cada store guarda seu
// PRÓPRIO dado + getSnapshot; isto centraliza só a plumbing de notificação, que
// vivia copiada em ~8 arquivos (vetor de drift — ex.: a limpeza de Set vazio do
// canal keyed existia só no hero-store depois do #291).

/** Canal reativo GLOBAL (single-channel): sessões, loja, rascunhos, seleção. */
export interface StoreChannel {
  /** Assina; retorna a função de desassinar. Passe direto pro useSyncExternalStore. */
  subscribe: (cb: () => void) => () => void
  /** Notifica todos os assinantes e incrementa a versão. */
  emit: () => void
  /** Versão atual (bump a cada emit) — getSnapshot dos stores version-based. */
  version: () => number
  /** SÓ testes: zera a versão e solta os assinantes (semântica de reload). */
  resetForTests: () => void
}

export function createStoreChannel(): StoreChannel {
  const listeners = new Set<() => void>()
  let version = 0
  return {
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    emit() {
      version++
      for (const cb of listeners) cb()
    },
    version: () => version,
    resetForTests() {
      version = 0
      listeners.clear()
    },
  }
}

/** Canal reativo POR-CHAVE (keyed): grupos, mapas de região, edições de herói —
 *  cada chave com seu próprio conjunto de assinantes. Ao desassinar, remove a
 *  entrada vazia do map (senão ele cresce sem limite a cada grupo/herói aberto —
 *  o vazamento que o #291 corrigiu no hero-store; aqui vale pra todos). */
export interface KeyedStoreChannel {
  subscribe: (key: string, cb: () => void) => () => void
  emit: (key: string) => void
  /** SÓ testes: solta todos os assinantes de todas as chaves. */
  resetForTests: () => void
}

export function createKeyedStoreChannel(): KeyedStoreChannel {
  const listeners = new Map<string, Set<() => void>>()
  return {
    subscribe(key, cb) {
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(cb)
      return () => {
        set.delete(cb)
        if (set.size === 0) listeners.delete(key)
      }
    },
    emit(key) {
      for (const cb of listeners.get(key) ?? []) cb()
    },
    resetForTests() {
      listeners.clear()
    },
  }
}
