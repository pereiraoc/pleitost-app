// Sync remoto da SESSÃO (#101b) — adapter local-first sobre o session-store:
// o app funciona 100% offline; com servidor configurado (VITE_SESSION_SERVER
// ou localStorage `pleitost.serverUrl`) e login GitHub (device flow), as
// sessões criadas/entradas passam pelo servidor e a sala sincroniza via
// WebSocket (last-write-wins):
//   - estado da sessão (init/round/vezIdx/claims/nome) → patch broadcast;
//   - volátil de vida dos heróis (Interativa.*) → espelhado via hero-store
//     (origem 'sync' é a guarda de eco).
import { useSyncExternalStore } from 'react'
import { onHeroWrite, writeHeroEdit } from './hero-store'
import { getSession, updateSession, type SessionRec } from './session-store'

export interface ServerUser {
  login: string
  name: string
  avatar: string
}

const URL_KEY = 'pleitost.serverUrl'
const AUTH_KEY = 'pleitost.serverAuth'

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

export function serverUrl(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.['VITE_SESSION_SERVER']
  const stored = storage()?.getItem(URL_KEY)
  const url = stored || env || ''
  return url ? url.replace(/\/$/, '') : null
}

export function setServerUrl(url: string): void {
  if (url) storage()?.setItem(URL_KEY, url)
  else storage()?.removeItem(URL_KEY)
  bump()
}

interface AuthState {
  token: string
  user: ServerUser
}

let authCache: AuthState | null | undefined
const listeners = new Set<() => void>()
function bump() {
  authCache = undefined
  for (const l of listeners) l()
}

export function getServerAuth(): AuthState | null {
  if (authCache !== undefined) return authCache
  try {
    const raw = storage()?.getItem(AUTH_KEY)
    authCache = raw ? (JSON.parse(raw) as AuthState) : null
  } catch {
    authCache = null
  }
  return authCache
}

export function logoutServer(): void {
  storage()?.removeItem(AUTH_KEY)
  bump()
}

export function useServerAuth(): { url: string | null; auth: AuthState | null } {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => `${serverUrl() ?? ''}|${getServerAuth()?.token ?? ''}`,
  )
  return { url: serverUrl(), auth: getServerAuth() }
}

/* ── login GitHub (device flow) ─────────────────────────────────── */

export interface DeviceLogin {
  userCode: string
  verificationUri: string
  /** Resolve quando o usuário autorizar no GitHub (poll no servidor). */
  finish: Promise<ServerUser>
  cancel: () => void
}

export async function startDeviceLogin(): Promise<DeviceLogin> {
  const url = serverUrl()
  if (!url) throw new Error('servidor não configurado')
  const res = await fetch(`${url}/auth/device`, { method: 'POST' })
  if (!res.ok) throw new Error(`auth/device ${res.status}`)
  const dc = (await res.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    interval: number
    expires_in: number
  }
  let cancelled = false
  const finish = (async () => {
    const deadline = Date.now() + dc.expires_in * 1000
    // o servidor repassa o interval do GitHub (≥5s em produção) — sem clamp
    // aqui pra não travar testes com intervals curtos
    let interval = Math.max(0.01, dc.interval) * 1000
    for (;;) {
      if (cancelled) throw new Error('cancelado')
      if (Date.now() > deadline) throw new Error('código expirou')
      await new Promise((r) => setTimeout(r, interval))
      const poll = await fetch(`${url}/auth/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: dc.device_code }),
      })
      if (!poll.ok) throw new Error(`auth/poll ${poll.status}`)
      const data = (await poll.json()) as { pending?: boolean; interval?: number; token?: string; user?: ServerUser }
      if (data.pending) {
        if (data.interval) interval = Math.max(interval, data.interval * 1000)
        continue
      }
      if (!data.token || !data.user) throw new Error('resposta inválida do servidor')
      storage()?.setItem(AUTH_KEY, JSON.stringify({ token: data.token, user: data.user }))
      bump()
      return data.user
    }
  })()
  return {
    userCode: dc.user_code,
    verificationUri: dc.verification_uri,
    finish,
    cancel: () => {
      cancelled = true
    },
  }
}

/* ── operações de sessão no servidor ────────────────────────────── */

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = serverUrl()
  const auth = getServerAuth()
  if (!url || !auth) throw new Error('sem servidor/login')
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}`, ...init.headers },
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return (await res.json()) as T
}

export interface ServerSession extends SessionRec {
  membros: string[]
  heroVol: Record<string, Record<string, unknown>>
  rev: number
}

export function serverCreateSession(nome: string, grupoId: string | null): Promise<ServerSession> {
  return api<ServerSession>('/sessions', { method: 'POST', body: JSON.stringify({ nome, grupoId }) })
}

export function serverJoinSession(codigo: string): Promise<ServerSession> {
  return api<ServerSession>(`/sessions/${encodeURIComponent(codigo)}/join`, { method: 'POST' })
}

/* ── sala ao vivo (WebSocket) ───────────────────────────────────── */

/** Campos da sessão que o remoto pode sobrescrever no store local. */
const SYNC_FIELDS = ['nome', 'grupoId', 'init', 'round', 'vezIdx', 'claims'] as const

let liveSocket: WebSocket | null = null

/** Envia um patch da sessão pra sala (se conectada) — a UI chama junto do
 *  updateSession local. */
export function pushSessionPatch(patch: Partial<SessionRec>): void {
  if (liveSocket?.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({ t: 'patch', patch }))
  }
}

/** Conecta a sala da sessão ativa. Efeito com cleanup:
 *  - remoto → local: sessão (campos SYNC_FIELDS) + volátil de herói
 *    (writeHeroEdit origem 'sync');
 *  - local → remoto: writes `Interativa.*` de qualquer ficha (exceto os do
 *    próprio sync) enquanto a sala está aberta. */
export function connectSessionSync(codigo: string): () => void {
  const url = serverUrl()
  const auth = getServerAuth()
  if (!url || !auth) return () => {}
  const wsUrl = `${url.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(auth.token)}&code=${encodeURIComponent(codigo)}`
  const ws = new WebSocket(wsUrl)
  liveSocket = ws

  ws.onmessage = (ev) => {
    let msg: { t?: string; sess?: ServerSession; heroId?: string; path?: string; value?: unknown }
    try {
      msg = JSON.parse(String(ev.data))
    } catch {
      return
    }
    if (msg.t === 'session' && msg.sess) {
      const local = getSession(codigo)
      if (local) {
        const patch: Partial<SessionRec> = {}
        for (const f of SYNC_FIELDS) (patch as Record<string, unknown>)[f] = msg.sess[f]
        // mestre/claims do servidor viram o espelho local
        patch.mestre = msg.sess.mestre
        updateSession(codigo, patch)
      }
      // snapshot inicial do volátil dos heróis da sala
      for (const [heroId, vol] of Object.entries(msg.sess.heroVol ?? {})) {
        for (const [path, value] of Object.entries(vol)) {
          writeHeroEdit(heroId, 'fm', path, value, { channel: 'autosave', origem: 'sync' })
        }
      }
    } else if (msg.t === 'hero' && msg.heroId && msg.path) {
      writeHeroEdit(msg.heroId, 'fm', msg.path, msg.value, { channel: 'autosave', origem: 'sync' })
    }
  }

  const offWrites = onHeroWrite((heroId, path, value, origem) => {
    if (origem === 'sync') return
    if (!path.startsWith('Interativa.')) return
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ t: 'hero', heroId, path, value }))
    }
  })

  return () => {
    offWrites()
    if (liveSocket === ws) liveSocket = null
    ws.close()
  }
}
