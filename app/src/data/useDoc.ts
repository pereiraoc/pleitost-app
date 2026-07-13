import { useEffect, useMemo, useState } from 'react'
import type { VaultDoc } from './types'
import { getLocalDoc, isLocalId, useLocalStoreVersion } from './local-entities'
import { liveCharacter, synthDocFromCharacter, useLiveSession } from './session-repo/live-session'
import { vaultUrl } from './base-url'

/** Doc SINTÉTICO de personagem remoto (#231): ids `sessao:<charId>` resolvem
 *  da sala viva — mesmo canal do resumo/#188, agora disponível pra QUALQUER
 *  consumidor de docs (GrupoView da mesa etc.). */
function isSessaoId(id: string): boolean {
  return id.startsWith('sessao:')
}
function getSessaoDoc(id: string): VaultDoc | undefined {
  const c = liveCharacter(id.slice('sessao:'.length))
  return c ? synthDocFromCharacter(c) : undefined
}

/** URL do JSON de um doc; ids têm espaços/acentos, escapa por segmento. */
export function docJsonUrl(id: string): string {
  return vaultUrl(id.split('/').map(encodeURIComponent).join('/') + '.json')
}

const cache = new Map<string, Promise<VaultDoc>>()

export function loadDoc(id: string): Promise<VaultDoc> {
  // Entidade local (issues #42–#47): sem fetch — vem do store local.
  if (isLocalId(id)) {
    const doc = getLocalDoc(id)
    return doc ? Promise.resolve(doc) : Promise.reject(new Error(`entidade local "${id}" ausente`))
  }
  if (isSessaoId(id)) {
    const doc = getSessaoDoc(id)
    return doc ? Promise.resolve(doc) : Promise.reject(new Error(`personagem da sala "${id}" ausente`))
  }
  let promise = cache.get(id)
  if (!promise) {
    promise = fetch(docJsonUrl(id)).then((res) => {
      if (!res.ok) throw new Error(`doc "${id}": HTTP ${res.status}`)
      return res.json() as Promise<VaultDoc>
    })
    cache.set(id, promise)
    promise.catch(() => cache.delete(id))
  }
  return promise
}

export interface DocState {
  doc?: VaultDoc
  error?: Error
}

/** Carrega um lote de docs (cache compartilhado); undefined enquanto carrega.
 *  Ids locais resolvem SÍNCRONO do store (reativo via versão); os da vault
 *  seguem o fetch cacheado. */
export function useDocs(ids: string[]): Map<string, VaultDoc> | undefined {
  const localVersion = useLocalStoreVersion()
  const live = useLiveSession() // reatividade dos docs sessao: (#231)
  const [vaultDocs, setVaultDocs] = useState<Map<string, VaultDoc>>()
  const allKey = ids.join('\n')
  const vaultKey = ids.filter((id) => !isLocalId(id) && !isSessaoId(id)).join('\n')

  useEffect(() => {
    let alive = true
    const wanted = vaultKey ? vaultKey.split('\n') : []
    Promise.all(wanted.map((id) => loadDoc(id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setVaultDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [vaultKey])

  return useMemo(() => {
    // Enquanto os docs da vault não chegam, preserva o estado de loading
    // (undefined) — a menos que só haja ids locais, que já estão prontos.
    if (vaultDocs === undefined && vaultKey) return undefined
    const byId = new Map<string, VaultDoc>(vaultDocs ?? [])
    for (const id of ids) {
      const doc = isLocalId(id) ? getLocalDoc(id) : isSessaoId(id) ? getSessaoDoc(id) : undefined
      if (doc) byId.set(id, doc)
    }
    return byId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultDocs, vaultKey, allKey, localVersion, live])
}

export function useDoc(id: string): DocState {
  const localVersion = useLocalStoreVersion()
  const live = useLiveSession()
  const local = isLocalId(id)
  const sessao = isSessaoId(id)
  const [state, setState] = useState<DocState>({})

  useEffect(() => {
    // id vazio = "sem doc" (ex.: AppShell sem personagem selecionado) — não
    // dispara fetch de /vault-data/.json à toa.
    if (local || sessao || !id) return
    let alive = true
    setState({})
    loadDoc(id).then(
      (doc) => alive && setState({ doc }),
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [id, local, sessao])

  if (!id) return {}
  if (sessao) {
    void live
    const doc = getSessaoDoc(id)
    return doc ? { doc } : { error: new Error(`personagem da sala "${id}" não está na sessão ativa`) }
  }
  if (local) {
    void localVersion // re-render quando a entidade local muda
    const doc = getLocalDoc(id)
    return doc ? { doc } : { error: new Error(`entidade local "${id}" não encontrada`) }
  }
  return state
}
