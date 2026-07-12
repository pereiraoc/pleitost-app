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

/** Parseia a tabela de uma seção "## <título>" do body da nota → matriz.
 *  Retorna null se a seção/tabela não for encontrada ou vier incompleta
 *  (caller cai no default). Só lê essa seção — para na próxima "## ". */
function parseMatrixSection(body: string, sectionTitle: string): AvailabilityMatrix | null {
  const esc = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = body.search(new RegExp(`^##\\s+${esc}\\s*$`, 'm'))
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

/** Tabela "## Disponibilidade Pronta" (estoque atual) da nota → matriz. */
export function parseDisponibilidadePronta(body: string): AvailabilityMatrix | null {
  return parseMatrixSection(body, 'Disponibilidade Pronta')
}

/** Tabela "## Disponibilidade por Encomenda" (sob pedido) da nota → matriz. */
export function parseDisponibilidadeEncomenda(body: string): AvailabilityMatrix | null {
  return parseMatrixSection(body, 'Disponibilidade por Encomenda')
}

/** DEFAULTS espelhando a tabela "Disponibilidade por Encomenda" da nota real.
 *    | Local          | Adepto | Experiente | Mestre |
 *    | Pequena Cidade |  100%  |     —      |   —    |
 *    | Grande Cidade  |  100%  |    50%     |   —    |
 *    | Capital        |  150%  |    100%    |  10%   |
 *    | Iluminada      |  200%  |    100%    |  25%   | */
export const DEFAULT_ENCOMENDA_MATRIX: AvailabilityMatrix = {
  'Pequena Cidade': { A: 100, E: null, M: null },
  'Grande Cidade': { A: 100, E: 50, M: null },
  Capital: { A: 150, E: 100, M: 10 },
  Iluminada: { A: 200, E: 100, M: 25 },
}

// ───────────────── Modificadores por Região (raridade × básico) ─────────────

/** Tesouros BÁSICOS (mais comuns) — lista verbatim da seção "## Modificadores
 *  por Região" da nota. São nomes canônicos (basename do doc do tesouro). */
export const TESOUROS_BASICOS: readonly string[] = [
  'Anel do Equilíbrio',
  'Luva do Arcanista',
  'Bracelete Elemental',
  'Arma Obra-prima',
  'Armadura Obra-prima',
  'Ferramenta Obra-prima',
]

/** Raridade regional de um tesouro (típico = está nos Recursos da localização).
 *  Básicos ganham uma classe própria (mais comuns). */
export type Raridade = 'tipico' | 'incomum' | 'basico-tipico' | 'basico-incomum'

/** Modificador de disponibilidade por raridade (tabela "Modificadores por
 *  Região"): típico ×1 · básico típico ×2 · básico incomum ×½ · incomum ×¼. */
export const RARIDADE_MULT: Record<Raridade, number> = {
  tipico: 1,
  'basico-tipico': 2,
  'basico-incomum': 0.5,
  incomum: 0.25,
}

/** Classifica um tesouro pelo nome canônico + se é típico da região (Recursos). */
export function raridadeTesouro(nome: string, tipico: boolean): Raridade {
  if (TESOUROS_BASICOS.includes(nome)) return tipico ? 'basico-tipico' : 'basico-incomum'
  return tipico ? 'tipico' : 'incomum'
}

/** Modificador de um combo ARMA×IMBUIÇÃO (tabela "Modificadores por Região"):
 *  típica+típica ×1 · incomum+típica ×½ · típica+incomum ×¼ · incomum+incomum ×⅛. */
export function comboMult(armaTipica: boolean, imbTipica: boolean): number {
  if (armaTipica) return imbTipica ? 1 : 0.25
  return imbTipica ? 0.5 : 0.125
}

/** Tabela "Tesouros em Vilarejos" — VERBATIM da nota (Disponibilidade de
 *  Tesouros): chances por Obter Informação num vilarejo, 1×/semana por tesouro
 *  específico. Informativa (a rolagem é do mestre na mesa). */
export const VILAREJO_CHANCES: ReadonlyArray<{ caso: string; chance: string }> = [
  { caso: 'Arma, Armadura ou Ferramenta típica pronta', chance: '25%' },
  { caso: 'Arma, Armadura ou Ferramenta típica por encomenda', chance: '100%' },
  { caso: 'Tesouro típico Adepto', chance: '1.5 × Obter Informação% (max 33%)' },
  { caso: 'Tesouro fundamental Adepto', chance: '3/4 × Obter Informação% (max 17%)' },
  { caso: 'Tesouro atípico Adepto', chance: '2/5 × Obter Informação% (max 8%)' },
]

// ─────────────────────── Quantidade / dados ─────────────────────────────────

/** Quantidade em ESTOQUE (pronta entrega) dada uma % efetiva: cada unidade
 *  (1ª..max) rola a MESMA % (teto 100%/unidade); só tenta a próxima se a
 *  anterior saiu. ≥100% enche até `max` (default 4). Regra de quantidade
 *  definida pelo mestre (não está na nota). Determinístico com RNG fixo. */
export function rollStock(pct: number | null, rng: Rng, max = 4): number {
  if (pct == null || pct <= 0) return 0
  const p = Math.min(pct, 100) / 100
  let n = 0
  while (n < max && rng() < p) n++
  return n
}

/** Rola uma expressão de dados "NdX", "NdX+C" ou "NdX-C" (N pode ser 0) com RNG
 *  injetado; resultado com piso 0. Ex.: "0d4-5"→0, "2d10-1"→[1..19]. */
export function rollDice(expr: string, rng: Rng): number {
  const m = expr.trim().match(/^(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?$/i)
  if (!m) return 0
  const n = Number(m[1])
  const faces = Number(m[2])
  const mod = m[3] ? Number(m[3].replace(/\s+/g, '')) : 0
  let total = mod
  for (let i = 0; i < n; i++) total += 1 + Math.floor(rng() * faces)
  return Math.max(0, total)
}

/** Disponibilidade de POÇÕES (consumíveis) — regra PRÓPRIA definida pelo mestre
 *  (não está na nota): quantidade por dados, por tipo de local × tier, rolada
 *  para CADA poção. "0dX-C" = sempre indisponível. */
export const POCAO_DICE: Record<LocalType, Record<Tier, string>> = {
  'Pequena Cidade': { A: '1d10-3', E: '1d6-4', M: '0d4-5' },
  'Grande Cidade': { A: '1d10-1', E: '1d6-2', M: '0d4-3' },
  Capital: { A: '2d10-1', E: '2d6-2', M: '1d4-3' },
  Iluminada: { A: '3d10-1', E: '3d6-2', M: '2d4-3' },
}

/** Quantidade de UMA poção disponível (pronta entrega) num local × tier. */
export function rollPocaoStock(localType: LocalType, tier: Tier, rng: Rng): number {
  const expr = POCAO_DICE[localType]?.[tier]
  return expr ? rollDice(expr, rng) : 0
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

// ═══════════════════ Motor v2 (issue #93): pronta + encomenda ═══════════════
//
// O caller (catálogo) monta os CANDIDATOS já classificados: tesouros simples e
// combos arma×imbuição (com `mult` = RARIDADE_MULT/comboMult) + poções à parte
// (dados). O motor rola PRONTA (estoque, quantidade que decrementa na compra) e
// ENCOMENDA (boolean, referência do GM). Puro/determinístico com `rng`.

/** Candidato de tesouro/combo — rolado pela matriz × modificador (`mult`). */
export interface ShopCandidate {
  /** Id único e estável: `target` do tesouro OU `armaTarget|imbTarget` do combo. */
  key: string
  /** Basename canônico (p/ alias do inventário na compra). */
  nome: string
  /** Rótulo exibível SEM o tier ("Adaga Relampejante", "Anel Canário"). */
  label: string
  /** Preço base em PO (versão Adepta). */
  precoBase: number
  /** Modificador de raridade/combo (RARIDADE_MULT ou comboMult). */
  mult: number
  /** Tiers ofertados (tesouro mágico: A/E/M). */
  tiers: Tier[]
  /** Combo: doc da ARMA (p/ miniatura + carta no hover). */
  armaTarget?: string
  /** Combo: doc da IMBUIÇÃO (p/ a 2ª carta no hover). */
  imbTarget?: string
  /** Base da propriedade p/ selo (imbuição "Relampejante" ou "Obra-prima"). */
  propriedadeBase?: string
  /** Basename alternativo p/ miniatura (escudo/armadura obra-prima: "Broquel"). */
  thumbBasename?: string
}

/** Candidato de POÇÃO — rolado por DADOS (POCAO_DICE), não pela matriz. */
export interface PocaoCandidate {
  key: string
  nome: string
  label: string
  precoBase: number
  tiers: Tier[]
}

/** Metadados de UI (miniatura/selo/carta) comuns às entradas. */
export interface EntryMeta {
  armaTarget?: string
  imbTarget?: string
  propriedadeBase?: string
  thumbBasename?: string
  /** É uma poção (aba Poções à parte de Equipamentos). */
  isPocao?: boolean
}

/** Entrada de PRONTA ENTREGA (estoque atual, decrementa na compra). */
export interface ProntaEntry extends EntryMeta {
  key: string
  nome: string
  label: string
  tier: Tier
  quantidade: number
  preco: number
}

/** Entrada de ENCOMENDA (só disponíveis; referência do GM, sem quantidade). */
export interface EncomendaEntry extends EntryMeta {
  key: string
  label: string
  tier: Tier
  preco: number
}

export interface RolledShop {
  pronta: ProntaEntry[]
  encomenda: EncomendaEntry[]
}

/** % efetiva de uma célula da matriz × modificador (null → null = indisponível). */
function pctEfetiva(cell: number | null, mult: number): number | null {
  return cell == null ? null : cell * mult
}

/** Rola a loja v2 (#93): PRONTA (estoque via rollStock) + ENCOMENDA (boolean via
 *  1 rolagem na % de encomenda) para tesouros/combos; poções pela tabela de
 *  dados (só pronta). Determinístico dado o `rng`. */
export function rollShop2(
  candidates: ShopCandidate[],
  pocoes: PocaoCandidate[],
  localType: LocalType,
  prontaMatrix: AvailabilityMatrix,
  encomendaMatrix: AvailabilityMatrix,
  rng: Rng,
): RolledShop {
  const prontaRow = prontaMatrix[localType]
  const encomendaRow = encomendaMatrix[localType]
  const pronta: ProntaEntry[] = []
  const encomenda: EncomendaEntry[] = []

  for (const c of candidates) {
    const meta: EntryMeta = {
      armaTarget: c.armaTarget,
      imbTarget: c.imbTarget,
      propriedadeBase: c.propriedadeBase,
      thumbBasename: c.thumbBasename,
    }
    for (const tier of c.tiers) {
      const preco = c.precoBase * TIER_PRICE_MULT[tier]
      // PRONTA: quantidade em estoque (mesma % por unidade, teto 100%, até 4).
      const qtd = rollStock(pctEfetiva(prontaRow[tier], c.mult), rng)
      if (qtd > 0) {
        pronta.push({ key: c.key, nome: c.nome, label: c.label, tier, quantidade: qtd, preco, ...meta })
      }
      // ENCOMENDA: disponível? (1 rolagem na % de encomenda × modificador).
      if (rollStock(pctEfetiva(encomendaRow[tier], c.mult), rng, 1) >= 1) {
        encomenda.push({ key: c.key, label: c.label, tier, preco, ...meta })
      }
    }
  }

  for (const p of pocoes) {
    for (const tier of p.tiers) {
      const qtd = rollPocaoStock(localType, tier, rng)
      if (qtd > 0) {
        pronta.push({
          key: p.key,
          nome: p.nome,
          label: p.label,
          tier,
          quantidade: qtd,
          preco: p.precoBase * TIER_PRICE_MULT[tier],
          isPocao: true,
        })
      }
    }
  }

  return { pronta, encomenda }
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
