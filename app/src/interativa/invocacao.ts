// Invocações (#30) — magias `tipo: Invocação` (Servo das Sombras, Amálgama
// das Sombras). ESPELHO do plugin pleitost-autosheet:
//   - resolvers puros: src/runtime/invocacao/resolve-invocacao.ts
//     (resolveStat :40-88, pickByThreshold :92-106, isInvocacaoDisponivel
//     :120-130, resolveInvocacao :151-169, resolveBonus :171-182)
//   - helpers da UI:   src/render/modes/interativa/tabs/tab-companheiros.ts
//     (listInvocacoesDisponiveis :67-74, genId :92-95, defaultPM :122-124,
//     lookupRota/maxRank :778-812, computeEvMax :818-845, computeMagiaAtaque
//     :708-753, resolveAttackBonus :681-704, buildDanoBreakdown :612-657,
//     computeDanoDelta :663-674, stats em 2 linhas :375-389, statEmoji
//     :852-863, formatStatValue :869-877)
// Estado volátil: FM `Interativa.Invocacoes_Ativas[label]` = array de
// instâncias {id, potencia, vitalidade, moralTemporaria} — shape EXATO que o
// plugin persiste (types/model.ts:271-287, serialize-to-fm.ts:479-496).
import { fmPath, num, signed, str } from '../components/ficha/hero-model'
import { PROF_BONUS, tokens } from '../components/ficha/registry'
import type { Proficiencia } from './condition-context'
import type { EffectDescriptor, ProficienciaRank, ValorEscalonado } from './descriptor'

const RANK_NUM: Record<ProficienciaRank, number> = { N: 0, A: 1, E: 2, M: 3, P: 4 }

/** Instância ativa persistida (plugin types/model.ts:280-287). */
export interface InvocacaoInstance {
  id: string
  /** PM com que foi conjurada — determina EV (5×PM no Servo). */
  potencia: number
  /** EV corrente. */
  vitalidade: number
  /** Overlay verde — dano consome primeiro. */
  moralTemporaria: number
}

export type InvocacoesAtivasMap = Record<string, InvocacaoInstance[]>

/** Lê o container salvo (tolerante a shapes estranhos no FM). */
export function invocacoesAtivas(fm: Record<string, unknown>): InvocacoesAtivasMap {
  const raw = (fmPath(fm, 'Interativa', 'Invocacoes_Ativas') ?? {}) as Record<string, unknown>
  const out: InvocacoesAtivasMap = {}
  for (const [label, lista] of Object.entries(raw)) {
    if (!Array.isArray(lista)) continue
    const insts: InvocacaoInstance[] = []
    for (const item of lista) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (!str(o['id'])) continue
      insts.push({
        id: str(o['id']),
        potencia: num(o['potencia']),
        vitalidade: num(o['vitalidade']),
        moralTemporaria: num(o['moralTemporaria']),
      })
    }
    if (insts.length > 0) out[label] = insts
  }
  return out
}

/** Id único por instância (plugin tab-companheiros.ts:92-95 — mesmo formato
 *  dos ids já persistidos: "Amálgama das Sombras#1782950692143-1"). */
let instanceCounter = 0
export function genId(label: string): string {
  return `${label}#${Date.now()}-${++instanceCounter}`
}

// ──────────────────────────────────────────────────────────────────────────
// Resolvers puros (plugin resolve-invocacao.ts)
// ──────────────────────────────────────────────────────────────────────────

export interface InvocacaoCtx {
  /** Nível do invocador (model.meta.nivel ?? 1). */
  nivelInvocador: number
  /** Rank do invocador na rota `invocacao.porProficienciaEm` — UM rank pra
   *  invocação inteira (plugin tab-companheiros.ts:300-304; o
   *  `porProficienciaEm` de cada stat é declarativo e NÃO re-resolvido). */
  proficiencia: Proficiencia | null
  /** Valor atual de cada selector ({label: value}) — pra `porSeletor`. */
  selectores: Record<string, number>
}

