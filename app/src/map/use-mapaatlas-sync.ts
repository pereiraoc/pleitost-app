// SYNC do mapaAtlas (regiões + habilitação por grupo) com a MESA — extraído do
// AtlasMapaPage (#419/#423/#424) pra ser reusável: agora o mestre também edita
// a habilitação na FICHA DO GRUPO (GrupoView), então a adoção/push do state da
// sessão precisa rodar nos DOIS lugares (/mapa e a exploração do grupo).
//
// Contrato preservado: jogador conectado LÊ o state da mesa (cfg = remoto);
// mestre/offline usa o local. Mestre conectado EMPURRA o blob EDITADO neste
// aparelho (seed não conta; local vazio nunca apaga mesa com conteúdo).
import { useEffect, useMemo, useRef } from 'react'
import { useLiveSelector } from '../data/session-repo/live-session'
import { useSessionRepo } from '../data/session-repo/provider'
import {
  lembrarMesa,
  mapaAtlasFoiEditadoLocalmente,
  mapaAtlasJson,
  sanitize,
  setMapaAtlasFull,
  ultimaMesaLembrada,
  useMapaAtlas,
  type MapaAtlasState,
} from './mapa-atlas-store'

export interface MapaAtlasSync {
  local: MapaAtlasState
  remoto: unknown
  /** Config EFETIVA pro viewer: jogador conectado = mesa; mestre/offline = local. */
  cfg: MapaAtlasState
}

export function useMapaAtlasSync(mestre: boolean): MapaAtlasSync {
  // só o sessionId e a fatia mapaAtlas do state (ref estável pelo merge da sala)
  const sessionId = useLiveSelector((l) => l?.sessionId ?? null)
  const remoto = useLiveSelector((l) => (l?.state as Record<string, unknown> | null | undefined)?.['mapaAtlas'])
  const repo = useSessionRepo()
  const local = useMapaAtlas()
  // Jogador: conectado = mesa; desconectado = a ÚLTIMA mesa que viu (senão o
  // local/seed). Mestre: sempre o local (autoria).
  const cfg = useMemo(
    () => (mestre ? local : remoto ? sanitize(remoto) : (ultimaMesaLembrada() ?? local)),
    [mestre, remoto, local],
  )
  // MEMÓRIA DA MESA (jogador): lembra a config vista pra usar offline.
  useEffect(() => {
    if (mestre || !remoto) return
    lembrarMesa(remoto)
  }, [mestre, remoto])

  // ADOÇÃO (#423/#424): mestre SEM edição própria importa o mapa da mesa 1×.
  useEffect(() => {
    if (!mestre || !remoto || mapaAtlasFoiEditadoLocalmente()) return
    const r = sanitize(remoto)
    if (r.regioes.length > 0 || r.pins.length > 0) setMapaAtlasFull(r)
  }, [mestre, remoto])

  // PUSH: mestre conectado empurra o blob EDITADO neste aparelho a cada mudança.
  const pushedRef = useRef('')
  useEffect(() => {
    if (!mestre || !repo || !sessionId) return
    if (!mapaAtlasFoiEditadoLocalmente()) return
    if (local.regioes.length === 0 && local.pins.length === 0) {
      const r = remoto ? sanitize(remoto) : null
      if (r && (r.regioes.length > 0 || r.pins.length > 0)) return
    }
    const json = mapaAtlasJson(local)
    if (json === pushedRef.current) return
    pushedRef.current = json
    void repo.updateSessionState(sessionId, { mapaAtlas: JSON.parse(json) }).catch(() => {})
  }, [mestre, repo, sessionId, local, remoto])

  return { local, remoto, cfg }
}
