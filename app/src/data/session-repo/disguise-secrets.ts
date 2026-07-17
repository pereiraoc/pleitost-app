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

/** Guarda o real do NPC disfarçado (chamado no insert, com o id já gerado). */
export function stashDisguiseSecret(sessionId: string, charId: string, secret: DisguiseSecret): void {
  const s = ls()
  if (!s) return
  try {
    s.setItem(keyOf(sessionId, charId), JSON.stringify(secret))
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
  return chars.map((c) => {
    const secret = readDisguiseSecret(sessionId, c.id)
    return secret ? { ...c, summary: secret.summary, characterPath: secret.characterPath } : c
  })
}
