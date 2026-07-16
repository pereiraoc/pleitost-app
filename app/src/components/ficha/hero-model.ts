// Leitura do MODELO SALVO do herói (frontmatter gravado pelo plugin
// pleitost-autosheet) → dados prontos pros slots do design. Projeção pura:
// nada aqui recomputa regras — só espelha fórmulas documentadas do plugin
// (mod = atributo + bônus de proficiência + bônus de item + bônus especial;
// defesas = 10 + mod; movimento = 4 + mod), as mesmas do script do design.
import type { VaultDoc } from '../../data/types'
import { linkLabel } from '../../markdown/dataview-value'
import { PROF_BONUS, RANK_ORDER, TIER_NOME, type RankLetter, type RankStateKey } from './registry'

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** Alvo de um wikilink ("[[A/B|C]]" → "A/B"); string plana volta intacta. */
export function wikiTarget(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = WIKILINK.exec(value)
  return (match ? match[1]! : value).trim()
}

export function fmOf(doc: VaultDoc | undefined): Record<string, unknown> {
  return (doc?.frontmatter ?? {}) as Record<string, unknown>
}

/** Acesso aninhado tolerante ("Inventario.Armas.Lista"). */
export function fmPath(fm: Record<string, unknown>, ...path: string[]): unknown {
  let cur: unknown = fm
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function signed(n: number): string {
  return (n >= 0 ? '+' : '') + n
}

/** Nome exibido do herói: FM nome, senão basename (regra do plugin). */
export function heroNome(doc: VaultDoc): string {
  const nome = fmOf(doc)['nome']
  return typeof nome === 'string' && nome.trim() ? nome : (doc.basename ?? doc.id)
}

/** Valores de atributo do FM (Atributos.FOR/AGI/INT/PRE + Principal). */
export function heroAtributos(fm: Record<string, unknown>): {
  values: Record<string, number>
  principal: string
} {
  const at = (fm['Atributos'] ?? {}) as Record<string, unknown>
  return {
    values: { FOR: num(at['FOR']), AGI: num(at['AGI']), INT: num(at['INT']), PRE: num(at['PRE']) },
    principal: str(at['Principal']),
  }
}

/** Linha padrão de proficiência do modelo salvo (Perícias/Ofícios/Defesas/…). */
export interface ProfRow {
  Nome?: string
  Atributo?: string
  Proficiencia?: string
  Bonus_Item?: number
  Bonus_Especial?: number
  Especializacao?: string
  Maestria?: string
  Complemento?: string
  Incrementos?: Array<Record<string, unknown>>
}

export function profLetter(row: ProfRow): RankLetter {
  const p = row.Proficiencia
  return p === 'A' || p === 'E' || p === 'M' ? p : 'N'
}

/** mod = atributo + PB(proficiência) + bônus de item + bônus especial. */
export function rowMod(row: ProfRow, attrs: Record<string, number>): number {
  return (
    (attrs[row.Atributo ?? ''] ?? 0) +
    PROF_BONUS[profLetter(row)] +
    num(row.Bonus_Item) +
    num(row.Bonus_Especial)
  )
}

/** Mod de OFÍCIO (#33): como rowMod, mas o atributo SÓ conta com prof ≥ A —
 *  espelho do buildOficioBreakdown do plugin (modificadores.ts:577-594). Ofício
 *  N com atributo ≠ 0 não soma o atributo (caixa = breakdown). */
export function oficioMod(row: ProfRow, attrs: Record<string, number>): number {
  const prof = profLetter(row)
  const attrApplies = prof === 'A' || prof === 'E' || prof === 'M'
  return (
    (attrApplies ? (attrs[row.Atributo ?? ''] ?? 0) : 0) +
    PROF_BONUS[prof] +
    num(row.Bonus_Item) +
    num(row.Bonus_Especial)
  )
}

/** Fonte de um incremento do modelo ("Slot.A" | "Regra.[[X]]" | "Passado" | "Escolha.[[X]]" | "Tesouro.[[X]]"). */
export interface IncrementoFonte {
  kind: 'Slot' | 'Regra' | 'Passado' | 'Escolha' | 'Tesouro' | 'Outro'
  target: string
}
export function parseFonte(raw: unknown): IncrementoFonte {
  const s = str(raw)
  const dot = s.indexOf('.')
  const head = dot === -1 ? s : s.slice(0, dot)
  const rest = dot === -1 ? '' : s.slice(dot + 1)
  const kind =
    head === 'Slot' || head === 'Regra' || head === 'Passado' || head === 'Escolha' || head === 'Tesouro'
      ? head
      : 'Outro'
  return { kind, target: wikiTarget(rest) }
}

/**
 * Estados N/A/E/M pro modo edição, derivados de Proficiencia + Incrementos:
 * rank atual → sólido (sel se veio de Slot, selRule se de Regra/Passado);
 * ranks intermediários → contorno (selSlot/ruleSlot); N já ultrapassado →
 * passN; rank não alcançado → off. Sem incremento registrado num degrau
 * intermediário assume concessão por regra (ruleSlot) — é como o design
 * pinta Defesas/Sentidos, cuja proficiência vem de regra sem incremento.
 */
export function rankStates(row: ProfRow): Record<RankLetter, RankStateKey> {
  const cur = profLetter(row)
  const curIdx = RANK_ORDER.indexOf(cur)
  const srcByLetter: Partial<Record<RankLetter, 'slot' | 'rule'>> = {}
  for (const inc of row.Incrementos ?? []) {
    for (const [key, value] of Object.entries(inc)) {
      if (!(RANK_ORDER as string[]).includes(key)) continue
      const fonte = parseFonte(value)
      srcByLetter[key as RankLetter] = fonte.kind === 'Slot' ? 'slot' : 'rule'
    }
  }
  const out = {} as Record<RankLetter, RankStateKey>
  for (const letter of RANK_ORDER) {
    const i = RANK_ORDER.indexOf(letter)
    if (i > curIdx) out[letter] = 'off'
    else if (i === curIdx) {
      if (letter === 'N') out[letter] = 'selN'
      else out[letter] = srcByLetter[letter] === 'slot' ? 'sel' : 'selRule'
    } else if (letter === 'N') out[letter] = 'passN'
    else out[letter] = srcByLetter[letter] === 'slot' ? 'selSlot' : 'ruleSlot'
  }
  return out
}

/** Entrada de lista "wikilink: fonte" ({"[[X|Y]]": "Regra.[[Z]]"}). */
export interface ListaEntry {
  raw: string
  label: string
  target: string
  fonte: IncrementoFonte
}
export function listaEntries(lista: unknown): ListaEntry[] {
  if (!Array.isArray(lista)) return []
  const out: ListaEntry[] = []
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      out.push({ raw: key, label: linkLabel(key), target: wikiTarget(key), fonte: parseFonte(value) })
    }
  }
  return out
}

