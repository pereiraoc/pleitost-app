// Avaliador dos guards `quando[]` dos efeitos interativos. ESPELHO do
// plugin pleitost-autosheet src/runtime/condicoes/guard-evaluator.ts
// (mesmos kinds, mesma semântica de sharedKey, Recurso, GrupoArma,
// Empunhadura com "Segurar com Duas Mãos", Seletor e Proficiência).
import type { AtributoId, Proficiencia } from './condition-context'
import type { ConditionalGuard } from './descriptor'
import { isCondicaoOn, isEfeitoOn, type CondicoesAtivasMap, type EfeitosAtivosMap, type SeletoresMap } from './state'

/** Modelo mínimo que a engine precisa (subset do InternalSheetModel do
 *  plugin restrito ao que os guards/modifiers consomem). */
export interface EngineModel {
  meta: { nivel: number }
  atributos: Record<AtributoId, number>
  ataques: { proficiencia: Proficiencia }
  magias: { potencia: number }
  inventario: {
    armas: { lista: Array<{ nome: string; bonusItem: number }> }
    escudo?: { nome: string; propriedade?: string; categoria?: string }
  }
  interativa: {
    condicoesAtivas: CondicoesAtivasMap
    efeitosAtivos: EfeitosAtivosMap
    seletores: SeletoresMap
    recursosRestantes: {
      vitalidade: number
      moral: number
      moralTemporaria: number
      em: number
      escudoDano: number
    }
  }
}

/** Tabela termo → grupos de arma (plugin util/grupo-arma.ts:GRUPOS_POR_TERMO). */
export const GRUPOS_POR_TERMO: Record<string, readonly string[]> = {
  'corpo-a-corpo': ['cac-simples', 'cac-marcial', 'natural'],
  'corpo a corpo': ['cac-simples', 'cac-marcial', 'natural'],
  'distância': ['d-simples', 'd-marcial'],
  'distancia': ['d-simples', 'd-marcial'],
  'especial': ['especial'],
  'natural': ['natural'],
  'simples': ['cac-simples', 'd-simples'],
  'marcial': ['cac-marcial', 'd-marcial'],
}

const GRUPOS_ARMA = ['cac-simples', 'cac-marcial', 'd-simples', 'd-marcial', 'especial', 'natural'] as const

export function isGrupoConhecido(grupo: string | undefined): boolean {
  const g = (grupo ?? '').toLowerCase().trim()
  return g !== '' && (GRUPOS_ARMA as readonly string[]).includes(g)
}

export function isCorpoACorpo(grupo: string | undefined): boolean {
  return GRUPOS_POR_TERMO['corpo-a-corpo'].includes((grupo ?? '').toLowerCase().trim())
}

export function isEspecial(grupo: string | undefined): boolean {
  return (grupo ?? '').toLowerCase().trim() === 'especial'
}

const RANK_NUM: Record<Proficiencia, number> = { N: 0, A: 1, E: 2, M: 3 }

const WIKILINK = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/

/** Label exibida de um wikilink raw (alias > basename); plana intacta. */
export function wikilinkLabel(value: string): string {
  const m = WIKILINK.exec(String(value ?? '').trim())
  if (!m) return String(value ?? '').trim()
  return (m[2] ?? m[1].split('/').pop() ?? '').trim()
}

/** Basename do target de um wikilink raw; string plana intacta. */
export function wikilinkBasename(value: string): string {
  const m = WIKILINK.exec(String(value ?? '').trim())
  if (!m) return String(value ?? '').trim()
  return (m[1].split('/').pop() ?? m[1]).replace(/\.md$/i, '').trim()
}

export interface GuardEvalContext {
  condicoesAtivas: CondicoesAtivasMap
  efeitosAtivos: EfeitosAtivosMap
  armaPropriedades?: string[]
  armaNome?: string
  armaGrupo?: string
  armasEspecializadas?: ReadonlySet<string>
  armaMaos?: number
  formaAtiva?: string | null
  seletores?: SeletoresMap
  effectLabel?: string
  effectSharedFrom?: string
  proficienciaAtaque?: Proficiencia
  recursosRestantes?: EngineModel['interativa']['recursosRestantes']
  armaCounts?: { cac: number; cacAgeis: number; distancia: number }
}

export function evalGuards(guards: readonly ConditionalGuard[], ctx: GuardEvalContext): boolean {
  for (const g of guards) {
    if (!evalOne(g, ctx)) return false
  }
  return true
}

