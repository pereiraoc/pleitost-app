// Bloco FM `Efeitos_Interativos:` → EffectDescriptor (formato do runtime).
// ESPELHO do plugin pleitost-autosheet:
//   - shape do bloco: src/extract/interativa/types.ts (EfeitoInterativo)
//   - tradutor:       src/extract/interativa/parse-descritor-legado.ts
//     (buildParameters/buildModifiers, expansões porSeletor/porAtributo,
//     links.requer → guard Estado extra em TODOS os modifiers)
//   - builtin:        src/extract/interativa/builtin-effects.ts (Acerto Decisivo)
// A vault-data já entrega o YAML como JSON estruturado — o tradutor consome
// direto (o parse-bloco do plugin valida/normaliza o YAML cru; aqui o dado
// já vem estruturado do extractor).
import { parseBonusType, type BonusType, type OrigemKind } from './condition-context'

// ── Guards (plugin extract/interativa/parse-condicional.ts) ──

export type ConditionalKind =
  | 'Condição'
  | 'Estado'
  | 'Forma'
  | 'Propriedade'
  | 'NãoPropriedade'
  | 'Recurso'
  | 'GrupoArma'
  | 'GrupoEspecializado'
  | 'Empunhadura'
  | 'Seletor'
  | 'Proficiência'
  | 'Outro'

export interface ConditionalGuard {
  kind: ConditionalKind
  value: string
}

// ── Modifier (plugin extract/interativa/parse-modifier.ts) ──

export type ModifierVerbo = 'Somar' | 'Multiplicar' | 'Sobrescrever' | 'Complementar' | 'Definir'

export interface EffectModifier {
  verbo: ModifierVerbo
  alvo: string
  valor: number | string
  guards: ConditionalGuard[]
  raw: string
  tipoBonus?: BonusType
}

// ── Invocação (plugin extract/interativa/types.ts:253-302) ──

/** Rank de proficiência com Perito (plugin types.ts ProficienciaRank). */
export type ProficienciaRank = 'N' | 'A' | 'E' | 'M' | 'P'

/** Valor que escala com nível/seletor/proficiência (plugin ValorEscalonado). */
export type ValorEscalonado =
  | number
  | string
  | { porNivel: Record<string, number | string> }
  | { porSeletor: string; tabela?: Record<string, number | string>; multiplicador?: number }
  | { porProficiencia: Partial<Record<ProficienciaRank, number | string>>; porProficienciaEm?: string }

/** Ataque declarado da criatura invocada (plugin AtaqueInvocado :292-297). */
export interface AtaqueInvocado {
  nome: string
  tipo: string
  /** number literal | {doInvocador: "MagiaAtaque"} — resolvido no render. */
  bonus?: number | { doInvocador: string }
  dano?: ValorEscalonado
}

/** Habilidade especial da invocação (plugin HabilidadeEspecial :299-302). */
export interface HabilidadeEspecial {
  label: string
  descricao: string
}

/** Sub-bloco `invocacao:` de um efeito `tipo: Invocação` (plugin
 *  InvocacaoEfeito :277-290, parseado em parse-bloco.ts:719-832). */
export interface InvocacaoEfeito {
  criaturaRef?: string
  porProficienciaEm?: string
  proficienciaMinima?: ProficienciaRank
  stats: Record<string, ValorEscalonado>
  ataques: AtaqueInvocado[]
  habilidadesEspeciais: HabilidadeEspecial[]
  notas: string[]
}

// ── Descriptor (plugin extract/interativa/descriptor-types.ts) ──

export type TipoKind = 'Passivo' | 'Estado' | 'Condição' | 'Forma' | 'AçãoLocal' | 'AtaqueLocal'

export interface NumericSelector {
  label: string
  min: number
  max: number
  step: number
}

export interface DiscreteSelector {
  label: string
  options: string[]
  oculto?: boolean
}

export interface EffectDescriptor {
  label: string
  sourceNote: string
  tipo?: TipoKind
  /** Tipo completo do bloco (inclui "Invocação"). */
  tipoEfeito?: string
  grupo?: 'Positiva' | 'Negativa'
  origem?: OrigemKind
  escopo?: 'Próprio' | 'CompartilhadoGrupo'
  compartilhar?: string
  aplicacao?: 'TodasAsArmas' | 'ArmaSelecionada' | 'AtaqueNatural'
  selectsWeapon?: boolean
  sharedFrom?: string
  sharedFromMeta?: { potenciaMagica?: number }
  numericSelector?: NumericSelector
  selectors: DiscreteSelector[]
  parameters: Record<string, string>
  modifiers: EffectModifier[]
  grupoArma?: { armas: string[] }
  /** Sub-bloco `invocacao:` quando `tipoEfeito === "Invocação"` (plugin
   *  parse-bloco.ts:231 — só é lido nesse tipo). */
  invocacao?: InvocacaoEfeito
}

