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
  /** Registro de nível FUTURO ainda não aplicado nas listas (só plano). */
  planejado?: boolean
}
export interface GastoPericia {
  nome: string
  rank: 'A' | 'E' | 'M'
  fonte: 'Slot' | 'Passado'
  planejado?: boolean
}
export interface GastoMagia {
  escola: string
  link: string
  rank: 'B' | 'A' | 'E' | 'M'
  secundaria: boolean
  planejado?: boolean
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
  /** Nota que causou a mudança (ruleSourcesByPath) — pro "via [[X]]" da tree. */
  fonte?: string
}

/** Registro EXPLÍCITO de gasto de slot com nível (Planejamento.gastosSlots) —
 *  gastos feitos pela aba gravam o nível; legados caem no earliest-fit. */
export interface GastoRegistrado {
  nivel: number
  tipo: 'pericia' | 'tecnica' | 'magia' | 'especialidade' | 'maestria'
  rank?: 'B' | 'A' | 'E' | 'M'
  alvo: string
  /** Magias: escola destino; especialidade/maestria: perícia dona. */
  contexto?: string
}

export function gastosRegistrados(fm: Record<string, unknown>): GastoRegistrado[] {
  const p = fm['Planejamento']
  const g = p && typeof p === 'object' ? (p as Record<string, unknown>)['gastosSlots'] : null
  return Array.isArray(g) ? (g as GastoRegistrado[]) : []
}

export interface LevelCard {
  nivel: number
  /** Wikilinks concedidos por regra NESTE nível (Habilidades.Lista). */
  habilidades: string[]
  /** Fonte de cada ganho (link → tag `Regra.[[pai]]`/…) — pra tree view
   *  (filho identado sob o pai que concedeu). */
  fonteDe: Record<string, string>
  /** Perícias elegíveis pra receber o slot de cada rank NESTE nível: o rank
   *  ENTRANDO no nível (piso de regra + gastos atribuídos a níveis
   *  anteriores) é o degrau imediatamente abaixo. Recalculado APÓS a
   *  atribuição (o derivado bruto incluía gastos de níveis futuros). */
  periciasElegiveis: Record<'A' | 'E' | 'M', string[]>
  /** Rank de cada perícia ENTRANDO no nível (contexto travado do popup). */
  periciasEntrando: Record<string, 'N' | 'A' | 'E' | 'M'>
  /** Piso POR REGRA no nível (incrementos não-slot do snapshot) — a grade
   *  pinta de amarelo (selRule/ruleSlot) o que veio de elemento de regra. */
  periciasPisoRegra: Record<string, 'N' | 'A' | 'E' | 'M'>
  /** Escolas proficientes NESTE nível (snapshot derivado, sem Tesouros) —
   *  gate do picker de magias do nível. */
  escolasProfNivel: Array<{ nome: string; prof: string }>
  tecnicasRegra: string[]
  acoesRegra: string[]
  /** Magias concedidas por regra neste nível (escola → links). */
  magiasRegra: Array<{ escola: string; link: string; secundaria: boolean; fonte?: string }>
  /** Slots GANHOS neste nível (delta vs nível anterior). */
  slots: { pericias: SlotDelta; tecnicas: SlotDelta; magias: SlotDelta }
  /** Notas que CONCEDERAM os slots deste nível (rastreabilidade): wikilinks
   *  novos no ruleSources de `<ns>.Slots.<rank>` vs o nível anterior. */
  slotFontes: { pericias: string[]; tecnicas: string[]; magias: string[] }
  /** Detalhe por fonte: a nota X adicionou slot de <ns> (<rank>) NESTE nível
   *  — pro "Evolução Básica → +Perícia (E)" sutil do card e o topo do popup. */
  slotGrants: Array<{ link: string; ns: 'Perícia' | 'Técnica' | 'Magia'; rank: 'B' | 'A' | 'E' | 'M' }>
  /** Gastos atribuídos a este nível (registro explícito > earliest-fit;
   *  Passado sempre N1). */
  gastos: {
    tecnicas: GastoTecnica[]
    pericias: GastoPericia[]
    magias: GastoMagia[]
    especialidades: Array<{
      pericia: string
      alvo: string
      tipo: 'especialidade' | 'maestria'
      planejado?: boolean
    }>
  }
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
  /** Primeiro nível livre do PRÓPRIO rank (sem fungibilidade). */
  takeSameRank(rank: 'B' | 'A' | 'E' | 'M'): number | null {
    const pool = this.pools[rank]!
    return pool.length ? pool.splice(0, 1)[0]! : null
  }
  /** Consome o slot do NÍVEL EXATO do registro. Sem slot naquele nível
   *  (registro deslocado de versões antigas), NÃO consome nada — roubar o
   *  slot de outro nível travava os botões de N8/N9 sem explicação. */
  takeAt(rank: 'B' | 'A' | 'E' | 'M', nivel: number): void {
    const pool = this.pools[rank]!
    const exato = pool.indexOf(nivel)
    if (exato !== -1) pool.splice(exato, 1)
  }
}