function evalOne(guard: ConditionalGuard, ctx: GuardEvalContext): boolean {
  const value = wikilinkLabel(guard.value)
  const sharedKey = ctx.effectSharedFrom ? `${value}::${ctx.effectSharedFrom}` : null
  switch (guard.kind) {
    case 'Condição':
      if (sharedKey) {
        if (isCondicaoOn(ctx.condicoesAtivas[sharedKey])) return true
        if (isEfeitoOn(ctx.efeitosAtivos[sharedKey])) return true
      }
      return isCondicaoOn(ctx.condicoesAtivas[value]) || isEfeitoOn(ctx.efeitosAtivos[value])
    case 'Estado':
      if (sharedKey) {
        if (isEfeitoOn(ctx.efeitosAtivos[sharedKey])) return true
        if (isCondicaoOn(ctx.condicoesAtivas[sharedKey])) return true
      }
      return isEfeitoOn(ctx.efeitosAtivos[value]) || isCondicaoOn(ctx.condicoesAtivas[value])
    case 'Forma':
      return ctx.formaAtiva != null && ctx.formaAtiva === value
    case 'Propriedade':
      return hasPropriedade(ctx.armaPropriedades, value)
    case 'NãoPropriedade':
      return !hasPropriedade(ctx.armaPropriedades, value)
    case 'Recurso':
      return evalRecurso(value, ctx.recursosRestantes, ctx.armaCounts)
    case 'GrupoArma':
      return evalGrupoArma(value, ctx.armaGrupo)
    case 'GrupoEspecializado':
      return evalGrupoEspecializado(guard.value, ctx.armaNome, ctx.armasEspecializadas)
    case 'Empunhadura':
      return evalEmpunhadura(guard.value, ctx.armaMaos)
    case 'Seletor':
      return evalSeletor(guard.value, ctx.seletores, ctx.effectLabel)
    case 'Proficiência':
      return evalProficiencia(guard.value, ctx.proficienciaAtaque)
    case 'Outro':
    default:
      return false
  }
}

function evalProficiencia(rawValue: string, profAtual: Proficiencia | undefined): boolean {
  if (!profAtual) return false
  const m = rawValue.trim().match(/^(>=|<=|>|<|==|=)\s*([NAEM])$/i)
  if (!m) return false
  const op = m[1]
  const expected = RANK_NUM[m[2].toUpperCase() as Proficiencia]
  const atual = RANK_NUM[profAtual]
  switch (op) {
    case '>=': return atual >= expected
    case '<=': return atual <= expected
    case '>': return atual > expected
    case '<': return atual < expected
    case '=':
    case '==': return atual === expected
  }
  return false
}

function evalGrupoArma(termo: string, armaGrupo: string | undefined): boolean {
  if (!armaGrupo) return false
  const t = termo.toLowerCase().trim()
  const g = armaGrupo.toLowerCase().trim()
  const accepted = GRUPOS_POR_TERMO[t] ?? [t]
  return accepted.includes(g)
}

function evalGrupoEspecializado(
  rawValue: string,
  armaNome: string | undefined,
  armasEspecializadas: ReadonlySet<string> | undefined,
): boolean {
  if (!armaNome) return false
  const want = rawValue.trim().toLowerCase() !== 'false'
  const has = armasEspecializadas?.has(armaNome) ?? false
  return want === has
}

function evalEmpunhadura(rawValue: string, armaMaos: number | undefined): boolean {
  if (armaMaos == null) return false
  const expected = parseInt(rawValue.trim(), 10)
  if (!Number.isFinite(expected)) return false
  return armaMaos === expected
}

function evalSeletor(
  rawValue: string,
  seletores: SeletoresMap | undefined,
  effectLabel: string | undefined,
): boolean {
  if (!seletores || !effectLabel) return false
  const m = /^\[\[([^\]|]+)\|([^\]]+)\]\]$/.exec(rawValue.trim())
  if (!m) return false
  const key = `${effectLabel}::${m[1].trim()}`
  const actual = seletores[key]
  if (actual == null) return false
  return String(actual) === m[2].trim()
}

function evalRecurso(
  value: string,
  recursos: GuardEvalContext['recursosRestantes'],
  armaCounts?: GuardEvalContext['armaCounts'],
): boolean {
  if (!recursos) return false
  const m = value.trim().match(/^([A-Za-zÁÉÍÓÚÂÊÔÇÃÕa-záéíóúâêôçãõ_]+)\s*(>=|<=|>|<|==|=)\s*(-?\d+)$/)
  if (!m) return false
  const atual = recursoValue(m[1], recursos, armaCounts)
  if (atual == null) return false
  const threshold = Number(m[3])
  switch (m[2]) {
    case '>=': return atual >= threshold
    case '<=': return atual <= threshold
    case '>': return atual > threshold
    case '<': return atual < threshold
    case '=':
    case '==': return atual === threshold
  }
  return false
}

function recursoValue(
  nome: string,
  recursos: NonNullable<GuardEvalContext['recursosRestantes']>,
  armaCounts?: GuardEvalContext['armaCounts'],
): number | null {
  const key = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  switch (key) {
    case 'em': return recursos.em
    case 'vitalidade':
    case 'vit': return recursos.vitalidade
    case 'moral': return recursos.moral
    case 'moraltemporaria':
    case 'moraltemp': return recursos.moralTemporaria
    case 'escudo':
    case 'escudodano': return recursos.escudoDano
    case 'armas_cac': return armaCounts?.cac ?? null
    case 'armas_cac_ageis': return armaCounts?.cacAgeis ?? null
    case 'armas_dist':
    case 'armas_distancia': return armaCounts?.distancia ?? null
    default: return null
  }
}

