// Hook do mapa de hexcrawl de uma região (issue #67) — assina o hexmap-store
// (namespace pleitost.hexMap.<regiao>) no padrão useSyncExternalStore do repo.
// Compartilhado pelo editor (HexMapEditor) e pela exploração do grupo.
import { useCallback, useSyncExternalStore } from 'react'
import { getHexMapState, subscribeHexMap, type HexMapState } from './hexmap-store'

export function useHexMap(regionId: string): HexMapState {
  return useSyncExternalStore(
    useCallback((cb: () => void) => subscribeHexMap(regionId, cb), [regionId]),
    () => getHexMapState(regionId),
  )
}
