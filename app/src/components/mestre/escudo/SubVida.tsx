// ESCUDO DO MESTRE — sub-aba VIDA: o MESMO CombateDaSala do painel SESSÃO
// (vida, steppers de EV, próximo/anterior, velocidades, esconder/revelar,
// liberar ficha — writes idempotentes, estado local independente da cópia da
// sidebar), filtrado por lado e com os chips de CONDIÇÕES/EFEITOS ativos de
// cada combatente dentro da linha (o combate do painel não os mostra).
import type { CSSProperties } from 'react'
import type { SessionRec } from '../../../data/session-store'
import type { SessionCharacter } from '../../../data/session-repo/contract'
import type { VaultDoc } from '../../../data/types'
import { isCondicaoOn, isEfeitoOn, parseStateKey } from '../../../interativa/state'
import { useCondicaoDocs } from '../../../interativa/useInterativaCtx'
import { reskinName } from '../../../data/reskin'
import { CombateDaSala } from '../../sessao/SessaoPage'
import { ItemHover } from '../../item-card'
import { chipStyle } from '../../detail/ResumoDetail'
import type { FiltroEscudo } from './useCombatentes'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

/** Condições (Interativa.Condicoes_Ativas) e efeitos (Efeitos_Ativos) LIGADOS
 *  do combatente, em chips com a carta da condição no hover. Chave composta
 *  `Label::compartilhadoDe` → só o label (parseStateKey). */
export function CondicoesAtivasChips({ c, docs }: { c: SessionCharacter; docs: readonly VaultDoc[] }) {
  const itens: { key: string; label: string; tipo: 'condicao' | 'efeito' }[] = []
  for (const [k, v] of Object.entries(c.state.condicoesAtivas ?? {})) {
    if (isCondicaoOn(v)) itens.push({ key: `c:${k}`, label: parseStateKey(k).label, tipo: 'condicao' })
  }
  for (const [k, v] of Object.entries(c.state.efeitosAtivos ?? {})) {
    const label = parseStateKey(k).label
    if (isEfeitoOn(v) && !itens.some((i) => i.label === label)) itens.push({ key: `e:${k}`, label, tipo: 'efeito' })
  }
  if (itens.length === 0) return null
  return (
    <div data-escudo-condicoes="" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 39 }}>
      {itens.map((it) => {
        const doc = docs.find((d) => d.basename === it.label)
        return (
          <span key={it.key} data-escudo-condicao={it.label} data-escudo-condicao-tipo={it.tipo} style={chipStyle}>
            <ItemHover doc={doc} fullBody>
              <span style={mono({ fontSize: 10.5, fontWeight: 700 })}>{reskinName(it.label)}</span>
            </ItemHover>
          </span>
        )
      })}
    </div>
  )
}

export function SubVida({ sess, filtro }: { sess: SessionRec; filtro: FiltroEscudo }) {
  const { docs } = useCondicaoDocs()
  return (
    <div data-escudo-sub="vida">
      <CombateDaSala
        sess={sess}
        variante="escudo"
        filtro={(_c, lado) => filtro === 'todos' || lado === 'inimigo'}
        extraPorCombatente={(c) => <CondicoesAtivasChips c={c} docs={docs} />}
      />
    </div>
  )
}