/** Resolve UM `ValorEscalonado` (plugin resolve-invocacao.ts:40-88). */
export function resolveStat(valor: ValorEscalonado, ctx: InvocacaoCtx): number | string | null {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string') return valor

  if ('porNivel' in valor) {
    return pickByThreshold(valor.porNivel, ctx.nivelInvocador)
  }

  if ('porSeletor' in valor) {
    const selValue = ctx.selectores[valor.porSeletor]
    if (typeof selValue !== 'number') return null
    if (typeof valor.multiplicador === 'number') return selValue * valor.multiplicador
    if (valor.tabela) {
      const direct = valor.tabela[selValue]
      if (direct !== undefined) return direct
      return pickByThreshold(valor.tabela, selValue)
    }
    return selValue
  }

  if ('porProficiencia' in valor) {
    if (!ctx.proficiencia) return null
    const tabela = valor.porProficiencia
    const direct = tabela[ctx.proficiencia]
    if (direct !== undefined) return direct
    // Threshold por rank ordinal (maior chave <= rank atual) — defensivo
    // (plugin :71-84).
    const profNum = RANK_NUM[ctx.proficiencia]
    let bestRank: ProficienciaRank | null = null
    let bestNum = -1
    for (const rank of Object.keys(tabela) as ProficienciaRank[]) {
      const n = RANK_NUM[rank]
      if (n !== undefined && n <= profNum && n > bestNum) {
        bestRank = rank
        bestNum = n
      }
    }
    return bestRank ? (tabela[bestRank] ?? null) : null
  }

  return null
}

/** Maior chave numérica ≤ ref (plugin :92-106). */
function pickByThreshold(
  tabela: Record<string | number, number | string>,
  ref: number,
): number | string | null {
  let bestKey = -Infinity
  let bestVal: number | string | null = null
  for (const [k, v] of Object.entries(tabela)) {
    const kNum = Number(k)
    if (Number.isFinite(kNum) && kNum <= ref && kNum > bestKey) {
      bestKey = kNum
      bestVal = v
    }
  }
  return bestVal
}

/** Disponível quando tipo Invocação + bloco presente + rank ≥ mínima
 *  (sem mínima: qualquer rank ≠ N) — plugin :120-130. */
export function isInvocacaoDisponivel(
  desc: EffectDescriptor,
  ctx: { proficiencia: Proficiencia | null },
): boolean {
  if (desc.tipoEfeito !== 'Invocação' || !desc.invocacao) return false
  const minima = desc.invocacao.proficienciaMinima
  if (!minima) return ctx.proficiencia != null && ctx.proficiencia !== 'N'
  if (!ctx.proficiencia) return false
  return RANK_NUM[ctx.proficiencia as ProficienciaRank] >= RANK_NUM[minima]
}

export interface InvocacaoResolved {
  stats: Record<string, number | string>
  ataques: Array<{
    nome: string
    tipo: string
    bonus: number | string | null
    dano: number | string | null
  }>
}

/** Stat block completo resolvido (plugin :151-169). */
export function resolveInvocacao(desc: EffectDescriptor, ctx: InvocacaoCtx): InvocacaoResolved | null {
  if (!isInvocacaoDisponivel(desc, { proficiencia: ctx.proficiencia })) return null
  const inv = desc.invocacao!
  const stats: Record<string, number | string> = {}
  for (const [k, v] of Object.entries(inv.stats)) {
    const resolved = resolveStat(v, ctx)
    if (resolved != null) stats[k] = resolved
  }
  const ataques = inv.ataques.map((a) => ({
    nome: a.nome,
    tipo: a.tipo,
    bonus: resolveBonusRef(a.bonus),
    dano: a.dano != null ? resolveStat(a.dano, ctx) : null,
  }))
  return { stats, ataques }
}

/** number literal direto; {doInvocador: X} vira a string X (caller resolve
 *  consultando o herói) — plugin :171-182. */
