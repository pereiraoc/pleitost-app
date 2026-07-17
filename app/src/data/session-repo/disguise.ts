// DISFARCE SEGURO (#291) — projeção MASCARADA de um NPC disfarçado pros
// jogadores. Hoje o disfarce é só na UI: a linha em `session_characters` chega
// com summary+fmBlob REAIS ao cliente do jogador (RLS entrega tudo pra NPC
// `visible`), então devtools revela a ficha. A correção publica só esta projeção
// mascarada; o real vive no user_state do GM (disguise-secrets) e volta no reveal.
import type { CharacterSummary } from './contract'

/** Summary mascarado pros jogadores. Espelha a regra do pleitost-autosheet
 *  (spec do usuário): NPC não-escondido mostra IMAGEM + label genérico
 *  ("Criatura N") + estimativa de vida; revelar só acrescenta o NOME. Então
 *  mantém `family` (label), `imagem` (sempre visível se existir) e
 *  `vitalidadeMax`/`moralMax` (a estimativa de vida se apoia neles). Tudo que
 *  IDENTIFICA ou dá vantagem mecânica — nome, raça, classe, sintonia, atributos,
 *  stats de combate, nível, tutor — é zerado/omitido. Com `raca` fora, um
 *  monstro disfarçado vira "Criatura N", não "Goblin N".
 *
 *  `revealName`: no reveal o NOME real volta (mas stats/ficha continuam ocultos
 *  — "revelado continua vendo só a estimativa, mas aí vê o nome"). */
export function maskSummaryForDisguise(real: CharacterSummary, revealName = false): CharacterSummary {
  return {
    nome: revealName ? real.nome : '',
    family: real.family,
    nivel: 0,
    atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
    vitalidadeMax: real.vitalidadeMax,
    ...(real.moralMax !== undefined ? { moralMax: real.moralMax } : {}),
    ...(real.imagem !== undefined ? { imagem: real.imagem } : {}),
    stats: { defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 },
    // raca / classe / sintonia / tutorRef: omitidos (undefined)
  }
}
