// Planejamento por nível (docs/plano-planejamento-por-nivel.md, F1) — timeline
// derivada estilo Pathbuilder: projeta o MESMO herói com Nível=1..10 (a
// projeção pura que a ficha já usa) e diffa níveis consecutivos. Ganhos caem
// no nível em que a regra dispara (scope `Nivel N`), escolhas no nível do
// gate (primeira projeção em que a choice aparece), e os GASTOS de slot são
// atribuídos por earliest-fit: o k-ésimo gasto do rank R cai no nível onde o
// k-ésimo slot R nasce (ordem da lista/incrementos = proxy de cronologia; a
// vault não grava o nível do gasto — lacuna documentada no plano §2).
// Módulo PURO e read-only: nunca escreve no FM nem alimenta a engine.
import type { Catalog } from '../data/catalog'
import type { VaultDoc } from '../data/types'
import { projectHeroRules } from './useHeroRules'
import type { ChoiceDescriptor } from './resolve-choices'

export const NIVEL_MAX_PLANEJAMENTO = 10

type Fm = Record<string, unknown>
type Row = Record<string, unknown>

export interface SlotDelta {
  B: number
  A: number
  E: number
  M: number
}

export interface GastoTecnica {
  link: string
  rank: 'A' | 'E' | 'M'
}
export interface GastoPericia {
  nome: string
  rank: 'A' | 'E' | 'M'
  fonte: 'Slot' | 'Passado'
}
export interface GastoMagia {
  escola: string
  link: string
  rank: 'B' | 'A' | 'E' | 'M'
  secundaria: boolean
}

export interface TimelineChoice {
  choiceKey: string
  sourceNote: string
  label: string
  options: string[]
  pick: string | null
  occ?: number
  gateLevel: number
  /** Escolha de SUBCLASSE (parent com subcategoria: Subclasse) — vem de
   *  projection.subclassChoices, não de habilidadeChoices. */
  isSubclass?: boolean
  /** Campos pro caminho de escrita EXISTENTE (writeChoicePick). */
  targetRaw?: string
  kind?: string
  source?: string
}

export interface EscalarDelta {
  label: string
  de: number
  para: number
}

export interface LevelCard {
  nivel: number
  /** Wikilinks concedidos por regra NESTE nível (Habilidades.Lista). */
  habilidades: string[]
  tecnicasRegra: string[]
  acoesRegra: string[]
  /** Magias concedidas por regra neste nível (escola → links). */
  magiasRegra: Array<{ escola: string; link: string; secundaria: boolean }>
  /** Slots GANHOS neste nível (delta vs nível anterior). */
  slots: { pericias: SlotDelta; tecnicas: SlotDelta; magias: SlotDelta }
  /** Gastos atribuídos a este nível (earliest-fit; Passado sempre N1). */
  gastos: { tecnicas: GastoTecnica[]; pericias: GastoPericia[]; magias: GastoMagia[] }
  /** Escolhas cujo gate abre NESTE nível. */
  escolhas: TimelineChoice[]
  /** Escalares que mudam neste nível (Vida/Potência/EM). */
  escalares: EscalarDelta[]
}

const ZERO_SLOTS = (): SlotDelta => ({ B: 0, A: 0, E: 0, M: 0 })
const RANKS_BAEM = ['B', 'A', 'E', 'M'] as const
const RANKS_AEM = ['A', 'E', 'M'] as const

function fmPathOf(fm: Fm, ...path: string[]): unknown {
  let cur: unknown = fm
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Fm)[key]
  }
  return cur
}

function rowsOf(fm: Fm, ...path: string[]): Row[] {
  const v = fmPathOf(fm, ...path)
  return Array.isArray(v) ? (v as Row[]) : []
}

function slotsOf(fm: Fm, ns: string): SlotDelta {
  const s = (fmPathOf(fm, ns, 'Slots') ?? {}) as Record<string, unknown>
  const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : Number(s[k]) || 0)
  return { B: n('B'), A: n('A'), E: n('E'), M: n('M') }
}

const wlBase = (s: string): string =>
  s
    .replace(/^\[\[|\]\]$/g, '')
    .split('|')[0]!
    .split('/')
    .pop()!
    .replace(/\.md$/i, '')
    .trim()

/** Entradas single-key `{'[[X]]': fonte}` de uma lista fonteada. */
function fontedEntries(rows: Row[]): Array<{ link: string; fonte: string }> {
  const out: Array<{ link: string; fonte: string }> = []
  for (const row of rows) {
    const e = Object.entries(row)
    if (e.length !== 1) continue
    const [link, fonte] = e[0]!
    if (typeof fonte === 'string') out.push({ link, fonte })
  }
  return out
}

/** Pools de níveis por rank a partir dos deltas de slot (ladder). Ex.:
 *  técnicas A com deltas N1..N3 = [1, 2, 3] — o 2º gasto A cai no nível 2. */
