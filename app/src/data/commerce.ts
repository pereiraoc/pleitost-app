// COMÉRCIO (issue #72) — lógica PURA da loja de uma Localização: parse da
// tabela de disponibilidade real da nota, matriz de % por (tipo de local ×
// tier) e rolagem dos Recursos disponíveis. Sem React, sem localStorage —
// testável com RNG injetado; a persistência/UI vivem em commerce-store.ts /
// LocationSheet.
//
// Fonte de verdade dos DEFAULTS: o body da nota real
// `Contexto/Histórias/Contexto Atual/Disponibilidade de Tesouros.md`
// (vault-data), seção "## Disponibilidade Pronta" — uma tabela markdown
// | Local | Adepto | Experiente | Mestre | com % (ou "—"). Parseada aqui; se
// o parse falhar (nota ausente/alterada), cai nos defaults hardcoded abaixo,
// que ESPELHAM a mesma tabela (documentados linha a linha).
import type { VaultDoc } from './types'
import { linkLabel } from '../markdown/dataview-value'
import { precoPO } from '../grupo/wealth'

/** Tiers de qualidade rolados na loja (mesma letra do resto da ficha). */
export type Tier = 'A' | 'E' | 'M'
export const TIERS: Tier[] = ['A', 'E', 'M']

/** Rótulo de coluna da nota por tier (cabeçalho "Adepto/Experiente/Mestre"). */
export const TIER_COLUNA: Record<Tier, string> = {
  A: 'Adepto',
  E: 'Experiente',
  M: 'Mestre',
}

/** Tipos de local da tabela "Disponibilidade Pronta" (linhas da nota, na
 *  ordem). São a CHAVE da matriz e casam com a `subcategoria` da Localização
 *  (exceto "Iluminada", uma capital distinta sem subcategoria própria — o GM
 *  a seleciona por local; ver localTypeForDoc). */
export const LOCAL_TYPES = [
  'Pequena Cidade',
  'Grande Cidade',
  'Capital',
  'Iluminada',
] as const
export type LocalType = (typeof LOCAL_TYPES)[number]

/** Matriz de disponibilidade: % por tipo de local × tier. null = indisponível
 *  (célula "—" da nota). Percentuais podem passar de 100 (150%/200% → 1
 *  garantido + chance do excedente). */
export type AvailabilityMatrix = Record<LocalType, Record<Tier, number | null>>

/** DEFAULTS espelhando a tabela "Disponibilidade Pronta" da nota real
 *  (Disponibilidade de Tesouros.md). Usados quando o parse do body falha.
 *    | Local          | Adepto | Experiente | Mestre |
 *    | Pequena Cidade |  33%   |     —      |   —    |
 *    | Grande Cidade  |  50%   |    10%     |   —    |
 *    | Capital        |  100%  |    25%     |   2%   |
 *    | Iluminada      |  150%  |    50%     |   5%   | */
export const DEFAULT_MATRIX: AvailabilityMatrix = {
  'Pequena Cidade': { A: 33, E: null, M: null },
  'Grande Cidade': { A: 50, E: 10, M: null },
  Capital: { A: 100, E: 25, M: 2 },
  Iluminada: { A: 150, E: 50, M: 5 },
}

/** Célula da tabela ("33%", "—", "2%*", "") → percentual ou null.
 *  Ignora o asterisco de nota de rodapé; "—"/vazio → null. */
export function parseCell(cell: string): number | null {
  const s = cell.replace(/\*/g, '').trim()
  if (!s || s === '—' || s === '-') return null
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? Number(m[1]) : null
}

/** Nome do local da 1ª coluna ("**Pequena Cidade**" → "Pequena Cidade"). */
function parseLocalName(cell: string): string {
  return cell.replace(/\*/g, '').trim()
}

/** Divide uma linha markdown de tabela em células (sem os pipes externos). */
function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((c) => c.trim())
}

/** Parseia a tabela "## Disponibilidade Pronta" do body da nota → matriz.
 *  Retorna null se a seção/tabela não for encontrada ou vier incompleta
 *  (caller cai no DEFAULT_MATRIX). Só lê essa seção — para na próxima "## ". */
