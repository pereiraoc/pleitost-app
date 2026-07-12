// Merge dos `calculatedRuleElements` no FM SALVO → FM DERIVADO (mesmo shape),
// pro render LIVE do Editável no app. PORTA de mergeCalculatedIntoModel do
// plugin (src/extract/merge-calculated-into-model.ts) + merge-setters.ts +
// merge-list-utils.ts + apply-principal-constraint.ts, operando DIRETO no FM
// (as abas leem `fmPath(fm, …)`, então o derivado precisa ser FM-shaped).
//
// DIFERENÇA DELIBERADA vs o plugin (documentada): o plugin faz wipe TOTAL das
// saídas de regra e regenera do zero (mergeCalculatedIntoModel:106-109). No
// app o `calculated` é uma projeção PARCIAL (só o que as regras ADICIONAM —
// proficiências-base de equipamento como Armas.Simples=P NÃO reaparecem no
// calculated), então wipe destrutivo corromperia o FM materializado. Aqui o
// merge é NÃO-destrutivo (upsert/upgrade): preserva os incrementos do usuário
// (Slot/Passado/Manual) e da base, e SOBREPÕE as adições de regra marcadas
// `Regra.[[…]]`. Consequência: destravar uma escolha ao vivo (unpick) deixa a
// saída antiga até um novo save materializar — trade-off aceitável porque o
// FM salvo é a base autoritativa e o fluxo primário é CONSTRUIR a ficha.
import type { ParsedRule } from './rule-types'

type Fm = Record<string, unknown>
type IncEntry = Record<string, string>
type Row = Record<string, unknown>

const RANK_ORDER: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
const RANK_FROM: Array<'N' | 'A' | 'E' | 'M'> = ['N', 'A', 'E', 'M']
const RANKS = new Set(['A', 'E', 'M'])

function slugify(s: string): string {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
}

/** Espelho de isRuleSource (plugin util/source-classification.ts): fonte
 *  `Regra*` é saída de regra (regenerável); Slot/Passado/Manual/Tesouro é
 *  estado do usuário/base (preservado). */
function isRuleSource(src: string): boolean {
  return src.startsWith('Regra')
}

/** Espelho de canonicalSourceTyped (plugin merge-calculated-into-model.ts:
 *  273-282): `Escolha.…` passa direto; senão `Tipo.[[basename]]`. */
function canonicalSource(sourceNote: string, type: 'Regra' | 'Tesouro'): string {
  if (sourceNote.startsWith('Escolha.')) return sourceNote
  const last = sourceNote.split('/').pop() ?? sourceNote
  const base = last.replace(/\.md$/i, '')
  return `${type}.[[${base}]]`
}

/** Chave única de um incremento FM (`{ [rank|field]: source }` tem 1 chave). */
function incKey(e: IncEntry): string {
  return Object.keys(e)[0] ?? ''
}

function incsOf(row: Row): IncEntry[] {
  if (!Array.isArray(row.Incrementos)) row.Incrementos = []
  return row.Incrementos as IncEntry[]
}

/** Upsert de incremento de RANK — espelho de upsertIncrement
 *  (plugin merge-setters.ts:676-687): promove a fonte do rank existente ou
 *  adiciona `{ [rank]: source }`. */
function upsertRankInc(incs: IncEntry[], rank: 'A' | 'E' | 'M', source: string): void {
  const existing = incs.find((e) => incKey(e) === rank)
  if (existing) existing[rank] = source
  else incs.push({ [rank]: source })
}

/** Upsert de incremento de CAMPO (`Bonus_Item`/`Bonus_Especial`) — espelho de
 *  upsertFieldIncrement (plugin merge-setters.ts). */
function upsertFieldInc(incs: IncEntry[], field: string, source: string): void {
  const existing = incs.find((e) => incKey(e) === field)
  if (existing) existing[field] = source
  else incs.push({ [field]: source })
}

/** Rank máximo entre os incrementos de rank — espelho de recompute em
 *  refreshDerivedProficiencias (plugin merge-calculated-into-model.ts:654-673). */
