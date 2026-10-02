// ESCUDO DO MESTRE — gate: a aba COMBATE vira o Escudo só em MODO MESTRE e só
// na ficha de HERÓI. A ficha de um monstro da vault/local (#229 a: bestiário →
// ficha formato herói) e a do companheiro animal seguem com o COMBATE próprio
// — é ali que o mestre vê a vida/ataques DAQUELA criatura sem mesa.
import type { SheetFamily } from '../../../data/familia'

export function escudoAtivo(mestre: boolean, familia: SheetFamily | null): boolean {
  return mestre && (familia === null || familia === 'Heroi')
}
