// RESETS DE DEPENDENTES do wizard (#452/#454) — trocar uma escolha ESTRUTURAL
// no meio da criação não pode deixar seleções órfãs (pedido explícito do
// usuário; ver "Ownership map" no design doc).
//
// A fonte única dos resets de CLASSE é `classChangeResets()` (local-entities) —
// a MESMA usada pelo seletor de classe da ficha (ClasseNivelPanel.setClasse):
// zera Magias/Sintonia/Habilidades.Lista (inclui a subclasse)/Tecnicas.Lista/
// Seletores. O wizard NÃO estende essa lista central (mudaria o comportamento
// da ficha); ele COMPÕE com o reset do EQUIPAMENTO INICIAL, que é conceito
// exclusivo do wizard (as recomendações são guiadas por proficiência de classe
// — trocar a classe re-apresenta o passo 6 limpo).
//
// O que deliberadamente NÃO reseta (design doc):
// - Atributos: a restrição de Principal revalida no gate do passo 5
//   (__constraint__Atributos.Principal via elementos de regra).
// - Perícias (picks Slot.*): os slots recontam ao vivo (computeSlotsView) e o
//   gate do passo 7 barra sobre-gasto; a perícia do Passado pertence ao passo 3.
import { classChangeResets } from '../../data/local-entities'
import type { HeroModel } from '../../data/useHeroModel'

/** Paths de FM que o PASSO 6 (equipamento inicial) possui. */
export function equipamentoResets(): Array<[string, unknown]> {
  return [
    ['Inventario.Armas.Lista', []],
    ['Inventario.Escudo.Nome', ''],
    ['Inventario.Armadura.Nome', '[[Sem Armadura]]'],
  ]
}

/** Aplica TODOS os resets de troca de classe no contexto do wizard. */
export function resetOnClasseChange(model: HeroModel): void {
  for (const [path, value] of [...classChangeResets(), ...equipamentoResets()]) {
    model.set(path, value)
  }
}