function maxRankFromIncs(incs: IncEntry[]): 'N' | 'A' | 'E' | 'M' {
  let max = 0
  for (const e of incs) {
    const k = incKey(e)
    if (!RANKS.has(k)) continue
    const r = RANK_ORDER[k] ?? 0
    if (r > max) max = r
  }
  return RANK_FROM[max]
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(String(v).trim()) || 0
}

function maxRank(a: string, b: string): string {
  return (RANK_ORDER[a] ?? 0) >= (RANK_ORDER[b] ?? 0) ? a : b
}

/** Materializa `__alias__<Target>` → `<Target>` wikilink — espelho de
 *  materializeAliasDeltas (plugin merge-calculated-into-model.ts:301-391).
 *  Fragmentos ordenados viram `[[base|display]]` (base = 1º fragmento). */
function materializeAlias(calc: Fm): Fm {
  const out: Fm = { ...calc }
  for (const key of Object.keys(out)) {
    if (!key.startsWith('__alias__')) continue
    const target = key.slice('__alias__'.length)
    const value = out[key]
    delete out[key]
    let wikilink: string | null = null
    if (typeof value === 'string') {
      wikilink = value
    } else if (Array.isArray(value)) {
      const raw = (value as Array<{ order: number; fragment: string }>)
        .filter((f) => f && f.fragment && f.fragment.length > 0)
        .slice()
        .sort((a, b) => a.order - b.order)
      if (raw.length > 0) {
        const base = raw[0].fragment
        const perOrder = new Map<number, string>()
        for (const f of raw) perOrder.set(f.order, f.fragment)
        const display = [...perOrder.entries()].sort((a, b) => a[0] - b[0]).map(([, f]) => f).join(' ')
        wikilink = base === display ? `[[${base}]]` : `[[${base}|${display}]]`
      }
    }
    if (wikilink) out[target] = wikilink
  }
  return out
}

/** targetRaw → fonte canônica das rules aplicadas (espelho de deltaSources.
 *  byValue do plugin, reconstruído do appliedRules: última rule que escreveu
 *  o target vence, como o tracking incremental do applier). */
function buildSourceByTarget(appliedRules: ParsedRule[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of appliedRules) {
    const a = r.action
    const targetRaw = 'targetRaw' in a ? (a as { targetRaw?: string }).targetRaw : undefined
    if (!targetRaw) continue
    const type = targetRaw.startsWith('Magias.Lista.Tesouros') ? 'Tesouro' : 'Regra'
    out.set(targetRaw, canonicalSource(r.sourceNote, type))
  }
  return out
}

// ─── acesso a listas do FM ───────────────────────────────────────────────

function ensureObj(parent: Fm, key: string): Fm {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {}
  return parent[key] as Fm
}

function ensureListaRows(fm: Fm, ...path: string[]): Row[] {
  let cur: Fm = fm
  for (let i = 0; i < path.length - 1; i++) cur = ensureObj(cur, path[i])
  const last = path[path.length - 1]
  if (!Array.isArray(cur[last])) cur[last] = []
  return cur[last] as Row[]
}

const WIKILINK_TARGET = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/
function wikiTarget(s: string): string {
  const m = s.match(WIKILINK_TARGET)
  return m ? m[1].trim() : s.trim()
}

/** Espelho de appendMergeFontedList (plugin merge-list-utils.ts:67-161),
 *  variante NÃO-destrutiva sobre a lista FM (`[{ [link]: source }]`):
 *  preserva TODOS os itens salvos, adiciona os itens de regra ainda ausentes
 *  (fonte explícita do item, ex. `Escolha.[[pai]]`, senão `Regra`). */
function appendMergeFmList(rows: Row[], items: unknown[]): void {
  const present = new Set<string>()
  for (const row of rows) {
    const k = Object.keys(row)[0]
    if (k) present.add(wikiTarget(k))
  }
  for (const it of items) {
    let link: string
    let source = 'Regra'
    if (typeof it === 'string') link = it
    else if (it && typeof it === 'object' && 'link' in it) {
      link = String((it as { link: unknown }).link)
      const s = (it as { source?: unknown }).source
      if (typeof s === 'string' && s) source = s
    } else continue
    const target = wikiTarget(link)
    if (!target || present.has(target)) continue
    present.add(target)
    rows.push({ [link]: source })
  }
}

