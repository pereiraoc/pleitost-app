// SEGREDO DO DISFARCE (#291) — o dado REAL (summary + fmBlob) de um NPC
// disfarçado vive AQUI, no user_state do GM: localStorage sob a chave
// `pleitost.disguise.*`, que o remote-persist já sincroniza POR CONTA (RLS por
// usuário). Nunca vai pra `session_characters` (lido pelos jogadores). No reveal,
// o app do GM lê daqui e re-publica o real; depois limpa. Só o GM tem a chave —
// jogador nunca recebe, nem por devtools.
import type { CharacterSummary, SessionCharacter } from './contract'

export interface DisguiseSecret {
  summary: CharacterSummary
  fmBlob: Record<string, unknown>
  /** characterPath real — o path tem o NOME (`Monstros/Goblin Assassino`), então
   *  não vai pra linha publicada; fica aqui pro GM ver / re-publicar no reveal. */
  characterPath: string
}

const PREFIX = 'pleitost.disguise.'
const keyOf = (sessionId: string, charId: string): string => `${PREFIX}${sessionId}.${charId}`

function ls(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

/** Memo da linha efetiva por (sessão, char): reaproveita o resultado enquanto
 *  a REF do personagem (estável pelo merge da sala viva) e o texto cru do
 *  segredo no storage são os mesmos — sem JSON.parse nem objeto novo por
 *  render. Comparar o texto cru (não só invalidar no stash/clear) cobre o
 *  segredo que chega por OUTRO caminho (remote-persist hidrata o storage). */
const efetivoCache = new Map<string, { c: SessionCharacter; raw: string | null; out: SessionCharacter }>()

function esquece(sessionId: string, charId: string): void {
  efetivoCache.delete(`overlay:${keyOf(sessionId, charId)}`)
  efetivoCache.delete(`ficha:${keyOf(sessionId, charId)}`)
}

function rawSecret(sessionId: string, charId: string): string | null {
  const s = ls()
  if (!s) return null
  try {
    return s.getItem(keyOf(sessionId, charId))
  } catch {
    return null
  }
}

/** Guarda o real do NPC disfarçado (chamado no insert, com o id já gerado). */
export function stashDisguiseSecret(sessionId: string, charId: string, secret: DisguiseSecret): void {
  const s = ls()
  if (!s) return
  try {
    s.setItem(keyOf(sessionId, charId), JSON.stringify(secret))
    esquece(sessionId, charId)
  } catch {
    /* sem storage → o GM perde o real no refresh; jogador nunca vazou */
  }
}

/** Lê o real (pro GM ver a identidade / pro reveal re-publicar). */
export function readDisguiseSecret(sessionId: string, charId: string): DisguiseSecret | null {
  const s = ls()
  if (!s) return null
  try {
    const raw = s.getItem(keyOf(sessionId, charId))
    return raw ? (JSON.parse(raw) as DisguiseSecret) : null
  } catch {
    return null
  }
}

export function clearDisguiseSecret(sessionId: string, charId: string): void {
  const s = ls()
  if (!s) return
  try {
    s.removeItem(keyOf(sessionId, charId))
    esquece(sessionId, charId)
  } catch {
    /* noop */
  }
}

/** Pro GM: sobrepõe o summary/characterPath REAL (do segredo) sobre as linhas
 *  mascaradas dos NPCs disfarçados — o mestre vê a identidade enquanto o jogador
 *  vê "Criatura N". Mantém o `state` ao vivo (o HP muda no combate; o segredo só
 *  guarda a identidade/stats do insert). Sem segredo → devolve o char intacto. */
export function overlayDisguiseSecrets(
  chars: readonly SessionCharacter[],
  sessionId: string,
): SessionCharacter[] {
  return chars.map((c) => memoEfetivo(c, sessionId, 'overlay'))
}

function parseSecret(raw: string): DisguiseSecret | null {
  try {
    return JSON.parse(raw) as DisguiseSecret
  } catch {
    return null
  }
}

/** Resolve (com memo) a linha efetiva; `modo` separa o overlay (só
 *  identidade) do comSegredo (identidade + fmBlob) no cache. */
function memoEfetivo(c: SessionCharacter, sessionId: string, modo: 'overlay' | 'ficha'): SessionCharacter {
  const raw = rawSecret(sessionId, c.id)
  if (raw === null) return c
  const k = `${modo}:${keyOf(sessionId, c.id)}`
  const hit = efetivoCache.get(k)
  if (hit && hit.c === c && hit.raw === raw) return hit.out
  const secret = parseSecret(raw)
  let out = c
  if (secret) {
    out =
      modo === 'overlay'
        ? { ...c, summary: secret.summary, characterPath: secret.characterPath }
        : {
            ...c,
            summary: secret.summary,
            characterPath: secret.characterPath,
            fmBlob: Object.keys(secret.fmBlob ?? {}).length ? secret.fmBlob : c.fmBlob,
          }
  }
  efetivoCache.set(k, { c, raw, out })
  return out
}

/** Linha EFETIVA pro GM (#486): identidade + characterPath + fmBlob REAIS do
 *  segredo quando ele existe neste aparelho (a linha publicada de NPC
 *  disfarçado é mascarada e vem com fmBlob `{}`); o fmBlob publicado só vale
 *  quando o segredo não guardou ficha. Sem segredo → a linha como está. Mantém
 *  o `state` ao vivo (vida muda no combate). Usada pelo resumo da sessão e
 *  pelo Escudo do Mestre. */
export function comSegredo(c: SessionCharacter, sessionId: string): SessionCharacter {
  return memoEfetivo(c, sessionId, 'ficha')
}
