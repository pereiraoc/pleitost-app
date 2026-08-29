/**
 * Seções "Contexto Oculto" — convenção da VAULT pra segredo de campanha (ex.:
 * Contexto Histórico/Descoberta de Selênica: `### 🧬 O Contexto Oculto – A
 * Verdade Alienígena`). Sem o Modo Mestre, a seção inteira sai do render
 * (report 2026-08-29): do heading que casa /contexto oculto/i até o próximo
 * heading de nível IGUAL OU MAIOR (sub-headings do segredo caem junto).
 * O gate fica no MarkdownBody — vale pra linha do tempo, HistoriaView,
 * DocPage e transclusões de uma vez.
 */
export function stripContextoOculto(body: string): string {
  const lines = body.split('\n')
  const out: string[] = []
  let skipLevel: number | null = null
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      const level = m[1]!.length
      if (skipLevel !== null && level <= skipLevel) skipLevel = null
      if (skipLevel === null && /contexto oculto/i.test(m[2]!)) {
        skipLevel = level
        continue
      }
    }
    if (skipLevel === null) out.push(line)
  }
  return out.join('\n')
}