/** #51 (espelho de pruneOrphanedChoices): remove das linhas SALVAS as entradas
 *  rule-derived (fonte `Regra…`/`Escolha…`) cujo alvo NÃO está mais no
 *  `calculated` — ou seja, a regra/escolha que as concedeu não fira mais
 *  (unpick, ou condição deixou de valer). Preserva Slot/Passado/Manual/Tesouro
 *  (usuário/base) e tudo que segue valendo. Seguro só nas listas FONTEADAS
 *  (Habilidades/Técnicas/Ações/Magias), onde toda adição de regra reaparece no
 *  `calculated` — proficiências-base não passam por aqui. */
function pruneOrphanedRuleEntries(rows: Row[], calculatedItems: unknown[]): void {
  const alive = new Set<string>()
  for (const it of calculatedItems) {
    const link = typeof it === 'string' ? it : (it as { link?: unknown })?.link
    if (typeof link === 'string') alive.add(wikiTarget(link))
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const entry = Object.entries(rows[i])[0]
    if (!entry) continue
    const [link, source] = entry
    const ruleDerived = typeof source === 'string' && /^(Regra|Escolha)(\.|$)/.test(source)
    if (ruleDerived && !alive.has(wikiTarget(link))) rows.splice(i, 1)
  }
}

// ─── proficiência das listas (perícias/ofícios) ──────────────────────────

const PROF_FIELD_SCALAR: Record<string, string> = {
  Bonus_Item: 'Bonus_Item',
  Bonus_Especial: 'Bonus_Especial',
}

function findRowBySlug(rows: Row[], name: string): Row | undefined {
  return rows.find((r) => slugify(String(r.Nome)) === name) ?? rows.find((r) => String(r.Nome) === name)
}

/** Aplica um delta de campo numa linha de perícia/ofício (com incrementos). */
function applyProfListField(row: Row, field: string, value: unknown, source: string): void {
  const incs = incsOf(row)
  if (field === 'Proficiencia') {
    const rank = String(value).trim().toUpperCase()
    if (rank === 'A' || rank === 'E' || rank === 'M') upsertRankInc(incs, rank, source)
    return
  }
  if (field in PROF_FIELD_SCALAR) {
    row[field] = num(value)
    upsertFieldInc(incs, field, source)
    return
  }
  // Atributo/Especializacao/Maestria/Complemento — escalar sem incremento.
  row[field] = value
}

/** Aplica um delta de campo numa linha de defesa/sentido/movimento (SEM
 *  incrementos no FM — a proficiência escalar é `allRuleDriven` no render, o
 *  que já pinta os degraus de OURO). Upgrade de rank (nunca rebaixa). */
function applyScalarRowField(row: Row, field: string, value: unknown): void {
  if (field === 'Proficiencia') {
    row.Proficiencia = maxRank(String(row.Proficiencia ?? 'N'), String(value).trim().toUpperCase())
    return
  }
  if (field === 'Bonus_Item' || field === 'Bonus_Especial') {
    row[field] = num(value)
    return
  }
  row[field] = value
}

const PROF_TARGET_RX =
  /^(Pericias|Oficios|Defesas_Resistencias|Sentidos|Movimento)\.Lista\.([^.]+)\.([^.]+)$/
const LISTA_ARRAY_RX = /^(Pericias|Oficios|Defesas_Resistencias|Sentidos|Movimento)\.Lista$/
const MAGIA_ESCOLA_FIELD_RX = /^Magias\.Lista\.([^.]+)\.([^.]+)$/
const SLOT_RX = /^(Pericias|Tecnicas|Magias)\.Slots\.([BAEM])$/
const EQUIP_ARMAS_RX = /^Inventario\.Armas\.Proficiencia\.(Simples|Marciais)$/
const EQUIP_ARMADURA_RX = /^Inventario\.Armadura\.Proficiencia\.(Sem|Leve|Pesada)$/

