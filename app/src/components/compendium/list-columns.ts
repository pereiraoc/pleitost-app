// Registro central das colunas destacadas nas listas, por tipo de doc.
// As entradas são nomes de campos dos próprios docs (inline fields ou
// frontmatter) — o cabeçalho da coluna é a própria chave (label vem do
// dado, nunca inventado aqui).
import type { IndexDocEntry } from '../../data/types'
import { SEM_CATEGORIA } from '../../data/catalog'

export const LIST_COLUMNS: Record<string, readonly string[]> = {
  Item: ['dano', 'tipo', 'mãos', 'propriedades'],
}

// ──────────────────────────────────────────────────────────────────────────
// Visão TABELA do Mestre (#192)
// ──────────────────────────────────────────────────────────────────────────

/** Grupo de docs do MESMO tipo na visão TABELA (label + colunas do tipo). */
export interface MestreGroup {
  /** Rótulo do grupo — o próprio tipo (e subtipo) vindos do frontmatter. */
  label: string
  columns: readonly string[]
}

// Colunas por tipo, chave `Tipo` ou `Tipo/Subtipo` (categoria/subcategoria
// do frontmatter real, como o extractor entrega em type/subtype). Célula sem
// valor no doc renderiza '—' — nunca se inventa dado.
const MESTRE_TABLE_COLUMNS: Record<string, readonly string[]> = {
  'Item/Arma': ['dano', 'tipo', 'mãos', 'preço'],
  'Item/Tesouro': ['tier', 'preço'],
  Magia: ['subcategoria', 'rank', 'custo'],
  Habilidade: ['rank'],
  Técnica: ['rank'],
}

/** Colunas default quando o tipo não tem registro próprio. */
const MESTRE_DEFAULT_COLUMNS: readonly string[] = ['categoria', 'subcategoria']

/** Resolve o grupo (rótulo + colunas) de um doc na visão TABELA do Mestre.
 *  Subtipo com registro próprio (ex.: Item/Arma) vira grupo separado; senão
 *  o doc cai no grupo do tipo, com as colunas do tipo ou as default. */
export function mestreGroupOf(entry: IndexDocEntry): MestreGroup {
  const type = entry.type ?? SEM_CATEGORIA
  if (entry.subtype) {
    const bySubtype = MESTRE_TABLE_COLUMNS[`${type}/${entry.subtype}`]
    if (bySubtype) return { label: `${type} · ${entry.subtype}`, columns: bySubtype }
  }
  return { label: type, columns: MESTRE_TABLE_COLUMNS[type] ?? MESTRE_DEFAULT_COLUMNS }
}
