// TAXONOMIA DE ITENS (#267, F-agrupamento do épico #243) — registro CENTRAL das
// facetas de um doc `type: Item`. É a ÚNICA fonte de verdade pro agrupamento e o
// filtro do compêndio de itens: dado um VaultDoc, deriva
//   { categoria, grupo, subgrupo, qualidade }
// a partir do PATH (categoria/subgrupo, como o item-card faz) + FM (grupo de arma,
// bonus_tipo, tipo_efeito) + basename (tipo de arma natural). NADA de string
// hardcodada no call-site — a barra de filtro e as seções lêem SEMPRE daqui.
//
// Fonte de verdade espelhada:
//   - Armas: grupo do FM (cac-simples/…/natural), como grupo-arma.ts do plugin
//     (extract/extract-arma-stats.ts:30) e o GRUPO_ARMA_ORDER da registry.ts.
//   - Tesouros: a subpasta É a categoria (Consumíveis/Imbuições/Qualidade/
//     Equipamentos/Implementos), igual às queries do pleitost-views
//     (render/modes/cartas/types/*/*-query.ts, por PASTA).
//   - Consumível: `tipo_efeito` do FM (Vitalidade/Moral/Velocidade — o mesmo campo
//     que o consumiveis-render.ts do pleitost-views usa pra escolher o emblema).
//   - Imbuição/Qualidade/Equipamento: `bonus_tipo` do FM (ataque/defesa/perícia).
//   - Equipamento: a subpasta (Ataque/Defesa/Perícia) é o subgrupo primário.
//   - Qualidade (obra-prima) mora DENTRO de "Imbuições e Qualidade" (6.3).
import type { VaultDoc } from '../../data/types'
import { docTier } from '../item-card'
import type { Tier } from '../../data/commerce'
import { TIER_COLUNA } from '../../data/commerce'
import { grupoArmaEmoji } from '../ficha/registry'

// ─────────────────────────── categorias (path-based) ───────────────────────────

/** Categoria de faceta de um item. A ORDEM aqui é a ordem de exibição das seções
 *  de topo (Armas → Escudos → Armaduras → Consumíveis → …), espelhando a ordem
 *  das 7 categorias do compêndio (compendio-registry.ts) com as tesouro depois. */
export type ItemCategoria =
  | 'arma'
  | 'escudo'
  | 'armadura'
  | 'consumivel'
  | 'imbuicao'
  | 'qualidade'
  | 'equipamento'
  | 'implemento'
  | 'outro'

/** Rótulo de exibição de cada categoria — fonte única (o call-site nunca inventa). */
export const CATEGORIA_LABEL: Record<ItemCategoria, string> = {
  arma: 'Armas',
  escudo: 'Escudos',
  armadura: 'Armaduras',
  consumivel: 'Consumíveis',
  imbuicao: 'Imbuições',
  qualidade: 'Qualidades',
  equipamento: 'Equipamentos',
  implemento: 'Implementos',
  outro: 'Outros',
}

/** Ordem canônica das categorias nas seções e no filtro. */
export const CATEGORIA_ORDER: ItemCategoria[] = [
  'arma',
  'escudo',
  'armadura',
  'consumivel',
  'imbuicao',
  'qualidade',
  'equipamento',
  'implemento',
  'outro',
]

/** Categoria pelo PATH do doc — a subpasta é a fonte de verdade (mesma lógica das
 *  queries do pleitost-views e do docImageUrl/docKind do item-card). */
export function itemCategoria(doc: VaultDoc): ItemCategoria {
  const id = doc.id
  if (id.includes('/Equipamento/Armas/')) return 'arma'
  if (id.includes('/Equipamento/Escudos/')) return 'escudo'
  if (id.includes('/Equipamento/Armaduras/')) return 'armadura'
  if (id.includes('/Consumíveis/')) return 'consumivel'
  // "Imbuições e Qualidade" tem 2 subpastas: Imbuições e Qualidade (obra-prima).
  if (id.includes('/Imbuições e Qualidade/Qualidade/')) return 'qualidade'
  if (id.includes('/Imbuições e Qualidade/')) return 'imbuicao'
  if (id.includes('/Equipamento/Tesouros/Equipamentos/')) return 'equipamento'
  if (id.includes('/Equipamento/Tesouros/Implementos/')) return 'implemento'
  return 'outro'
}

