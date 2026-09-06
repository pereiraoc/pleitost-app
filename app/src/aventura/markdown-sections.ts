// Varredura de headings CIENTE de fences (um `#` dentro de ```…``` não é
// heading) + fatiamento de seção: da linha do heading até o próximo heading
// de nível igual ou maior. Utilitário puro do parser de aventura.

export interface HeadingLine {
  level: number
  text: string
  /** índice da linha no array. */
  line: number
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const FENCE_RE = /^\s*(```|~~~)/

export function scanHeadings(lines: readonly string[]): HeadingLine[] {
  const out: HeadingLine[] = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    const f = FENCE_RE.exec(l)
    if (f) {
      if (fence === null) fence = f[1]!
      else if (fence === f[1]) fence = null
      continue
    }
    if (fence) continue
    const m = HEADING_RE.exec(l)
    if (m) out.push({ level: m[1]!.length, text: m[2]!.trim(), line: i })
  }
  return out
}

/** Linhas do CORPO da seção (depois do heading, até o próximo heading de
 *  nível <= ao dela). */
export function sectionBody(lines: readonly string[], headings: readonly HeadingLine[], h: HeadingLine): string[] {
  const idx = headings.indexOf(h)
  let end = lines.length
  for (let j = idx + 1; j < headings.length; j++) {
    if (headings[j]!.level <= h.level) {
      end = headings[j]!.line
      break
    }
  }
  return lines.slice(h.line + 1, end)
}

/** Headings FILHOS diretos de `h` (nível exatamente h.level+1, dentro da seção). */
export function childHeadings(headings: readonly HeadingLine[], h: HeadingLine): HeadingLine[] {
  const idx = headings.indexOf(h)
  const out: HeadingLine[] = []
  for (let j = idx + 1; j < headings.length; j++) {
    const c = headings[j]!
    if (c.level <= h.level) break
    if (c.level === h.level + 1) out.push(c)
  }
  return out
}

/** Primeiro heading de nível `level` com o texto exato (trim). */
export function findHeading(headings: readonly HeadingLine[], level: number, text: string): HeadingLine | null {
  return headings.find((h) => h.level === level && h.text === text) ?? null
}