function resolveBonusRef(bonus: number | { doInvocador: string } | undefined): number | string | null {
  if (bonus == null) return null
  if (typeof bonus === 'number') return bonus
  if (typeof bonus === 'object' && 'doInvocador' in bonus) return bonus.doInvocador
  return null
}

// ──────────────────────────────────────────────────────────────────────────
// Rota de magia → rank do herói (plugin tab-companheiros.ts:778-812)
// ──────────────────────────────────────────────────────────────────────────

interface EscolaRow {
  nome: string
  proficiencia: Proficiencia
  atributo: string
  bonusItem: number
  bonusEspecial: number
}

/** Escolas da PRIMÁRIA do FM salvo (Magias.Lista — nomes 'Arcana Branca'/
 *  'Arcana Negra'/'Anima'/'Tesouros', o equivalente do
 *  model.magias.proficiencias do plugin). */
function escolasOf(fm: Record<string, unknown>): Map<string, EscolaRow> {
  const out = new Map<string, EscolaRow>()
  const lista = (fmPath(fm, 'Magias', 'Lista') ?? []) as Record<string, unknown>[]
  if (!Array.isArray(lista)) return out
  for (const row of lista) {
    const nome = str(row['Nome'])
    if (!nome) continue
    const p = str(row['Proficiencia'])
    out.set(nome, {
      nome,
      proficiencia: p === 'A' || p === 'E' || p === 'M' ? p : 'N',
      atributo: str(row['Atributo']),
      bonusItem: num(row['Bonus_Item']),
      bonusEspecial: num(row['Bonus_Especial']),
    })
  }
  return out
}

/** Rota declarada no doc → escola do FM (plugin :783-789 e :717-721). */
function escolaDaRota(fm: Record<string, unknown>, rota: string): EscolaRow | null {
  const r = rota.toLowerCase().trim()
  const escolas = escolasOf(fm)
  if (r === 'magia arcana branca') return escolas.get('Arcana Branca') ?? null
  if (r === 'magia arcana negra') return escolas.get('Arcana Negra') ?? null
  if (r === 'magia anima' || r === 'magia arcana anima') return escolas.get('Anima') ?? null
  if (r === 'magia arcana tesouros') return escolas.get('Tesouros') ?? null
  return null
}

/** Rank do herói na rota; 'magia arcana' genérica = maior rank entre as
 *  escolas (plugin lookupRota :778-802 + maxRank :804-812). */
export function lookupRota(fm: Record<string, unknown>, rota: string | undefined): Proficiencia | null {
  if (!rota) return null
  const direta = escolaDaRota(fm, rota)
  if (direta && direta.proficiencia !== 'N') return direta.proficiencia
  if (rota.toLowerCase().trim() === 'magia arcana') {
    let best: Proficiencia = 'N'
    const order: Proficiencia[] = ['N', 'A', 'E', 'M']
    for (const e of escolasOf(fm).values()) {
      if (order.indexOf(e.proficiencia) > order.indexOf(best)) best = e.proficiencia
    }
    return best === 'N' ? null : best
  }
  return null
}

/** Invocações do herói: descritores tipo Invocação com rank ≥ mínima
 *  (plugin listInvocacoesDisponiveis :67-74). Aba fica oculta quando vazio. */
export function listInvocacoesDisponiveis(
  descriptors: readonly EffectDescriptor[],
  fm: Record<string, unknown>,
): EffectDescriptor[] {
  return descriptors.filter(
    (d) =>
      !d.sharedFrom &&
      isInvocacaoDisponivel(d, { proficiencia: lookupRota(fm, d.invocacao?.porProficienciaEm) }),
  )
}

// ──────────────────────────────────────────────────────────────────────────
// EV máximo (plugin computeEvMax :818-845)
// ──────────────────────────────────────────────────────────────────────────

const EV_MULT_RE = /(\d+)\s*[×x*]?\s*pot[eê]ncia/i

/** EV máximo pra dado PM — "5×potência" (Servo) parseado e multiplicado;
 *  fallback resolveStat; 0 sem EV declarado. */
