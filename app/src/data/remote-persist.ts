// PERSISTÊNCIA DURÁVEL do estado do usuário (#84) — o app guarda caminhos de
// grupo (pleitost.groupState.*), edições de ficha (pleitost.heroEdits.*),
// personagens criados (local:*), mapas (pleitost.hexMap.*) e ajustes
// (pleitost.settings.*) no localStorage, que é POR-ORIGEM: some quando o
// endereço do túnel muda e não sobrevive sozinho a nada server-side.
//
// Aqui o localStorage vira um ESPELHO de um arquivo no servidor (/app-state,
// ver vite/app-state.ts): ao abrir, HIDRATA do servidor (preenche o que falta
// localmente — então um endereço novo já vem com os dados); e cada gravação é
// ESPELHADA de volta pro servidor (debounce). O arquivo no disco é a fonte
// durável — sobrevive a restart do servidor e troca de URL. NÃO toca a vault.

import { appStateUrl } from './base-url'
import { supabaseClient } from './session-repo/supabase'

const ENDPOINT = appStateUrl()
/** Chaves do app que devem persistir (grupo, ficha, personagens, mapa, ajustes). */
const SYNCED = /^(pleitost\.|local:)/

let queue: Record<string, string | null> = {}
let timer: ReturnType<typeof setTimeout> | null = null
let patched = false
let origSet: ((k: string, v: string) => void) | null = null
let origRemove: ((k: string) => void) | null = null

/** window.localStorage (ou null) — mesma convenção dos outros stores do app. */
function ls(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

/* ── #239: espelho POR CONTA (Supabase user_state) ─────────────────────────
 * Logado, o MESMO snapshot (pleitost.* e local:*) sincroniza pra linha do usuário
 * (RLS: só a própria). Semântica idêntica ao /app-state: hidratar preenche o
 * que FALTA local (nunca sobrescreve), cada flush faz merge por chave no
 * jsonb (last-write-wins por lote — documento na issue). v1: dados de outro
 * dispositivo entram no LOGIN/boot (um reload quando chegam chaves novas);
 * durante a sessão, só a mesa (SessionRepo) é realtime. */
interface UserStateOps {
  get(userId: string): Promise<Record<string, string> | null>
  put(userId: string, patch: Record<string, string | null>): Promise<void>
}
let userOps: UserStateOps | null = null
let sbUserId: string | null = null

function defaultUserOps(): UserStateOps | null {
  const sb = supabaseClient()
  if (!sb) return null
  return {
    async get(userId) {
      const { data, error } = await sb
        .from('user_state')
        .select('data')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data?.data as Record<string, string>) ?? null
    },
    async put(userId, patch) {
      // read-merge-write (linha única por usuário; null remove a chave)
      const { data } = await sb.from('user_state').select('data').eq('user_id', userId).maybeSingle()
      const merged: Record<string, string> = { ...((data?.data as Record<string, string>) ?? {}) }
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete merged[k]
        else merged[k] = v
      }
      const { error } = await sb
        .from('user_state')
        .upsert({ user_id: userId, data: merged, updated_at: new Date().toISOString() })
      if (error) throw new Error(error.message)
    },
  }
}

export function __setUserStateOpsForTests(ops: UserStateOps | null): void {
  userOps = ops
}

/** Liga o espelho por conta quando o usuário loga (auth-state chama). Hidrata
 *  as chaves ausentes; se chegou coisa nova, `onHydrated` decide o que fazer
 *  (produção: um reload pra os stores re-hidratarem do localStorage). */
export async function connectUserStateSync(
  userId: string | null,
  onHydrated: (addedKeys: string[]) => void = (added) => {
    if (added.length) window.location.reload()
  },
): Promise<void> {
  if (userId === sbUserId) return
  sbUserId = userId
  if (!userId) return
  const ops = userOps ?? defaultUserOps()
  if (!ops) return
  const store = ls()
  if (!store) return
  const added: string[] = []
  try {
    const data = await ops.get(userId)
    for (const [k, v] of Object.entries(data ?? {})) {
      if (typeof v === 'string' && SYNCED.test(k) && store.getItem(k) === null) {
        // grava pelo canal ORIGINAL (sem re-enfileirar o que veio do servidor)
        ;(origSet ?? store.setItem.bind(store))(k, v)
        added.push(k)
      }
    }
    // bootstrap: snapshot local → conta (merge; chaves do servidor ficam)
    const patch: Record<string, string> = {}
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k && SYNCED.test(k)) {
        const v = store.getItem(k)
        if (v !== null) patch[k] = v
      }
    }
    await ops.put(userId, patch)
  } catch {
    /* offline/sem tabela: segue local; tenta de novo no próximo login */
  }
  onHydrated(added)
}

