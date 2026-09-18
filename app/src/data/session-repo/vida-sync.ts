// Sincronização da VIDA entre a ficha do dono e a mesa (report 5464acaf).
// Helpers PUROS — a fiação vive em SessaoPage (evPendente/ajustaEvNpc) e
// usePublicacao (push com rev + backflow servidor→local).
//
// O contrato: todo write de `recursosRestantes` carrega um `rev` (nonce do
// cliente que escreveu). O dono do herói guarda os revs que ELE publicou —
// um rev que não é dele é escrita de mesa e flui pro FM local (origem
// 'sync'); echo do próprio push e refetch stale (rev antigo do próprio
// conjunto) nunca revertem edição local. Cliente antigo sem rev → ignora
// (conservador: melhor perder um backflow que reverter o dono).

/** (a) A pendência otimista dos steppers de EV pode soltar? Solta quando o
 *  live ALCANÇA o alvo ou quando MUDOU em relação à base registrada no
 *  momento do write (alguma escrita pousou — a nossa ou a do dono). Segura
 *  só enquanto o live ainda mostra a base (anti-flicker do #487). */
export function pendenciaResolvida(p: { alvo: number; base: number; vitLive: number }): boolean {
  return p.vitLive === p.alvo || p.vitLive !== p.base
}

/** (b) O state recebido do live deve fluir pro FM LOCAL do dono? */
export function decideBackflow(p: {
  rev: string | undefined
  /** revs que ESTE cliente publicou (echo/stale → ignorar). */
  meusRevs: ReadonlySet<string>
  /** revs estrangeiros já aplicados (idempotência). */
  aplicados: ReadonlySet<string>
}): 'aplicar' | 'ignorar' {
  if (!p.rev) return 'ignorar'
  if (p.meusRevs.has(p.rev)) return 'ignorar'
  if (p.aplicados.has(p.rev)) return 'ignorar'
  return 'aplicar'
}

/** Nonce de write — curto, único o bastante pro escopo (sessão × chars). */
export function novoRev(): string {
  return Math.random().toString(36).slice(2, 10)
}