// ──────────────────────────────────────────────────────────────────────────
// Tradutor bloco → descriptor (plugin parse-descritor-legado.ts)
// ──────────────────────────────────────────────────────────────────────────

type Dict = Record<string, unknown>

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

const KIND_BY_OBJECT_KEY: Record<string, ConditionalKind> = {
  recurso: 'Recurso',
  estado: 'Estado',
  condicao: 'Condição',
  forma: 'Forma',
  propriedade: 'Propriedade',
  naoPropriedade: 'NãoPropriedade',
  grupoArma: 'GrupoArma',
  grupoEspecializado: 'GrupoEspecializado',
  empunhadura: 'Empunhadura',
  proficiencia: 'Proficiência',
  seletor: 'Seletor',
}

/** `quando[]` (objeto-shape) → guards legacy (plugin :347-369). */
function guardsParaLegacy(quando: unknown[]): ConditionalGuard[] {
  const out: ConditionalGuard[] = []
  for (const g of quando) {
    if (!g || typeof g !== 'object') continue
    for (const [key, val] of Object.entries(g as Dict)) {
      const kind = KIND_BY_OBJECT_KEY[key]
      if (!kind || val == null) continue
      let value: string
      if (key === 'seletor' && typeof val === 'object' && val !== null) {
        const sel = val as { label?: string; valor?: unknown }
        value = `[[${sel.label ?? ''}|${String(sel.valor ?? '')}]]`
      } else if (key === 'empunhadura') {
        value = String(val)
      } else if (
        key === 'estado' || key === 'condicao' || key === 'forma' ||
        key === 'propriedade' || key === 'naoPropriedade'
      ) {
        value = `[[${String(val)}]]`
      } else {
        value = String(val)
      }
      out.push({ kind, value })
    }
  }
  return out
}

function pickVerbo(mod: Dict): ModifierVerbo | null {
  if (mod['somar'] != null) return 'Somar'
  if (mod['multiplicar'] != null) return 'Multiplicar'
  if (mod['sobrescrever'] != null) return 'Sobrescrever'
  if (mod['definir'] != null) return 'Definir'
  if (mod['complementar'] != null) return 'Complementar'
  return null
}

/** ValorEscalonado → number|string legacy (plugin valorParaLegacy :311-331). */
function valorParaLegacy(v: unknown): number | string {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as Dict
    if ('porNivel' in o) {
      return Object.entries(o['porNivel'] as Dict).map(([k, val]) => `${k}:${val}`).join(',')
    }
    if ('porSeletor' in o) {
      const tabela = o['tabela'] as Dict | undefined
      if (tabela) {
        const tabelaStr = Object.entries(tabela).map(([k, val]) => `${k}:${val}`).join(',')
        return `"${o['porSeletor']}" ${tabelaStr}`
      }
      if (typeof o['multiplicador'] === 'number') {
        return `"${o['porSeletor']}" multiplicador=${o['multiplicador']}`
      }
      return `"${o['porSeletor']}"`
    }
    if ('porProficiencia' in o) {
      return Object.entries(o['porProficiencia'] as Dict).map(([k, val]) => `${k}:${val}`).join(',')
    }
  }
  return JSON.stringify(v)
}

function composeAlvoLegacy(alvoNovo: string, mod: Dict): string {
  let alvoLegacy = alvoNovo
  const porAtributo = mod['porAtributo']
  if (porAtributo && typeof porAtributo === 'string') {
    alvoLegacy = `${alvoNovo}(${porAtributo})`
  }
  if (mod['pericia']) alvoLegacy = `${alvoNovo}(${str(mod['pericia'])})`
  return alvoLegacy
}

/** Modifiers do bloco → EffectModifier[] com as expansões do plugin
 *  (parse-descritor-legado.ts buildModifiers :149-289). */
