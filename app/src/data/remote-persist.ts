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
import {
  mergeArrayBlobsBy,
  mergeByUpdatedAt,
  mergeRecordBlobs,
  mergeRecordBlobsByUpdatedAt,
  type CollectionMerger,
} from './collection-merge'
import { pushLog } from './debug-log'

const ENDPOINT = appStateUrl()
/** Chaves do app que devem persistir (grupo, ficha, personagens, mapa, ajustes). */
const SYNCED = /^(pleitost\.|local:)/
/** Preferências POR DISPOSITIVO — NÃO sincronizam por conta. O tema/cor de
 *  destaque é escolha visual local: sincronizá-lo fazia um valor antigo do
 *  servidor (de outro boot/device) reverter a seleção local ao reabrir. Segue
 *  no localStorage (per-origin), durável o bastante pra uma preferência de UI. */
const DEVICE_LOCAL = /^pleitost\.theme$/
/** Deve sincronizar pra conta/servidor? (exclui as preferências por dispositivo) */
function synced(k: string): boolean {
  return SYNCED.test(k) && !DEVICE_LOCAL.test(k)
}

/** Chaves de COLEÇÃO (blob único com N itens): a hidratação faz MERGE POR
 *  ENTRADA (união; local vence no mesmo id) em vez de fill-only-missing — um
 *  device com a chave presente nunca recebia (nem subia) os itens do outro
 *  (report: heróis importados no tablet não apareciam no celular), e um flush
 *  desatualizado apagava da conta os itens alheios. Registro central; merges
 *  estruturais em collection-merge.ts. */
const COLLECTION_MERGERS: Record<string, CollectionMerger> = {
  // #448: localEntities une por id mas resolve conflito do MESMO id por
  // recência (updatedAt por entidade) — edições de conteúdo (Pessoas nas
  // anotações) precisam propagar, não só entidades novas.
  'pleitost.localEntities': mergeRecordBlobsByUpdatedAt,
  'pleitost.groupMembership': mergeRecordBlobs,
  'pleitost.compendio.drafts': mergeRecordBlobs,
  'pleitost.sessoes': mergeArrayBlobsBy('codigo'),
}

/** Chaves versionadas por `updatedAt` (uma por região/grupo — prefixo, não
 *  exata): o mapa de hexcrawl (mapa:mundo etc.) e o caminho de cada grupo. NÃO
 *  são coleções de itens; a política é NEWER-WINS (report c85c98cf: "marquei
 *  num device e sumiu no outro" — a hidratação fill-only-missing nunca trazia a
 *  versão mais nova). Ambos gravam updatedAt no blob (hexmap-store/group-store). */
const UPDATED_AT_PREFIXES = ['pleitost.hexMap.', 'pleitost.groupState.']
/** Chaves ÚNICAS (não-prefixo) versionadas por updatedAt: o mapa do mundo
 *  (regiões/habilitação por grupo). Mesma política newer-wins. */
const UPDATED_AT_KEYS = new Set(['pleitost.mapaAtlas'])

/** Merger da chave: coleção exata, senão newer-wins (chave/prefixo), senão
 *  nenhum (escalares seguem fill-only-missing). */
function mergerFor(key: string): CollectionMerger | undefined {
  const exact = COLLECTION_MERGERS[key]
  if (exact) return exact
  if (UPDATED_AT_KEYS.has(key) || UPDATED_AT_PREFIXES.some((p) => key.startsWith(p))) {
    return mergeByUpdatedAt
  }
  return undefined
}

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

/** Callback padrão: um reload deixa os stores re-hidratarem do localStorage
 *  quando o merge trouxe chaves novas da conta. */
function defaultReload(added: string[]): void {
  if (added.length) window.location.reload()
}

/** Liga o espelho por conta quando o usuário loga (auth-state chama). Hidrata
 *  as chaves ausentes; se chegou coisa nova, `onHydrated` decide o que fazer
 *  (produção: um reload pra os stores re-hidratarem do localStorage). */
export async function connectUserStateSync(
  userId: string | null,
  onHydrated: (addedKeys: string[]) => void = defaultReload,
): Promise<void> {
  if (userId === sbUserId) return
  sbUserId = userId
  if (!userId) return
  await pullAndBootstrap(userId, onHydrated)
}

/** Re-hidrata a conta pro usuário JÁ logado (#448): o user_state só puxava no
 *  boot/login; durante a sessão só a mesa era realtime, então mudanças de outro
 *  device (Pessoas, trilhas) não apareciam sem reboot. Disparado quando o app
 *  volta ao primeiro plano (visibilitychange→visible). No-op se deslogado. */
export async function resyncUserState(
  onHydrated: (addedKeys: string[]) => void = defaultReload,
): Promise<void> {
  if (!sbUserId) return
  await pullAndBootstrap(sbUserId, onHydrated)
}