/** Pins FALTANTES: gastos reais atribuídos nos cards que ainda não têm
 *  registro explícito. Materializa o planejamento do que já está feito —
 *  a atribuição atual congela (earliest-fit não re-embaralha o passado em
 *  edições futuras) e a aba fica coerente pra qualquer herói aberto. */
export function pinsFaltantes(cards: LevelCard[], registros: GastoRegistrado[]): GastoRegistrado[] {
  const out: GastoRegistrado[] = []
  const tem = (tipo: GastoRegistrado['tipo'], alvo: string, rank?: GastoRegistrado['rank']) =>
    [...registros, ...out].some(
      (x) =>
        x.tipo === tipo &&
        wlBase(x.alvo) === wlBase(alvo) &&
        (tipo !== 'pericia' || x.rank === rank),
    )
  for (const c of cards) {
    for (const g of c.gastos.tecnicas) {
      if (!g.planejado && !tem('tecnica', g.link))
        out.push({ nivel: c.nivel, tipo: 'tecnica', rank: g.rank, alvo: g.link })
    }
    for (const g of c.gastos.pericias) {
      if (g.fonte === 'Slot' && !g.planejado && !tem('pericia', g.nome, g.rank))
        out.push({ nivel: c.nivel, tipo: 'pericia', rank: g.rank, alvo: g.nome })
    }
    for (const g of c.gastos.magias) {
      if (!g.secundaria && !g.planejado && !tem('magia', g.link))
        out.push({ nivel: c.nivel, tipo: 'magia', rank: g.rank, alvo: g.link, contexto: g.escola })
    }
    for (const g of c.gastos.especialidades) {
      if (!g.planejado && !tem(g.tipo, g.alvo))
        out.push({ nivel: c.nivel, tipo: g.tipo, alvo: g.alvo, contexto: g.pericia })
    }
  }
  return out
}

/** Sanitiza registros DESLOCADOS (versões antigas gravaram níveis errados —
 *  ex.: "tudo no N1"): registro cujo nível não tem slot do rank é MOVIDO pro
 *  primeiro nível com slot livre daquele rank. Alvo/rank/tipo preservados —
 *  nada se perde; só o nível é corrigido. Especialidades/maestrias não usam
 *  slot e ficam como estão. */
