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
import { ehEssencia, ehMenor, migrarEssenciasParaSlots } from './essencia-slots'
import type { ChoiceDescriptor } from './resolve-choices'
import { addTecnicaToLista } from './apply-tecnica-edit'
import { addMagiaToEscola } from './apply-magia-edit'
import { ESCOLAS_POR_ESSENCIA, MAGIA_ESCOLA_NOME, targetToModelPath } from './projection'
import { caminhoSlots, ehEssencialDoCatalogo, ESCOLA_ESSENCIAL, poolsDoGasto, type PoolMagia } from './slots-magia'

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
  /** Essência comprada com o slot de magia (Habilidades.Lista, Slot.X) —
   *  escola = a das essências; desfaz-se no Círculo, não aqui. */
  essencia?: boolean
  /** Pool que pagou o gasto (rules/slots-magia.ts). */
  pool?: PoolMagia
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
  valorRaw?: string
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
  /** Magia da lista SECUNDÁRIA (Escola Arcana Menor etc., #516). */
  sec?: boolean
}

/** Registro de ESSÊNCIA: tipo `magia` (contexto = escola das essências) cujo
 *  alvo é uma nota de essência — o gasto real é a linha `Slot.<rank>` em
 *  `Habilidades.Lista`, não a escola. */
export function ehRegistroEssencia(r: Pick<GastoRegistrado, 'tipo' | 'alvo'>): boolean {
  return r.tipo === 'magia' && ehEssencia(wlBase(r.alvo))
}

/** Círculo das Essências de UM nível do Planejamento: só nos níveis que
 *  ganham slot A/E/M na escola das essências. `fm` = derivado do nível sem as
 *  essências compradas DEPOIS dele; `fmSalvo` = só as compradas NESTE nível
 *  (as que o Círculo do card pode desfazer); `slots` = os ganhos no nível. */
export interface CirculoNivel {
  sec: boolean
  fm: Fm
  fmSalvo: Fm
  slots: Record<'A' | 'E' | 'M', { total: number; usados: number }>
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
  /** Escolas SECUNDÁRIAS proficientes no nível (Escola Arcana Menor etc.) —
   *  o derivado não materializa as rows; vem do CALC com o nome canônico do
   *  registro MAGIA_ESCOLA_NOME (#516). */
  escolasSecNivel: Array<{ nome: string; prof: string }>
  tecnicasRegra: string[]
  acoesRegra: string[]
  /** Magias concedidas por regra neste nível (escola → links). */
  magiasRegra: Array<{ escola: string; link: string; secundaria: boolean; fonte?: string }>
  /** Slots GANHOS neste nível (delta vs nível anterior). `magiasSec` é o
   *  escopo SECUNDÁRIO (Magias.Secundaria.Slots — Escola Arcana Menor etc.);
   *  a UI de slots primários ignora, mas a atribuição de gastos usa (#508). */
  slots: {
    pericias: SlotDelta
    tecnicas: SlotDelta
    /** Pool ARCANA (`Magias.Slots`). */
    magias: SlotDelta
    magiasSec?: SlotDelta
    /** Pools por escola (rules/slots-magia.ts): Anima (essência) e Essencial. */
    anima?: SlotDelta
    animaSec?: SlotDelta
    essencial?: SlotDelta
    essencialSec?: SlotDelta
  }
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
  /** Círculo das Essências do nível (primário e/ou Menor). */
  circulos: CirculoNivel[]
}