function hasPropriedade(armaProps: string[] | undefined, target: string): boolean {
  if (!armaProps || armaProps.length === 0) return false
  const tNorm = target.toLowerCase()
  return armaProps.some((p) => {
    const m = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/.exec(p.trim())
    if (m) {
      const targetName = (m[1].split('/').pop() ?? m[1]).trim().toLowerCase()
      return targetName === tNorm
    }
    return p.trim().toLowerCase() === tNorm
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup de armas (plugin :357-476)
// ──────────────────────────────────────────────────────────────────────────

export interface ArmaPropsLookup {
  /** basename → propriedades intrínsecas (wikilinks raw). */
  byName: Map<string, string[]>
  /** basename → grupo (cac-marcial/d-simples/natural/…). */
  byGrupo?: Map<string, string>
  /** basename → mãos (1 ou 2). */
  byMaos?: Map<string, number>
}

export function makeArmaPropsLookup(
  armasOptions?: ReadonlyArray<{ nome: string; propriedades: string[]; grupo?: string; maos?: number }>,
): ArmaPropsLookup {
  const byName = new Map<string, string[]>()
  const byGrupo = new Map<string, string>()
  const byMaos = new Map<string, number>()
  for (const a of armasOptions ?? []) {
    byName.set(a.nome, a.propriedades)
    if (a.grupo) byGrupo.set(a.nome, a.grupo)
    if (typeof a.maos === 'number') byMaos.set(a.nome, a.maos)
  }
  return { byName, byGrupo, byMaos }
}

/** True quando estado "Segurar com Duas Mãos" está ON em qualquer mapa
 *  (plugin runtime/condicoes/state-helpers.ts:isStateActive). */
function isSegurarDuasMaosOn(model: EngineModel): boolean {
  return (
    isEfeitoOn(model.interativa.efeitosAtivos['Segurar com Duas Mãos']) ||
    isCondicaoOn(model.interativa.condicoesAtivas['Segurar com Duas Mãos'])
  )
}

export function makeGuardCtx(
  model: EngineModel,
  opts?: {
    armaPropsLookup?: ArmaPropsLookup
    armaNome?: string
    formaAtiva?: string | null
    effectLabel?: string
    effectSharedFrom?: string
    armasEspecializadas?: ReadonlySet<string>
  },
): GuardEvalContext {
  const armaProps = opts?.armaNome && opts.armaPropsLookup
    ? opts.armaPropsLookup.byName.get(opts.armaNome) ?? []
    : []
  const armaGrupo = opts?.armaNome && opts.armaPropsLookup?.byGrupo
    ? opts.armaPropsLookup.byGrupo.get(opts.armaNome)
    : undefined
  let armaMaos = opts?.armaNome && opts.armaPropsLookup?.byMaos
    ? opts.armaPropsLookup.byMaos.get(opts.armaNome)
    : undefined
  // Estado "Segurar com Duas Mãos" + propriedade Duas-mãos → maos efetiva 2.
  if (armaMaos !== undefined) {
    const armaTemDuasMaos = armaProps.some((p) => /^\[\[Duas-mãos\]\]$|^Duas-mãos$/.test(p.trim()))
    if (isSegurarDuasMaosOn(model) && armaTemDuasMaos) armaMaos = 2
  }
  return {
    condicoesAtivas: model.interativa.condicoesAtivas,
    efeitosAtivos: model.interativa.efeitosAtivos,
    armaPropriedades: armaProps,
    armaNome: opts?.armaNome,
    armaGrupo,
    armasEspecializadas: opts?.armasEspecializadas,
    armaMaos,
    formaAtiva: opts?.formaAtiva ?? null,
    seletores: model.interativa.seletores,
    effectLabel: opts?.effectLabel,
    effectSharedFrom: opts?.effectSharedFrom,
    proficienciaAtaque: model.ataques.proficiencia,
    recursosRestantes: model.interativa.recursosRestantes,
    armaCounts: computeArmaCounts(model.inventario.armas.lista, opts?.armaPropsLookup),
  }
}

function computeArmaCounts(
  armas: ReadonlyArray<{ nome: string }>,
  lookup?: ArmaPropsLookup,
): NonNullable<GuardEvalContext['armaCounts']> {
  const counts = { cac: 0, cacAgeis: 0, distancia: 0 }
  if (!lookup) return counts
  for (const arma of armas) {
    const basename = wikilinkBasename(arma.nome)
    const grupo = lookup.byGrupo?.get(basename)
    if (!grupo) continue
    if (grupo === 'cac-simples' || grupo === 'cac-marcial' || grupo === 'natural') {
      counts.cac++
      const props = lookup.byName.get(basename) ?? []
      if (props.some((p) => /Ágil/i.test(p))) counts.cacAgeis++
    } else if (grupo === 'd-simples' || grupo === 'd-marcial') {
      counts.distancia++
    }
  }
  return counts
}