/** Puxa a conta (merge por chave) + empurra as chaves genuinamente novas deste
 *  device. Compartilhado pelo login (connectUserStateSync) e pelo foco
 *  (resyncUserState). */
async function pullAndBootstrap(
  userId: string,
  onHydrated: (addedKeys: string[]) => void,
): Promise<void> {
  const ops = userOps ?? defaultUserOps()
  if (!ops) return
  const store = ls()
  if (!store) return
  const added: string[] = []
  try {
    const data = await ops.get(userId)
    const write = origSet ?? store.setItem.bind(store)
    const patch: Record<string, string> = {}
    for (const [k, v] of Object.entries(data ?? {})) {
      if (typeof v !== 'string' || !synced(k)) continue
      const merger = mergerFor(k)
      if (merger) {
        // Coleções: MERGE por entrada nos DOIS sentidos — o que faltar local
        // desce (added → grava `value` + reload), o que diferir sobe (`pushValue`,
        // que no EMPATE preserva a conta → não clobbera).
        const r = merger(store.getItem(k), v)
        if (r.addedFromRemote) {
          write(k, r.value)
          added.push(k)
        }
        if (r.differsFromRemote) patch[k] = r.pushValue ?? r.value
        continue
      }
      if (store.getItem(k) === null) {
        // grava pelo canal ORIGINAL (sem re-enfileirar o que veio do servidor)
        write(k, v)
        added.push(k)
      }
    }
    // #291: bootstrap empurra SÓ as chaves AUSENTES no servidor (dados locais
    // genuinamente novos deste dispositivo). Antes empurrava TODAS as chaves
    // locais → um dispositivo com dado VELHO sobrescrevia (no login) o dado mais
    // NOVO que outro dispositivo já tinha gravado na conta = perda de dados. As
    // edições normais continuam sincronizando pelo flush (por-chave); só o
    // bulk-push do login deixa de clobberar o servidor. (Coleções acima já
    // subiram o MERGE quando divergem.)
    const serverKeys = new Set(Object.keys(data ?? {}))
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k && synced(k) && !serverKeys.has(k)) {
        const v = store.getItem(k)
        if (v !== null) patch[k] = v
      }
    }
    if (Object.keys(patch).length) await ops.put(userId, patch)
    // Modo debug: rastro do sync por conta (diagnóstico de "herói não
    // aparece no outro device" direto no aparelho, via report com logs).
    pushLog(
      'account-sync',
      `hidratou=${added.length} subiu=${Object.keys(patch).length} chaves`,
      { added, subiu: Object.keys(patch) },
    )
  } catch (e) {
    /* offline/sem tabela: segue local; tenta de novo no próximo login */
    pushLog('account-sync', `FALHOU: ${e instanceof Error ? e.message : String(e)}`)
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
      // MERGE-AWARE (#448/#449): o push cego regredia a conta — um device com
      // blob VELHO sobrescrevia a chave inteira, apagando o que outro device
      // gravou (Pessoas viravam null no servidor; a trilha nova do grupo sumia).
      // Antes de gravar, lê o valor ATUAL da conta e aplica o merger da chave
      // (união/newer-wins) — o push nunca regride. Só chaves mergeáveis não-nulas
      // pagam a leitura extra; escalares seguem sobrescrita direta.
      const mergeable = Object.keys(patch).some((k) => patch[k] !== null && !!mergerFor(k))
      let finalPatch = patch
      if (mergeable) {
        const server = (await ops.get(uid)) ?? {}
        finalPatch = {}
        for (const [k, v] of Object.entries(patch)) {
          const merger = v !== null ? mergerFor(k) : undefined
          const cur = server[k]
          if (merger && typeof cur === 'string') {
            const r = merger(v, cur) // v = meu blob local; cur = a conta
            // sobe o `pushValue` — no EMPATE preserva o da conta (não regride).
            finalPatch[k] = r.pushValue ?? r.value
          } else {
            finalPatch[k] = v
          }
        }
      }
      await ops.put(uid, finalPatch)
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
      if (typeof v !== 'string' || !synced(k)) continue
      const merger = mergerFor(k)
      if (merger) {
        const r = merger(store.getItem(k), v)
        if (r.addedFromRemote) store.setItem(k, r.value)
        continue
      }
      if (store.getItem(k) === null) store.setItem(k, v)
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
    if (synced(k)) enqueue(k, v)
  }
  store.removeItem = (k: string) => {
    origRemove!(k)
    if (synced(k)) enqueue(k, null)
  }
  // celular: ao esconder/fechar o app, garante o flush pendente; ao VOLTAR ao
  // primeiro plano, re-hidrata a conta (#448) — mudanças de outro device
  // aparecem sem precisar reabrir o app do zero.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
    else void resyncUserState()
  })
  window.addEventListener('pagehide', flush)
  // bootstrap: manda o estado LOCAL atual pro servidor
  const patch: Record<string, string> = {}
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && synced(k)) {
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
