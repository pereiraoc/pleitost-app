// Ataques do grupo — ESPELHA o plugin pleitost-autosheet (READ-ONLY):
//  - render/modes/grupo/section-ataques.ts: mergedAtaquesFromFm (Inventario.
//    Armas.Lista + Ataques.Lista sem "Manobras"), profAtaqueFromFm (escalar
//    ou legacy .Ataque), total = profMod(Ataques.Proficiencia) + attr + item
//    + especial, ordenação por total desc (top 4 por membro) e
//    categoriaAttackSuffix (letra do grau da Categoria).
//  - render/groups/inventario/equipamentos-section.ts: mapa grupo-de-arma →
//    EMOJI.grupoArma (cac-simples/cac-marcial/d-simples/d-marcial/especial/
//    natural) usado pro ícone da arma.
import type { Catalog } from '../data/catalog'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { tokens } from '../generated/tokens'
import { linkLabel } from '../markdown/dataview-value'
import { getAttr, profMod, toArray, type Fm } from './stats'

interface AtaqueRow {
  Nome?: unknown
  Atributo?: unknown
  Bonus_Item?: unknown
  Bonus_Especial?: unknown
  Propriedade?: unknown
  Categoria?: unknown
}

/** Espelha profAtaqueFromFm (section-ataques.ts): escalar novo ou legacy `.Ataque`. */
export function profAtaque(fm: Fm | undefined): unknown {
  const p = (fm as { Ataques?: { Proficiencia?: unknown } } | undefined)?.Ataques?.Proficiencia
  if (p == null) return undefined
  if (typeof p === 'string') return p
  return (p as { Ataque?: unknown }).Ataque
}

/** Espelha mergedAtaquesFromFm (section-ataques.ts): equipadas + naturais sem "Manobras". */
export function mergedAtaques(fm: Fm | undefined): AtaqueRow[] {
  const equipadas = toArray(
    (fm as { Inventario?: { Armas?: { Lista?: unknown } } } | undefined)?.Inventario?.Armas?.Lista,
  ) as AtaqueRow[]
  const ataques = toArray(
    (fm as { Ataques?: { Lista?: unknown } } | undefined)?.Ataques?.Lista,
  ) as AtaqueRow[]
  const naturais = ataques.filter((a) => String(a?.Nome ?? '') !== 'Manobras')
  return [...equipadas, ...naturais]
}

/** Espelha maxAttackModifier (section-ataques.ts) — ordenação dos membros. */
export function maxAttackModifier(fm: Fm | undefined): number | null {
  const atkProf = profMod(profAtaque(fm))
  let max = -Infinity
  for (const row of mergedAtaques(fm)) {
    const nome = row?.Nome != null ? String(row.Nome) : ''
    if (!nome.trim()) continue
    const total =
      atkProf +
      getAttr(fm, row.Atributo) +
      (Number(row.Bonus_Item) || 0) +
      (Number(row.Bonus_Especial) || 0)
    if (total > max) max = total
  }
  return max === -Infinity ? null : max
}

/** Espelha categoriaAttackSuffix (section-ataques.ts), devolvendo só a letra. */
export function categoriaLetter(categoriaRaw: unknown): '' | 'N' | 'A' | 'E' | 'M' {
  if (categoriaRaw == null) return ''
  const s = String(categoriaRaw).trim()
  if (!s) return ''
  const L = linkLabel(s).toLowerCase().replace(/\s+/g, ' ').trim()
  if (!L) return ''
  if (L === 'a' || L.startsWith('adepto')) return 'A'
  if (L === 'e' || L.startsWith('experiente')) return 'E'
  if (L === 'm' || L.startsWith('mestre')) return 'M'
  if (L === 'n' || L.startsWith('novato')) return 'N'
  return ''
}

/** Espelha o WEAPON_GROUPS de equipamentos-section.ts: `grupo` do doc da
 *  arma → emoji do registro central EMOJI.grupoArma (via tokens gerados). */
const WEAPON_GROUP_EMOJI: Record<string, string> = {
  'cac-simples': tokens.emojis.grupoArma.CaCSimples,
  'cac-marcial': tokens.emojis.grupoArma.CaCMarcial,
  'd-simples': tokens.emojis.grupoArma.DistSimples,
  'd-marcial': tokens.emojis.grupoArma.DistMarcial,
  especial: tokens.emojis.grupoArma.Especial,
  natural: tokens.emojis.grupoArma.Natural,
}

const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/

/** Ícone da arma: resolve o doc da arma no catálogo e mapeia o FM `grupo`
 *  pelo registro central. Sem doc/grupo → '' (nunca chutar). */
export function weaponIcon(catalog: Catalog, nomeRaw: unknown): string {
  const s = String(nomeRaw ?? '').trim()
  if (!s) return ''
  const target = WIKILINK.exec(s)?.[1] ?? s
  const res = catalog.resolve(target)
  if (res.kind !== 'doc') return ''
  const grupo = catalog.entryById.get(res.id)?.grupo
  if (typeof grupo !== 'string') return ''
  return WEAPON_GROUP_EMOJI[grupo] ?? ''
}

export interface AttackChip {
  total: number
  /** Nome visível da arma (label do wikilink). */
  label: string
  /** Ícone do grupo da arma ('' quando não resolvido). */
  icon: string
  /** Display da Propriedade ('' quando ausente). */
  prop: string
  /** Letra do grau da Categoria ('' quando ausente). */
  prof: string
}

export interface MemberAttacks {
  id: string
  who: string
  list: AttackChip[]
}

/** Espelha buildAtaquesSectionEl (section-ataques.ts): entries por membro,
 *  sort total desc (tie: nome pt), top 4; membros sem ataques ficam fora. */
export function memberAttacks(catalog: Catalog, fm: Fm | undefined): AttackChip[] {
  const atkProf = profMod(profAtaque(fm))
  const entries: Array<AttackChip & { nome: string }> = []
  for (const row of mergedAtaques(fm)) {
    const nome = row?.Nome != null ? String(row.Nome) : ''
    if (!nome) continue
    const total =
      atkProf +
      getAttr(fm, row.Atributo) +
      (Number(row.Bonus_Item) || 0) +
      (Number(row.Bonus_Especial) || 0)
    const propRaw = row.Propriedade
    const prop = propRaw == null || String(propRaw).trim() === '' ? '' : linkLabel(String(propRaw).trim())
    entries.push({
      total,
      nome,
      label: linkLabel(nome),
      icon: weaponIcon(catalog, nome),
      prop,
      prof: categoriaLetter(row.Categoria),
    })
  }
  entries.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt'))
  return entries.slice(0, 4).map(({ nome: _nome, ...chip }) => chip)
}

export function groupAttacks(
  catalog: Catalog,
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
): MemberAttacks[] {
  const out: MemberAttacks[] = []
  for (const member of members) {
    const list = memberAttacks(catalog, docs?.get(member.id)?.frontmatter)
    if (!list.length) continue
    out.push({ id: member.id, who: member.basename ?? member.id, list })
  }
  return out
}
