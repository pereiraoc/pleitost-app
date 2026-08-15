// RESUMO DE UMA LINHA de um doc da vault pra FICHA DE PAPEL (#452 export) —
// primeira prosa do corpo, sem meta (%%), fences, headings, callouts e
// sintaxe de wikilink; truncado com reticências. Puro e unit-testado.

/** Corpo markdown → uma linha de prosa limpa ('' quando não há prosa). */
export function resumoDoCorpo(body: string, maxlen = 95): string {
  let t = body ?? ''
  t = t.replace(/%%[\s\S]*?%%/g, '')
  t = t.replace(/```[\s\S]*?```/g, '')
  t = t.replace(/^#+ .*$/gm, '')
  t = t.replace(/^\s*>\s*\[![^\]]+\].*$/gm, '')
  t = t.replace(/!\[\[[^\]]+\]\]/g, '')
  t = t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1')
  t = t.replace(/[*_`>]/g, '')
  const linhas = t
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('|') && !l.startsWith('^') && !/^-{3,}$/.test(l))
  if (!linhas.length) return ''
  let out = linhas[0]!
  let i = 1
  // emenda linhas curtas de continuação (prosa quebrada), sem entrar em listas
  while (out.length < 55 && i < linhas.length && !/^[-*]/.test(linhas[i]!)) {
    out += ' ' + linhas[i]!
    i += 1
  }
  out = out.replace(/\s+/g, ' ').trim()
  return out.length > maxlen ? out.slice(0, maxlen - 1) + '…' : out
}
