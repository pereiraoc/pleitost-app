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

export type VitaStatus = 'Impecável' | 'Saudável' | 'Ferido' | 'Gravemente Ferido' | 'Morto'
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

export function vitaStatusOf(c: SessionCharacter): VitaClassification {
  return classifyVita(c.state.recursosRestantes?.vitalidade ?? 0, c.summary.vitalidadeMax)
}

/** Cor da faixa — mesma paleta de tons do painel do sync. */
export const VITA_TONE_COLOR: Record<VitaTone, string> = {
  'is-trivial': 'var(--muted)',
  'is-easy': '#5aa563',
  'is-hard': '#c98b3a',
  'is-lethal': '#c85a4a',
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
