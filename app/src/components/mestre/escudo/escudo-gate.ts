// ESCUDO DO MESTRE — gate: a aba COMBATE vira o Escudo só em MODO MESTRE e só
// na ficha de HERÓI. A ficha de um monstro da vault/local (#229 a: bestiário →
// ficha formato herói) e a do companheiro animal seguem com o COMBATE próprio
// — é ali que o mestre vê a vida/ataques DAQUELA criatura sem mesa.
import type { SheetFamily } from '../../../data/familia'

//
// Report 2026-10-08: CONECTADO à mesa como mestre, o escudo vale em QUALQUER
// ficha selecionada — com um companheiro selecionado (aberto pela
// iniciativa), o ESCUDO DO MESTRE sumia da barra e a aba levava pro combate
// do bicho. Na mesa o escudo já mostra todos os combatentes, ele incluso.
export function escudoAtivo(mestre: boolean, familia: SheetFamily | null, naMesa = false): boolean {
  return mestre && (naMesa || familia === null || familia === 'Heroi')
}
