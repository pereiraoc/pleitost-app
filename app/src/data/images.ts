// IMAGENS LOCAIS (issue #197): retrato que o jogador SOBE pro herói/companheiro/
// grupo criado no navegador. A vault é READ-ONLY (o app nunca escreve nela), e
// localStorage não comporta blobs de foto — então a imagem vive em IndexedDB
// (database `pleitost-images`, key = entityId), local-first como o resto das
// entidades locais. Sem dependência nova: indexedDB cru com um wrapper promise
// mínimo (request→Promise), espelhando o padrão de reatividade do
// local-entities.ts (versão + listeners pra useSyncExternalStore).
//
// A LEITURA de retrato passa por useCreaturePortrait(doc): imagem local tem
// precedência; sem ela, cai na hierarquia da vault (creatureImageUrl/assets.json)
// — assim os call sites não espalham ifs de "é local? tem upload?".
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAssetIndex } from './assets'
import { creatureImageUrl } from './creature-image'
import type { VaultDoc } from './types'

const DB_NAME = 'pleitost-images'
const DB_VERSION = 1
const STORE = 'images'

/* ===================== indexedDB (wrapper promise mínimo) ===================== */

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  // Cacheia a conexão (abrir é async e caro); falha limpa o cache pra permitir
  // retry — mesma política do fetchAssetIndex (assets.ts).
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      // key = entityId (out-of-line), valor = Blob da imagem como veio do input.
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('indexedDB: open falhou'))
    }
  })
  return dbPromise
}

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB: request falhou'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return asPromise(fn(db.transaction(STORE, mode).objectStore(STORE)))
}

/* ===================== reatividade (espelho do local-entities) ===================== */

let version = 0
const listeners = new Set<() => void>()

/** Toda mutação bumpa a versão e acorda os assinantes — coarse (qualquer imagem
 *  reprocessa os hooks montados), mas suficiente pra escala do app. */
function bump(): void {
  version++
  for (const cb of listeners) cb()
}

function subscribeImages(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
function imagesVersion(): number {
  return version
}

/* ===================== API ===================== */

/** Grava/substitui a imagem de uma entidade (blob como veio do input file). */
export async function saveEntityImage(id: string, blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, id))
  bump()
}

/** Remove a imagem — os retratos voltam ao fallback da vault/iniciais. */
export async function deleteEntityImage(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
  bump()
}

function getEntityImage(id: string): Promise<Blob | undefined> {
  return withStore('readonly', (store) => store.get(id) as IDBRequest<Blob | undefined>)
}

/**
 * Object URL da imagem local de uma entidade, ou null (ausente/carregando).
 * Async por natureza (IndexedDB não tem leitura síncrona): o retrato resolve
 * num segundo render — sem fallback síncrono de propósito, o caller mostra o
 * fallback usual enquanto isso. O URL é revogado no cleanup (memória do blob);
 * a versão reativa refaz a leitura quando alguém salva/remove.
 */
export function useEntityImageUrl(id: string | null | undefined): string | null {
  const v = useSyncExternalStore(subscribeImages, imagesVersion, imagesVersion)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    // Zera ANTES do async: o URL anterior já foi revogado no cleanup — mantê-lo
    // no estado renderizaria um blob: morto até a nova leitura resolver.
    setUrl(null)
    if (!id) return
    let alive = true
    let objectUrl: string | null = null
    getEntityImage(id).then(
      (blob) => {
        if (!alive) return
        objectUrl = blob ? URL.createObjectURL(blob) : null
        setUrl(objectUrl)
      },
      // indexedDB indisponível (private mode etc.) → sem imagem local, sem crash.
      () => alive && setUrl(null),
    )
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, v])
  return url
}

/**
 * Retrato de uma criatura, local-first: imagem subida pelo jogador (IndexedDB)
 * tem precedência; sem ela, hierarquia da vault (creatureImageUrl/assets.json).
 * Único ponto de combinação — call sites de retrato trocam
 * `creatureImageUrl(doc, assets)` por este hook, sem ifs próprios.
 */
export function useCreaturePortrait(doc: VaultDoc | undefined): string | null {
  const assets = useAssetIndex()
  const local = useEntityImageUrl(doc?.id ?? null)
  return local ?? creatureImageUrl(doc, assets)
}

/* ===================== testes ===================== */

/** SÓ testes: derruba a conexão cacheada e zera a reatividade — permite trocar
 *  o indexedDB global (fake-indexeddb) entre casos sem vazar estado. */
export function __resetImagesStoreForTests(): void {
  void dbPromise?.then((db) => db.close()).catch(() => undefined)
  dbPromise = null
  version = 0
  listeners.clear()
}