/** "[[Experiente]]"/"(Experiente)" → 'E' (tier de categoria de item, como no plugin). */
export function tierLetter(categoria: unknown): 'A' | 'E' | 'M' | null {
  const label = linkLabel(str(categoria)) || str(categoria)
  if (/Adept/i.test(label)) return 'A'
  if (/Experiente/i.test(label)) return 'E'
  if (/Mestre/i.test(label)) return 'M'
  return null
}

/** Alias de tesouro/consumível "Nome (Adepto) (x3)" → partes. */
export function parseItemAlias(value: unknown): {
  nome: string
  tier: 'A' | 'E' | 'M' | null
  qtd: number
} {
  const label = linkLabel(str(value))
  const qtdMatch = /\(x(\d+)\)\s*$/.exec(label)
  const semQtd = label.replace(/\s*\(x\d+\)\s*$/, '')
  const tierMatch = /\((Adepto|Adepta|Experiente|Mestre)\)\s*$/.exec(semQtd)
  const nome = semQtd.replace(/\s*\((Adepto|Adepta|Experiente|Mestre)\)\s*$/, '').trim()
  return {
    nome,
    tier: tierMatch ? tierLetter(`(${tierMatch[1]})`) : null,
    qtd: qtdMatch ? Number(qtdMatch[1]) : 1,
  }
}

/** Inverso de tierLetter pro overlay: letra → Categoria como o FM grava
 *  ("[[Adepto]]"/"[[Experiente]]"/"[[Mestre]]"; '' limpa a qualidade). */
