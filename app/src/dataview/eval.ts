// Avaliação das queries dataview sobre o catálogo + docs reais.
import type { Catalog } from '../data/catalog'
import type { VaultDoc } from '../data/types'
import { getField, isDvLink, type DvLink, type DvValue } from './model'
import type { Expr, FromTerm, Query } from './parse'

export interface DataviewCtx {
  catalog: Catalog
  current: VaultDoc
  loadDoc: (id: string) => Promise<VaultDoc>
  /** Grafo resolvido do links.json (id → ids); {} desabilita [[]]/outgoing. */
  edges: Record<string, string[]>
}

export interface DvResult {
  kind: 'TABLE' | 'LIST'
  headers: string[]
  rows: DvValue[][]
}

/** Alvo de link → id do catálogo (ou o próprio alvo se não resolver). */
function linkKey(link: DvLink, catalog: Catalog): string {
  const res = catalog.resolve(link.target)
  return res.kind === 'doc' ? res.id : link.target
}

function equals(a: DvValue, b: DvValue, catalog: Catalog): boolean {
  if (isDvLink(a) && isDvLink(b)) return linkKey(a, catalog) === linkKey(b, catalog)
  if (isDvLink(a) || isDvLink(b)) {
    // link = "texto": compara com o alvo/label (uso raro; melhor que false silencioso)
    const link = (isDvLink(a) ? a : b) as DvLink
    const other = isDvLink(a) ? b : a
    if (typeof other !== 'string') return false
    return link.target === other || link.label === other
  }
  return a === b
}

function truthy(value: DvValue): boolean {
  if (value === null) return false
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

function compare(a: DvValue, b: DvValue): number {
  const rank = (v: DvValue) => (v === null || v === undefined ? 1 : 0)
  if (rank(a) !== rank(b)) return rank(a) - rank(b) // nulls por último
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const text = (v: DvValue): string =>
    isDvLink(v) ? (v.label ?? v.target) : Array.isArray(v) ? v.map(text).join(',') : String(v)
  return text(a).localeCompare(text(b), 'pt')
}

function evalExpr(expr: Expr, doc: VaultDoc, ctx: DataviewCtx): DvValue {
  switch (expr.kind) {
    case 'lit':
      return expr.value
    case 'field': {
      if (expr.path.startsWith('this.')) return getField(ctx.current, expr.path.slice(5))
      return getField(doc, expr.path)
    }
    case 'not':
      return !truthy(evalExpr(expr.inner, doc, ctx))
    case 'bin': {
      const left = evalExpr(expr.left, doc, ctx)
      // #291: and/or devolvem BOOLEAN (antes vazavam o valor cru do operando).
      if (expr.op === 'and') return truthy(left) ? truthy(evalExpr(expr.right, doc, ctx)) : false
      if (expr.op === 'or') return truthy(left) ? true : truthy(evalExpr(expr.right, doc, ctx))
      const right = evalExpr(expr.right, doc, ctx)
      switch (expr.op) {
        case '=':
          return equals(left, right, ctx.catalog)
        case '!=':
          return !equals(left, right, ctx.catalog)
        case '>':
        case '<':
        case '>=':
        case '<=': {
          // #291: null/undefined em QUALQUER lado → não casa (o `compare` trata
          // null como "maior que tudo", certo pra SORT mas errado pros operadores;
          // dataview real considera comparação com null como não-match).
          if (left == null || right == null) return false
          const c = compare(left, right)
          return expr.op === '>' ? c > 0 : expr.op === '<' ? c < 0 : expr.op === '>=' ? c >= 0 : c <= 0
        }
      }
      break
    }
    case 'call': {
      const args = expr.args.map((a) => evalExpr(a, doc, ctx))
      switch (expr.fn) {
        case 'link': {
          const [target, label] = args
          if (isDvLink(target)) {
            return label === null || label === undefined
              ? target
              : { ...target, label: String(label) }
          }
          if (typeof target === 'string') {
            return {
              $link: true,
              target,
              label: label === null || label === undefined ? undefined : String(label),
            }
          }
          return null
        }
        case 'contains': {
          const [haystack, needle] = args
          if (Array.isArray(haystack)) {
            return haystack.some((v) => equals(v, needle, ctx.catalog))
          }
          if (typeof haystack === 'string') {
            if (typeof needle === 'string') return haystack.includes(needle)
            if (isDvLink(needle)) return haystack.includes(needle.target)
          }
          if (isDvLink(haystack)) return equals(haystack, needle, ctx.catalog)
          return false
        }
        default:
          throw new Error(`função não suportada: ${expr.fn}()`)
      }
    }
  }
  throw new Error('expressão não avaliável')
}

function candidateIds(from: FromTerm[], ctx: DataviewCtx): string[] {
  const all = () => ctx.catalog.content.map((d) => d.id)
  const setOf = (term: FromTerm): Set<string> => {
    switch (term.kind) {
      case 'folder': {
        const prefix = term.path.endsWith('/') ? term.path : term.path + '/'
        return new Set(all().filter((id) => id.startsWith(prefix)))
      }
      case 'inlinks': {
        const ids = Object.entries(ctx.edges)
          .filter(([, targets]) => targets.includes(ctx.current.id))
          .map(([id]) => id)
        return new Set(ids)
      }
      case 'outlinks':
        return new Set(ctx.edges[ctx.current.id] ?? [])
    }
  }

  const positives = from.filter((t) => !t.negated)
  const negatives = from.filter((t) => t.negated)

  let base: Set<string>
  if (positives.length === 0) {
    base = new Set(all())
  } else {
    base = setOf(positives[0])
    for (const term of positives.slice(1)) {
      const other = setOf(term)
      base = new Set([...base].filter((id) => other.has(id)))
    }
  }
  for (const term of negatives) {
    const excluded = setOf(term)
    base = new Set([...base].filter((id) => !excluded.has(id)))
  }
  return [...base]
}

export async function runQuery(query: Query, ctx: DataviewCtx): Promise<DvResult> {
  const ids = candidateIds(query.from, ctx)
  const docs = (
    await Promise.all(ids.map((id) => ctx.loadDoc(id).catch(() => null)))
  ).filter((d): d is VaultDoc => d !== null)

  const matched = query.where
    ? docs.filter((doc) => truthy(evalExpr(query.where!, doc, ctx)))
    : docs

  if (query.sort.length) {
    const keyed = matched.map((doc) => ({
      doc,
      keys: query.sort.map((s) => evalExpr(s.expr, doc, ctx)),
    }))
    keyed.sort((a, b) => {
      for (let i = 0; i < query.sort.length; i++) {
        const cmp = compare(a.keys[i], b.keys[i])
        if (cmp !== 0) return query.sort[i].desc ? -cmp : cmp
      }
      return 0
    })
    matched.length = 0
    matched.push(...keyed.map((k) => k.doc))
  } else {
    matched.sort((a, b) => a.basename.localeCompare(b.basename, 'pt'))
  }

  if (query.kind === 'LIST') {
    return {
      kind: 'LIST',
      headers: [],
      rows: matched.map((doc) => [{ $link: true, target: doc.id } satisfies DvLink]),
    }
  }

  return {
    kind: 'TABLE',
    headers: query.columns.map((c) => c.label),
    rows: matched.map((doc) => query.columns.map((c) => evalExpr(c.expr, doc, ctx))),
  }
}