export function computeEvMax(desc: EffectDescriptor, pm: number): number {
  const stats = desc.invocacao?.stats ?? {}
  for (const [k, v] of Object.entries(stats)) {
    if (!isEvKey(k)) continue
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const fromStr = evFromString(v, pm)
      if (fromStr !== null) return fromStr
    }
    const resolved = resolveStat(v, {
      nivelInvocador: 1,
      proficiencia: null,
      selectores: { 'Potência Mágica': pm, 'Potencia Magica': pm },
    })
    if (typeof resolved === 'number') return resolved
    if (typeof resolved === 'string') {
      const fromStr = evFromString(resolved, pm)
      if (fromStr !== null) return fromStr
    }
  }
  return 0
}

function evFromString(v: string, pm: number): number | null {
  const m = v.match(EV_MULT_RE)
  if (m) return Number(m[1]) * pm
  const n = v.match(/-?\d+/)
  if (n) return Number(n[0])
  return null
}

export function isEvKey(k: string): boolean {
  const norm = stripAccents(k).toLowerCase()
  return norm === 'ev' || norm === 'energia vital' || norm === 'vida' || norm === 'vitalidade'
}

// ──────────────────────────────────────────────────────────────────────────
// Bônus de ataque do invocador (plugin :681-753)
// ──────────────────────────────────────────────────────────────────────────

const PROF_LABEL: Record<Proficiencia, string> = {
  N: 'Nenhum',
  A: 'Adepto',
  E: 'Experiente',
  M: 'Mestre',
}

export interface BonusInfo {
  total: number
  /** Breakdown como tooltip do app (uma linha por fonte, padrão entriesTitle). */
  title: string
  /** Parcelas estruturadas (label+valor) pro tooltip rico no padrão do plugin
   *  (entriesBreakdown → renderBreakdownHtml) — mesmo conteúdo do title. */
  entries?: Array<{ label: string; value: number }>
}

/** Ataque Mágico do herói na escola da rota = PB(rank) + atributo + item +
 *  especialização (plugin computeMagiaAtaque :708-753). */
export function computeMagiaAtaque(fm: Record<string, unknown>, rota: string | undefined): BonusInfo | null {
  if (!rota) return null
  const escola = escolaDaRota(fm, rota)
  if (!escola || escola.proficiencia === 'N') return null
  const profBonus = PROF_BONUS[escola.proficiencia] ?? 0
  const attr = num(fmPath(fm, 'Atributos', escola.atributo))
  const total = profBonus + attr + escola.bonusItem + escola.bonusEspecial
  const entries: Array<{ label: string; value: number }> = [
    { label: escola.atributo, value: attr },
    { label: `${PROF_LABEL[escola.proficiencia]} (${rota})`, value: profBonus },
  ]
  if (escola.bonusItem !== 0) entries.push({ label: 'Item', value: escola.bonusItem })
  if (escola.bonusEspecial !== 0) entries.push({ label: 'Especialização', value: escola.bonusEspecial })
  const lines = entries.map((e) => `${e.label} ${signed(e.value)}`)
  return { total, title: `Ataque Mágico ${signed(total)}\n${lines.join('\n')}`, entries }
}

/** number literal → breakdown simples; "MagiaAtaque"/"AtaqueMagico" →
 *  computeMagiaAtaque; outras strings → null (plugin resolveAttackBonus
 *  :681-704). */
export function resolveAttackBonus(
  bonus: number | string | null,
  fm: Record<string, unknown>,
  desc: EffectDescriptor,
): BonusInfo | null {
  if (bonus == null) return null
  if (typeof bonus === 'number') {
    return { total: bonus, title: `Bônus de ataque ${signed(bonus)}` }
  }
  const norm = stripAccents(bonus).toLowerCase().trim()
  if (norm === 'magiaataque' || norm === 'ataquemagico') {
    return computeMagiaAtaque(fm, desc.invocacao?.porProficienciaEm)
  }
  return null
}

