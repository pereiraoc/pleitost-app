import { useEffect, useState } from 'react'
import type { VaultDoc } from './types'

/** URL do JSON de um doc; ids têm espaços/acentos, escapa por segmento. */
export function docJsonUrl(id: string): string {
  return '/vault-data/' + id.split('/').map(encodeURIComponent).join('/') + '.json'
}

const cache = new Map<string, Promise<VaultDoc>>()

export function loadDoc(id: string): Promise<VaultDoc> {
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

export function useDoc(id: string): DocState {
  const [state, setState] = useState<DocState>({})

  useEffect(() => {
    let alive = true
    setState({})
    loadDoc(id).then(
      (doc) => alive && setState({ doc }),
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [id])

  return state
}
