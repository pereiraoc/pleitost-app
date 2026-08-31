import { reskinName } from '../data/reskin'
/** String literal dataview (`"d4+2"`) → conteúdo sem aspas; demais valores intactos. */
export function unquote(value: string): string {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}

/** Texto exibível de um valor com wikilink: alias, senão alvo, senão o próprio texto. */
/** linkLabel para RENDER: aplica o reskin do mundo ativo (#519). Nunca usar
 *  em comparação/lógica — pra isso é o linkLabel cru (canônico). */
export function linkLabelDisplay(value: unknown): string {
  return reskinName(linkLabel(value))
}

export function linkLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(value)
  if (!match) return value
  return (match[2] ?? match[1]!).trim()
}
