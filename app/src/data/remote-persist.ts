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
  const store = ls()
  if (patched && store) {
    if (origSet) store.setItem = origSet as Storage['setItem']
    if (origRemove) store.removeItem = origRemove as Storage['removeItem']
  }
  patched = false
  origSet = null
  origRemove = null
  queue = {}
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