// ─────────────────────────────── grupos de arma ───────────────────────────────

/** Ordem de exibição dos grupos de arma (6.1): simples → marcial → especial →
 *  natural; dentro de simples/marcial, CaC antes de distância. É um SUPERSET do
 *  GRUPO_ARMA_ORDER da registry.ts, mas nesta ordem pedida na issue. */
export const ARMA_GRUPO_ORDER = [
  'cac-simples',
  'd-simples',
  'cac-marcial',
  'd-marcial',
  'especial',
  'natural',
] as const

/** Rótulos dos grupos de arma — fonte única (emoji do registro grupoArma). */
export const ARMA_GRUPO_LABEL: Record<string, string> = {
  'cac-simples': 'Corpo-a-Corpo Simples',
  'd-simples': 'Distância Simples',
  'cac-marcial': 'Corpo-a-Corpo Marcial',
  'd-marcial': 'Distância Marcial',
  especial: 'Armas Especiais',
  natural: 'Armas Naturais',
}

/** Emoji do grupo de arma — reusa o registro central (grupoArmaEmoji). */
export function armaGrupoEmoji(grupo: string): string {
  return grupoArmaEmoji(grupo)
}

// ───────────────────── tipos de faceta (consumível/imbuição/etc) ─────────────────────

/** Rótulo de `bonus_tipo` do FM (ataque/defesa/perícia/resistência) — normalizado
 *  ao vocabulário de exibição. Fonte: FM `bonus_tipo` dos tesouros. */
const BONUS_TIPO_LABEL: Record<string, string> = {
  ataque: 'Ataque',
  defesa: 'Defesa',
  resistência: 'Defesa', // Equipamentos de Defesa gravam "resistência" (sinônimo)
  resistencia: 'Defesa',
  pericia: 'Perícia',
  perícia: 'Perícia',
}

/** Rótulo de `tipo_efeito` do FM dos consumíveis (Vitalidade/Moral/Velocidade). */
function tipoEfeitoLabel(raw: unknown): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

function fmStr(doc: VaultDoc, key: string): string {
  const v = (doc.frontmatter ?? {})[key]
  return typeof v === 'string' ? v.trim() : ''
}

// ─────────────────────────── stem de arma natural ───────────────────────────

/** Tipo de uma arma NATURAL = a 1ª palavra do basename (Garras/Presas/Mandíbula/
 *  Chifres/Cauda). O FM `ordem` já cresce por decada dentro do tipo (11-15 Garras,
 *  21-25 Presas…), então usamos `ordem` pra ordenar crescente e a raiz pro grupo. */
export function armaNaturalTipo(doc: VaultDoc): string {
  const first = doc.basename.split(/\s+/)[0] ?? doc.basename
  return first
}

// ────────────────────────────────── qualidade ──────────────────────────────────

/** Categorias cuja QUALIDADE (tier) é COMPRADA — a família tesouro. A carta dessas
 *  varia por tier (Adepto/Experiente/Mestre, showTier no item-card); arma/escudo/
 *  armadura base NÃO têm qualidade (a qualidade vem da propriedade/imbuição).
 *  É o mesmo showTier do item-card (docKind === 'tesouro'). */
const QUALIDADE_CATEGORIAS: ReadonlySet<ItemCategoria> = new Set<ItemCategoria>([
  'consumivel',
  'imbuicao',
  'qualidade',
  'equipamento',
  'implemento',
])

/** Se a categoria é comprada POR qualidade (tier) — a carta mostra "(Adepto/…)". */
export function categoriaTemQualidade(categoria: ItemCategoria): boolean {
  return QUALIDADE_CATEGORIAS.has(categoria)
}

/** Qualidade (tier) INERENTE do doc — reusa docTier do item-card. Hoje toda a base
 *  volta 'A'; a família tesouro é exibível em qualquer tier (o filtro de qualidade
 *  escolhe qual). */
export function itemQualidade(doc: VaultDoc): Tier {
  return docTier(doc)
}