const ZERO_SLOTS = (): SlotDelta => ({ B: 0, A: 0, E: 0, M: 0 })
/** Namespaces (sem `.Slots`) dos pools por escola. */
const NS_POOL = {
  anima: caminhoSlots('anima', false).replace(/\.Slots$/, ''),
  animaSec: caminhoSlots('anima', true).replace(/\.Slots$/, ''),
  essencial: caminhoSlots('essencial', false).replace(/\.Slots$/, ''),
  essencialSec: caminhoSlots('essencial', true).replace(/\.Slots$/, ''),
}
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
  take(rank: 'B' | 'A' | 'E' | 'M', minNivel = 1, maxNivel = Infinity): number | null {
    const ordem = RANKS_BAEM.slice(RANKS_BAEM.indexOf(rank))
    for (const r of ordem) {
      const pool = this.pools[r]!
      const idx = pool.findIndex((n) => n >= minNivel && n <= maxNivel)
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
  takeAt(rank: 'B' | 'A' | 'E' | 'M', nivel: number): boolean {
    const pool = this.pools[rank]!
    const exato = pool.indexOf(nivel)
    if (exato !== -1) pool.splice(exato, 1)
    return exato !== -1
  }
}

/** Nível até onde o plano já foi MATERIALIZADO na ficha
 *  (`Planejamento.nivelSincronizado`). O sync plano→ficha só aplica registros
 *  ACIMA dele (o herói subiu de nível); abaixo, a ficha é a verdade. Ausente
 *  (herói de antes do campo) = já sincronizado no nível atual — nunca
 *  reaplica o passado (report 95b2e420: trocar Enganação por Diplomacia na
 *  ficha e abrir o planejamento devolvia a Enganação, toda vez). */
export function nivelSincronizado(fm: Fm, nivelAtual: number): number {
  const p = fm['Planejamento']
  const v = p && typeof p === 'object' ? (p as Record<string, unknown>)['nivelSincronizado'] : undefined
  return typeof v === 'number' && Number.isFinite(v) ? v : nivelAtual
}

/** A ficha (FM CRU — o que o sync escreve) tem o gasto do registro? `null`
 *  quando o registro não é do tipo que o sync materializa (sem veredito). */
export function fichaTemGasto(fm: Fm, r: GastoRegistrado): boolean | null {
  const base = wlBase(r.alvo)
  if (r.tipo === 'pericia') {
    if (!r.rank || r.rank === 'B') return null
    const row = rowsOf(fm, 'Pericias', 'Lista').find((x) => String(x.Nome) === r.alvo)
    const incs = Array.isArray(row?.Incrementos) ? (row!.Incrementos as Row[]) : []
    return incs.some((i) => typeof i[r.rank!] === 'string' && String(i[r.rank!]).startsWith('Slot'))
  }
  if (r.tipo === 'tecnica') {
    if (!r.rank || r.rank === 'B') return null
    return rowsOf(fm, 'Tecnicas', 'Lista').some((x) => Object.keys(x).some((k) => wlBase(k) === base))
  }
  if (r.tipo === 'magia') {
    if (!r.rank || !r.contexto) return null
    if (ehRegistroEssencia(r))
      return fontedEntries(rowsOf(fm, 'Habilidades', 'Lista')).some(
        (e) => wlBase(e.link) === base && e.fonte.startsWith('Slot'),
      )
    const escolas = r.sec ? rowsOf(fm, 'Magias', 'Secundaria', 'Lista') : rowsOf(fm, 'Magias', 'Lista')
    return escolas.some((esc) =>
      (Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : []).some((x) => Object.keys(x).some((k) => wlBase(k) === base)),
    )
  }
  if (!r.contexto) return null
  const campo = r.tipo === 'especialidade' ? 'Especializacao' : 'Maestria'
  const row = rowsOf(fm, 'Pericias', 'Lista').find((x) => String(x.Nome) === r.contexto)
  return wlBase(String(row?.[campo] ?? '')) === base
}

/** Tira os registros que a ficha CONTRADIZ — no PASSADO já sincronizado: o jogador desfez/trocou o gasto na própria ficha depois, e o
 *  registro velho é que está errado. Sem isso o sync o reaplicava e o
 *  pinsFaltantes ainda registrava o gasto novo por cima — plano com os dois e
 *  "quantidades incorretas". */
export function semRegistrosContraditos(
  fm: Fm,
  registros: GastoRegistrado[],
  nivelAtual: number,
  sinc: number,
): { mudou: boolean; registros: GastoRegistrado[] } {
  const passado = Math.min(nivelAtual, sinc)
  const futuro = Math.max(nivelAtual, sinc)
  const out = registros.filter((r) => {
    const tem = fichaTemGasto(fm, r)
    // passado sincronizado sem o gasto na ficha: desfeito/trocado na ficha
    if (r.nivel <= passado && tem === false) return false
    // registro de nível NUNCA sincronizado cujo gasto a ficha já tem: o gasto
    // é real, o nível do registro é que está errado (o pinsFaltantes regrava
    // no nível certo) — senão o sync o "desfazia" da ficha
    if (r.nivel > futuro && tem === true) return false
    return true
  })
  return { mudou: out.length !== registros.length, registros: out }
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
      if (!g.planejado && !tem('magia', g.link))
        out.push({
          nivel: c.nivel,
          tipo: 'magia',
          rank: g.rank,
          alvo: g.link,
          contexto: g.escola,
          ...(g.secundaria ? { sec: true } : {}),
        })
    }
    for (const g of c.gastos.especialidades) {
      if (!g.planejado && !tem(g.tipo, g.alvo))
        out.push({ nivel: c.nivel, tipo: g.tipo, alvo: g.alvo, contexto: g.pericia })
    }
  }
  return out
}