function buildModifiers(efeito: Dict): EffectModifier[] {
  const out: EffectModifier[] = []
  const links = (efeito['links'] ?? {}) as Dict
  // links.requer → guard `Estado X` extra em TODOS os modifiers (AND).
  const requerGuards: ConditionalGuard[] = asArray(links['requer']).map((label) => ({
    kind: 'Estado' as ConditionalKind,
    value: `[[${String(label)}]]`,
  }))
  const selectores = asArray(efeito['selectores'])

  for (const rawMod of asArray(efeito['modificadores'])) {
    if (!rawMod || typeof rawMod !== 'object') continue
    const mod = rawMod as Dict
    const verbo = pickVerbo(mod)
    if (!verbo) continue
    const alvoNovo = str(mod[verbo.toLowerCase()])
    const valor = mod['valor']
    const tipoBonus = parseBonusType(mod['tipoBonus'])
    const guardsBase = guardsParaLegacy(asArray(mod['quando']))

    // Expansão A: porSeletor com tabela em target NÃO-DadoExtra → N modifiers
    // (um por entry, cada um com guard Seletor).
    if (
      valor && typeof valor === 'object' && 'porSeletor' in (valor as Dict) &&
      (valor as Dict)['tabela'] && !/dadoextra/i.test(alvoNovo)
    ) {
      const vo = valor as Dict
      const seletorName = String(vo['porSeletor'])
      const alvoLegacy = composeAlvoLegacy(alvoNovo, mod)
      for (const [optKey, optVal] of Object.entries(vo['tabela'] as Dict)) {
        const numVal = typeof optVal === 'number' ? optVal : Number.parseFloat(String(optVal))
        if (!Number.isFinite(numVal)) continue
        out.push({
          verbo,
          alvo: alvoLegacy,
          valor: numVal,
          guards: [...requerGuards, ...guardsBase, { kind: 'Seletor', value: `[[${seletorName}|${optKey}]]` }],
          raw: `[from-bloco-expanded:porSeletor=${optKey}] ${verbo} ${alvoLegacy} ${numVal}`,
          tipoBonus,
        })
      }
      continue
    }

    // Expansão A2: porSeletor com multiplicador (sem tabela) → 1 modifier por
    // valor possível do seletor numérico (min..max), com guard Seletor.
    if (
      valor && typeof valor === 'object' && 'porSeletor' in (valor as Dict) &&
      typeof (valor as Dict)['multiplicador'] === 'number' && !(valor as Dict)['tabela'] &&
      !/dadoextra/i.test(alvoNovo)
    ) {
      const vo = valor as Dict
      const seletorName = String(vo['porSeletor'])
      const mult = vo['multiplicador'] as number
      const seletorDef = selectores.find(
        (s) => (s as Dict)?.['kind'] === 'numerico' && (s as Dict)?.['label'] === seletorName,
      ) as Dict | undefined
      if (seletorDef) {
        const min = Number(seletorDef['min']) || 0
        const max = Number(seletorDef['max']) || 0
        const step = Number(seletorDef['step']) || 1
        const alvoLegacy = composeAlvoLegacy(alvoNovo, mod)
        for (let i = min; i <= max; i += step) {
          const numVal = i * mult
          out.push({
            verbo,
            alvo: alvoLegacy,
            valor: numVal,
            guards: [...requerGuards, ...guardsBase, { kind: 'Seletor', value: `[[${seletorName}|${i}]]` }],
            raw: `[from-bloco-expanded:porSeletor*mult=${i}] ${verbo} ${alvoLegacy} ${numVal}`,
            tipoBonus,
          })
        }
        continue
      }
    }

    // Expansão B: porAtributo {doSeletor} → 1 modifier por opção do seletor.
    const porAtributo = mod['porAtributo']
    if (porAtributo && typeof porAtributo === 'object' && 'doSeletor' in (porAtributo as Dict)) {
      const seletorName = String((porAtributo as Dict)['doSeletor'])
      const seletorDef = selectores.find(
        (s) => (s as Dict)?.['kind'] === 'discreto' && (s as Dict)?.['label'] === seletorName,
      ) as Dict | undefined
      const opcoes = seletorDef ? asArray(seletorDef['opcoes']) : []
      const numVal = typeof valor === 'number' ? valor : Number.parseFloat(String(valor))
      if (!Number.isFinite(numVal)) continue
      for (const opt of opcoes) {
        const optClean = String(opt).replace(/^\[\[|\]\]$/g, '').split('|').pop()!.trim()
        const alvoLegacy = `${alvoNovo}(${optClean})`
        out.push({
          verbo,
          alvo: alvoLegacy,
          valor: numVal,
          guards: [...requerGuards, ...guardsBase, { kind: 'Seletor', value: `[[${seletorName}|${optClean}]]` }],
          raw: `[from-bloco-expanded:doSeletor=${optClean}] ${verbo} ${alvoLegacy} ${numVal}`,
          tipoBonus,
        })
      }
      continue
    }

    // Path padrão + normalizações porNivel/porSeletor sobre DadoExtra.
    let alvoLegacy = composeAlvoLegacy(alvoNovo, mod)
    if (valor && typeof valor === 'object' && 'porNivel' in (valor as Dict) && /^DadoExtra$/i.test(alvoLegacy)) {
      alvoLegacy = 'DadoExtraPorNivel'
    }
    if (valor && typeof valor === 'object' && 'porSeletor' in (valor as Dict) && /^DadoExtra$/i.test(alvoLegacy)) {
      alvoLegacy = 'DadoExtraPorSeletor'
    }
    out.push({
      verbo,
      alvo: alvoLegacy,
      valor: valorParaLegacy(valor),
      guards: [...requerGuards, ...guardsBase],
      raw: `[from-bloco] ${verbo} ${alvoLegacy} ${JSON.stringify(valor)}`,
      tipoBonus,
    })
  }
  return out
}

