// Combatentes da sala (#196) — lógica de domínio portada do ecossistema
// pleitost:
//   - classifyVita: VERBATIM de pleitost-autosheet/src/runtime/status/
//     classify-vita.ts (estimativa de saúde por faixas — o jogador vê a
//     FAIXA do monstro, nunca números);
//   - maskedLabel: adaptação de genericLabelFor (pleitost-sync/src/core/
//     encounter.ts:259) operando sobre o SUMMARY publicado (o app não tem o
//     FM da vault do monstro na sala): Monstro → Raça, Companheiro →
//     "Companheiro", Herói → "Humano", fallback "Criatura"; numerado por
//     rótulo repetido ("Goblin 1", "Goblin 2") como no player view do plugin.
import type { CharacterSummary, SessionCharacter } from './contract'
import { ladoDe, type Lado } from '../initiative-blocks'
import { FICHA_FAMILIA } from '../familia'
import { reskinName } from '../reskin'

/** 'Morrendo' = nome da CONDIÇÃO da vault (Sistema/Regras/Condições/Morrendo.md;
 *  catálogo do plugin condicoes-catalog.ts) — o estado de quem tem moral e
 *  está com EV ≤ 0 (Sistema/Regras/Combate/Morte.md). Os demais: classify-vita
 *  do plugin. */
export type VitaStatus = 'Impecável' | 'Saudável' | 'Ferido' | 'Gravemente Ferido' | 'Morrendo' | 'Morto'
export type VitaTone = 'is-trivial' | 'is-easy' | 'is-hard' | 'is-lethal' | 'is-dead'

export interface VitaClassification {
  label: VitaStatus
  tone: VitaTone
}

/** VERBATIM do plugin (classify-vita.ts). */
export function classifyVita(vit: number, vitMax: number): VitaClassification {
  if (vit <= 0 && vitMax > 0) return { label: 'Morto', tone: 'is-dead' }
  if (vitMax === 0) return { label: 'Impecável', tone: 'is-trivial' }
  const ratio = vit / vitMax
  if (ratio >= 1) return { label: 'Impecável', tone: 'is-trivial' }
  if (ratio > 0.5) return { label: 'Saudável', tone: 'is-easy' }
  if (ratio > 0.25) return { label: 'Ferido', tone: 'is-hard' }
  return { label: 'Gravemente Ferido', tone: 'is-lethal' }
}

/** Tem MORAL → a vida vai NEGATIVA até −máx antes de cair (Morte.md): herói,
 *  companheiro animal, ou qualquer combatente de família com moral
 *  (FICHA_FAMILIA — Monstro não tem; o piso dele é 0, ajustaEvNpc trava). */
function temMoral(c: SessionCharacter): boolean {
  if (c.kind === 'heroi' || c.kind === 'companheiro') return true
  return FICHA_FAMILIA[c.summary.family]?.moral ?? false
}

const vitDe = (c: SessionCharacter) => c.state.recursosRestantes?.vitalidade ?? 0

/** Faixa de vida do combatente. "Morto" de fato só com a marca EXPLÍCITA do GM
 *  (turnState.mortos — paridade CombatantState.morto do tracker do plugin).
 *  Quem tem moral com EV ≤ 0 está "Morrendo" (ainda age). Sem moral (Monstro)
 *  e sem marca, segue o classifyVita VERBATIM do plugin — EV ≤ 0 já sai
 *  "Morto" na faixa, como no player view do pleitost-sync (npcStatus →
 *  classifyVita); pular a vez continua exigindo a marca. */
export function vitaStatusOf(c: SessionCharacter, morto = false): VitaClassification {
  if (morto) return { label: 'Morto', tone: 'is-dead' }
  const vit = vitDe(c)
  if (vit <= 0 && c.summary.vitalidadeMax > 0 && temMoral(c)) return { label: 'Morrendo', tone: 'is-lethal' }
  return classifyVita(vit, c.summary.vitalidadeMax)
}

