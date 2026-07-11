// Tooltip de LOCALIZAÇÃO reutilizável (#124 mapa/parada, #140 Naturalidade):
// nome + tipo (subcategoria) + Descrição + Recursos, fonte de verdade no
// frontmatter do doc de Atlas — NUNCA o corpo (callouts/dataview) que não
// renderiza bem em tooltip.
import { esc } from '../item-card'
import type { VaultDoc } from '../../data/types'

/** Tira wikilinks ([[X|Y]]/[[a/b|Y]] → Y) e espaços de um texto. */
export function wikiStrip(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => (b ?? a).split('/').pop() ?? a)
    .trim()
}

/** HTML do tooltip do local. Null quando o doc não tem nada útil além do nome. */
export function localTipHtml(doc: VaultDoc | undefined): string | null {
  if (!doc) return null
  const tipo = typeof doc.subtype === 'string' ? doc.subtype.trim() : ''
  const desc = typeof doc.frontmatter['Descrição'] === 'string' ? (doc.frontmatter['Descrição'] as string) : ''
  const recursos = Array.isArray(doc.frontmatter['Recursos'])
    ? (doc.frontmatter['Recursos'] as unknown[]).filter((r): r is string => typeof r === 'string' && !!r.trim())
    : []
  const parts = [`<div class="loc-tip-name">${esc(doc.basename)}</div>`]
  if (tipo) parts.push(`<div class="loc-tip-tipo">${esc(tipo)}</div>`)
  if (desc) parts.push(`<div class="loc-tip-desc">${esc(wikiStrip(desc))}</div>`)
  if (recursos.length)
    parts.push(
      `<div class="loc-tip-rec"><b>Recursos:</b> ${recursos.map((r) => esc(wikiStrip(r))).join(', ')}</div>`,
    )
  return `<div class="loc-tip">${parts.join('')}</div>`
}

export const LOC_TIP_CSS = `
.loc-tip{min-width:150px;max-width:280px}
.loc-tip-name{font-weight:800;font-size:12.5px;margin-bottom:2px}
.loc-tip-tipo{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.loc-tip-desc{font-size:11.5px;line-height:1.4;opacity:.92}
.loc-tip-rec{font-size:11px;opacity:.85;margin-top:5px}
.loc-tip-rec b{color:var(--muted)}
`