/** Tooltip do dano: dano BASE = entry "A" da tabela porProficiencia + delta
 *  em dados extras pro rank atual (plugin buildDanoBreakdown :612-657). */
export function buildDanoTitle(
  at: { nome: string; dano: number | string | null },
  desc: EffectDescriptor,
  fm: Record<string, unknown>,
): string | null {
  if (at.dano == null) return null
  const decl = desc.invocacao?.ataques.find((x) => x.nome === at.nome)
  const tabela =
    decl?.dano && typeof decl.dano === 'object' && 'porProficiencia' in decl.dano
      ? (decl.dano as { porProficiencia: Record<string, string | number> }).porProficiencia
      : null
  const baseDano = tabela?.['A'] != null ? String(tabela['A']) : String(at.dano)
  const rotaProf = lookupRota(fm, desc.invocacao?.porProficienciaEm)
  const rankAtual: 'A' | 'E' | 'M' = rotaProf === 'E' || rotaProf === 'M' ? rotaProf : 'A'
  const lines = [`${at.nome} — Dano`, `Base ${baseDano}`]
  if (tabela && rankAtual !== 'A' && String(at.dano) !== baseDano) {
    const delta = computeDanoDelta(baseDano, String(at.dano))
    if (delta) lines.push(`${PROF_LABEL[rankAtual]} +${delta}`)
  }
  return lines.join('\n')
}

/** "1d4+2" → "3d4+2" = "2d4" (delta em dados extras; plugin :663-674). */
export function computeDanoDelta(base: string, atual: string): string | null {
  const rx = /^(\d+)d(\d+)([+-]\d+)?$/
  const mb = rx.exec(base.trim())
  const ma = rx.exec(atual.trim())
  if (!mb || !ma) return null
  if (Number(mb[2]) !== Number(ma[2])) return null
  const deltaN = Number(ma[1]) - Number(mb[1])
  if (deltaN <= 0) return null
  return `${deltaN}d${ma[2]}`
}

// ──────────────────────────────────────────────────────────────────────────
// Display dos stats (plugin renderStatsGrouped :375-389 + statEmoji :852-863)
// ──────────────────────────────────────────────────────────────────────────

/** Linhas canônicas do card (plugin :379-380); remanescentes numa 3ª linha. */
export const INVOC_STATS_ROWS: readonly (readonly string[])[] = [
  ['Defesa', 'Vigor', 'Evasão', 'Ímpeto'],
  ['Percepção', 'Movimento'],
]

export function matchStatKey(stats: Record<string, unknown>, wanted: string): string | null {
  const wnorm = stripAccents(wanted).toLowerCase()
  for (const k of Object.keys(stats)) {
    if (stripAccents(k).toLowerCase() === wnorm) return k
  }
  return null
}

/** Emoji do stat do registro gerado (mapa do plugin statEmoji :852-863 —
 *  Evasão usa o emoji de Reflexo). */
export function invocStatEmoji(stat: string): string {
  const norm = stripAccents(stat).toLowerCase()
  if (norm === 'defesa') return tokens.emojis.defesa.Defesa
  if (norm === 'vigor') return tokens.emojis.defesa.Vigor
  if (norm === 'reflexo' || norm === 'evasao') return tokens.emojis.defesa.Reflexo
  if (norm === 'impeto') return tokens.emojis.defesa.Impeto
  if (norm === 'percepcao') return tokens.emojis.categoria.Percepcao
  if (norm === 'intuicao') return tokens.emojis.categoria.Intuicao
  if (norm === 'movimento') return tokens.emojis.subcategoria.Movimento
  return ''
}

/** Sentidos (Percepção/Intuição) com sinal explícito; resto cru (plugin
 *  formatStatValue :869-877). */
export function formatStatValue(wanted: string, raw: number | string): string {
  if (typeof raw === 'string') return raw
  const norm = stripAccents(wanted).toLowerCase()
  if (norm === 'percepcao' || norm === 'intuicao') return signed(raw)
  return String(raw)
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