/** Sugestão de morte (destaca o 💀 do GM; NÃO marca sozinho) — paridade
 *  shouldShowDeathSkull do plugin (tracker-actions.ts): sem moral e EV ≤ 0, ou
 *  com moral no piso EV ≤ −máx (isAtVitalidadeFloor). */
export function sugereMorte(c: SessionCharacter): boolean {
  const max = Math.max(0, c.summary.vitalidadeMax)
  const vit = vitDe(c)
  if (temMoral(c)) return max > 0 && vit <= -max
  return max > 0 && vit <= 0
}

/** Cor da faixa de estado de vida — MESMA paleta do pleitost-autosheet (#322):
 *  styles.css .gm-enc-difficulty.is-* (is-trivial azul, is-easy verde, is-hard
 *  laranja, is-lethal vermelho). Antes o is-trivial ("Impecável") saía cinza. */
export const VITA_TONE_COLOR: Record<VitaTone, string> = {
  'is-trivial': '#60a5fa',
  'is-easy': '#4ade80',
  'is-hard': '#fb923c',
  'is-lethal': '#f87171',
  'is-dead': '#8a8f98',
}

function baseLabelOf(summary: CharacterSummary): string {
  if (summary.family === 'Monstro') return summary.raca?.trim() || 'Criatura'
  if (summary.family === 'CompanheiroAnimal') return 'Companheiro'
  if (summary.family === 'Heroi') return 'Humano'
  return 'Criatura'
}

/** Nomes exibidos pro JOGADOR: revelados mostram o nome real; ocultos viram
 *  o rótulo genérico NUMERADO por repetição (ordem estável da lista). */
export function maskedNames(
  chars: readonly SessionCharacter[],
  revealedIds: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>()
  const numberByLabel = new Map<string, number>()
  for (const c of chars) {
    if (revealedIds.includes(c.id)) {
      out.set(c.id, c.summary.nome)
      continue
    }
    const base = baseLabelOf(c.summary)
    const n = (numberByLabel.get(base) ?? 0) + 1
    numberByLabel.set(base, n)
    out.set(c.id, `${base} ${n}`)
  }
  return out
}

/** Lado do combatente nos blocos de iniciativa. #16: o companheiro animal fica
 *  do LADO DO TUTOR (tutor jogador → lado jogador), não sempre "inimigo";
 *  resolve o tutor por tutorCharacterId no mapa da sala. Fonte única do
 *  CombateDaSala (sidebar) e do Escudo do Mestre. */
export function ladoDoCombatente(
  c: SessionCharacter,
  charById: ReadonlyMap<string, SessionCharacter>,
): Lado {
  if (c.kind === 'companheiro' && c.tutorCharacterId) {
    const tutor = charById.get(c.tutorCharacterId)
    if (tutor) return ladoDe(tutor.summary.family)
  }
  return ladoDe(c.summary.family)
}

/** Linha embaixo do nome na iniciativa do ESCUDO (pedido 2026-10-08): classe
 *  (nome no mundo ativo) + "Tier N" pro monstro ou "Nível N" pro resto, ex.:
 *  "Soldado Competente · Tier 1" / "Pirata Pugilista · Nível 2". Monstro
 *  publicado antes do `tier` no summary cai no `Tier` do fmBlob. */
export function subtituloCombatente(s: CharacterSummary, fmBlob?: Record<string, unknown> | null): string {
  if (!s.classe) return ''
  const classe = reskinName(s.classe)
  if (s.family === 'Monstro') {
    const bruto = s.tier ?? fmBlob?.['Tier']
    const tier = typeof bruto === 'number' ? bruto : typeof bruto === 'string' && bruto.trim() ? Number(bruto) : NaN
    return Number.isFinite(tier) ? `${classe} · Tier ${tier}` : classe
  }
  return s.nivel > 0 ? `${classe} · Nível ${s.nivel}` : classe
}