/** Rótulo da qualidade — fonte única (TIER_COLUNA do commerce). */
export function qualidadeLabel(tier: Tier): string {
  return TIER_COLUNA[tier]
}

// ─────────────────────────────── faceta completa ───────────────────────────────

/** Faceta derivada de um doc de Item: categoria + grupo + subgrupo + qualidade.
 *  `grupo`/`subgrupo` são as chaves (não rótulos) das seções; `grupoLabel`/
 *  `subgrupoLabel` os rótulos exibidos; `ordem` é a ordem crescente dentro do
 *  subgrupo (FM `ordem`; +Infinity quando ausente → depois, como sortByOrdem). */
export interface ItemFacet {
  categoria: ItemCategoria
  categoriaLabel: string
  grupo: string
  grupoLabel: string
  grupoEmoji: string
  subgrupo: string
  subgrupoLabel: string
  qualidade: Tier
  qualidadeLabel: string
  ordem: number
}

function fmOrdem(doc: VaultDoc): number {
  const v = (doc.frontmatter ?? {})['ordem']
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/** Deriva a faceta completa de um doc de Item. PURA — só lê path/FM/basename.
 *  É a função central: a barra de filtro e as seções agrupam por ela. */
export function itemFacet(doc: VaultDoc): ItemFacet {
  const categoria = itemCategoria(doc)
  const qualidade = itemQualidade(doc)
  const ordem = fmOrdem(doc)
  let grupo = ''
  let grupoLabel = ''
  let grupoEmoji = ''
  let subgrupo = ''
  let subgrupoLabel = ''

  if (categoria === 'arma') {
    // 6.1 — grupo do FM; naturais ganham subgrupo pelo tipo (raiz do basename).
    grupo = fmStr(doc, 'grupo').toLowerCase()
    grupoLabel = ARMA_GRUPO_LABEL[grupo] ?? grupo
    grupoEmoji = armaGrupoEmoji(grupo)
    if (grupo === 'natural') {
      subgrupo = armaNaturalTipo(doc)
      subgrupoLabel = subgrupo
    }
  } else if (categoria === 'consumivel') {
    // 6.2 — por tipo_efeito (Vitalidade/Moral/Velocidade).
    grupo = fmStr(doc, 'tipo_efeito').toLowerCase()
    grupoLabel = tipoEfeitoLabel(doc.frontmatter?.['tipo_efeito'])
  } else if (categoria === 'imbuicao' || categoria === 'equipamento' || categoria === 'qualidade') {
    // 6.3/6.4 — por bonus_tipo (ataque/defesa/perícia).
    const bt = fmStr(doc, 'bonus_tipo').toLowerCase()
    grupo = BONUS_TIPO_LABEL[bt] ? bt : bt || 'outro'
    grupoLabel = BONUS_TIPO_LABEL[bt] ?? (bt ? bt : 'Outros')
  } else if (categoria === 'implemento') {
    // 6.5 — implementos não têm um "tipo" no FM; a categoria já é o grupo.
    grupo = ''
    grupoLabel = ''
  }

  return {
    categoria,
    categoriaLabel: CATEGORIA_LABEL[categoria],
    grupo,
    grupoLabel,
    grupoEmoji,
    subgrupo,
    subgrupoLabel,
    qualidade,
    qualidadeLabel: qualidadeLabel(qualidade),
    ordem,
  }
}

// ─────────────────────── agrupamento hierárquico (seções) ───────────────────────

export interface ItemGroupNode<E> {
  categoria: ItemCategoria
  categoriaLabel: string
  grupos: {
    grupo: string
    grupoLabel: string
    grupoEmoji: string
    subgrupos: {
      subgrupo: string
      subgrupoLabel: string
      entries: E[]
    }[]
  }[]
}

/** Ordena grupos de arma pela ARMA_GRUPO_ORDER; demais alfabeticamente (mas com
 *  chaves conhecidas de bonus_tipo primeiro: Ataque, Defesa, Perícia). */
function grupoRank(categoria: ItemCategoria, grupo: string): number {
  if (categoria === 'arma') {
    const i = (ARMA_GRUPO_ORDER as readonly string[]).indexOf(grupo)
    return i === -1 ? ARMA_GRUPO_ORDER.length : i
  }
  const order = ['ataque', 'defesa', 'resistência', 'resistencia', 'perícia', 'pericia']
  const i = order.indexOf(grupo)
  return i === -1 ? order.length : i
}

/** Item já facetado pro agrupamento — a faceta é calculada UMA vez (no call-site)
 *  e reusada aqui. `entry` é a projeção que o render precisa (ex.: uma célula). */
export interface FacetedItem<E> {
  facet: ItemFacet
  entry: E
}

/** Agrupa itens JÁ FACETADOS em categoria → grupo → subgrupo, mantendo cada nível
 *  ordenado (categorias pela CATEGORIA_ORDER; grupos pela ordem canônica; entries
 *  por FM `ordem`, depois pela ordem de entrada). Fonte de verdade única do
 *  agrupamento — o render só percorre a árvore. */
export function groupFacetedItems<E>(items: FacetedItem<E>[]): ItemGroupNode<E>[] {
  type Bucket = FacetedItem<E>
  const byCat = new Map<ItemCategoria, Bucket[]>()
  for (const it of items) {
    const arr = byCat.get(it.facet.categoria) ?? []
    arr.push(it)
    byCat.set(it.facet.categoria, arr)
  }

  const cmpEntry = (a: Bucket, b: Bucket): number => {
    if (a.facet.ordem !== b.facet.ordem) return a.facet.ordem - b.facet.ordem
    return 0
  }

  const nodes: ItemGroupNode<E>[] = []
  for (const categoria of CATEGORIA_ORDER) {
    const buckets = byCat.get(categoria)
    if (!buckets || !buckets.length) continue
    // grupo → subgrupo
    const byGrupo = new Map<string, Bucket[]>()
    for (const b of buckets) {
      const arr = byGrupo.get(b.facet.grupo) ?? []
      arr.push(b)
      byGrupo.set(b.facet.grupo, arr)
    }
    const grupos = [...byGrupo.entries()]
      .sort(([ga], [gb]) => {
        const ra = grupoRank(categoria, ga)
        const rb = grupoRank(categoria, gb)
        if (ra !== rb) return ra - rb
        return ga.localeCompare(gb, 'pt-BR')
      })
      .map(([grupo, gbuckets]) => {
        const bySub = new Map<string, Bucket[]>()
        for (const b of gbuckets) {
          const arr = bySub.get(b.facet.subgrupo) ?? []
          arr.push(b)
          bySub.set(b.facet.subgrupo, arr)
        }
        const subgrupos = [...bySub.entries()]
          .sort(([, sa], [, sb]) => {
            // subgrupos ordenados pela MENOR ordem de seus entries (crescente).
            const oa = Math.min(...sa.map((x) => x.facet.ordem))
            const ob = Math.min(...sb.map((x) => x.facet.ordem))
            if (oa !== ob) return oa - ob
            return (sa[0]?.facet.subgrupoLabel ?? '').localeCompare(
              sb[0]?.facet.subgrupoLabel ?? '',
              'pt-BR',
            )
          })
          .map(([subgrupo, sbuckets]) => ({
            subgrupo,
            subgrupoLabel: sbuckets[0]?.facet.subgrupoLabel ?? '',
            entries: [...sbuckets].sort(cmpEntry).map((b) => b.entry),
          }))
        return {
          grupo,
          grupoLabel: gbuckets[0]?.facet.grupoLabel ?? '',
          grupoEmoji: gbuckets[0]?.facet.grupoEmoji ?? '',
          subgrupos,
        }
      })
    nodes.push({
      categoria,
      categoriaLabel: CATEGORIA_LABEL[categoria],
      grupos,
    })
  }
  return nodes
}

/** Conveniência docs-first: faceta cada doc (uma vez) e agrupa. `entryOf`
 *  projeta o que o render precisa (ex.: uma célula). Usado por testes e por
 *  qualquer call-site que parta dos VaultDocs crus. */
export function groupItems<E>(
  docs: VaultDoc[],
  entryOf: (doc: VaultDoc, facet: ItemFacet) => E,
): ItemGroupNode<E>[] {
  return groupFacetedItems(
    docs.map((doc) => {
      const facet = itemFacet(doc)
      return { facet, entry: entryOf(doc, facet) }
    }),
  )
}
