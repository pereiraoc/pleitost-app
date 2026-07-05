// Builder do ConditionContext a partir dos efeitos interativos LIGADOS.
// ESPELHO do plugin pleitost-autosheet src/runtime/condicoes/build-effect-context.ts
// (isEffectActive por tipo, filtro sharedFrom/ApenasAliados, pickTargetWeapons
// com auto-pick de ArmaSelecionada, iteração de armas pra guards
// arma-dependentes em targets globais). Fora do escopo do app: formas ferais
// do Druida (feralWeapons/formaAtiva chegam vazios).
import { createEmptyConditionContext, type ConditionContext } from './condition-context'
import { evalGuards, makeGuardCtx, wikilinkBasename, wikilinkLabel, type ArmaPropsLookup, type EngineModel } from './guard-evaluator'
import { composeStateKey, isCondicaoOn, isEfeitoOn } from './state'
import { applyModifier } from './build-effect-modifier'
import type { EffectDescriptor, EffectModifier } from './descriptor'

export function buildEffectContext(
  model: EngineModel,
  descriptors: readonly EffectDescriptor[],
  armaPropsLookup?: ArmaPropsLookup,
): ConditionContext {
  const ctx = createEmptyConditionContext()
  const efeitosAtivos = model.interativa.efeitosAtivos ?? {}
  const condicoesAtivas = model.interativa.condicoesAtivas ?? {}

  // Forma (Druida) ativa — primeiro descritor tipo=Forma ligado vence.
  let formaAtiva: string | null = null
  for (const d of descriptors) {
    if (d.tipo !== 'Forma') continue
    if (isEfeitoOn(efeitosAtivos[effectStateKey(d)])) {
      formaAtiva = d.label
      break
    }
  }

  // Pré-passo: iconOverrides a partir de parameters.IconeLigado.
  for (const d of descriptors) {
    const icon = d.parameters?.['IconeLigado']
    if (icon && typeof icon === 'string') {
      ctx.iconOverrides.set(d.label, icon)
    }
  }

  // Pré-passo: armas de grupos de Especialização em Arma (guard GrupoEspecializado).
  const armasEspecializadas = new Set<string>()
  for (const desc of descriptors) {
    if (desc.sharedFrom || !desc.grupoArma) continue
    if (!isEffectActive(efeitosAtivos, condicoesAtivas, desc)) continue
    for (const arma of desc.grupoArma.armas) {
      const base = wikilinkBasename(arma)
      if (base) armasEspecializadas.add(base)
    }
  }

  for (const desc of descriptors) {
    // Descritor de aliado só se shareable.
    if (desc.sharedFrom) {
      const shareable = desc.escopo === 'CompartilhadoGrupo' || desc.compartilhar === 'Grupo'
      if (!shareable) continue
    }
    if (!isEffectActive(efeitosAtivos, condicoesAtivas, desc)) continue
    // `ApenasAliados sim`: a FONTE não ganha o próprio buff (Inspiração).
    if (!desc.sharedFrom && String(desc.parameters?.['ApenasAliados'] ?? '').trim().toLowerCase() === 'sim') {
      continue
    }

    for (const mod of desc.modifiers) {
      const targetWeapons = pickTargetWeapons(model, desc, mod, armaPropsLookup)
      const targetIsGlobal = isGlobalTarget(mod.alvo)
      const effLabel = effectStateKey(desc)
      const isPerArma = desc.aplicacao === 'ArmaSelecionada'
      // Target global + guard arma-dependente (fora de ArmaSelecionada):
      // acha UMA arma que satisfaça os guards e aplica 1x sem sourceId.
      if (targetIsGlobal && hasArmaGuard(mod.guards) && !isPerArma) {
        const armasParaTeste = collectAllArmas(model)
        for (const armaCand of armasParaTeste) {
          const guardCtx = makeGuardCtx(model, {
            armaPropsLookup,
            armaNome: armaCand,
            formaAtiva,
            effectLabel: effLabel,
            effectSharedFrom: desc.sharedFrom,
            armasEspecializadas,
          })
          if (evalGuards(mod.guards, guardCtx)) {
            applyModifier(ctx, effLabel, mod, undefined, model, desc)
            break
          }
        }
        continue
      }
      for (const armaNome of targetWeapons) {
        const guardCtx = makeGuardCtx(model, {
          armaPropsLookup,
          armaNome,
          formaAtiva,
          effectLabel: effLabel,
          effectSharedFrom: desc.sharedFrom,
          armasEspecializadas,
        })
        if (!evalGuards(mod.guards, guardCtx)) continue
        applyModifier(ctx, effLabel, mod, armaNome, model, desc)
      }
    }
  }

  return ctx
}

function hasArmaGuard(guards: readonly { kind: string }[]): boolean {
  return guards.some(
    (g) =>
      g.kind === 'GrupoArma' || g.kind === 'GrupoEspecializado' ||
      g.kind === 'Propriedade' ||
      g.kind === 'NãoPropriedade' || g.kind === 'Empunhadura',
  )
}

