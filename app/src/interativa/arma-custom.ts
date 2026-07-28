// Ataques CUSTOM (efeito `tipo: Arma`) → lista de ataques resolvida por FOR,
// espelho do plugin extract/inject-arma-custom.ts. Diferente da Forma Feral,
// NÃO depende de toggle: o efeito existir (o herói tem o item, via
// collectDescriptors) já significa que o ataque está disponível. Os stats vêm
// INLINE (dano/tipo/props escalados por FOR); o ataque carrega label/link
// próprios, desacoplados de nome/scan de arma.
import type { ArmaPorFor, EffectDescriptor } from './descriptor'

/** Ataque custom já resolvido pro nível de FOR do herói. `dano` é a expressão
 *  BASE (o render soma dados de proficiência + contexto, igual a uma arma). */
export interface CustomAtaque {
  label: string
  /** Wikilink de preview (doc do artefato) — figura/hover. */
  link: string
  /** #393: FOR por padrão; AGI quando o degrau porFor RESOLVIDO tem a
   *  propriedade Precisa e AGI > FOR (max(FOR, AGI), empate em FOR). */
  atributo: 'FOR' | 'AGI'
  /** Item-bônus FIXO do efeito (ex.: artefato Mestre → 3). */
  bonusItem: number
  dano: string
  tipo: string
  /** Propriedades (wikilinks raw), como no doc de uma arma. */
  propriedades: string[]
  /** Grupo de arma canônico p/ elegibilidade de AdO (ex.: cac-marcial). */
  grupo: string
  /** Nota de origem (rastreabilidade). */
  sourceNote: string
}

/** Escolhe a entrada `porFor` pro nível de FOR: clampa em [menor, maior] chave
 *  e pega o maior degrau ≤ FOR clampado (plugin inject-arma-custom.ts:57). */
export function resolvePorFor(porFor: Record<number, ArmaPorFor>, forValue: number): ArmaPorFor | null {
  const keys = Object.keys(porFor)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b)
  if (keys.length === 0) return null
  const clamped = Math.max(keys[0]!, Math.min(keys[keys.length - 1]!, forValue))
  let chosen = keys[0]!
  for (const k of keys) if (k <= clamped) chosen = k
  return porFor[chosen] ?? null
}

/** #393: Precisa ("pode usar Agilidade em vez de Força na jogada de ataque")
 *  → max(FOR, AGI), empate em FOR. Espelho de deriveArmaAtributo do plugin
 *  (extract/apply-armas-edit.ts:44-59). Só olha as `propriedades` do degrau
 *  porFor JÁ resolvido (as Garras têm Precisa nos degraus 1/2, mas não no 3). */
function atributoComPrecisa(
  propriedades: readonly string[],
  forValue: number,
  agiValue: number,
): 'FOR' | 'AGI' {
  const temPrecisa = propriedades.some((p) => p.toLowerCase().includes('precisa'))
  if (temPrecisa && agiValue > forValue) return 'AGI'
  return 'FOR'
}

/** Descriptors `tipo: Arma` → ataques resolvidos pro `forValue`. Dedupe por
 *  label (plugin inject-arma-custom.ts:injectArmaCustom). `agiValue` (#393)
 *  entra no cálculo do atributo quando o degrau tem Precisa; ausente → FOR. */
export function collectCustomAtaques(
  descriptors: readonly EffectDescriptor[],
  forValue: number,
  agiValue = 0,
): CustomAtaque[] {
  const out: CustomAtaque[] = []
  const seen = new Set<string>()
  for (const ef of descriptors) {
    if (ef.tipo !== 'Arma' || !ef.porFor) continue
    if (seen.has(ef.label)) continue
    const stats = resolvePorFor(ef.porFor, forValue)
    if (!stats) continue
    seen.add(ef.label)
    out.push({
      label: ef.label,
      link: ef.link ?? `[[${ef.label}]]`,
      atributo: atributoComPrecisa(stats.propriedades, forValue, agiValue),
      bonusItem: ef.bonusItem ?? 0,
      dano: stats.dano,
      tipo: stats.tipo,
      propriedades: stats.propriedades,
      grupo: ef.grupoAtaque ?? '',
      sourceNote: ef.sourceNote,
    })
  }
  return out
}
