// ESCUDO DO MESTRE — o combate da sala dentro do escudo: o MESMO CombateDaSala
// do painel SESSÃO (vida, steppers de EV, próximo/anterior, velocidades,
// esconder/revelar, liberar ficha — writes idempotentes, estado local
// independente da cópia da sidebar), filtrado por lado, com a FICHA de cada
// combatente dentro da linha (porCombatente: escudo, condições, vistas).
import type { ReactNode } from 'react'
import type { SessionRec } from '../../../data/session-store'
import type { SessionCharacter } from '../../../data/session-repo/contract'
import { CombateDaSala } from '../../sessao/SessaoPage'
import type { FiltroEscudo } from './useCombatentes'

export function SubVida({
  sess,
  filtro,
  porCombatente,
}: {
  sess: SessionRec
  filtro: FiltroEscudo
  /** Conteúdo extra por linha (a ficha do combatente: escudo, condições, vistas). */
  porCombatente?: (c: SessionCharacter) => ReactNode
}) {
  return (
    <div data-escudo-sub="vida">
      <CombateDaSala
        sess={sess}
        variante="escudo"
        filtro={(_c, lado) => filtro === 'todos' || lado === 'inimigo'}
        extraPorCombatente={(c) => (porCombatente ? porCombatente(c) : null)}
      />
    </div>
  )
}