/** Parâmetros legacy que o render lê (plugin buildParameters :106-147, subset
 *  sem os campos de Forma feral — Druida fora do escopo do app). */
function buildParameters(efeito: Dict): Record<string, string> {
  const params: Record<string, string> = {}
  const visual = (efeito['visual'] ?? {}) as Dict
  const escopo = (efeito['escopo'] ?? {}) as Dict
  const links = (efeito['links'] ?? {}) as Dict
  if (str(visual['iconeLigado'])) params['IconeLigado'] = str(visual['iconeLigado'])
  if (str(visual['iconeDesligado'])) params['IconeDesligado'] = str(visual['iconeDesligado'])
  if (visual['oculto']) params['OcultarInterativa'] = 'sim'
  if (visual['nucleo']) params['Nucleo'] = 'sim'
  if (visual['realceEspecial'] === 'performance-bardica') params['PerformanceBardica'] = 'sim'
  if (str(visual['ancorar'])) params['Ancorar'] = str(visual['ancorar'])
  if (escopo['aplicaEm'] === 'Aliados') params['ApenasAliados'] = 'sim'
  const ativa = asArray(links['ativa'])
  if (ativa.length > 0) params['AtivaEstado'] = String(ativa[0])
  return params
}

const RANKS: readonly ProficienciaRank[] = ['N', 'A', 'E', 'M', 'P']

/** `invocacao:` do bloco → InvocacaoEfeito (plugin parse-bloco.ts:719-832 —
 *  parseInvocacao + parseInvocacaoAtaques + parseHabilidadesEspeciais; a
 *  vault-data já entrega o YAML estruturado, então só tipamos/normalizamos). */
function parseInvocacao(raw: unknown): InvocacaoEfeito | null {
  if (!raw || typeof raw !== 'object') return null
  const inv = raw as Dict
  const out: InvocacaoEfeito = { stats: {}, ataques: [], habilidadesEspeciais: [], notas: [] }
  if (str(inv['criaturaRef'])) out.criaturaRef = str(inv['criaturaRef'])
  if (str(inv['porProficienciaEm'])) out.porProficienciaEm = str(inv['porProficienciaEm'])
  const minima = str(inv['proficienciaMinima'])
  if ((RANKS as readonly string[]).includes(minima)) {
    out.proficienciaMinima = minima as ProficienciaRank
  }
  const stats = inv['stats']
  if (stats && typeof stats === 'object') {
    for (const [k, v] of Object.entries(stats as Dict)) {
      if (v != null) out.stats[k] = v as ValorEscalonado
    }
  }
  for (const rawAt of asArray(inv['ataques'])) {
    if (!rawAt || typeof rawAt !== 'object') continue
    const at = rawAt as Dict
    const nome = str(at['nome'])
    if (!nome) continue
    const ataque: AtaqueInvocado = { nome, tipo: str(at['tipo']) }
    const bonus = at['bonus']
    if (typeof bonus === 'number') ataque.bonus = bonus
    else if (bonus && typeof bonus === 'object' && 'doInvocador' in (bonus as Dict)) {
      ataque.bonus = { doInvocador: String((bonus as Dict)['doInvocador']) }
    }
    if (at['dano'] != null) ataque.dano = at['dano'] as ValorEscalonado
    out.ataques.push(ataque)
  }
  for (const rawHab of asArray(inv['habilidadesEspeciais'])) {
    if (!rawHab || typeof rawHab !== 'object') continue
    const hab = rawHab as Dict
    if (!str(hab['label'])) continue
    out.habilidadesEspeciais.push({ label: str(hab['label']), descricao: str(hab['descricao']) })
  }
  for (const nota of asArray(inv['notas'])) {
    if (typeof nota === 'string' && nota.trim()) out.notas.push(nota)
  }
  return out
}