const META_SCALARS = new Set(['Sintonia', 'Classe', 'Raça', 'Raca', 'Tutor', 'Tamanho'])
const LIST_TARGETS: Record<string, string[]> = {
  'Habilidades.Lista': ['Habilidades', 'Lista'],
  Habilidades: ['Habilidades', 'Lista'],
  'Tecnicas.Lista': ['Tecnicas', 'Lista'],
  Tecnicas: ['Tecnicas', 'Lista'],
  'Acoes.Lista': ['Acoes', 'Lista'],
  Acoes: ['Acoes', 'Lista'],
}

function ensureMovimentoRow(fm: Fm, nome: string): Row {
  const rows = ensureListaRows(fm, 'Movimento', 'Lista')
  let row = rows.find((r) => String(r.Nome) === nome)
  if (!row) {
    row = { Nome: nome, Atributo: '', Bonus_Item: 0, Bonus_Especial: 0 }
    rows.push(row)
  }
  return row
}

function setNested(fm: Fm, path: string[], value: unknown): void {
  let cur: Fm = fm
  for (let i = 0; i < path.length - 1; i++) cur = ensureObj(cur, path[i])
  cur[path[path.length - 1]] = value
}

/** Espelho de inferImplicitSlotAPericia (plugin merge-calculated-into-model.ts
 *  :428-437): perícia com E/M de REGRA sem A ganha `{ A: Slot.A }` implícito
 *  (semântica "gastou o slot pra destravar o caminho"). */
function inferImplicitSlotAPericia(rows: Row[]): void {
  for (const row of rows) {
    const incs = incsOf(row)
    const hasHighRegra = incs.some((e) => {
      const k = incKey(e)
      return (k === 'E' || k === 'M') && isRuleSource(e[k])
    })
    if (!hasHighRegra) continue
    if (incs.some((e) => incKey(e) === 'A')) continue
    incs.push({ A: 'Slot.A' })
  }
}

/** Espelho de inferImplicitRegraAOficio (plugin merge-calculated-into-model.ts):
 *  ofício com E/M de REGRA sem A ganha `{ A: <mesma fonte> }` (ofícios são
 *  cumulativos por regra, não gastam slot). */
function inferImplicitRegraAOficio(rows: Row[]): void {
  for (const row of rows) {
    const incs = incsOf(row)
    const high = incs.find((e) => {
      const k = incKey(e)
      return (k === 'E' || k === 'M') && isRuleSource(e[k])
    })
    if (!high) continue
    if (incs.some((e) => incKey(e) === 'A')) continue
    incs.push({ A: high[incKey(high)] })
  }
}

/** Recalcula a Proficiencia escalar de perícias/ofícios do max dos rank-incs
 *  — refreshDerivedProficiencias (plugin merge-calculated-into-model.ts:654). */
function refreshProfScalar(rows: Row[]): void {
  for (const row of rows) row.Proficiencia = maxRankFromIncs(incsOf(row))
}

/** Espelho de applyPrincipalConstraint (plugin apply-principal-constraint.ts:
 *  25-75): se o atributo do rank 3 não é permitido, troca-o com allowed[0]
 *  (allowed[0] → rank 3; o antigo assume o rank que allowed[0] tinha). */
function applyPrincipalConstraint(fm: Fm, allowed: string[] | null): void {
  if (!allowed || allowed.length === 0) return
  const at = ensureObj(fm, 'Atributos')
  const ATTRS = ['FOR', 'AGI', 'INT', 'PRE'] as const
  const allowedSet = new Set(allowed)
  const attrByRank = (rank: number): string | null => ATTRS.find((a) => num(at[a]) === rank) ?? null
  const attr3 = attrByRank(3)
  if (attr3 && allowedSet.has(attr3)) {
    at.Principal = attr3
    return
  }
  const newAttr3 = allowed[0]
  const oldRankOfNew = num(at[newAttr3])
  at[newAttr3] = 3
  if (attr3 && attr3 !== newAttr3) at[attr3] = oldRankOfNew
  at.Principal = newAttr3
}