/** Pins que SOBREVIVEM ao filtro de contradição: um gasto real que os cards
 *  atribuem a um nível acima do herói (ficha "adiantada": Nível 1 com
 *  Elementalista e magias de classe secundária já gravadas) nunca vira
 *  registro — senão o pin entrava, o semRegistrosContraditos o tirava no
 *  rebuild seguinte e a aba gravava/regravava pra sempre (Inri Prismo,
 *  2026-10-25: Planejamento travado). */
export function pinsValidos(
  fm: Fm,
  cards: LevelCard[],
  registros: GastoRegistrado[],
  nivelAtual: number,
): GastoRegistrado[] {
  const pins = pinsFaltantes(cards, registros)
  return semRegistrosContraditos(fm, pins, nivelAtual, nivelSincronizado(fm, nivelAtual)).registros
}

/** Sanitiza registros DESLOCADOS (versões antigas gravaram níveis errados —
 *  ex.: "tudo no N1"): registro cujo nível não tem slot do rank é MOVIDO pro
 *  primeiro nível com slot livre daquele rank. Alvo/rank/tipo preservados —
 *  nada se perde; só o nível é corrigido. Especialidades/maestrias não usam
 *  slot e ficam como estão. */
export function sanitizarRegistros(
  cards: LevelCard[],
  registros: GastoRegistrado[],
  /** Nível do herói: registro do PASSADO (≤ ele) só é corrigido dentro do
   *  passado — empurrar um gasto real pro futuro o fazia ser "contradito" no
   *  rebuild seguinte e voltar (escrita em loop numa ficha estourada). */
  nivelAtual = Infinity,
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
  // passada 0.5: MAESTRIA ÓRFÃ (#507) — maestria depende da especialidade da
  // perícia; se a espec sumiu de TODO lugar (nem gasto real/planejado nos
  // cards, nem registro), o registro de maestria cai junto. Sem isso, tirar
  // a espec deixava a maestria "selecionada" pro nível futuro pra sempre.
  const periciasComEspec = new Set<string>()
  for (const c of cards) {
    for (const g of c.gastos.especialidades) {
      if (g.tipo === 'especialidade') periciasComEspec.add(g.pericia)
    }
  }
  for (const r of registros) {
    if (r.tipo === 'especialidade' && r.contexto) periciasComEspec.add(r.contexto)
  }
  const comEspec = registros.filter(
    (r) => !(r.tipo === 'maestria' && r.contexto && !periciasComEspec.has(r.contexto)),
  )
  // passada 0.6: MAGIA SECUNDÁRIA ÓRFÃ (#518) — a escola secundária vem de
  // uma cadeia (técnica de multiclasse → escola); se a cadeia foi removida,
  // nenhum card tem a escola viva e o registro sec cai junto.
  const escolasSecVivas = new Set<string>()
  for (const c of cards) for (const e of c.escolasSecNivel ?? []) escolasSecVivas.add(e.nome)
  const comEscolaSec = comEspec.filter(
    (r) => !(r.tipo === 'magia' && r.sec && r.contexto && !escolasSecVivas.has(r.contexto)),
  )
  const dropouOrfa = comEscolaSec.length !== registros.length
  registros = comEscolaSec
  const pools: Record<string, SlotPools> = {
    pericia: new SlotPools(cards.map((c) => c.slots.pericias)),
    tecnica: new SlotPools(cards.map((c) => c.slots.tecnicas)),
    magia: new SlotPools(cards.map((c) => c.slots.magias)),
    magiaSec: new SlotPools(cards.map((c) => c.slots.magiasSec ?? ZERO_SLOTS())),
    anima: new SlotPools(cards.map((c) => c.slots.anima ?? ZERO_SLOTS())),
    animaSec: new SlotPools(cards.map((c) => c.slots.animaSec ?? ZERO_SLOTS())),
    essencial: new SlotPools(cards.map((c) => c.slots.essencial ?? ZERO_SLOTS())),
    essencialSec: new SlotPools(cards.map((c) => c.slots.essencialSec ?? ZERO_SLOTS())),
  }
  // pools que podem pagar o registro (slots por escola — rules/slots-magia.ts):
  // o que a timeline já atribuiu ao gasto (ela conhece o catálogo); sem gasto
  // nos cards, essência → Anima e magia → Arcana ou Essencial. Secundária tem
  // os próprios. Sem isso, a Branca estourada era "corrigida" pra um slot
  // Essencial livre e voltava no rebuild — escrita em loop (Flohx/Saladin).
  const poolDoCard = new Map<string, PoolMagia>()
  for (const c of cards)
    for (const g of c.gastos.magias) if (g.pool) poolDoCard.set(`${wlBase(g.link)}|${g.secundaria ? 1 : 0}`, g.pool)
  const poolsDe = (r: GastoRegistrado): string[] => {
    if (r.tipo !== 'magia') return [r.tipo]
    const sfx = r.sec ? 'Sec' : ''
    const doCard = poolDoCard.get(`${wlBase(r.alvo)}|${r.sec ? 1 : 0}`)
    if (ehRegistroEssencia(r) || doCard === 'anima') return [`anima${sfx}`]
    if (doCard === 'arcana') return [`magia${sfx}`]
    return [`essencial${sfx}`, `magia${sfx}`]
  }
  // passada 1: quem tem slot no próprio nível reivindica primeiro
  const claims = registros.map((r) => {
    if (!r.rank || !(r.tipo in pools)) return { r, ok: true }
    return { r, ok: poolsDe(r).some((k) => pools[k]!.takeAt(r.rank!, r.nivel)) }
  })
  // passada 2: deslocados vão pro primeiro nível livre do MESMO rank
  let mudou = dedupou || dropouOrfa
  const out = claims.map(({ r, ok }) => {
    if (ok || !r.rank || !(r.tipo in pools)) return r
    let novo: number | null = null
    for (const k of poolsDe(r)) if (novo === null) novo = pools[k]!.takeSameRank(r.rank)
    if (novo !== null && r.nivel <= nivelAtual && novo > nivelAtual) return r
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
  fm = migrarEssenciasParaSlots(fm)
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
  // PLANEJADOS materializados por nível: técnica/magia/espec registrada pro
  // futuro entra no FM da projeção a partir do SEU nível — sem isso as
  // escolhas internas do item (ex.: "Classe Secundária" do Treinamento) nunca
  // eram descobertas pra níveis futuros (#505, report 2026-08-26).
  const regsPlanejados = gastosRegistrados(fm)
  const materializaPlanejados = (base: Fm, nivel: number): Fm => {
    let out = base
    const emLista = (rows: Row[], alvo: string) =>
      fontedEntries(rows).some((e) => wlBase(e.link) === wlBase(alvo))
    const magiaAprendida = (alvo: string) =>
      rowsOf(out, 'Magias', 'Lista').some((esc) =>
        (Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : []).some((r) =>
          Object.keys(r).some((k) => wlBase(k) === wlBase(alvo)),
        ),
      )
    for (const r of regsPlanejados) {
      if (r.nivel > nivel) continue
      if (ehRegistroEssencia(r) && r.rank && r.rank !== 'B') {
        // essência planejada: o gasto é a linha Slot.<rank> em Habilidades
        const lista = rowsOf(out, 'Habilidades', 'Lista')
        if (!emLista(lista, r.alvo))
          out = {
            ...out,
            Habilidades: {
              ...((out['Habilidades'] as Record<string, unknown>) ?? {}),
              Lista: [...lista, { [`[[${wlBase(r.alvo)}]]`]: `Slot.${r.rank}` }],
            },
          }
      } else if (r.tipo === 'tecnica' && r.rank && r.rank !== 'B') {
        const lista = rowsOf(out, 'Tecnicas', 'Lista')
        if (!emLista(lista, r.alvo))
          out = {
            ...out,
            Tecnicas: {
              ...((out['Tecnicas'] as Record<string, unknown>) ?? {}),
              Lista: addTecnicaToLista(lista as never, r.alvo, r.rank as 'A' | 'E' | 'M'),
            },
          }
      } else if (r.tipo === 'magia' && r.rank && r.contexto) {
        if (r.sec) {
          const secObj = (out['Magias'] as Record<string, unknown>)?.['Secundaria'] as
            | Record<string, unknown>
            | undefined
          let lista = rowsOf(out, 'Magias', 'Secundaria', 'Lista')
          if (!lista.some((e) => String(e.Nome) === r.contexto))
            lista = [...lista, { Nome: r.contexto, Proficiencia: 'N', Lista: [] }]
          out = {
            ...out,
            Magias: {
              ...((out['Magias'] as Record<string, unknown>) ?? {}),
              Secundaria: {
                ...(secObj ?? {}),
                Lista: addMagiaToEscola(lista as never, r.contexto, r.alvo, r.rank),
              },
            },
          }
        } else if (!magiaAprendida(r.alvo))
          out = {
            ...out,
            Magias: {
              ...((out['Magias'] as Record<string, unknown>) ?? {}),
              Lista: addMagiaToEscola(rowsOf(out, 'Magias', 'Lista') as never, r.contexto, r.alvo, r.rank),
            },
          }
      } else if ((r.tipo === 'especialidade' || r.tipo === 'maestria') && r.contexto) {
        const campo = r.tipo === 'especialidade' ? 'Especializacao' : 'Maestria'
        const rows = rowsOf(out, 'Pericias', 'Lista')
        const row = rows.find((x) => String(x.Nome) === r.contexto)
        if (row && !String(row[campo] ?? '').trim())
          out = {
            ...out,
            Pericias: {
              ...((out['Pericias'] as Record<string, unknown>) ?? {}),
              Lista: rows.map((x) => (x === row ? { ...x, [campo]: r.alvo } : x)),
            },
          }
      }
    }
    return out
  }
  // picks do PLANO viram transients nas projeções: a escolha planejada
  // materializa o que o USUÁRIO escolheu, não o default alfabético (#511)
  const picksPlano = ((): Record<string, string> => {
    const p = fm['Planejamento']
    const raw = p && typeof p === 'object' ? (p as Record<string, unknown>)['picks'] : null
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {}
  })()
  const snaps: Snap[] = []
  for (let nivel = 1; nivel <= nivelMax; nivel++) {
    const fmNivel = materializaPlanejados({ ...fm, ['Nível']: nivel, Nivel: nivel }, nivel)
    const { projection } = await projectHeroRules(fmNivel, catalog, load, picksPlano)
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
      for (const f of snap.ruleSources[targetToModelPath(`${ns}.Slots.${rank}`) ?? ''] ?? []) {
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
    const slotGrantsDe = (deltas: LevelCard['slots']): LevelCard['slotGrants'] => {
      const out: LevelCard['slotGrants'] = []
      const NS: Array<[string, 'Perícia' | 'Técnica' | 'Magia', SlotDelta]> = [
        ['Pericias', 'Perícia', deltas.pericias],
        ['Tecnicas', 'Técnica', deltas.tecnicas],
        ['Magias', 'Magia', deltas.magias],
        ['Magias.Secundaria', 'Magia', deltas.magiasSec ?? ZERO_SLOTS()],
        [NS_POOL.anima, 'Magia', deltas.anima ?? ZERO_SLOTS()],
        [NS_POOL.animaSec, 'Magia', deltas.animaSec ?? ZERO_SLOTS()],
        [NS_POOL.essencial, 'Magia', deltas.essencial ?? ZERO_SLOTS()],
        [NS_POOL.essencialSec, 'Magia', deltas.essencialSec ?? ZERO_SLOTS()],
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
        valorRaw: (c as unknown as { valorRaw?: string }).valorRaw,
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
    const escolasProfNivel: LevelCard['escolasProfNivel'] = rowsOf(cur.derived, 'Magias', 'Lista')
      .filter((e) => String(e.Proficiencia ?? 'N') !== 'N' && String(e.Nome) !== 'Tesouros')
      .map((e) => ({ nome: String(e.Nome ?? ''), prof: String(e.Proficiencia ?? 'N') }))
    // Arcana ESSENCIAL (escola oculta, só no calc — #417): entra quando tem
    // proficiência, pra ser oferecida no nível (slot Essencial ou Arcana)
    const profEss = String(cur.calculated['Magias.Lista.ArcanaEssencial.Proficiencia'] ?? 'N')
    if (profEss === 'A' || profEss === 'E' || profEss === 'M')
      escolasProfNivel.push({ nome: ESCOLA_ESSENCIAL, prof: profEss })
    // Secundárias: rows salvas ∪ proficiências do CALC (o merge não
    // materializa a Lista secundária — só Slots/Potencia/EM)
    const escolasSecNivel: LevelCard['escolasSecNivel'] = rowsOf(
      cur.derived,
      'Magias',
      'Secundaria',
      'Lista',
    )
      .filter((e) => String(e.Proficiencia ?? 'N') !== 'N')
      .map((e) => ({ nome: String(e.Nome ?? ''), prof: String(e.Proficiencia ?? 'N') }))
    for (const [k, v] of Object.entries(cur.calculated)) {
      const m = /^Magias\.Secundaria\.Lista\.(.+)\.Proficiencia$/.exec(k)
      if (!m || String(v) === 'N') continue
      const nome = m[1] === 'ArcanaEssencial' ? ESCOLA_ESSENCIAL : (MAGIA_ESCOLA_NOME[m[1]!] ?? m[1]!)
      if (!escolasSecNivel.some((e) => e.nome === nome)) escolasSecNivel.push({ nome, prof: String(v) })
    }

    const slotsCard: LevelCard['slots'] = {
      pericias: slotsDelta('Pericias'),
      tecnicas: slotsDelta('Tecnicas'),
      magias: slotsDelta('Magias'),
      magiasSec: slotsDelta('Magias.Secundaria'),
      anima: slotsDelta(NS_POOL.anima),
      animaSec: slotsDelta(NS_POOL.animaSec),
      essencial: slotsDelta(NS_POOL.essencial),
      essencialSec: slotsDelta(NS_POOL.essencialSec),
    }
    cards.push({
      nivel,
      // essência comprada com slot é gasto (gastos.magias), não concessão
      habilidades: novos(['Habilidades', 'Lista']).filter((l) => {
        const fonte = fontedEntries(rowsOf(cur.derived, 'Habilidades', 'Lista')).find((e) => e.link === l)?.fonte
        return !(typeof fonte === 'string' && fonte.startsWith('Slot'))
      }),
      fonteDe,
      periciasElegiveis,
      periciasEntrando: {},
      periciasPisoRegra: {},
      escolasProfNivel,
      escolasSecNivel,
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
        magias: [
          ...new Set(['Magias', 'Magias.Secundaria', ...Object.values(NS_POOL)].flatMap((ns) => slotFontesDe(ns))),
        ],
      },
      slotGrants: slotGrantsDe(slotsCard),
      gastos: { tecnicas: [], pericias: [], magias: [], especialidades: [] },
      escolhas,
      escalares,
      circulos: [],
    })
  }

  // ── atribuição de gastos: registro explícito PRIMEIRO, earliest-fit no
  // resto (legados sem nível gravado) ────────────────────────────────────────
  const poolTec = new SlotPools(cards.map((c) => c.slots.tecnicas))
  const poolPer = new SlotPools(cards.map((c) => c.slots.pericias))
  // Pools de MAGIA por escola (rules/slots-magia.ts) × escopo. Os SECUNDÁRIOS
  // são separados — sem isso os gastos secundários consumiam o pool primário
  // vazio e transbordavam pro N10 (#508, report Simões).
  const pools = (k: keyof LevelCard['slots']) => new SlotPools(cards.map((c) => c.slots[k] ?? ZERO_SLOTS()))
  const poolsMagia: Record<PoolMagia, [SlotPools, SlotPools]> = {
    arcana: [pools('magias'), pools('magiasSec')],
    anima: [pools('anima'), pools('animaSec')],
    essencial: [pools('essencial'), pools('essencialSec')],
  }
  const ehEssencial = ehEssencialDoCatalogo(catalog)
  /** Atribui um gasto de magia/essência ao primeiro pool da preferência com
   *  vaga — no nível do registro, ou earliest-fit. */
  const atribuiMagia = (
    prefs: PoolMagia[],
    sec: boolean,
    rank: 'B' | 'A' | 'E' | 'M',
    nivelReg?: number,
  ): { nivel: number | null; pool: PoolMagia } => {
    if (nivelReg !== undefined) {
      const p = prefs.find((x) => poolsMagia[x][sec ? 1 : 0].takeAt(rank, nivelReg))
      return { nivel: nivelReg, pool: p ?? prefs[prefs.length - 1]! }
    }
    // gasto REAL (sem registro) já aconteceu: nunca num nível acima do herói
    // — o que não cabe fica no presente (#509), estourando o contador
    for (const p of prefs) {
      const n = poolsMagia[p][sec ? 1 : 0].take(rank, 1, nivelHeroi)
      if (n !== null) return { nivel: n, pool: p }
    }
    return { nivel: null, pool: prefs[prefs.length - 1]! }
  }
  // Gasto sem slot explicável no ladder (pool esgotado/escopo desconhecido)
  // pertence ao PRESENTE do herói — cair no N10 espalhava tudo no fim do
  // roadmap (#509, report Munro).
  const nivelHeroi = Math.max(1, Math.min(nivelMax, Number(fm['Nível'] ?? fm['Nivel']) || 1))
  const cardDe = (nivel: number | null): LevelCard =>
    cards[Math.max(1, Math.min(nivelMax, nivel ?? nivelHeroi)) - 1]!
  const registros = gastosRegistrados(fm)
  const registroDe = (
    tipo: GastoRegistrado['tipo'],
    alvoBase: string,
    contexto?: string,
    rank?: GastoRegistrado['rank'],
    sec?: boolean,
  ) =>
    registros.find(
      (r) =>
        r.tipo === tipo &&
        wlBase(r.alvo) === alvoBase &&
        (rank === undefined || r.rank === rank) &&
        (tipo !== 'magia' || !!r.sec === !!sec) &&
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

  // Magias com fonte Slot.<R> (B incluso), primária + secundária — cada uma
  // no pool da escola dela; as de pool ÚNICO primeiro (a Essencial só
  // transborda pro Arcana depois que as Arcanas pegaram as vagas delas).
  const gastosMagia: Array<{ escola: string; link: string; rank: 'B' | 'A' | 'E' | 'M'; secundaria: boolean; prefs: PoolMagia[] }> = []
  for (const secundaria of [false, true]) {
    const escolas = secundaria
      ? rowsOf(fm, 'Magias', 'Secundaria', 'Lista')
      : rowsOf(fm, 'Magias', 'Lista')
    for (const esc of escolas) {
      const escola = String(esc.Nome ?? '')
      if (escola === 'Tesouros') continue
      for (const e of fontedEntries(Array.isArray(esc.Lista) ? (esc.Lista as Row[]) : [])) {
        const m = /^Slot\.([BAEM])$/.exec(e.fonte)
        if (!m) continue
        gastosMagia.push({ escola, link: e.link, rank: m[1] as 'B' | 'A' | 'E' | 'M', secundaria, prefs: poolsDoGasto(e.link, escola, ehEssencial) })
      }
    }
  }
  gastosMagia.sort((a, b) => a.prefs.length - b.prefs.length)
  for (const g of gastosMagia) {
    const reg = registroDe('magia', wlBase(g.link), g.escola, undefined, g.secundaria)
    const { nivel, pool } = atribuiMagia(g.prefs, g.secundaria, g.rank, reg?.nivel)
    cardDe(nivel).gastos.magias.push({ escola: g.escola, link: g.link, rank: g.rank, secundaria: g.secundaria, pool })
  }

  // ESSÊNCIAS compradas com slot de magia (Habilidades.Lista, Slot.<R>):
  // gastam o pool da ANIMA (Menor = secundário). A que a regra passou a conceder
  // (pura da sintonia de ficha antiga) não gasta — o derivado do nível do
  // herói já traz a fonte da regra (refundSlotsConcedidos).
  const derivadoAtual = snaps[nivelHeroi - 1]?.derived ?? {}
  const fonteDerivada = new Map(
    fontedEntries(rowsOf(derivadoAtual, 'Habilidades', 'Lista')).map((e) => [wlBase(e.link), e.fonte]),
  )
  for (const e of fontedEntries(rowsOf(fm, 'Habilidades', 'Lista'))) {
    const m = /^Slot\.([AEM])$/.exec(e.fonte)
    const alvo = wlBase(e.link)
    if (!m || !ehEssencia(alvo)) continue
    if (fonteDerivada.has(alvo) && !fonteDerivada.get(alvo)!.startsWith('Slot')) continue
    const rank = m[1] as 'A' | 'E' | 'M'
    const secundaria = ehMenor(alvo)
    const escola = [...ESCOLAS_POR_ESSENCIA][0]!
    const reg = registroDe('magia', alvo, escola, undefined, secundaria)
    const { nivel } = atribuiMagia(['anima'], secundaria, rank, reg?.nivel)
    cardDe(nivel).gastos.magias.push({ escola, link: e.link, rank, secundaria, essencia: true, pool: 'anima' })
  }
  // A linha salva da essência existe em TODOS os snapshots (gasto de slot
  // não tem nível no FM), então as magias que ela concede apareciam no N1:
  // vão pro card onde a essência foi comprada (#503, "não selecionei uma
  // essência que dá essas magias nesse nível").
  const nivelDaEssencia = new Map<string, number>()
  for (const c of cards) for (const g of c.gastos.magias) if (g.essencia) nivelDaEssencia.set(wlBase(g.link), c.nivel)
  if (nivelDaEssencia.size) {
    const mover: Array<[number, LevelCard['magiasRegra'][number]]> = []
    for (const c of cards) {
      c.magiasRegra = c.magiasRegra.filter((m) => {
        const pai = /^Regra\.\[\[(.+?)\]\]$/.exec(m.fonte ?? '')?.[1]
        const nivel = pai ? nivelDaEssencia.get(wlBase(`[[${pai}]]`)) : undefined
        if (nivel === undefined || nivel === c.nivel) return true
        mover.push([nivel, m])
        return false
      })
    }
    for (const [nivel, m] of mover) cardDe(nivel).magiasRegra.push(m)
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
      const prefs = poolsDoGasto(r.alvo, ehRegistroEssencia(r) ? null : (r.contexto ?? ''), ehEssencial)
      const { pool } = atribuiMagia(prefs, !!r.sec, r.rank, r.nivel)
      card.gastos.magias.push({
        pool,
        escola: r.contexto ?? '',
        link: r.alvo,
        rank: r.rank,
        secundaria: !!r.sec,
        planejado: true,
        ...(ehRegistroEssencia(r) ? { essencia: true } : {}),
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
          // nível efetivo = max(pai na cadeia, o PRÓPRIO item): pick de
          // escolha irmã com gate futuro (Escolha.03 → N3) tem nivelDe
          // anotado pela escolha, mas o pai (a nota da subclasse) é N1 —
          // sem o próprio, a Congelante e as magias dela caíam no N1 (#503)
          const alvo = Math.max(pai ? (nivelDe.get(pai) ?? 1) : 1, nivelDe.get(wlBase(wl)) ?? 1)
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

  // ── Círculo das Essências por nível ───────────────────────────────────────
  const nivelEssencia = new Map<string, number>()
  for (const c of cards) for (const g of c.gastos.magias) if (g.essencia) nivelEssencia.set(wlBase(g.link), c.nivel)
  for (const card of cards) {
    const snap = snaps[card.nivel - 1]!
    for (const sec of [false, true]) {
      // só nos níveis que GANHAM slot da Anima (o pool das essências)
      const delta = (sec ? card.slots.animaSec : card.slots.anima) ?? ZERO_SLOTS()
      if (delta.A + delta.E + delta.M <= 0) continue
      const escolas = sec ? card.escolasSecNivel : card.escolasProfNivel
      // proficiência: a row derivada OU o calc (ficha sem as rows de Magias)
      const profCalc = Object.entries(snap.calculated).some(([k, v]) => {
        const m = (sec ? /^Magias\.Secundaria\.Lista\.(.+)\.Proficiencia$/ : /^Magias\.Lista\.(.+)\.Proficiencia$/).exec(k)
        return !!m && String(v) !== 'N' && String(v) !== '' && ESCOLAS_POR_ESSENCIA.has(MAGIA_ESCOLA_NOME[m[1]!] ?? m[1]!)
      })
      if (!profCalc && !escolas.some((e) => ESCOLAS_POR_ESSENCIA.has(e.nome))) continue
      // o derivado traz as essências REAIS em todo nível: as compradas
      // depois deste ficam de fora
      const lista = rowsOf(snap.derived, 'Habilidades', 'Lista').filter((row) => {
        const e = fontedEntries([row])[0]
        if (!e || !e.fonte.startsWith('Slot') || !ehEssencia(wlBase(e.link))) return true
        return (nivelEssencia.get(wlBase(e.link)) ?? 1) <= card.nivel
      })
      const habDerivada = (snap.derived['Habilidades'] as Record<string, unknown>) ?? {}
      const gastosAqui = card.gastos.magias.filter((g) => g.secundaria === sec && g.pool === 'anima')
      const slots = Object.fromEntries(
        (['A', 'E', 'M'] as const).map((t) => [t, { total: delta[t], usados: gastosAqui.filter((g) => g.rank === t).length }]),
      ) as CirculoNivel['slots']
      card.circulos.push({
        sec,
        fm: { ...snap.derived, Habilidades: { ...habDerivada, Lista: lista } },
        fmSalvo: {
          Habilidades: {
            Lista: gastosAqui.filter((g) => g.essencia).map((g) => ({ [`[[${wlBase(g.link)}]]`]: `Slot.${g.rank}` })),
          },
        },
        slots,
      })
    }
  }

  return cards
}