/** UM item do bloco `Efeitos_Interativos` → EffectDescriptor
 *  (plugin paraDescritorLegado :26-101). */
export function blocoParaDescritor(raw: unknown, sourceNote: string): EffectDescriptor | null {
  if (!raw || typeof raw !== 'object') return null
  const efeito = raw as Dict
  const label = str(efeito['label'])
  if (!label) return null

  const desc: EffectDescriptor = {
    label,
    sourceNote,
    selectors: [],
    parameters: buildParameters(efeito),
    modifiers: buildModifiers(efeito),
  }

  const tipo = str(efeito['tipo'])
  if (tipo && tipo !== 'Invocação') desc.tipo = tipo as TipoKind
  if (tipo) desc.tipoEfeito = tipo
  // Sub-bloco invocacao só vale em `tipo: Invocação` (plugin
  // parse-bloco.ts:231-240 — em outro tipo gera warning e é ignorado).
  if (tipo === 'Invocação' || tipo === 'Invocacao') {
    const inv = parseInvocacao(efeito['invocacao'])
    if (inv) desc.invocacao = inv
  }
  const grupo = str(efeito['grupo'])
  if (grupo === 'Positiva' || grupo === 'Negativa') desc.grupo = grupo
  const origem = str(efeito['origem'])
  if (origem) desc.origem = (origem === 'Item' ? 'Outra' : origem) as OrigemKind

  const escopo = (efeito['escopo'] ?? {}) as Dict
  if (escopo['aplicaEm'] === 'Aliados' || escopo['aplicaEm'] === 'Ambos') {
    desc.escopo = 'CompartilhadoGrupo'
  } else if (escopo['aplicaEm'] === 'Próprio') {
    desc.escopo = 'Próprio'
  }
  if (escopo['compartilharGrupo']) desc.compartilhar = 'Grupo'
  const arma = str(escopo['arma'])
  if (arma === 'TodasAsArmas' || arma === 'ArmaSelecionada' || arma === 'AtaqueNatural') {
    desc.aplicacao = arma
  }
  desc.selectsWeapon = desc.aplicacao === 'ArmaSelecionada'

  for (const sel of asArray(efeito['selectores'])) {
    const s = sel as Dict
    if (s?.['kind'] === 'numerico') {
      desc.numericSelector = {
        label: str(s['label']),
        min: Number(s['min']) || 0,
        max: Number(s['max']) || 0,
        step: Number(s['step']) || 1,
      }
    } else if (s?.['kind'] === 'discreto') {
      desc.selectors.push({
        label: str(s['label']),
        options: asArray(s['opcoes']).map(String),
        ...(s['oculto'] ? { oculto: true } : {}),
      })
    }
  }

  const grupoArma = efeito['grupoArma'] as Dict | undefined
  if (grupoArma && Array.isArray(grupoArma['armas'])) {
    desc.grupoArma = { armas: (grupoArma['armas'] as unknown[]).map(String) }
  }

  return desc
}

/** Tier-gate opcional do bloco (Imbuição Incendiária declara 1 entry por
 *  tier). Retorna o tier declarado ou null. */
export function blocoTier(raw: unknown): 'Adepto' | 'Experiente' | 'Mestre' | null {
  const t = str((raw as Dict)?.['tier'])
  return t === 'Adepto' || t === 'Experiente' || t === 'Mestre' ? t : null
}

// ──────────────────────────────────────────────────────────────────────────
// Builtin (plugin builtin-effects.ts) — Acerto Decisivo
// ──────────────────────────────────────────────────────────────────────────

/** Acerto Decisivo — regra universal da engine (Sucesso Decisivo de
 *  Atacar.md): +1 dado de dano da arma (DadoDecisivo → dano normal e conta
 *  pro DanoArmaPorDado) + 1 dado no AdO (DadoOportunidade, origem
 *  Habilidade → acumula). Bloco idêntico ao BUILTIN do plugin. */
export const BUILTIN_EFEITOS_BLOCOS: readonly Record<string, unknown>[] = [
  {
    label: 'Acerto Decisivo',
    tipo: 'Estado',
    origem: 'Habilidade',
    sourceNote: '(builtin) Acerto Decisivo',
    visual: {
      iconeLigado: '💥',
      iconeDesligado: '🚫',
      ancorar: 'AtaquesEAcoes',
      nucleo: true,
    },
    modificadores: [
      { somar: 'DadoDecisivo', valor: 1 },
      { somar: 'DadoOportunidade', valor: 1 },
    ],
  },
]