/**
 * FM salvo + calculated → FM DERIVADO (mesmo shape), pronto pras abas.
 * `savedFm` é a base autoritativa; `calculated` são as adições de regra;
 * `appliedRules` reconstrói as fontes canônicas (`Regra.[[nota]]`).
 */
export function mergeCalculatedIntoFm(
  savedFm: Fm,
  calculated: Fm,
  appliedRules: ParsedRule[],
): Fm {
  const out = structuredClone(savedFm) as Fm
  const calc = materializeAlias(calculated)
  const byTarget = buildSourceByTarget(appliedRules)
  const sourceOf = (targetRaw: string, fallbackType: 'Regra' | 'Tesouro' = 'Regra'): string =>
    byTarget.get(targetRaw) ?? fallbackType

  for (const key of Object.keys(calc)) {
    if (key.startsWith('__')) continue
    const value = calc[key]

    // Campos de proficiência das 5 listas.
    const prof = PROF_TARGET_RX.exec(key)
    if (prof) {
      const [, ns, name, field] = prof
      if (ns === 'Pericias' || ns === 'Oficios') {
        const rows = ensureListaRows(out, ns, 'Lista')
        let row = findRowBySlug(rows, name)
        if (!row) {
          row = { Nome: name, Atributo: '', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] }
          rows.push(row)
        }
        applyProfListField(row, field, value, sourceOf(key))
      } else if (ns === 'Movimento') {
        applyScalarRowField(ensureMovimentoRow(out, name), field, value)
      } else {
        const rows = ensureListaRows(out, ns, 'Lista')
        const row = findRowBySlug(rows, name)
        if (row) applyScalarRowField(row, field, value)
      }
      continue
    }

    // Arrays de lista (Movimento.Lista = ["Terrestre"]).
    if (LISTA_ARRAY_RX.test(key) && Array.isArray(value)) {
      if (key === 'Movimento.Lista') for (const nome of value) ensureMovimentoRow(out, String(nome))
      continue
    }

    // Listas fonteadas (Habilidades/Tecnicas/Acoes).
    if (key in LIST_TARGETS && Array.isArray(value)) {
      const rows = ensureListaRows(out, ...LIST_TARGETS[key])
      // #51: poda entradas rule-derived (Regra./Escolha.) que a regra NÃO produz
      // mais (unpick / condição deixou de valer) — antes ficavam até re-salvar.
      pruneOrphanedRuleEntries(rows, value)
      appendMergeFmList(rows, value)
      continue
    }

    // Magias: escola.Lista (append) ou escola.Campo (Proficiencia/Atributo).
    if (key === 'Magias.Lista.Tesouros.Lista' && Array.isArray(value)) {
      const escolas = ensureListaRows(out, 'Magias', 'Lista')
      let esc = escolas.find((e) => String(e.Nome) === 'Tesouros')
      if (!esc) {
        esc = { Nome: 'Tesouros', Lista: [] }
        escolas.push(esc)
      }
      if (!Array.isArray(esc.Lista)) esc.Lista = []
      appendMergeFmList(esc.Lista as Row[], value)
      continue
    }
    const magEsc = MAGIA_ESCOLA_FIELD_RX.exec(key)
    if (magEsc) {
      const [, escola, field] = magEsc
      const escolas = ensureListaRows(out, 'Magias', 'Lista')
      let esc = escolas.find((e) => String(e.Nome) === escola || slugify(String(e.Nome)) === escola)
      if (!esc && field === 'Lista') {
        esc = { Nome: escola, Lista: [] }
        escolas.push(esc)
      }
      if (esc) {
        if (field === 'Lista' && Array.isArray(value)) {
          if (!Array.isArray(esc.Lista)) esc.Lista = []
          appendMergeFmList(esc.Lista as Row[], value)
        } else if (field === 'Proficiencia') {
          esc.Proficiencia = maxRank(String(esc.Proficiencia ?? 'N'), String(value).trim().toUpperCase())
        } else {
          esc[field] = value
        }
      }
      continue
    }

    // Slots (Pericias/Tecnicas/Magias) + Potencia/EM.
    const slot = SLOT_RX.exec(key)
    if (slot) {
      setNested(out, [slot[1], 'Slots', slot[2]], num(value))
      continue
    }
    if (key === 'Magias.Potencia') { setNested(out, ['Magias', 'Potencia'], num(value)); continue }
    if (key === 'Magias.EM') { setNested(out, ['Magias', 'EM'], num(value)); continue }

    // Ataque (escalar N/A/E/M, upgrade).
    if (key === 'Ataques.Proficiencia') {
      const ataques = ensureObj(out, 'Ataques')
      ataques.Proficiencia = maxRank(String(ataques.Proficiencia ?? 'N'), String(value).trim().toUpperCase())
      continue
    }

    // Proficiências de equipamento (binário N/P, upgrade — nunca N sobre P).
    const eqA = EQUIP_ARMAS_RX.exec(key)
    if (eqA) {
      const prof2 = ensureObj(ensureObj(ensureObj(out, 'Inventario'), 'Armas'), 'Proficiencia')
      if (String(value) === 'P') prof2[eqA[1]] = 'P'
      continue
    }
    const eqAr = EQUIP_ARMADURA_RX.exec(key)
    if (eqAr) {
      const prof2 = ensureObj(ensureObj(ensureObj(out, 'Inventario'), 'Armadura'), 'Proficiencia')
      if (String(value) === 'P') prof2[eqAr[1]] = 'P'
      continue
    }
    if (key === 'Inventario.Escudo.Proficiencia') {
      const esc = ensureObj(ensureObj(out, 'Inventario'), 'Escudo')
      if (String(value) === 'P') esc.Proficiencia = 'P'
      continue
    }
    if (key === 'Inventario.Armas.Proficiencia.Especificas' && Array.isArray(value)) {
      const prof2 = ensureObj(ensureObj(ensureObj(out, 'Inventario'), 'Armas'), 'Proficiencia')
      if (!Array.isArray(prof2.Especificas)) prof2.Especificas = []
      const cur = prof2.Especificas as string[]
      const present = new Set(cur.map((x) => wikiTarget(String(x))))
      for (const v of value) {
        const t = wikiTarget(String(v))
        if (t && !present.has(t)) { present.add(t); cur.push(String(v)) }
      }
      continue
    }

    // Papel / Vida escalares.
    if (key.startsWith('Papel.')) { setNested(out, key.split('.'), num(value)); continue }
    if (key.startsWith('Vida.')) { setNested(out, key.split('.'), num(value)); continue }

    // Atributos.FOR/AGI/INT/PRE (Definir direto).
    if (/^Atributos\.(FOR|AGI|INT|PRE)$/.test(key)) {
      ensureObj(out, 'Atributos')[key.split('.')[1]] = num(value)
      continue
    }
    if (key === 'Atributos.Principal') {
      ensureObj(out, 'Atributos').Principal = String(value)
      continue
    }

    // Metas escalares materializadas (Classe/Sintonia/Raça/Tutor/Tamanho).
    if (META_SCALARS.has(key)) {
      out[key === 'Raca' ? 'Raça' : key] = value
      continue
    }
  }

  // Restrição de Atributo Principal (pós-apply, com swap).
  const constraint = calculated['__constraint__Atributos.Principal']
  const allowed = Array.isArray(constraint)
    ? (constraint as unknown[]).filter((a): a is string => a === 'FOR' || a === 'AGI' || a === 'INT' || a === 'PRE')
    : null
  applyPrincipalConstraint(out, allowed)

  // Ladders implícitos + refresh das proficiências escalares derivadas.
  const perRows = Array.isArray((out.Pericias as Fm | undefined)?.Lista)
    ? ((out.Pericias as Fm).Lista as Row[])
    : []
  const ofiRows = Array.isArray((out.Oficios as Fm | undefined)?.Lista)
    ? ((out.Oficios as Fm).Lista as Row[])
    : []
  inferImplicitSlotAPericia(perRows)
  inferImplicitRegraAOficio(ofiRows)
  refreshProfScalar(perRows)
  refreshProfScalar(ofiRows)

  return out
}