export function tierCategoriaFm(tier: '' | 'A' | 'E' | 'M'): string {
  return tier ? `[[${TIER_NOME[tier]}]]` : ''
}

/** Bônus de item por tier de QUALIDADE da arma — VERBATIM do RANK_BONUS_ITEM
 *  do plugin (extract/apply-armas-edit.ts:31): "Adepto +1, Experiente +2,
 *  Mestre +3, null (sem tier) = 0". */
export const RANK_BONUS_ITEM: Record<'A' | 'E' | 'M', number> = { A: 1, E: 2, M: 3 }

/** Propriedade Obra-prima automática ao ranquear item sem propriedade —
 *  arma: plugin apply-armas-edit.ts:157; armadura: apply-equipamentos-edit.ts:80. */
export const ARMA_OBRA_PRIMA = '[[Arma Obra-prima|Obra-prima]]'
export const ARMADURA_OBRA_PRIMA = '[[Armadura Obra-prima|Obra-prima]]'

/** Obra-prima do escudo pelo nome — espelha resolveObraPrimaTarget do plugin
 *  (apply-equipamentos-edit.ts:31-36: label contém "broquel" → Broquel). */
export function escudoObraPrima(nome: unknown): string {
  const label = linkLabel(str(nome)) || str(nome)
  return label.toLowerCase().includes('broquel')
    ? '[[Broquel Obra-prima|Obra-prima]]'
    : '[[Escudo Obra-prima|Obra-prima]]'
}

/** Atributo derivado da arma — espelha deriveArmaAtributo do plugin
 *  (extract/apply-armas-edit.ts:44-58): d-marcial/d-simples → AGI; qualquer
 *  outro grupo (cac-simples/cac-marcial/especial/natural) com Precisa →
 *  AGI se AGI > FOR, senão FOR (empate → FOR, :55); senão FOR. Só "Precisa"
 *  influencia — Arremesso/Força X/Ágil/etc. não entram (:51). Sem arma
 *  (grupo/propriedades vazios) → FOR, como o `if (!info) return "FOR"` do
 *  plugin (:48). Derivação acontece SÓ ao escolher a arma no dropdown
 *  (equipamentos-section.ts:186-203, batch nome+atributo); o render mostra
 *  sempre o Atributo SALVO no modelo (equipamentos-section.ts:167), nunca
 *  re-deriva. Não há escolha manual de FOR/AGI na UI do plugin
 *  (setArmaAtributo só é alcançável pelo path do batch do dropdown).
 *  `propriedades` aceita a string inline `propriedades::` do doc da arma. */
export function deriveArmaAtributo(
  grupo: unknown,
  propriedades: unknown,
  atributos: Record<string, number>,
): string {
  const g = str(grupo).toLowerCase()
  if (g === 'd-marcial' || g === 'd-simples') return 'AGI'
  // Base v2: `propriedades` é ARRAY no frontmatter; v1 era string inline.
  const propStr = (Array.isArray(propriedades) ? propriedades.map(str).join(' ') : str(propriedades)).toLowerCase()
  if (propStr.includes('precisa')) {
    return num(atributos['AGI']) > num(atributos['FOR']) ? 'AGI' : 'FOR'
  }
  return 'FOR'
}

/** Alias de tesouro no formato do FM salvo — espelha addTesouro/setTesouroTier
 *  do plugin (apply-tesouros-edit.ts:44-46 e :73-77): `[[X|X (Adepto)]]`,
 *  sempre basename, sem sufixo de quantidade. */
export function buildTesouroAlias(nome: string, tier: 'A' | 'E' | 'M'): string {
  return `[[${nome}|${nome} (${TIER_NOME[tier]})]]`
}

/** Inverso de parseItemAlias pro overlay: alias de consumível/tesouro no
 *  formato do FM salvo ("[[Poção de Cura|Poção de Cura (Adepto) (x2)]]"). */
export function buildItemAlias(nome: string, tier: 'A' | 'E' | 'M', qtd: number): string {
  return `[[${nome}|${nome} (${TIER_NOME[tier]}) (x${qtd})]]`
}