function collectAllArmas(model: EngineModel): string[] {
  const armas = model.inventario.armas.lista
    .map((a) => wikilinkBasename(a.nome))
    .filter((n): n is string => !!n)
  return Array.from(new Set(armas))
}

/** Targets arma-específicos multiplicam por arma; o resto é GLOBAL
 *  (plugin :267-289). */
function isGlobalTarget(alvo: string): boolean {
  const lower = alvo.toLowerCase().replace(/\([^)]*\)\s*$/, '').trim()
  const armaSpecific = [
    'danoarmafixo', 'dano_arma_fixo',
    'danoarmapordado', 'dano_arma_por_dado',
    'passodedado', 'passo_de_dado', 'passododado',
    'dadoextra', 'dadoextraporseletor', 'dadoextradaarma',
    'dadoextrapornivel', 'dadoextrapornível',
    'dadooportunidade',
  ]
  return !armaSpecific.includes(lower)
}

function pickTargetWeapons(
  model: EngineModel,
  desc: EffectDescriptor,
  mod: EffectModifier,
  armaPropsLookup: ArmaPropsLookup | undefined,
): Array<string | undefined> {
  if (isGlobalTarget(mod.alvo) && desc.aplicacao !== 'ArmaSelecionada') {
    return [undefined]
  }
  const armasEquipadas = Array.from(
    new Set(
      model.inventario.armas.lista
        .map((a) => wikilinkBasename(a.nome))
        .filter((n): n is string => !!n),
    ),
  )

  if (desc.aplicacao === 'TodasAsArmas') {
    return armasEquipadas.length > 0 ? armasEquipadas : [undefined]
  }
  if (desc.aplicacao === 'AtaqueNatural') {
    const naturals = armasEquipadas.filter((nome) => armaPropsLookup?.byGrupo?.get(nome) === 'natural')
    return naturals.length > 0 ? naturals : [undefined]
  }
  if (desc.aplicacao === 'ArmaSelecionada') {
    const selectedRaw = pickArmaForEffect(model, desc)
    const selected = selectedRaw ? wikilinkBasename(selectedRaw) : null
    if (selected) return [selected]
    // Auto-default: arma com a propriedade requerida pelo guard.
    const propGuard = mod.guards.find((g) => g.kind === 'Propriedade')
    if (propGuard && armaPropsLookup) {
      const wantProp = wikilinkLabel(propGuard.value).toLowerCase()
      for (const armaNome of armasEquipadas) {
        const props = armaPropsLookup.byName.get(armaNome) ?? []
        if (props.some((p) => wikilinkLabel(p).toLowerCase() === wantProp)) {
          return [armaNome]
        }
      }
    }
    if (armasEquipadas.length > 0) return [armasEquipadas[0]]
    return [undefined]
  }
  return [undefined]
}

/** Descritor "ativo" (plugin :377-404): Passivo sempre; Forma via
 *  efeitosAtivos; Estado via efeitosAtivos OU condicoesAtivas; Condição via
 *  condicoesAtivas; default efeitosAtivos. */
export function isEffectActive(
  efeitosAtivos: Record<string, unknown>,
  condicoesAtivas: Record<string, unknown>,
  desc: EffectDescriptor,
): boolean {
  if (desc.tipo === 'Passivo') return true
  const stateKey = effectStateKey(desc)
  if (desc.tipo === 'Forma') {
    return isEfeitoOn(efeitosAtivos[stateKey])
  }
  if (desc.tipo === 'Estado') {
    if (isEfeitoOn(efeitosAtivos[stateKey])) return true
    return isCondicaoOn(condicoesAtivas[stateKey])
  }
  if (desc.tipo === 'Condição') {
    return isCondicaoOn(condicoesAtivas[stateKey])
  }
  return isEfeitoOn(efeitosAtivos[stateKey])
}

export function effectStateKey(desc: EffectDescriptor): string {
  return composeStateKey(desc.label, desc.sharedFrom)
}

/** Arma alvo de aplicacao=ArmaSelecionada: condicoesAtivas[].weaponSelector
 *  primeiro, seletores[<key>::Arma] fallback (plugin :428-440). */
function pickArmaForEffect(model: EngineModel, desc: EffectDescriptor): string | null {
  if (desc.aplicacao !== 'ArmaSelecionada') return null
  const baseKey = effectStateKey(desc)
  const cond = (model.interativa.condicoesAtivas ?? {})[baseKey]
  if (cond && typeof cond === 'object' && 'weaponSelector' in cond) {
    const ws = (cond as { weaponSelector?: string }).weaponSelector
    if (typeof ws === 'string' && ws.length > 0) return ws
  }
  const v = (model.interativa.seletores ?? {})[`${baseKey}::Arma`]
  if (typeof v === 'string' && v.length > 0) return v
  return null
}
