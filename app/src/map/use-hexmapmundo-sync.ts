// DISTRIBUIÇÃO do mapa-múndi autorado pelo mestre (hexmap mapa:mundo) pros
// jogadores da MESA (#430) — mesmo veículo das regiões (#419) e da exploração
// (#5): sessions.state.hexMapMundo (jsonb). O MESTRE empurra as células que
// editou; o JOGADOR conectado adota no store local (setHexMapFull) e o render
// usa o store normal (useHexMap). Sem loop: mestre só empurra, jogador só lê.
//
// Complementa o espelho por CONTA (user_state newer-wins) que cobre o mesmo
// mestre em vários dispositivos; aqui o alvo são OUTRAS contas (jogadores).
import { useEffect, useRef } from 'react'
import { useHexMap } from '../data/useHexMap'
import { hexMapFoiEditado, setHexMapFull } from '../data/hexmap-store'
import { MAPA_MUNDO_ID } from '../data/seed-hexmaps'
import { useLiveSession } from '../data/session-repo/live-session'
import { useSessionRepo } from '../data/session-repo/provider'

/** Liga a sincronização do mapa-múndi com a mesa. Chamado onde o mapa é visto
 *  (/mapa e a exploração do grupo) — idempotente, pode montar em ambos. */
export function useHexMapMundoSync(mestre: boolean): void {
  const live = useLiveSession()
  const repo = useSessionRepo()
  const hexMap = useHexMap(MAPA_MUNDO_ID)
  const remoto = (live?.state as Record<string, unknown> | null | undefined)?.['hexMapMundo']
  const remotoCells = remoto && typeof remoto === 'object' ? (remoto as { cells?: unknown }).cells : null
  const remotoSig = Array.isArray(remotoCells) ? JSON.stringify(remotoCells) : null

  // MESTRE empurra as células EDITADAS neste device (o seed não conta — nunca
  // sobrescreve a mesa com o mapa embarcado). Guarda por assinatura: não
  // re-empurra o que já está na mesa nem repete o mesmo blob.
  const pushedRef = useRef('')
  useEffect(() => {
    if (!mestre || !repo || !live?.sessionId) return
    if (!hexMapFoiEditado(MAPA_MUNDO_ID)) return
    const sig = JSON.stringify(hexMap.cells)
    if (sig === pushedRef.current || sig === remotoSig) return
    pushedRef.current = sig
    void repo.updateSessionState(live.sessionId, { hexMapMundo: { cells: hexMap.cells } }).catch(() => {})
  }, [mestre, repo, live?.sessionId, hexMap.cells, remotoSig])

  // JOGADOR (não-mestre) adota o mapa da mesa UMA vez por valor remoto distinto.
  // CUIDADO (React #185): NÃO comparar `remotoSig` (células cruas) com
  // `JSON.stringify(hexMap.cells)` (células NORMALIZADAS por setHexMapFull) — a
  // normalização (migração areaId→areaIds, ordem de chaves, campos vazios
  // omitidos) faz as strings nunca baterem, e o efeito re-importava a CADA
  // render → loop infinito de commit/emit. Rastreia o último remoto importado.
  const importedRef = useRef<string | null>(null)
  useEffect(() => {
    if (mestre || remotoSig === null) return
    if (remotoSig === importedRef.current) return
    importedRef.current = remotoSig
    setHexMapFull(MAPA_MUNDO_ID, remotoCells)
  }, [mestre, remotoSig, remotoCells])
}
