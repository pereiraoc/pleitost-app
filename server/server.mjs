// Servidor de sessão do companion pleitost (#101b): HTTP (auth + CRUD de
// sessões) + WebSocket por sala (sync last-write-wins do estado da sessão e do
// volátil de vida dos heróis). Sem framework — node:http + ws.
//
// Rodar: PLEITOST_GITHUB_CLIENT_ID=<oauth app client id> npm start -w server
// (porta via PLEITOST_SERVER_PORT, default 8787; estado em server/data/state.json)
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { WebSocketServer } from 'ws'
import { createStore } from './lib/store.mjs'
import { createAuth } from './lib/auth.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const store = createStore(process.env.PLEITOST_SERVER_STATE ?? join(here, 'data', 'state.json'))
const auth = createAuth({ clientId: process.env.PLEITOST_GITHUB_CLIENT_ID, store })
const PORT = Number(process.env.PLEITOST_SERVER_PORT ?? 8787)

/** Salas ativas: codigo → Set<ws>. */
const rooms = new Map()

function send(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  })
  res.end(json)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return {}
  }
}

function userFrom(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return m ? store.userOf(m[1]) : null
}

function broadcast(codigo, msg, except = null) {
  const set = rooms.get(codigo)
  if (!set) return
  const json = JSON.stringify(msg)
  for (const ws of set) {
    if (ws !== except && ws.readyState === 1) ws.send(json)
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const path = url.pathname
  if (req.method === 'OPTIONS') return send(res, 204, {})

  try {
    /* ── auth (device flow) ─────────────────────────────────────── */
    if (path === '/auth/device' && req.method === 'POST') {
      if (!auth.enabled) return send(res, 503, { error: 'auth desabilitada (sem client_id)' })
      return send(res, 200, await auth.deviceCode())
    }
    if (path === '/auth/poll' && req.method === 'POST') {
      if (!auth.enabled) return send(res, 503, { error: 'auth desabilitada (sem client_id)' })
      const { device_code } = await readBody(req)
      return send(res, 200, await auth.poll(device_code))
    }
    if (path === '/me' && req.method === 'GET') {
      const user = userFrom(req)
      return user ? send(res, 200, user) : send(res, 401, { error: 'sem token' })
    }

    /* ── sessões (auth obrigatória) ─────────────────────────────── */
    const user = userFrom(req)
    if (path === '/sessions' && req.method === 'GET') {
      if (!user) return send(res, 401, { error: 'sem token' })
      return send(res, 200, store.listSessionsOf(user.login))
    }
    if (path === '/sessions' && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'sem token' })
      const { nome, grupoId } = await readBody(req)
      return send(res, 201, store.createSession({ nome, grupoId, mestre: user.login }))
    }
    const joinM = /^\/sessions\/([A-Za-z0-9]+)\/join$/.exec(path)
    if (joinM && req.method === 'POST') {
      if (!user) return send(res, 401, { error: 'sem token' })
      const sess = store.joinSession(joinM[1], user.login)
      if (!sess) return send(res, 404, { error: 'sessão não existe' })
      broadcast(sess.codigo, { t: 'session', sess })
      return send(res, 200, sess)
    }
    const delM = /^\/sessions\/([A-Za-z0-9]+)$/.exec(path)
    if (delM && req.method === 'DELETE') {
      if (!user) return send(res, 401, { error: 'sem token' })
      return store.deleteSession(delM[1], user.login)
        ? send(res, 200, { ok: true })
        : send(res, 403, { error: 'só o mestre exclui' })
    }
    if (delM && req.method === 'GET') {
      if (!user) return send(res, 401, { error: 'sem token' })
      const sess = store.getSession(delM[1])
      return sess ? send(res, 200, sess) : send(res, 404, { error: 'sessão não existe' })
    }

    return send(res, 404, { error: 'rota desconhecida' })
  } catch (err) {
    return send(res, 500, { error: String(err?.message ?? err) })
  }
})

/* ── WebSocket: /ws?token=…&code=… ─────────────────────────────── */
const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const user = store.userOf(url.searchParams.get('token'))
  const codigo = (url.searchParams.get('code') ?? '').toUpperCase()
  const sess = store.getSession(codigo)
  if (!user || !sess || !sess.membros.includes(user.login)) {
    ws.close(4001, 'não autorizado')
    return
  }
  let set = rooms.get(codigo)
  if (!set) rooms.set(codigo, (set = new Set()))
  set.add(ws)
  ws.send(JSON.stringify({ t: 'session', sess }))

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (msg.t === 'patch') {
      const next = store.patchSession(codigo, msg.patch ?? {})
      if (next) broadcast(codigo, { t: 'session', sess: next }, ws)
    } else if (msg.t === 'hero') {
      const next = store.setHeroVol(codigo, msg.heroId, msg.path, msg.value)
      if (next) broadcast(codigo, { t: 'hero', heroId: msg.heroId, path: msg.path, value: msg.value }, ws)
    }
  })
  ws.on('close', () => {
    set.delete(ws)
    if (set.size === 0) rooms.delete(codigo)
  })
})

server.listen(PORT, () => {
  console.log(`[pleitost-server] ouvindo em http://0.0.0.0:${PORT} (auth ${auth.enabled ? 'GitHub ok' : 'DESABILITADA'})`)
})
