// Modelo de valores do avaliador dataview. Valores vêm SEMPRE dos docs
// extraídos (frontmatter/inline fields/metadados de arquivo) — nada inventado.
import type { VaultDoc } from '../data/types'

export interface DvLink {
  $link: true
  target: string
  label?: string
}

export type DvValue = string | number | boolean | null | DvLink | DvValue[]

export function isDvLink(value: unknown): value is DvLink {
  return typeof value === 'object' && value !== null && '$link' in value
}

const WIKILINK = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/

function scalarFromString(raw: string): DvValue {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  // #291: desencapa aspas ANTES de testar wikilink. Campos multi-valor guardam
  // cada item aspado (`"[[Arcana]]", "[[Anima]]"`); sem isso um `"[[Arcana]]"`
  // virava a STRING `[[Arcana]]` e contains(campo,"Arcana") não casava.
  if (/^".*"$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1)
    const innerLink = WIKILINK.exec(inner.trim())
    if (innerLink) return { $link: true, target: innerLink[1].trim(), label: innerLink[2]?.trim() }
    return inner // string aspada comum permanece string (não vira número/bool)
  }
  const link = WIKILINK.exec(trimmed)
  if (link) return { $link: true, target: link[1].trim(), label: link[2]?.trim() }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return trimmed
}

/** Divide em vírgulas fora de [[...]] e "...". */
function splitTopLevel(raw: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') inString = !inString
    else if (!inString && raw.startsWith('[[', i)) depth++
    else if (!inString && raw.startsWith(']]', i)) depth = Math.max(0, depth - 1)
    else if (!inString && depth === 0 && ch === ',') {
      parts.push(raw.slice(start, i))
      start = i + 1
    }
  }
  parts.push(raw.slice(start))
  return parts
}

/** Valor de inline field (sintaxe dataview): lista por vírgulas, senão escalar. */
export function parseFieldString(raw: string): DvValue {
  const parts = splitTopLevel(raw)
  if (parts.length > 1) {
    const values = parts.map(scalarFromString).filter((v) => v !== null)
    return values
  }
  return scalarFromString(raw)
}

/** Valor de frontmatter (YAML já parseado) → DvValue. */
export function fmToValue(value: unknown): DvValue {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(fmToValue)
  switch (typeof value) {
    case 'number':
    case 'boolean':
      return value
    case 'string':
      return scalarFromString(value)
    default:
      return null
  }
}

/** Campo de um doc: file.* → metadado; senão inline field, senão frontmatter. */
export function getField(doc: VaultDoc, name: string): DvValue {
  if (name === 'file.name') return doc.basename
  if (name === 'file.link') return { $link: true, target: doc.id }
  if (name === 'file.path') return doc.path
  if (name === 'file.folder') {
    const cut = doc.id.lastIndexOf('/')
    return cut === -1 ? '' : doc.id.slice(0, cut)
  }

  const inline = doc.inlineFields[name]
  if (inline !== undefined) return parseFieldString(inline)
  if (name in doc.frontmatter) return fmToValue(doc.frontmatter[name])

  // dataview é case-insensitive em nomes de campo
  const lower = name.toLowerCase()
  for (const key of Object.keys(doc.inlineFields)) {
    if (key.toLowerCase() === lower) return parseFieldString(doc.inlineFields[key])
  }
  for (const key of Object.keys(doc.frontmatter)) {
    if (key.toLowerCase() === lower) return fmToValue(doc.frontmatter[key])
  }
  return null
}
