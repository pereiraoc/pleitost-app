/** String literal dataview (`"d4+2"`) → conteúdo sem aspas; demais valores intactos. */
export function unquote(value: string): string {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}

/** Texto exibível de um valor com wikilink: alias, senão alvo, senão o próprio texto. */
export function linkLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(value)
  if (!match) return value
  return (match[2] ?? match[1]!).trim()
}
