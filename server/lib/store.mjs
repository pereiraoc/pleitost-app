// Estado do servidor de sessão — sessões por código + tokens de auth,
// persistidos num JSON (write atômico via rename). Shape da sessão espelha o
// SessionRec do app (app/src/data/session-store.ts) + campos de servidor:
// membros (logins GitHub), rev (last-write-wins) e heroVol (volátil de vida
// dos heróis compartilhado na sala — Interativa.* por heroId/path).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function genCode() {
  let out = ''
  for (let i = 0; i < 6; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return out
}

export function createStore(filePath) {
  let state = { sessions: {}, tokens: {} }
  try {
    state = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    // primeiro boot — estado vazio
  }
  state.sessions ??= {}
  state.tokens ??= {}

  let persistTimer = null
  const persist = () => {
    // debounce curto: rajadas de patch (combate) viram 1 write
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      try {
        mkdirSync(dirname(filePath), { recursive: true })
        const tmp = `${filePath}.tmp`
        writeFileSync(tmp, JSON.stringify(state, null, 1))
        renameSync(tmp, filePath)
      } catch (err) {
        console.error('[pleitost-server] persist falhou:', err?.message)
      }
    }, 150)
  }

  return {
    /* ── auth tokens ───────────────────────────────────────────── */
    issueToken(user) {
      const token = randomBytes(24).toString('hex')
      state.tokens[token] = { login: user.login, name: user.name ?? user.login, avatar: user.avatar_url ?? '' }
      persist()
      return token
    },
    userOf(token) {
      return token ? (state.tokens[token] ?? null) : null
    },

    /* ── sessões ───────────────────────────────────────────────── */
    createSession({ nome, grupoId, mestre }) {
      let codigo = genCode()
      while (state.sessions[codigo]) codigo = genCode()
      const sess = {
        codigo,
        nome: nome || 'Nova Sessão',
        grupoId: grupoId ?? null,
        mestre,
        criadaEm: new Date().toISOString(),
        init: {},
        round: 1,
        vezIdx: 0,
        claims: {},
        membros: [mestre],
        heroVol: {},
        rev: 1,
      }
      state.sessions[codigo] = sess
      persist()
      return sess
    },
    getSession(codigo) {
      return state.sessions[String(codigo || '').toUpperCase()] ?? null
    },
    listSessionsOf(login) {
      return Object.values(state.sessions).filter((s) => s.membros.includes(login))
    },
    joinSession(codigo, login) {
      const sess = this.getSession(codigo)
      if (!sess) return null
      if (!sess.membros.includes(login)) {
        sess.membros.push(login)
        sess.rev++
        persist()
      }
      return sess
    },
    deleteSession(codigo, login) {
      const sess = this.getSession(codigo)
      if (!sess) return false
      if (sess.mestre !== login) return false
      delete state.sessions[sess.codigo]
      persist()
      return true
    },
    /** Patch last-write-wins nos campos da sessão (init/round/vezIdx/claims/
     *  nome/grupoId) — campos de servidor (codigo/mestre/membros/rev) são
     *  protegidos. Retorna a sessão nova ou null. */
    patchSession(codigo, patch) {
      const sess = this.getSession(codigo)
      if (!sess) return null
      const ALLOWED = ['nome', 'grupoId', 'init', 'round', 'vezIdx', 'claims']
      for (const k of ALLOWED) {
        if (patch[k] !== undefined) sess[k] = patch[k]
      }
      sess.rev++
      persist()
      return sess
    },
    /** Volátil de herói compartilhado na sala (vida/condições) — path plano
     *  estilo hero-store ('Interativa.Recursos_Restantes.Vitalidade'). */
    setHeroVol(codigo, heroId, path, value) {
      const sess = this.getSession(codigo)
      if (!sess) return null
      if (!String(path).startsWith('Interativa.')) return null
      sess.heroVol[heroId] = { ...(sess.heroVol[heroId] ?? {}), [path]: value }
      sess.rev++
      persist()
      return sess
    },
  }
}
