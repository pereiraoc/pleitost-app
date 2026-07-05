// Aplicação de UM modifier no ConditionContext: roteia verbo + alvo pro
// `add*` correto. ESPELHO do plugin pleitost-autosheet
// src/runtime/condicoes/build-effect-modifier.ts (mesmo dispatching:
// Sobrescrever/Definir/Multiplicar → NUMBER_TARGETS/GROUPS; Somar →
// DadoExtra*/DadoDecisivo/DadoOportunidade/OportunidadeFixo/skills/attacks/
// damage/ManobrasPorItemDaArma/BonusEscudo).
import {
  addNumber,
  addNumberGroup,
  addNumberGroupTyped,
  addNumberOverride,
  addNumberDefine,
  addNumberMultiplier,
  addNumberTyped,
  addSkillAll,
  addSkillAllTyped,
  addSkillByName,
  addSkillByNameTyped,
  addSkillByAttr,
  addSkillByAttrTyped,
  addAttackAll,
  addAttackAllTyped,
  addAttackByAttr,
  addAttackByAttrTyped,
  addAttackBySource,
  addDamageFixed,
  addDamageFixedTyped,
  addDamagePerDie,
  addDamagePerDieTyped,
  addDieStep,
  addDieStepTyped,
  addBaseDiceCount,
  addExtraDice,
  addAdoDice,
  addAdoFixo,
  CONDITION_NUMBER_GROUPS,
  type AtributoId,
  type ConditionContext,
  type ConditionNumberKey,
  type ConditionNumberGroup,
} from './condition-context'
import { pickMappedValue } from './level-table'
import { slugify } from '../components/ficha/registry'
import type { EffectDescriptor, EffectModifier } from './descriptor'
import type { EngineModel } from './guard-evaluator'

/** Alvos numéricos SEM o prefixo `Condicao.` (plugin :49-62). */
export const NUMBER_TARGETS: Record<string, ConditionNumberKey> = {
  ataque: 'ataque',
  manobra: 'manobra',
  defesa: 'defesa',
  vigor: 'vigor',
  impeto: 'impeto',
  reflexo: 'reflexo',
  percepcao: 'percepcao',
  intuicao: 'intuicao',
  movimento: 'movimento',
  potenciamagica: 'potenciaMagica',
  magiaataque: 'magiaAtaque',
  magiacd: 'magiaCD',
}

export const NUMBER_GROUPS: Record<string, ConditionNumberGroup> = {
  resistencias: 'resistencias',
  resistências: 'resistencias',
  sentidos: 'sentidos',
}

const VALID_ATTRS: readonly AtributoId[] = ['FOR', 'AGI', 'INT', 'PRE']