export function sanitizarRegistros(
  cards: LevelCard[],
  registros: GastoRegistrado[],
): { mudou: boolean; registros: GastoRegistrado[] } {
  // passada 0: DUPLICATAS exatas (clique repetido gravou o mesmo alvo N
  // vezes, #495) — fica a primeira; a chave espelha a semântica do registrar
  // (perícia é por rank; os demais tipos têm uma instância por alvo).
  const vistos = new Set<string>()
  const unicos = registros.filter((r) => {
    const chave =
      r.tipo === 'pericia'
        ? `pericia|${wlBase(r.alvo)}|${r.rank}`
        : `${r.tipo}|${wlBase(r.alvo)}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
  const dedupou = unicos.length !== registros.length
  registros = unicos
  const pools: Record<string, SlotPools> = {
    pericia: new SlotPools(cards.map((c) => c.slots.pericias)),
    tecnica: new SlotPools(cards.map((c) => c.slots.tecnicas)),
    magia: new SlotPools(cards.map((c) => c.slots.magias)),
  }
  // passada 1: quem tem slot no próprio nível reivindica primeiro
  const claims = registros.map((r) => {
    if (!r.rank || !(r.tipo in pools)) return { r, ok: true }
    const pool = pools[r.tipo]!
    const antes = JSON.stringify(pool)
    pool.takeAt(r.rank, r.nivel)
    return { r, ok: JSON.stringify(pool) !== antes }
  })
  // passada 2: deslocados vão pro primeiro nível livre do MESMO rank
  let mudou = dedupou
  const out = claims.map(({ r, ok }) => {
    if (ok || !r.rank || !(r.tipo in pools)) return r
    const novo = pools[r.tipo]!.takeSameRank(r.rank)
    if (novo === null || novo === r.nivel) return r
    mudou = true
    return { ...r, nivel: novo }
  })
  return { mudou, registros: out }
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
    ruleSources: Record<string, string[]>
    /** Deltas de regra da projeção NESTE nível — fonte dos SLOTS do ladder.
     *  O derivado não serve: os Slots SALVOS do herói (materializados no
     *  nível real) vazam pros snapshots de nível baixo quando o calc não
     *  produz a chave (Carlos: per[E+3,M+1] no N1, deltas negativos). */
    calculated: Record<string, unknown>
  }
  const snaps: Snap[] = []
  for (let nivel = 1; nivel <= nivelMax; nivel++) {
    const fmNivel = { ...fm, ['Nível']: nivel, Nivel: nivel }
    const { projection } = await projectHeroRules(fmNivel, catalog, load)
    const p = projection as unknown as {
      derivedFm: Fm
      habilidadeChoices: ChoiceDescriptor[]
      calculated?: Record<string, unknown>
      ruleSourcesByPath?: Record<string, string[]>
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
    snaps.push({
      derived: p.derivedFm,
      choices: [...(p.habilidadeChoices ?? []), ...sub],
      ruleSources: p.ruleSourcesByPath ?? {},
      calculated: p.calculated ?? {},
    })
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
    const magiasDe = (
      snap: Snap | null,
    ): Array<{ escola: string; link: string; secundaria: boolean; fonte?: string }> => {
      if (!snap) return []
      const out: Array<{ escola: string; link: string; secundaria: boolean; fonte?: string }> = []
      for (const secundaria of [false, true]) {
        const escolas = secundaria
          ? rowsOf(snap.derived, 'Magias', 'Secundaria', 'Lista')
          : rowsOf(snap.derived, 'Magias', 'Lista')
        for (const esc of escolas) {
          // Tesouros ficam FORA do planejamento (magia de item não é escolha
          // de nível — report 2026-08-25).
          if (String(esc.Nome ?? '') === 'Tesouros') continue
          for (const e of fontedEntries(Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : [])) {
            // gasto de Slot NÃO é ganho por regra (vira gastos.magias) —
            // sem o filtro, Avivar/Celeridade do Carlos apareciam em dobro.
            if (e.fonte.startsWith('Slot')) continue
            if (e.fonte.startsWith('Tesouro')) continue
            out.push({ escola: String(esc.Nome ?? ''), link: e.link, secundaria, fonte: e.fonte })
          }
        }
      }
      return out
    }
    const magiasAntes = new Set(magiasDe(prev).map((m) => `${m.secundaria}|${m.escola}|${wlBase(m.link)}`))
    const magiasRegra = magiasDe(cur).filter(
      (m) => !magiasAntes.has(`${m.secundaria}|${m.escola}|${wlBase(m.link)}`),
    )

    const slotsCalc = (snap: Snap | null, ns: string): SlotDelta => {
      if (!snap) return ZERO_SLOTS()
      const n = (rank: string) => {
        const v = snap.calculated[`${ns}.Slots.${rank}`]
        const x = typeof v === 'number' ? v : Number(v)
        return Number.isFinite(x) ? x : 0
      }
      return { B: n('B'), A: n('A'), E: n('E'), M: n('M') }
    }
    const linksDe = (snap: Snap | null, ns: string, rank: string): Set<string> => {
      const out = new Set<string>()
      if (!snap) return out
      for (const f of snap.ruleSources[`${ns}.Slots.${rank}`] ?? []) {
        const m = /^Regra\.(\[\[.+?\]\])$/.exec(f)
        if (m) out.add(m[1]!)
      }
      return out
    }
    const slotFontesDe = (ns: string): string[] => {
      const out = new Set<string>()
      for (const rank of RANKS_BAEM) {
        const antes = linksDe(prev, ns, rank)
        for (const l of linksDe(cur, ns, rank)) if (!antes.has(l)) out.add(l)
      }
      return [...out]
    }
    /** Fontes dos ranks com DELTA > 0 neste nível: a Evolução Básica aparece
     *  no N4 E no N5 E no N6 (cada nível em que ela adiciona slot), não só
     *  onde a regra dispara pela primeira vez. */
    const slotGrantsDe = (deltas: {
      pericias: SlotDelta
      tecnicas: SlotDelta
      magias: SlotDelta
    }): LevelCard['slotGrants'] => {
      const out: LevelCard['slotGrants'] = []
      const NS: Array<['Pericias' | 'Tecnicas' | 'Magias', 'Perícia' | 'Técnica' | 'Magia', SlotDelta]> = [
        ['Pericias', 'Perícia', deltas.pericias],
        ['Tecnicas', 'Técnica', deltas.tecnicas],
        ['Magias', 'Magia', deltas.magias],
      ]
      for (const [nsKey, nsLabel, delta] of NS) {
        for (const rank of RANKS_BAEM) {
          if (delta[rank] <= 0) continue
          for (const l of linksDe(cur, nsKey, rank)) out.push({ link: l, ns: nsLabel, rank })
        }
      }
      return out
    }
    const slotsDelta = (ns: string): SlotDelta => {
      const agora = slotsCalc(cur, ns)
      const antes = slotsCalc(prev, ns)
      return {
        B: Math.max(0, agora.B - antes.B),
        A: Math.max(0, agora.A - antes.A),
        E: Math.max(0, agora.E - antes.E),
        M: Math.max(0, agora.M - antes.M),
      }
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
      if (agora !== antes) {
        const fonte = (cur.ruleSources[path.join('.')] ?? [])[0]
        escalares.push({ label, de: antes, para: agora, ...(fonte ? { fonte } : {}) })
      }
    }
    escalar('Vitalidade', 'Vida', 'Vitalidade')
    escalar('Moral', 'Vida', 'Moral')
    escalar('Potência', 'Magias', 'Potencia')
    escalar('Energia Mágica', 'Magias', 'EM')
    escalar('Potência Secundária', 'Magias', 'Secundaria', 'Potencia')
    escalar('EM Secundária', 'Magias', 'Secundaria', 'EM')

    // Fonte de cada ganho do nível (tree view) — mapa link→fonte da lista
    // derivada ATUAL (Habilidades/Tecnicas/Acoes).
    const fonteDe: Record<string, string> = {}
    for (const path of [
      ['Habilidades', 'Lista'],
      ['Tecnicas', 'Lista'],
      ['Acoes', 'Lista'],
    ] as const) {
      for (const e of fontedEntries(rowsOf(cur.derived, ...path))) fonteDe[e.link] = e.fonte
    }

    // periciasElegiveis/periciasEntrando são recalculados APÓS a atribuição
    // (precisam do rank entrando no nível, não do derivado global).
    const periciasElegiveis: Record<'A' | 'E' | 'M', string[]> = { A: [], E: [], M: [] }
    const escolasProfNivel = rowsOf(cur.derived, 'Magias', 'Lista')
      .filter((e) => String(e.Proficiencia ?? 'N') !== 'N' && String(e.Nome) !== 'Tesouros')
      .map((e) => ({ nome: String(e.Nome ?? ''), prof: String(e.Proficiencia ?? 'N') }))

    const slotsCard = {
      pericias: slotsDelta('Pericias'),
      tecnicas: slotsDelta('Tecnicas'),
      magias: slotsDelta('Magias'),
    }
    cards.push({
      nivel,
      habilidades: novos(['Habilidades', 'Lista']),
      fonteDe,
      periciasElegiveis,
      periciasEntrando: {},
      periciasPisoRegra: {},
      escolasProfNivel,
      tecnicasRegra: novos(['Tecnicas', 'Lista']).filter((l) => {
        // gastos de Slot ficam na atribuição — aqui só concessões de regra
        const fonte = fontedEntries(rowsOf(cur.derived, 'Tecnicas', 'Lista')).find(
          (e) => e.link === l,
        )?.fonte
        return !(typeof fonte === 'string' && fonte.startsWith('Slot'))
      }),
      acoesRegra: novos(['Acoes', 'Lista']),
      magiasRegra,
      slots: slotsCard,
      slotFontes: {
        pericias: slotFontesDe('Pericias'),
        tecnicas: slotFontesDe('Tecnicas'),
        magias: slotFontesDe('Magias'),
      },
      slotGrants: slotGrantsDe(slotsCard),
      gastos: { tecnicas: [], pericias: [], magias: [], especialidades: [] },
      escolhas,
      escalares,
    })
  }

  // ── atribuição de gastos: registro explícito PRIMEIRO, earliest-fit no
  // resto (legados sem nível gravado) ────────────────────────────────────────
  const poolTec = new SlotPools(cards.map((c) => c.slots.tecnicas))
  const poolPer = new SlotPools(cards.map((c) => c.slots.pericias))
  const poolMag = new SlotPools(cards.map((c) => c.slots.magias))
  const cardDe = (nivel: number | null): LevelCard => cards[Math.max(1, Math.min(nivelMax, nivel ?? nivelMax)) - 1]!
  const registros = gastosRegistrados(fm)
  const registroDe = (
    tipo: GastoRegistrado['tipo'],
    alvoBase: string,
    contexto?: string,
    rank?: GastoRegistrado['rank'],
  ) =>
    registros.find(
      (r) =>
        r.tipo === tipo &&
        wlBase(r.alvo) === alvoBase &&
        (rank === undefined || r.rank === rank) &&
        (contexto === undefined || r.contexto === undefined || wlBase(r.contexto) === wlBase(contexto)),
    )

  // Técnicas com fonte Slot.<R>, na ordem da lista salva.
  for (const e of fontedEntries(rowsOf(fm, 'Tecnicas', 'Lista'))) {
    const m = /^Slot\.([AEM])$/.exec(e.fonte)
    if (!m) continue
    const rank = m[1] as 'A' | 'E' | 'M'
    const reg = registroDe('tecnica', wlBase(e.link))
    if (reg) {
      poolTec.takeAt(rank, reg.nivel)
      cardDe(reg.nivel).gastos.tecnicas.push({ link: e.link, rank })
    } else {
      cardDe(poolTec.take(rank)).gastos.tecnicas.push({ link: e.link, rank })
    }
  }

  // Perícias: incrementos por linha, na ordem (A antes de E antes de M na
  // mesma perícia — o E só pode nascer num nível ≥ o do A dela).
  const nivelDoRank = new Map<string, number>() // `${nome}|${rank}` → nível
  for (const row of rowsOf(fm, 'Pericias', 'Lista')) {
    const incs = Array.isArray(row.Incrementos) ? (row.Incrementos as Row[]) : []
    const nome = String(row.Nome ?? '')
    let minNivel = 1
    for (const rank of RANKS_AEM) {
      const inc = incs.find((i) => typeof i[rank] === 'string')
      if (!inc) continue
      const fonte = String(inc[rank])
      if (fonte.startsWith('Passado')) {
        cards[0]!.gastos.pericias.push({ nome, rank, fonte: 'Passado' })
        nivelDoRank.set(`${nome}|${rank}`, 1)
        continue
      }
      if (!fonte.startsWith('Slot')) continue
      // POR RANK: cada degrau (A/E/M) da perícia é um gasto independente —
      // o registro do E não pode desviar a atribuição do A (#494)
      const reg = registroDe('pericia', nome, undefined, rank)
      const nivel = reg ? (poolPer.takeAt(rank, reg.nivel), reg.nivel) : poolPer.take(rank, minNivel)
      cardDe(nivel).gastos.pericias.push({ nome, rank, fonte: 'Slot' })
      if (nivel !== null) {
        minNivel = nivel
        nivelDoRank.set(`${nome}|${rank}`, nivel)
      }
    }
    // Especialidade (exige E) e Maestria (exige M) da linha: registro explícito
    // ou o nível onde o rank correspondente caiu.
    const espec = String(row.Especializacao ?? '').trim()
    if (espec) {
      const reg = registroDe('especialidade', wlBase(espec), nome)
      const nivel = reg?.nivel ?? nivelDoRank.get(`${nome}|E`) ?? null
      cardDe(nivel).gastos.especialidades.push({ pericia: nome, alvo: espec, tipo: 'especialidade' })
    }
    const maes = String(row.Maestria ?? '').trim()
    if (maes) {
      const reg = registroDe('maestria', wlBase(maes), nome)
      const nivel = reg?.nivel ?? nivelDoRank.get(`${nome}|M`) ?? null
      cardDe(nivel).gastos.especialidades.push({ pericia: nome, alvo: maes, tipo: 'maestria' })
    }
  }

  // Magias com fonte Slot.<R> (B incluso), primária + secundária.
  for (const secundaria of [false, true]) {
    const escolas = secundaria
      ? rowsOf(fm, 'Magias', 'Secundaria', 'Lista')
      : rowsOf(fm, 'Magias', 'Lista')
    for (const esc of escolas) {
      if (String(esc.Nome ?? '') === 'Tesouros') continue
      for (const e of fontedEntries(Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : [])) {
        const m = /^Slot\.([BAEM])$/.exec(e.fonte)
        if (!m) continue
        const rank = m[1] as 'B' | 'A' | 'E' | 'M'
        const reg = registroDe('magia', wlBase(e.link), String(esc.Nome ?? ''))
        const nivel = reg ? (poolMag.takeAt(rank, reg.nivel), reg.nivel) : poolMag.take(rank)
        cardDe(nivel).gastos.magias.push({
          escola: String(esc.Nome ?? ''),
          link: e.link,
          rank,
          secundaria,
        })
      }
    }
  }

  // ── gastos PLANEJADOS: registro cujo alvo NÃO está nas listas reais (nível
  // futuro esperando materializar) vira gasto `planejado` no card do nível —
  // sem isso a seleção futura "sumia" (nem chip nem contador; report
  // 2026-08-25). O já-aplicado foi consumido pelos walks acima (dedup).
  // Perícia entra na chave COM o rank: o A/E real da mesma perícia não pode
  // deduplicar o M futuro registrado (#494 — o M* sumia no rebuild).
  const atribuidos = new Set<string>()
  for (const c of cards) {
    for (const g of c.gastos.tecnicas) atribuidos.add(`tecnica|${wlBase(g.link)}`)
    for (const g of c.gastos.pericias) atribuidos.add(`pericia|${g.nome}|${g.rank}`)
    for (const g of c.gastos.magias) atribuidos.add(`magia|${wlBase(g.link)}`)
    for (const g of c.gastos.especialidades) atribuidos.add(`${g.tipo}|${wlBase(g.alvo)}`)
  }
  for (const r of registros) {
    const chave =
      r.tipo === 'pericia' ? `pericia|${wlBase(r.alvo)}|${r.rank}` : `${r.tipo}|${wlBase(r.alvo)}`
    if (atribuidos.has(chave)) continue
    // marca o consumo: registros DUPLICADOS no FM (clique repetido, #495)
    // rendem UM gasto, não um por duplicata
    atribuidos.add(chave)
    const card = cardDe(r.nivel)
    if (r.tipo === 'tecnica' && r.rank && r.rank !== 'B') {
      poolTec.takeAt(r.rank, r.nivel)
      card.gastos.tecnicas.push({ link: r.alvo, rank: r.rank, planejado: true })
    } else if (r.tipo === 'pericia' && r.rank && r.rank !== 'B') {
      poolPer.takeAt(r.rank, r.nivel)
      card.gastos.pericias.push({ nome: r.alvo, rank: r.rank, fonte: 'Slot', planejado: true })
    } else if (r.tipo === 'magia' && r.rank) {
      poolMag.takeAt(r.rank, r.nivel)
      card.gastos.magias.push({
        escola: r.contexto ?? '',
        link: r.alvo,
        rank: r.rank,
        secundaria: false,
        planejado: true,
      })
    } else if (r.tipo === 'especialidade' || r.tipo === 'maestria') {
      card.gastos.especialidades.push({
        pericia: r.contexto ?? '',
        alvo: r.alvo,
        tipo: r.tipo,
        planejado: true,
      })
    }
  }

  // ── estado ENTRANDO por nível (contexto travado dos popups) ───────────────
  // Rank de cada perícia ao ENTRAR no nível = piso de regra do snapshot
  // (incrementos NÃO-slot — só regras ≤ L disparam nele) + gastos atribuídos
  // a níveis ANTERIORES. Elegíveis do rank R = entrando no degrau abaixo.
  {
    const RANK_N: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
    const LETRAS = ['N', 'A', 'E', 'M'] as const
    const acumulado = new Map<string, number>()
    for (const card of cards) {
      const snap = snaps[card.nivel - 1]!
      const entrando: Record<string, 'N' | 'A' | 'E' | 'M'> = {}
      const pisoRegra: Record<string, 'N' | 'A' | 'E' | 'M'> = {}
      for (const row of rowsOf(snap.derived, 'Pericias', 'Lista')) {
        const nome = String(row.Nome ?? '')
        let piso = 0
        for (const inc of (row.Incrementos ?? []) as Row[]) {
          for (const r of RANKS_AEM) {
            const v = inc[r]
            if (typeof v === 'string' && !v.startsWith('Slot')) piso = Math.max(piso, RANK_N[r]!)
          }
        }
        pisoRegra[nome] = LETRAS[piso]!
        entrando[nome] = LETRAS[Math.max(piso, acumulado.get(nome) ?? 0)]!
      }
      card.periciasEntrando = entrando
      card.periciasPisoRegra = pisoRegra
      const gastouAqui = new Set(card.gastos.pericias.map((g) => `${g.nome}|${g.rank}`))
      for (const r of RANKS_AEM) {
        const degrau = RANK_N[r]! - 1
        card.periciasElegiveis[r] = Object.entries(entrando)
          .filter(([nome, rk]) => RANK_N[rk] === degrau && !gastouAqui.has(`${nome}|${r}`))
          .map(([nome]) => nome)
      }
      for (const g of card.gastos.pericias) {
        if (g.fonte === 'Passado') continue
        acumulado.set(g.nome, Math.max(acumulado.get(g.nome) ?? 0, RANK_N[g.rank]!))
      }
    }
  }

  // ── #493: reatribuição por CADEIA DE DERIVAÇÃO ────────────────────────────
  // Item comprado por slot (ou pick salvo) vive no FM em TODOS os snapshots →
  // as regras dele rodam desde o nível 1 e os ganhos/escolhas derivados caíam
  // no card 1. Nível efetivo de um derivado = max(nível em que apareceu,
  // nível do PAI na cadeia). Itera até estabilizar (cadeias multi-nível).
  const nivelDe = new Map<string, number>()
  const anota = (wl: string, nivel: number) => {
    const b = wlBase(wl)
    nivelDe.set(b, Math.max(nivelDe.get(b) ?? 1, nivel))
  }
  for (const c of cards) {
    for (const wl of [...c.habilidades, ...c.tecnicasRegra, ...c.acoesRegra]) anota(wl, c.nivel)
    for (const g of c.gastos.tecnicas) anota(g.link, c.nivel)
    for (const g of c.gastos.magias) anota(g.link, c.nivel)
    for (const e of c.escolhas) if (e.pick) anota(e.pick, c.nivel)
  }
  const paiDaFonte = (fonte: string | undefined): string | null => {
    const m = /^(?:Regra|Escolha)(?:\.\d+)?\.\[\[(.+?)\]\]$/.exec(fonte ?? '')
    return m ? wlBase(`[[${m[1]}]]`) : null
  }
  for (let pass = 0; pass < 4; pass++) {
    let mudou = false
    for (const card of cards) {
      for (const key of ['habilidades', 'tecnicasRegra', 'acoesRegra'] as const) {
        for (const wl of [...card[key]]) {
          const pai = paiDaFonte(card.fonteDe[wl])
          const alvo = pai ? (nivelDe.get(pai) ?? 1) : 1
          if (alvo > card.nivel) {
            card[key] = card[key].filter((x) => x !== wl)
            const dest = cards[Math.min(nivelMax, alvo) - 1]!
            dest[key].push(wl)
            dest.fonteDe[wl] = card.fonteDe[wl]!
            anota(wl, alvo)
            mudou = true
          }
        }
      }
      for (const m of [...card.magiasRegra]) {
        const pai = paiDaFonte(m.fonte)
        const alvo = pai ? (nivelDe.get(pai) ?? 1) : 1
        if (alvo > card.nivel) {
          card.magiasRegra = card.magiasRegra.filter((x) => x !== m)
          cards[Math.min(nivelMax, alvo) - 1]!.magiasRegra.push(m)
          mudou = true
        }
      }
      for (const e of [...card.escolhas]) {
        const alvo = nivelDe.get(wlBase(e.sourceNote)) ?? e.gateLevel
        if (alvo > card.nivel) {
          card.escolhas = card.escolhas.filter((x) => x !== e)
          e.gateLevel = alvo
          cards[Math.min(nivelMax, alvo) - 1]!.escolhas.push(e)
          if (e.pick) anota(e.pick, alvo)
          mudou = true
        }
      }
    }
    if (!mudou) break
  }

  return cards
}
