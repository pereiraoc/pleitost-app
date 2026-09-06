// Blocos de callout de um trecho markdown: `> [!tipo] título` + linhas `> …`.
// Reusa o parser de campos dos templates (calloutTemplateFields) pra o `[!info]`;
// `[!quote]` vira Leitura (🔊) e `[!gm]` vira segredo. Puro.
import { calloutTemplateFields, type CalloutField } from '../components/compendium/callout-template-fields'
import type { Leitura } from './types'

export interface CalloutBlock {
  tipo: string
  titulo: string
  /** Linhas CRUAS (com `>`), inclusive o cabeçalho. */
  raw: string[]
  /** índice da primeira e da última linha no array de origem. */
  inicio: number
  fim: number
}

const HEADER_RE = /^>\s*\[!([\w-]+)\]\s*(.*)$/

export function extractCallouts(lines: readonly string[]): CalloutBlock[] {
  const out: CalloutBlock[] = []
  let i = 0
  while (i < lines.length) {
    const m = HEADER_RE.exec(lines[i]!)
    if (!m) {
      i++
      continue
    }
    let j = i + 1
    while (j < lines.length && lines[j]!.startsWith('>')) j++
    out.push({ tipo: m[1]!.toLowerCase(), titulo: m[2]!.trim(), raw: lines.slice(i, j), inicio: i, fim: j - 1 })
    i = j
  }
  return out
}

/** Corpo do callout sem o cabeçalho e sem o prefixo `>`. */
export function calloutBody(b: CalloutBlock): string {
  return b.raw
    .slice(1)
    .map((l) => l.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
}

export function calloutFields(b: CalloutBlock): CalloutField[] {
  return calloutTemplateFields(b.raw.join('\n'), new Set())
}

export function leituraDe(b: CalloutBlock): Leitura {
  return { titulo: b.titulo, texto: calloutBody(b) }
}

/** Markdown do bloco `[!gm]` (título + corpo) — o segredo inteiro. */
export function segredoDe(b: CalloutBlock): string {
  const corpo = calloutBody(b)
  return b.titulo ? `**${b.titulo}**\n\n${corpo}` : corpo
}

/** Linhas de `lines` sem os blocos dados. */
export function withoutBlocks(lines: readonly string[], blocks: readonly CalloutBlock[]): string[] {
  const skip = new Set<number>()
  for (const b of blocks) for (let k = b.inicio; k <= b.fim; k++) skip.add(k)
  return lines.filter((_, i) => !skip.has(i))
}