export function parseDisponibilidadePronta(body: string): AvailabilityMatrix | null {
  const start = body.search(/^##\s+Disponibilidade Pronta\s*$/m)
  if (start === -1) return null
  const rest = body.slice(start)
  const nextHeading = rest.slice(1).search(/^##\s+/m)
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1)

  const lines = section.split('\n').filter((l) => l.trim().startsWith('|'))
  // header + separador + linhas de dados; header dá a ordem das colunas de tier.
  if (lines.length < 3) return null
  const header = splitRow(lines[0]) // ["Local","Adepto","Experiente","Mestre"]
  const colOfTier: Record<Tier, number> = { A: -1, E: -1, M: -1 }
  for (const tier of TIERS) {
    colOfTier[tier] = header.findIndex((h) => h.toLowerCase() === TIER_COLUNA[tier].toLowerCase())
  }
  if (TIERS.some((t) => colOfTier[t] === -1)) return null

  const parsed: Partial<AvailabilityMatrix> = {}
  for (const line of lines.slice(2)) {
    const cells = splitRow(line)
    const nome = parseLocalName(cells[0])
    const known = LOCAL_TYPES.find((t) => t === nome)
    if (!known) continue
    parsed[known] = {
      A: parseCell(cells[colOfTier.A] ?? ''),
      E: parseCell(cells[colOfTier.E] ?? ''),
      M: parseCell(cells[colOfTier.M] ?? ''),
    }
  }
  // Só aceita se todos os tipos conhecidos foram lidos (senão parse frágil → default).
  if (LOCAL_TYPES.some((t) => !parsed[t])) return null
  return parsed as AvailabilityMatrix
}

/** Matriz de defaults a partir da nota (parse) ou do hardcode espelhado. */
export function matrixFromNote(noteBody: string | undefined | null): AvailabilityMatrix {
  const parsed = noteBody ? parseDisponibilidadePronta(noteBody) : null
  return parsed ?? cloneMatrix(DEFAULT_MATRIX)
}

export function cloneMatrix(m: AvailabilityMatrix): AvailabilityMatrix {
  const out = {} as AvailabilityMatrix
  for (const t of LOCAL_TYPES) out[t] = { ...m[t] }
  return out
}

/** Tipo de local usado na rolagem: a `subcategoria` da Localização quando bate
 *  com uma linha da tabela, senão null (a loja não rola para Ponto de
 *  Interesse/Região/Nação — sem regra de disponibilidade na nota). "Iluminada"
 *  não é subcategoria: uma Localização só é Iluminada por escolha do GM
 *  (override por local), tratado no store; aqui é a projeção da subcategoria. */
export function localTypeFromSubtype(subtype: string | null | undefined): LocalType | null {
  const found = LOCAL_TYPES.find((t) => t === subtype)
  return found ?? null
}

/** RNG injetável: () => número em [0,1). Default = Math.random (browser). */
export type Rng = () => number

/** Quantidade rolada dada uma % (pode passar de 100): parte inteira garantida
 *  + 1 extra com prob. da parte fracionária. 33% → 0 ou 1; 150% → 1, ou 2 com
 *  50%; null → 0 (indisponível). Determinístico com RNG fixo. */
export function rollQuantity(pct: number | null, rng: Rng): number {
  if (pct == null || pct <= 0) return 0
  const frac = pct / 100
  const guaranteed = Math.floor(frac)
  const chance = frac - guaranteed
  return guaranteed + (rng() < chance ? 1 : 0)
}

/** Um item de Recurso resolvido para a loja: doc do tesouro + metadados. */
export interface ResourceItem {
  /** Alvo do wikilink (basename/path) — id estável do Recurso. */
  target: string
  /** Rótulo exibível (alias do wikilink, ex. "Armadura Leve"). */
  label: string
  /** Nome canônico (basename do doc) — usado no alias do inventário. */
  nome: string
  /** Doc do tesouro, se resolvido no catálogo. */
  doc: VaultDoc | undefined
  /** Preço base em PO (preço:: do doc). */
  precoBase: number
}

/** Item disponível na loja após a rolagem: recurso + tier + quantidade + preço
 *  do tier (base × multiplicador de qualidade). */
export interface ShopEntry {
  target: string
  label: string
  nome: string
  tier: Tier
  /** Quantidade rolada como disponível (> 0). */
  quantidade: number
  /** Preço unitário no tier (base × tierMult: A×1, E×5, M×25). */
  preco: number
}

/** Multiplicador de preço por tier de qualidade — ESPELHA tierMultFromName
 *  (grupo/wealth.ts): Adepto ×1, Experiente ×5, Mestre ×25. */
export const TIER_PRICE_MULT: Record<Tier, number> = { A: 1, E: 5, M: 25 }

/** Recursos (wikilinks) → itens de tesouro resolvidos. Só entram os que
 *  resolvem para um doc `Tesouro` (magia com preço/tiers); armas base e
 *  strings simples ficam de fora (a loja de disponibilidade é de tesouros,
 *  conforme a nota). `resolveDoc` mapeia alvo → VaultDoc (catálogo). */
export function resolveResourceItems(
  recursos: string[],
  resolveDoc: (target: string) => VaultDoc | undefined,
): ResourceItem[] {
  const out: ResourceItem[] = []
  const seen = new Set<string>()
  for (const raw of recursos) {
    const target = wikiTargetOf(raw)
    if (!target || seen.has(target)) continue
    const doc = resolveDoc(target)
    if (!doc || doc.subtype !== 'Tesouro') continue // só tesouros entram na loja
    seen.add(target)
    out.push({
      target,
      label: linkLabel(raw) || target,
      nome: doc.basename,
      doc,
      precoBase: precoPO(doc),
    })
  }
  return out
}

const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/

/** Alvo de um wikilink de Recurso ("[[A/B|C]]" → "A/B"); string plana volta. */
function wikiTargetOf(value: string): string {
  const m = WIKILINK.exec(value)
  return (m ? m[1] : value).trim()
}

/** Rola a loja: para cada item de Recurso, em cada tier suportado pelo tipo de
 *  local, rola a quantidade disponível pela % da matriz. Retorna só as
 *  entradas com quantidade > 0. Determinístico dado o `rng`. */
export function rollShop(
  items: ResourceItem[],
  localType: LocalType,
  matrix: AvailabilityMatrix,
  rng: Rng,
): ShopEntry[] {
  const row = matrix[localType]
  const out: ShopEntry[] = []
  for (const item of items) {
    for (const tier of TIERS) {
      const qtd = rollQuantity(row[tier], rng)
      if (qtd <= 0) continue
      out.push({
        target: item.target,
        label: item.label,
        nome: item.nome,
        tier,
        quantidade: qtd,
        preco: item.precoBase * TIER_PRICE_MULT[tier],
      })
    }
  }
  return out
}
