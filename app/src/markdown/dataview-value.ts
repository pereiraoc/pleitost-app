/** String literal dataview (`"d4+2"`) → conteúdo sem aspas; demais valores intactos. */
export function unquote(value: string): string {
  const trimmed = value.trim()
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}
