// #288: avaliação do verbo AplicavelA de um tesouro (imbuição / obra-prima)
// contra o ITEM HOSPEDEIRO (arma/escudo/armadura). É a fonte de verdade pra NÃO
// oferecer na loja combos arma×imbuição incompatíveis com o sistema.
//
// ESPELHA a semântica do plugin (extract/rule-applier.ts `hostConditionPasses`),
// NÃO reinventa: AND entre os termos (grupos), OR dentro do termo. Escalares
// (Subcategoria/Grupo/Tipo/Mãos) comparam por IGUALDADE case-insensitive — nunca
// substring, senão "Armadura".includes("Arma") casaria por engano. `Propriedades`
// é lista e usa `listContainsToken` (membership por basename de wikilink), então
// `Propriedades,Contem([[Arremesso]])` casa `[[Arremesso|Arremesso 3]]` da Adaga.
import type { VaultDoc } from '../data/types'
import type { AplicavelOrGroup, HostItemStats, RuleCondition } from '../generated/rule-parser'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

// ── helpers portados VERBATIM do plugin (util/wikilink.ts, rule-applier.ts) ──
/** "[[A/B|C]]" → "B" (basename do alvo, sem alias, sem .md); texto cru → o texto. */
function wikilinkBasename(wl: string): string {
  const m = wl.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
  if (!m) return wl.trim()
  const target = m[1].trim()
  return (target.split('/').pop() ?? target).replace(/\.md$/i, '').trim()
}
function isWikilink(s: string): boolean {
  return /^\[\[[^\]]+\]\]$/.test(s)
}
/** Membership numa lista: wikilink casa por basename; texto cru casa por substring. */
function listContainsToken(value: unknown, needle: string): boolean {
  const matches = isWikilink(needle)
    ? (s: string) => isWikilink(s) && wikilinkBasename(s) === wikilinkBasename(needle)
    : (s: string) => s.includes(needle)
  if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && matches(v))
  if (typeof value === 'string') return matches(value)
  return false
}

/** Stats do host (arma/escudo/armadura) que o AplicavelA avalia — lidos do FM.
 *  `propriedades` fica com os wikilinks CRUS ("[[Arremesso|Arremesso 3]]") porque
 *  `listContainsToken` compara basenames — igual ao plugin (parsePropriedades). */
export function hostStatsFromDoc(doc: VaultDoc): HostItemStats {
  const fm = (doc.frontmatter ?? {}) as Record<string, unknown>
  const propsRaw = fm['propriedades']
  const propriedades = Array.isArray(propsRaw)
    ? propsRaw.map((p) => str(p).trim()).filter(Boolean)
    : []
  const maosRaw = fm['mãos'] ?? fm['maos']
  const maosNum =
    typeof maosRaw === 'number'
      ? maosRaw
      : maosRaw != null && str(maosRaw) !== ''
        ? Number(str(maosRaw))
        : NaN
  return {
    subcategoria: str(fm['subcategoria']) || null,
    grupo: str(fm['grupo']) || null,
    tipo: str(fm['tipo']) || null,
    maos: Number.isFinite(maosNum) ? maosNum : null,
    propriedades,
    itemName: doc.basename,
  }
}

/** Predicados AplicavelA de um doc (imbuição/tesouro) — o 1º que houver — ou null
 *  se o tesouro não restringe (aplica-se a qualquer host). */
export function aplicavelPredicates(doc: VaultDoc): AplicavelOrGroup[] | null {
  for (const el of doc.ruleElements ?? []) {
    const parsed = (el as { parsed?: unknown }).parsed
    if (!Array.isArray(parsed)) continue
    for (const rule of parsed) {
      if (!isRecord(rule)) continue
      const action = rule.action
      if (isRecord(action) && action.kind === 'aplicavel-a' && Array.isArray(action.predicates)) {
        return action.predicates as AplicavelOrGroup[]
      }
    }
  }
  return null
}

/** Valor do slot no host: escalar (subcategoria/grupo/tipo/mãos) ou lista
 *  (propriedades). Slot desconhecido → null (bloqueia por segurança). Espelha
 *  `hostAttrValue` do plugin. */
function hostAttrValue(
  host: HostItemStats,
  slot: string,
): { kind: 'scalar'; v: string | null } | { kind: 'list'; v: string[] } | null {
  switch (slot.trim().toLowerCase()) {
    case 'subcategoria':
      return { kind: 'scalar', v: host.subcategoria }
    case 'grupo':
      return { kind: 'scalar', v: host.grupo }
    case 'tipo':
      return { kind: 'scalar', v: host.tipo }
    case 'maos':
    case 'mãos':
      return { kind: 'scalar', v: host.maos === null ? null : String(host.maos) }
    case 'propriedades':
      return { kind: 'list', v: host.propriedades }
    default:
      return null // slot desconhecido pro host
  }
}

/** Uma condição do AplicavelA casa o host? Só name-contains / props-contains
 *  fazem sentido contra o host. Espelha `hostConditionPasses` do plugin. */
function condMatchesHost(cond: RuleCondition, host: HostItemStats): boolean {
  if (cond.kind !== 'name-contains' && cond.kind !== 'props-contains') return false
  const attr = hostAttrValue(host, cond.slotProp)
  if (attr === null) return false // slot desconhecido → não casa (bloqueio por segurança)
  if (attr.kind === 'list') return listContainsToken(attr.v, cond.needle)
  if (attr.v === null) return false // atributo ausente no host → não casa
  return attr.v.trim().toLowerCase() === cond.needle.trim().toLowerCase()
}

/** O tesouro (pelos predicados) é APLICÁVEL ao host? AND entre grupos, OR dentro
 *  do grupo. Sem predicados = aplicável a tudo (sem restrição declarada). */
export function isAplicavelAoHost(
  predicates: AplicavelOrGroup[] | null,
  host: HostItemStats,
): boolean {
  if (!predicates || predicates.length === 0) return true
  return predicates.every((group) => group.some((cond) => condMatchesHost(cond, host)))
}

/** Conveniência docs-first: o tesouro é aplicável ao item hospedeiro? */
export function tesouroAplicavelAoItem(tesouro: VaultDoc, host: VaultDoc): boolean {
  return isAplicavelAoHost(aplicavelPredicates(tesouro), hostStatsFromDoc(host))
}
