// AVENTURA EM CURSO na mesa (state.aventura da sala viva), já carregada e
// interpretada — o que os painéis do escudo (CENA, NOTAS) leem. `locked` =
// doc protegido e não destravado NESTE aparelho: aí não há `model` (o corpo
// cifrado não é lido) e quem mostra manda destravar no compêndio.
import { useMemo } from 'react'
import { useDoc } from '../data/useDoc'
import { useCatalog } from '../data/CatalogContext'
import { isUnlocked } from '../data/doc-lock'
import { useLiveSession } from '../data/session-repo/live-session'
import type { VaultDoc } from '../data/types'
import { aventuraAtual } from './session-actions'
import { parseAventura } from './parse-aventura'
import { aventuraConfig, type AventuraConfig } from './config'
import type { AventuraModel } from './types'

export interface AventuraEmCurso {
  av: ReturnType<typeof aventuraAtual>
  doc: VaultDoc | null
  locked: boolean
  model: AventuraModel | null
  cfg: AventuraConfig
}

export function useAventuraEmCurso(): AventuraEmCurso {
  const live = useLiveSession()
  const catalog = useCatalog()
  const av = aventuraAtual(live)
  const { doc } = useDoc(av?.docId ?? '')
  const cfg = useMemo(() => aventuraConfig(catalog.contextoDef), [catalog.contextoDef])
  const locked = !!doc && !!(doc as { protegido?: unknown }).protegido && !isUnlocked(doc.id)
  const model = useMemo(() => (av && doc && !locked ? parseAventura(doc, cfg) : null), [av, doc, locked, cfg])
  return { av, doc: av ? (doc ?? null) : null, locked, model, cfg }
}