export function applyModifier(
  ctx: ConditionContext,
  label: string,
  mod: EffectModifier,
  sourceId: string | undefined,
  model: EngineModel,
  desc?: EffectDescriptor,
): void {
  const target = mod.alvo.trim()
  const lower = target.toLowerCase()

  if (mod.verbo === 'Sobrescrever' || mod.verbo === 'Definir' || mod.verbo === 'Multiplicar') {
    const numValue = typeof mod.valor === 'number' ? mod.valor : NaN
    if (!Number.isFinite(numValue)) return
    const numKey = NUMBER_TARGETS[lower]
    const groupKey = NUMBER_GROUPS[lower]
    if (numKey) {
      applyNonSomarToKey(ctx, numKey, mod.verbo, label, numValue)
      return
    }
    if (groupKey) {
      for (const k of CONDITION_NUMBER_GROUPS[groupKey]) {
        applyNonSomarToKey(ctx, k, mod.verbo, label, numValue)
      }
      return
    }
    return
  }

  if (mod.verbo === 'Complementar') return

  // Resto: `Somar` (caminho padrão).
  const numValue = typeof mod.valor === 'number' ? mod.valor : NaN
  const strValue = typeof mod.valor === 'string' ? mod.valor.trim() : ''
  const src = 'efeito' as const

  if (lower === 'dadoextra') {
    if (strValue) addExtraDice(ctx, label, strValue, sourceId, src)
    return
  }

  // DadoExtraPorSeletor: `"<seletorName>" <tabela>` — lê o valor do seletor
  // de 3 fontes em ordem (seletores → condicoesAtivas[].numericSelector →
  // default de Potência Mágica), idem plugin :136-171.
  if (lower === 'dadoextraporseletor') {
    const m = strValue.match(/^"([^"]+)"\s+(.+)$/)
    if (!m) return
    const seletorName = m[1].trim()
    const table = m[2].trim()
    const seletores = model.interativa.seletores ?? {}
    let seletorRaw = seletores[`${label}::${seletorName}`]
    if (seletorRaw === undefined) {
      const cond = (model.interativa.condicoesAtivas ?? {})[label]
      if (cond && typeof cond === 'object' && 'numericSelector' in cond) {
        const ns = (cond as { numericSelector?: number }).numericSelector
        if (ns !== undefined) seletorRaw = ns
      }
    }
    if (seletorRaw === undefined) {
      const isPotencia =
        seletorName.toLowerCase().replace(/\s/g, '') === 'potênciamágica' ||
        seletorName.toLowerCase().replace(/\s/g, '') === 'potenciamagica'
      if (isPotencia) {
        seletorRaw = desc?.sharedFromMeta?.potenciaMagica ?? model.magias.potencia ?? 0
      }
    }
    const seletorValue = typeof seletorRaw === 'number'
      ? seletorRaw
      : Number.parseInt(String(seletorRaw ?? '0'), 10) || 0
    const dice = pickMappedValue(table, seletorValue)
    if (dice) addExtraDice(ctx, `${label} (${seletorName} ${seletorValue})`, dice, sourceId, src)
    return
  }

  // DadoExtraDaArma: cópias EXTRAS do dado-base (Ataque Poderoso) —
  // display only, dadoDeArma=false.
  if (lower === 'dadoextradaarma') {
    if (Number.isFinite(numValue) && numValue !== 0) {
      addBaseDiceCount(ctx, label, numValue, sourceId, src, false)
    }
    return
  }

  // DadoDecisivo: dado de dano da arma DE VERDADE (Sucesso Decisivo) —
  // conta pro multiplicador DanoArmaPorDado.
  if (lower === 'dadodecisivo') {
    if (Number.isFinite(numValue) && numValue !== 0) {
      addBaseDiceCount(ctx, label, numValue, sourceId, src, true)
    }
    return
  }

  if (lower === 'dadooportunidade') {
    if (Number.isFinite(numValue) && numValue !== 0) {
      addAdoDice(ctx, label, numValue, desc?.origem, sourceId, src, desc?.tipo === 'Passivo')
    }
    return
  }

  if (lower === 'oportunidadefixo') {
    if (Number.isFinite(numValue) && numValue !== 0) {
      addAdoFixo(ctx, label, numValue, sourceId, src)
    }
    return
  }

  if (lower === 'dadoextrapornivel' || lower === 'dadoextrapornível') {
    const nivel = model.meta.nivel ?? 1
    const dice = pickMappedValue(strValue, nivel)
    if (dice) addExtraDice(ctx, label, dice, sourceId, src)
    return
  }

  if (!Number.isFinite(numValue) || !numValue) return

  // Ataque com sourceId (ArmaSelecionada) → bucket per-arma ANTES do global.
  if ((lower === 'ataque' || lower === 'ataques') && sourceId) {
    addAttackBySource(ctx, sourceId, label, numValue, src)
    return
  }

  if (NUMBER_TARGETS[lower]) {
    if (mod.tipoBonus) {
      addNumberTyped(ctx, NUMBER_TARGETS[lower], mod.tipoBonus, label, numValue, src)
    } else {
      addNumber(ctx, NUMBER_TARGETS[lower], label, numValue, src)
    }
    return
  }

  if (NUMBER_GROUPS[lower]) {
    if (mod.tipoBonus) {
      addNumberGroupTyped(ctx, NUMBER_GROUPS[lower], mod.tipoBonus, label, numValue, src)
    } else {
      addNumberGroup(ctx, NUMBER_GROUPS[lower], label, numValue, src)
    }
    return
  }

  if (lower === 'pericias' || lower === 'perícias') {
    if (mod.tipoBonus) addSkillAllTyped(ctx, mod.tipoBonus, label, numValue, src)
    else addSkillAll(ctx, label, numValue, src)
    return
  }
  const skillAttrMatch = /^Per[ií]cias?DeAtributo\(([A-Za-z]+)\)$/i.exec(target)
  if (skillAttrMatch) {
    const attr = skillAttrMatch[1].toUpperCase() as AtributoId
    if (VALID_ATTRS.includes(attr)) {
      if (mod.tipoBonus) addSkillByAttrTyped(ctx, attr, mod.tipoBonus, label, numValue, src)
      else addSkillByAttr(ctx, attr, label, numValue, src)
    }
    return
  }
  const skillNameMatch = /^Per[ií]cia\(([^)]+)\)$/i.exec(target)
  if (skillNameMatch) {
    const pid = slugify(skillNameMatch[1])
    if (mod.tipoBonus) addSkillByNameTyped(ctx, pid, mod.tipoBonus, label, numValue, src)
    else addSkillByName(ctx, pid, label, numValue, src)
    return
  }

  if (lower === 'ataques' || lower === 'ataque') {
    if (sourceId) {
      addAttackBySource(ctx, sourceId, label, numValue, src)
    } else if (mod.tipoBonus) {
      addAttackAllTyped(ctx, mod.tipoBonus, label, numValue, src)
    } else {
      addAttackAll(ctx, label, numValue, src)
    }
    return
  }
  const attackAttrMatch = /^AtaquesDeAtributo\(([A-Za-z]+)\)$/i.exec(target)
  if (attackAttrMatch) {
    const attr = attackAttrMatch[1].toUpperCase() as AtributoId
    if (VALID_ATTRS.includes(attr)) {
      if (mod.tipoBonus) addAttackByAttrTyped(ctx, attr, mod.tipoBonus, label, numValue, src)
      else addAttackByAttr(ctx, attr, label, numValue, src)
    }
    return
  }

  const fromAtaqueLocal = desc?.tipo === 'AtaqueLocal'
  if (lower === 'danoarmafixo' || lower === 'dano_arma_fixo') {
    if (mod.tipoBonus) addDamageFixedTyped(ctx, mod.tipoBonus, label, numValue, sourceId, src, fromAtaqueLocal)
    else addDamageFixed(ctx, label, numValue, sourceId, src, fromAtaqueLocal)
    return
  }
  if (lower === 'danoarmapordado' || lower === 'dano_arma_por_dado') {
    if (mod.tipoBonus) addDamagePerDieTyped(ctx, mod.tipoBonus, label, numValue, sourceId, src, fromAtaqueLocal)
    else addDamagePerDie(ctx, label, numValue, sourceId, src, fromAtaqueLocal)
    return
  }
  if (lower === 'passodedado' || lower === 'passo_de_dado' || lower === 'passododado') {
    if (mod.tipoBonus) addDieStepTyped(ctx, mod.tipoBonus, label, numValue, sourceId, src, fromAtaqueLocal)
    else addDieStep(ctx, label, numValue, sourceId, src, fromAtaqueLocal)
    return
  }

  // ManobrasPorItemDaArma (Ataque Brutal): bonusItem da arma × valor.
  if (lower === 'manobrasporitemdaarma') {
    const armaBonusItem = sourceId ? lookupArmaBonusItem(model, sourceId) : 0
    const effective = armaBonusItem * numValue
    if (effective !== 0) addNumber(ctx, 'manobra', label, effective, src)
    return
  }

  // BonusEscudo (Erguer Escudo): tipo do escudo (Escudo=2/Broquel=1) +
  // Obra-prima por tier (A+1/E+2/M+3).
  if (lower === 'bonusescudo') {
    const escudo = model.inventario.escudo
    if (!escudo || !escudo.nome) return
    const escudoBasename = String(escudo.nome).replace(/^\[\[|\]\]$/g, '')
      .split('|').pop()?.split('/').pop()?.replace(/\.md$/i, '').trim() ?? ''
    let bonusBase = 0
    if (escudoBasename === 'Escudo') bonusBase = 2
    else if (escudoBasename === 'Broquel') bonusBase = 1
    if (bonusBase === 0) return
    const propRaw = String(escudo.propriedade ?? '').toLowerCase()
    let obraExtra = 0
    if (propRaw.includes('obra-prima') || propRaw.includes('obra prima')) {
      const cat = String(escudo.categoria ?? '').toLowerCase()
      if (cat.includes('mestre')) obraExtra = 3
      else if (cat.includes('experiente')) obraExtra = 2
      else if (cat.includes('adepto')) obraExtra = 1
    }
    const total = (bonusBase + obraExtra) * numValue
    if (total !== 0) addNumber(ctx, 'defesa', `${label} (${escudoBasename})`, total, src)
    return
  }
  // Targets desconhecidos — silenciosamente skipped (paridade plugin).
}

function applyNonSomarToKey(
  ctx: ConditionContext,
  key: ConditionNumberKey,
  verbo: 'Sobrescrever' | 'Definir' | 'Multiplicar',
  label: string,
  value: number,
): void {
  const src = 'efeito' as const
  if (verbo === 'Sobrescrever') addNumberOverride(ctx, key, label, value, src)
  else if (verbo === 'Definir') addNumberDefine(ctx, key, label, value, src)
  else if (verbo === 'Multiplicar') addNumberMultiplier(ctx, key, label, value, src)
}

function lookupArmaBonusItem(model: EngineModel, armaBasename: string): number {
  for (const arma of model.inventario.armas.lista) {
    const m = String(arma.nome ?? '').match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
    const base = m
      ? (m[1].split('/').pop() ?? m[1]).replace(/\.md$/i, '').trim()
      : String(arma.nome ?? '').trim()
    if (base === armaBasename) {
      const n = Number(arma.bonusItem ?? 0)
      return Number.isFinite(n) ? n : 0
    }
  }
  return 0
}
