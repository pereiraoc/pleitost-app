// Report 2026-08-29: os templates de Organização/Pessoa da vault POA guardam
// parte das infos como PROSA LITERAL em linhas de callout do corpo — o FM
// correspondente fica vazio:
//   >**Objetivo de Longo Prazo:** Exportar equipamentos táticos.
// Este helper extrai esses pares rótulo→valor pro render em cards. O RÓTULO
// vem da própria nota (fonte de verdade — nada inventado); linhas `= this.X`
// são puladas (são refs do FM, que a view já lê direto do frontmatter);
// continuações (bullets sob um rótulo) agregam ao valor.

export interface CalloutField {
  label: string
  value: string
}

/** Casa `**Rótulo:** valor` no início de uma linha de callout já sem o `> `
 *  (tolera emoji/decoração antes do negrito). Rótulos que são wikilinks
 *  (`**[[Org]]:**` — sub-entradas de lista) NÃO viram campo próprio; ficam
 *  como continuação do campo anterior. */
function matchLabel(stripped: string): { label: string; rest: string } | null {
  const m = /^[^\w[\]*]*\*\*([^*[\]]+?):?\*\*:?\s*(.*)$/.exec(stripped)
  if (!m) return null
  return { label: m[1]!.trim(), rest: m[2]! }
}

/** Extrai os campos literais dos callouts do corpo. `skipLabels` (normalizado
 *  em minúsculas) remove os que a view já cobre por outra fonte. */
export function calloutTemplateFields(body: string, skipLabels: Set<string>): CalloutField[] {
  const out: CalloutField[] = []
  let cur: CalloutField | null = null
  const flush = () => {
    if (cur && cur.value.trim() !== '' && !cur.value.includes('= this.')) {
      out.push({ label: cur.label, value: cur.value.trim() })
    }
    cur = null
  }
  for (const raw of (body ?? '').split('\n')) {
    if (!raw.startsWith('>')) {
      flush()
      continue
    }
    if (/^>\s*\[!/.test(raw)) {
      flush()
      continue
    }
    const stripped = raw.replace(/^>\s?/, '')
    if (stripped.trim() === '') {
      flush()
      continue
    }
    const m = matchLabel(stripped)
    if (m) {
      flush()
      if (skipLabels.has(m.label.toLowerCase())) continue
      cur = { label: m.label, value: m.rest }
      continue
    }
    if (cur) cur.value += `\n${stripped}`
  }
  flush()
  return out
}