// #291: SERIALIZA os read-merge-write da linha user_state. `ops.put` é SELECT →
// merge → UPSERT; dois flushes concorrentes (bursts, ou o bootstrap sobrepondo um
// flush normal) liam a linha, mergiam só o próprio patch e sobrescreviam chaves
// que o outro tinha acabado de gravar. Uma corrente de promises garante ordem.
let userPutChain: Promise<void> = Promise.resolve()

async function putUserPatch(patch: Record<string, string | null>): Promise<void> {
  if (!sbUserId || Object.keys(patch).length === 0) return
  const ops = userOps ?? defaultUserOps()
  if (!ops) return
  const uid = sbUserId
  userPutChain = userPutChain.then(async () => {
    try {
      await ops.put(uid, patch)
    } catch {
      /* offline: próxima gravação tenta de novo */
    }
  })
  return userPutChain
}

/** SÓ testes: dispara um putUserPatch (a serialização é interna). */
export function __putUserPatchForTests(patch: Record<string, string | null>): Promise<void> {
  return putUserPatch(patch)
}

async function putPatch(patch: Record<string, string | null>): Promise<void> {
  if (Object.keys(patch).length === 0) return
  try {
    await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      keepalive: true,
    })
  } catch {
    /* offline: fica só no localStorage; sincroniza na próxima gravação */
  }
}

function flush(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const patch = queue
  queue = {}
  void putPatch(patch)
  void putUserPatch(patch) // #239: espelho por conta quando logado
}

function enqueue(key: string, value: string | null): void {
  queue[key] = value
  if (!timer) timer = setTimeout(flush, 500)
}

/** Puxa o estado do servidor e PREENCHE as chaves ausentes no localStorage
 *  (não sobrescreve local mais novo). Num endereço novo (local vazio) traz
 *  tudo; offline/timeout → segue com o que houver local. */
export async function hydrateFromServer(timeoutMs = 3500): Promise<void> {
  const store = ls()
  if (typeof fetch !== 'function' || !store) return
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(ENDPOINT, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    if (!res.ok) return
    const data = (await res.json()) as Record<string, unknown>
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string' && SYNCED.test(k) && store.getItem(k) === null) {
        store.setItem(k, v)
      }
    }
  } catch {
    /* offline/timeout */
  }
}

/** Intercepta setItem/removeItem do localStorage pra ESPELHAR toda gravação das
 *  chaves do app pro servidor (uma vez). Depois empurra o estado local atual
 *  (bootstrap: dados que já existiam viram duráveis). */
export function installPersistMirror(): void {
  const store = ls()
  if (patched || !store) return
  patched = true
  origSet = store.setItem.bind(store)
  origRemove = store.removeItem.bind(store)
  store.setItem = (k: string, v: string) => {
    origSet!(k, v)
    if (SYNCED.test(k)) enqueue(k, v)
  }
  store.removeItem = (k: string) => {
    origRemove!(k)
    if (SYNCED.test(k)) enqueue(k, null)
  }
  // celular: ao esconder/fechar o app, garante o flush pendente
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
  // bootstrap: manda o estado LOCAL atual pro servidor
  const patch: Record<string, string> = {}
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && SYNCED.test(k)) {
      const v = store.getItem(k)
      if (v !== null) patch[k] = v
    }
  }
  void putPatch(patch)
}

/** Ordem correta na inicialização: hidrata (server→local) e SÓ então instala o
 *  espelho (pra a hidratação não gerar sync redundante). */
export async function initPersistence(): Promise<void> {
  await hydrateFromServer()
  installPersistMirror()
}

/** SÓ testes: restaura o localStorage original, desfaz o patch e limpa a fila. */
export function __resetPersistForTests(): void {
  sbUserId = null
  userOps = null
  const store = ls()
  if (patched && store) {
    if (origSet) store.setItem = origSet as Storage['setItem']
    if (origRemove) store.removeItem = origRemove as Storage['removeItem']
  }
  patched = false
  origSet = null
  origRemove = null
  queue = {}
  userPutChain = Promise.resolve()
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