class SlotPools {
  private pools: Record<string, number[]> = { B: [], A: [], E: [], M: [] }
  constructor(deltasPorNivel: SlotDelta[]) {
    deltasPorNivel.forEach((d, i) => {
      for (const r of RANKS_BAEM) for (let k = 0; k < d[r]; k++) this.pools[r]!.push(i + 1)
    })
  }
  /** Consome o primeiro nível disponível do rank ≥ minNivel; fungibilidade
   *  descendente: sem slot do próprio rank, tenta os ranks ACIMA (E cobre A,
   *  M cobre E/A — espelho de slotsFeasible). Sem nada → nível atual = null. */
  take(rank: 'B' | 'A' | 'E' | 'M', minNivel = 1): number | null {
    const ordem = RANKS_BAEM.slice(RANKS_BAEM.indexOf(rank))
    for (const r of ordem) {
      const pool = this.pools[r]!
      const idx = pool.findIndex((n) => n >= minNivel)
      if (idx !== -1) return pool.splice(idx, 1)[0]!
    }
    return null
  }
}

export async function buildLevelTimeline(
  fm: Fm,
  catalog: Catalog,
  load: (id: string) => Promise<VaultDoc>,
  nivelMax = NIVEL_MAX_PLANEJAMENTO,
): Promise<LevelCard[]> {
  interface Snap {
    derived: Fm
    choices: ChoiceDescriptor[]
  }
  const snaps: Snap[] = []
  for (let nivel = 1; nivel <= nivelMax; nivel++) {
    const fmNivel = { ...fm, ['Nível']: nivel, Nivel: nivel }
    const { projection } = await projectHeroRules(fmNivel, catalog, load)
    const p = projection as unknown as {
      derivedFm: Fm
      habilidadeChoices: ChoiceDescriptor[]
      subclassChoices: Array<{
        choiceKey: string
        parent: string
        options: Array<{ value: string }>
        pick: string | null
      }>
    }
    // Subclasse entra na MESMA régua (o pedido do Planejamento inclui
    // classe/subclasse por nível) — normalizada pro shape do descriptor.
    const sub: ChoiceDescriptor[] = (p.subclassChoices ?? []).map(
      (c) =>
        ({
          choiceKey: c.choiceKey,
          sourceNote: c.parent,
          label: 'Subclasse',
          options: c.options.map((o) => o.value),
          pick: c.pick,
          kind: 'complementar-sel',
          isSubclass: true,
        }) as unknown as ChoiceDescriptor,
    )
    snaps.push({ derived: p.derivedFm, choices: [...(p.habilidadeChoices ?? []), ...sub] })
  }

  // ── deltas por nível ──────────────────────────────────────────────────────
  const cards: LevelCard[] = []
  const choiceGate = new Map<string, number>()
  for (let i = 0; i < snaps.length; i++) {
    const nivel = i + 1
    const cur = snaps[i]!
    const prev = i > 0 ? snaps[i - 1]! : null

    const novos = (path: string[]): string[] => {
      const antes = prev
        ? new Set(fontedEntries(rowsOf(prev.derived, ...path)).map((e) => wlBase(e.link)))
        : new Set<string>()
      return fontedEntries(rowsOf(cur.derived, ...path))
        .filter((e) => !antes.has(wlBase(e.link)))
        .map((e) => e.link)
    }

    // Magias por regra: escolas primária + secundária.
    const magiasDe = (snap: Snap | null): Array<{ escola: string; link: string; secundaria: boolean }> => {
      if (!snap) return []
      const out: Array<{ escola: string; link: string; secundaria: boolean }> = []
      for (const secundaria of [false, true]) {
        const escolas = secundaria
          ? rowsOf(snap.derived, 'Magias', 'Secundaria', 'Lista')
          : rowsOf(snap.derived, 'Magias', 'Lista')
        for (const esc of escolas) {
          for (const e of fontedEntries(Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : [])) {
            out.push({ escola: String(esc.Nome ?? ''), link: e.link, secundaria })
          }
        }
      }
      return out
    }
    const magiasAntes = new Set(magiasDe(prev).map((m) => `${m.secundaria}|${m.escola}|${wlBase(m.link)}`))
    const magiasRegra = magiasDe(cur).filter(
      (m) => !magiasAntes.has(`${m.secundaria}|${m.escola}|${wlBase(m.link)}`),
    )

    const slotsDelta = (ns: string): SlotDelta => {
      const agora = slotsOf(cur.derived, ns)
      const antes = prev ? slotsOf(prev.derived, ns) : ZERO_SLOTS()
      return { B: agora.B - antes.B, A: agora.A - antes.A, E: agora.E - antes.E, M: agora.M - antes.M }
    }

    // Escolhas cujo gate abre neste nível.
    const escolhas: TimelineChoice[] = []
    for (const c of cur.choices) {
      if (choiceGate.has(c.choiceKey)) continue
      choiceGate.set(c.choiceKey, nivel)
      escolhas.push({
        choiceKey: c.choiceKey,
        sourceNote: c.sourceNote,
        label: c.label ?? '',
        options: c.options ?? [],
        pick: c.pick ?? null,
        occ: c.occurrenceWithinParent,
        gateLevel: nivel,
        isSubclass: (c as unknown as { isSubclass?: boolean }).isSubclass === true,
        targetRaw: (c as unknown as { targetRaw?: string }).targetRaw,
        kind: c.kind,
        source: c.source,
      })
    }

    const escalares: EscalarDelta[] = []
    const escalar = (label: string, ...path: string[]) => {
      const agora = Number(fmPathOf(cur.derived, ...path)) || 0
      const antes = prev ? Number(fmPathOf(prev.derived, ...path)) || 0 : 0
      if (agora !== antes) escalares.push({ label, de: antes, para: agora })
    }
    escalar('Vitalidade', 'Vida', 'Vitalidade')
    escalar('Moral', 'Vida', 'Moral')
    escalar('Potência', 'Magias', 'Potencia')
    escalar('Energia Mágica', 'Magias', 'EM')
    escalar('Potência Secundária', 'Magias', 'Secundaria', 'Potencia')
    escalar('EM Secundária', 'Magias', 'Secundaria', 'EM')

    cards.push({
      nivel,
      habilidades: novos(['Habilidades', 'Lista']),
      tecnicasRegra: novos(['Tecnicas', 'Lista']).filter((l) => {
        // gastos de Slot ficam na atribuição — aqui só concessões de regra
        const fonte = fontedEntries(rowsOf(cur.derived, 'Tecnicas', 'Lista')).find(
          (e) => e.link === l,
        )?.fonte
        return !(typeof fonte === 'string' && fonte.startsWith('Slot'))
      }),
      acoesRegra: novos(['Acoes', 'Lista']),
      magiasRegra,
      slots: {
        pericias: slotsDelta('Pericias'),
        tecnicas: slotsDelta('Tecnicas'),
        magias: slotsDelta('Magias'),
      },
      gastos: { tecnicas: [], pericias: [], magias: [] },
      escolhas,
      escalares,
    })
  }

  // ── atribuição de gastos (earliest-fit sobre o ladder de slots) ──────────
  const poolTec = new SlotPools(cards.map((c) => c.slots.tecnicas))
  const poolPer = new SlotPools(cards.map((c) => c.slots.pericias))
  const poolMag = new SlotPools(cards.map((c) => c.slots.magias))
  const cardDe = (nivel: number | null): LevelCard => cards[Math.max(1, Math.min(nivelMax, nivel ?? nivelMax)) - 1]!

  // Técnicas com fonte Slot.<R>, na ordem da lista salva.
  for (const e of fontedEntries(rowsOf(fm, 'Tecnicas', 'Lista'))) {
    const m = /^Slot\.([AEM])$/.exec(e.fonte)
    if (!m) continue
    const rank = m[1] as 'A' | 'E' | 'M'
    cardDe(poolTec.take(rank)).gastos.tecnicas.push({ link: e.link, rank })
  }

  // Perícias: incrementos por linha, na ordem (A antes de E antes de M na
  // mesma perícia — o E só pode nascer num nível ≥ o do A dela).
  for (const row of rowsOf(fm, 'Pericias', 'Lista')) {
    const incs = Array.isArray(row.Incrementos) ? (row.Incrementos as Row[]) : []
    let minNivel = 1
    for (const rank of RANKS_AEM) {
      const inc = incs.find((i) => typeof i[rank] === 'string')
      if (!inc) continue
      const fonte = String(inc[rank])
      if (fonte.startsWith('Passado')) {
        cards[0]!.gastos.pericias.push({ nome: String(row.Nome ?? ''), rank, fonte: 'Passado' })
        continue
      }
      if (!fonte.startsWith('Slot')) continue
      const nivel = poolPer.take(rank, minNivel)
      cardDe(nivel).gastos.pericias.push({ nome: String(row.Nome ?? ''), rank, fonte: 'Slot' })
      if (nivel !== null) minNivel = nivel
    }
  }

  // Magias com fonte Slot.<R> (B incluso), primária + secundária.
  for (const secundaria of [false, true]) {
    const escolas = secundaria
      ? rowsOf(fm, 'Magias', 'Secundaria', 'Lista')
      : rowsOf(fm, 'Magias', 'Lista')
    for (const esc of escolas) {
      for (const e of fontedEntries(Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : [])) {
        const m = /^Slot\.([BAEM])$/.exec(e.fonte)
        if (!m) continue
        const rank = m[1] as 'B' | 'A' | 'E' | 'M'
        cardDe(poolMag.take(rank)).gastos.magias.push({
          escola: String(esc.Nome ?? ''),
          link: e.link,
          rank,
          secundaria,
        })
      }
    }
  }

  return cards
}