/** Slots restantes/máx por rank ("A 0/4") a partir de Slots + usos Slot.X. */
export function slotsInfo(
  slots: unknown,
  usedBy: (letter: string) => number,
  letters: string[],
): { letter: string; label: string }[] {
  const s = (slots ?? {}) as Record<string, unknown>
  return letters.map((letter) => {
    const max = num(s[letter])
    const remaining = Math.max(0, max - usedBy(letter))
    return { letter, label: `${letter} ${remaining}/${max}` }
  })
}

/** "usos_<tier>" → máx de usos ("1/10min" → 1); passivo/ausente → null. */
export function usosMax(freq: unknown): number | null {
  const f = str(freq).trim()
  if (!f || /^passivo$/i.test(f)) return null
  const n = parseInt(f, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

const TIER_FIELD: Record<'A' | 'E' | 'M', string> = { A: 'adepto', E: 'experiente', M: 'mestre' }

/** Lê um campo do doc: FRONTMATTER primeiro (base v2), fallback pro inline (v1). */
export function docField(doc: VaultDoc | undefined, key: string): unknown {
  if (!doc) return undefined
  const fm = doc.frontmatter as Record<string, unknown> | undefined
  const inl = doc.inlineFields as Record<string, unknown> | undefined
  const fv = fm?.[key]
  return fv !== undefined && fv !== null ? fv : inl?.[key]
}

/** Campo POR TIER: v2 = objeto aninhado no frontmatter (`bonus: {adepto,…}`);
 *  v1 = inline `bonus_adepto` flat. */
function docTierField(doc: VaultDoc, field: string, tier: 'A' | 'E' | 'M'): unknown {
  const word = TIER_FIELD[tier]
  const obj = (doc.frontmatter as Record<string, unknown> | undefined)?.[field]
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const v = (obj as Record<string, unknown>)[word]
    if (v !== undefined && v !== null) return v
  }
  return (doc.inlineFields as Record<string, unknown> | undefined)?.[`${field}_${word}`]
}

/** usos_<tier> do doc do tesouro/imbuição (v2 aninhado / v1 flat). */
export function usosPorTier(doc: VaultDoc | undefined, tier: 'A' | 'E' | 'M'): number | null {
  if (!doc) return null
  return usosMax(docTierField(doc, 'usos', tier))
}

/** Freq TEXTUAL de usos_<tier> ("1/10min", "1/dia") — a regra de Descanso
 *  (descanso.ts) decide restauração pelo sufixo, como o plugin
 *  (acoes-descanso.ts:aplicarDescansoNosUsos). passivo/ausente → null. */
export function usosFreqPorTier(doc: VaultDoc | undefined, tier: 'A' | 'E' | 'M'): string | null {
  if (!doc) return null
  const f = str(docTierField(doc, 'usos', tier)).trim()
  return f && usosMax(f) !== null ? f : null
}

/** cargas_<tier> N do doc (Focos/Implementos) — contador iniciado em 0. */
export function cargasPorTier(doc: VaultDoc | undefined, tier: 'A' | 'E' | 'M'): number | null {
  if (!doc) return null
  const n = parseInt(str(docTierField(doc, 'cargas', tier)), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** bonus_<tier> "+2" do doc do tesouro → 2 (coluna ITEM BÔNUS do design). */
export function bonusPorTier(doc: VaultDoc | undefined, tier: 'A' | 'E' | 'M'): number {
  if (!doc) return 0
  const n = parseInt(str(docTierField(doc, 'bonus', tier)).replace('+', ''), 10)
  return Number.isFinite(n) ? n : 0
}

/** `dano::` da arma ("d4+2" / "2d6" / "3") → componentes numéricos —
 *  espelha o parse de calcDanoArma do plugin (util/modificadores.ts). */
export function parseDanoArma(dano: unknown): { dice: number; die: number; offset: number } {
  const s = str(dano).trim().replace(/\s+/g, '')
  const m = /^(\d+)?d(\d+)([+-]\d+)?$/i.exec(s)
  if (m) {
    return {
      dice: m[1] ? Number(m[1]) : 1,
      die: Number(m[2]),
      offset: m[3] ? Number(m[3]) : 0,
    }
  }
  const n = parseInt(s, 10)
  return { dice: 0, die: 0, offset: Number.isFinite(n) ? n : 0 }
}

/** Dados extras de dano por proficiência — VERBATIM do PROF_DICE do plugin. */
export const PROF_DICE: Record<string, number> = { N: 0, A: 0, E: 1, M: 2 }

/** Display do dano da arma pela proficiência de ataque — espelha
 *  calcDanoArma do plugin: (baseDice + PROF_DICE[prof])d(die) + offset.
 *  Dano sem dado (ou vazio) volta como veio. */
export function danoArmaDisplay(dano: unknown, prof: string): string {
  const { dice, die, offset } = parseDanoArma(dano)
  if (!die) return str(dano).trim()
  const total = dice + (PROF_DICE[prof] ?? 0)
  return `${total}d${die}${offset > 0 ? `+${offset}` : offset < 0 ? String(offset) : ''}`
}

/** Dano BASE de Ataque de Oportunidade — regra documentada no plugin
 *  (util/ataque-oportunidade.ts): "o dano causado é somente o dano base
 *  da arma [só o offset]. Caso você seja Mestre com a arma, adicione um
 *  dado de dano da arma". Projeção do modelo salvo: efeitos/condições
 *  (dados extras, passo de dado) não entram. Elegibilidade (grupo da
 *  arma + prof ≥ Adepto) é checada pelo caller via ADO_GRUPOS. */
export function adoBase(dano: unknown, prof: string): string {
  const { die, offset } = parseDanoArma(dano)
  const diceCount = prof === 'M' ? 1 : 0
  if (diceCount === 0 || !die) return String(offset)
  return `${diceCount}d${die}${offset > 0 ? `+${offset}` : offset < 0 ? String(offset) : ''}`
}

/** Totais de Experiência do modelo salvo (chips 🟨/💠 da topbar e pips
 *  da aba EXPERIÊNCIA): reconhecimentos preenchidos sobre 3 pips e soma
 *  de marcas sobre a régua de 10 diamantes com unit por nível (plugin:
 *  1:1 até nível 3, 10:1 depois). */
export function experienciaTotais(fm: Record<string, unknown>): {
  recon: number
  reconMax: number
  marcas: number
  marcasMax: number
} {
  const exp = (fm['Experiencia'] ?? {}) as Record<string, unknown>
  const recs = Array.isArray(exp['Reconhecimentos'])
    ? (exp['Reconhecimentos'] as Record<string, unknown>[])
    : []
  const recon = recs.filter((r) => str(r['entidade']).trim() || str(r['texto']).trim()).length
  const marcasList = Array.isArray(exp['Marcas']) ? (exp['Marcas'] as Record<string, unknown>[]) : []
  const marcas = marcasList.reduce((sum, m) => sum + Math.max(0, num(m['qtd'])), 0)
  const unit = num(fm['Nível']) <= 3 ? 1 : 10
  return { recon, reconMax: 3, marcas, marcasMax: unit * 10 }
}

/** Recursos correntes salvos pela Interativa (Recursos_Restantes / Usos_Recursos). */
export function interativa(fm: Record<string, unknown>): {
  restantes: Record<string, unknown>
  usos: Record<string, unknown>
  condicoes: Record<string, unknown>
  imunidades: Record<string, unknown>
} {
  const inter = (fm['Interativa'] ?? {}) as Record<string, unknown>
  return {
    restantes: (inter['Recursos_Restantes'] ?? {}) as Record<string, unknown>,
    usos: (inter['Usos_Recursos'] ?? {}) as Record<string, unknown>,
    condicoes: (inter['Condicoes_Ativas'] ?? {}) as Record<string, unknown>,
    imunidades: (inter['Imunidades'] ?? {}) as Record<string, unknown>,
  }
}

/** Nome curto de sintonia — espelha shortSintoniaName do plugin. */
export function shortSintonia(value: unknown): string {
  const label = linkLabel(str(value))
  const m = /^Traço Elemental d[aeo]\s+(.+)$/i.exec(label)
  return m ? m[1]!.trim() : label
}

/** Nome curto de subclasse — espelha shortSubclassName do plugin ("X (Y)" → "Y"). */
export function shortSubclass(value: unknown): string {
  const label = linkLabel(str(value))
  const m = /\(([^)]+)\)\s*$/.exec(label)
  return m ? m[1]!.trim() : label
}
