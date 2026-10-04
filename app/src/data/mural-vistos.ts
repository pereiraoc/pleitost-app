// "NOVO" da aba MURAL: ids do mural que ESTE aparelho já viu, por sessão
// (`pleitost.mural.vistos.<sessionId>`). Conveniência local — storage
// indisponível só some com o selo, nada quebra.
import { useEffect, useMemo, useState } from 'react'
import type { MuralItem } from './session-repo/contract'

const chave = (sessionId: string) => `pleitost.mural.vistos.${sessionId}`

function lerVistos(sessionId: string): Set<string> {
  try {
    const raw = localStorage.getItem(chave(sessionId))
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function gravarVistos(sessionId: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(chave(sessionId), JSON.stringify(ids))
  } catch {
    /* sem storage */
  }
}

/** Quantos itens do mural este aparelho ainda não viu. `vendo` = a aba MURAL
 *  está aberta agora → tudo vira visto. */
export function useMuralNovos(sessionId: string | null, mural: readonly MuralItem[] | undefined, vendo: boolean): number {
  const [vistos, setVistos] = useState<Set<string>>(() => (sessionId ? lerVistos(sessionId) : new Set()))
  useEffect(() => {
    setVistos(sessionId ? lerVistos(sessionId) : new Set())
  }, [sessionId])
  useEffect(() => {
    if (!vendo || !sessionId || !mural?.length) return
    if (mural.every((m) => vistos.has(m.id))) return
    // guarda só os ids que ainda existem (o mural não cresce sem fim no storage)
    const ids = mural.map((m) => m.id)
    gravarVistos(sessionId, ids)
    setVistos(new Set(ids))
  }, [vendo, sessionId, mural, vistos])
  return useMemo(() => (mural ?? []).filter((m) => !vistos.has(m.id)).length, [mural, vistos])
}
