// RESUMO de um doc da vault pra FICHA DE PAPEL (export #452) — prioridade pro
// campo FM `resumo` (itens já trazem); senão o 1º PARÁGRAFO INTEIRO do corpo
// (sem truncar — decisão do usuário v5/v6): se o parágrafo é só introdução
// (curto ou termina em ':'), o bloco de bullets seguinte entra junto ("Evolução
// Básica" e afins não podem cortar). Puro e unit-testado.
import type { VaultDoc } from '../data/types'

function limpaWikilinks(t: string): string {
  return t
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
}

/** Corpo markdown → prosa de resumo ('' quando não há prosa). */
export function resumoDoCorpo(body: string): string {
  let t = body ?? ''
  t = t.replace(/%%[\s\S]*?%%/g, '')
  t = t.replace(/```[\s\S]*?```/g, '')
  t = t.replace(/^#+ .*$/gm, '')
  t = t.replace(/^\s*>\s*\[![^\]]+\].*$/gm, '')
  t = t.replace(/!\[\[[^\]]+\]\]/g, '')
  t = limpaWikilinks(t)
  t = t.replace(/[*_`>]/g, '')
  const ls = t.split('\n').map((l) => l.trim())
  const par: string[] = []
  const resto: string[] = []
  let i = 0
  // 1º parágrafo de prosa (pula vazio/tabela/lista/hr antes dele)
  while (i < ls.length && !par.length) {
    const l = ls[i]!
    i += 1
    if (!l || l.startsWith('|') || l.startsWith('^') || /^-{3,}$/.test(l)) continue
    if (l.startsWith('-') || l.startsWith('*')) continue
    par.push(l)
  }
  // continuação: prosa emenda; bullets acumulam até o fim do bloco
  while (i < ls.length) {
    const l = ls[i]!
    if (!l) {
      if (resto.length) break
      i += 1
      continue
    }
    if (l.startsWith('|') || l.startsWith('^') || /^-{3,}$/.test(l)) break
    if (l.startsWith('-') || l.startsWith('*')) {
      resto.push('• ' + l.replace(/^[-*]\s*/, '').replace(/;$/, ''))
      i += 1
      continue
    }
    if (!resto.length) {
      par.push(l)
      i += 1
      continue
    }
    break
  }
  let texto = par.join(' ')
  if (resto.length && (texto.trimEnd().endsWith(':') || texto.length < 90)) {
    texto += ' ' + resto.join(' ')
  }
  return resumir(texto.replace(/\s+/g, ' ').trim())
}

/** RESUMO de verdade (report 2026-08-16: parágrafos enormes saíam inteiros):
 *  acumula FRASES até ~240 chars — o corte é sempre em fim de frase (nada de
 *  reticências no meio, reclamação da v5); uma frase única gigante cai no
 *  corte por palavra com reticências (raro). */
const ALVO = 240
export function resumir(texto: string): string {
  if (texto.length <= ALVO) return texto
  const frases = texto.match(/[^.!?]+[.!?]+(?:\s|$)/g)
  if (frases && frases.length > 1) {
    let out = ''
    for (const f of frases) {
      if (out && out.length + f.length > ALVO) break
      out += f
    }
    if (out.trim()) return out.trim()
  }
  const corte = texto.slice(0, ALVO)
  return corte.slice(0, corte.lastIndexOf(' ')) + '…'
}

/** Resumo de um DOC: FM `resumo` > inline field `resumo` (técnicas guardam
 *  lá, entre aspas) > 1º parágrafo do corpo. */
export function resumoDoDoc(doc: VaultDoc | undefined): string {
  if (!doc) return ''
  const fmr = doc.frontmatter?.['resumo']
  if (typeof fmr === 'string' && fmr.trim()) return limpaWikilinks(fmr).trim()
  const inline = doc.inlineFields?.['resumo']
  if (typeof inline === 'string' && inline.trim()) {
    return limpaWikilinks(inline.trim().replace(/^"|"$/g, '')).trim()
  }
  return resumoDoCorpo(doc.body ?? '')
}
