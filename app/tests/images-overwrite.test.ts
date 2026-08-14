// @vitest-environment jsdom
// Garantia pedida pelo usuário (#465 follow-up): trocar a imagem CUSTOM de um
// herói SOBRESCREVE a anterior (nada de acumular blobs por troca) — o store é
// IndexedDB com key = entityId e `put` (replace). Outros personagens do
// jogador seguem com as suas imagens; os assets da BASE (classes/retratos da
// vault) vivem noutro pipeline read-only (assets.json) que o app nunca escreve.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveEntityImage, deleteEntityImage, __resetImagesStoreForTests } from '../src/data/images'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  __resetImagesStoreForTests()
})

// Tamanhos DISTINTOS identificam qual blob sobreviveu (o clone do
// fake-indexeddb nem sempre expõe arrayBuffer no jsdom).
const png = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/png' })

/** Lê direto do IndexedDB (contagem + blob) pra provar a substituição. */
async function dump(): Promise<Map<IDBValidKey, Blob>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('pleitost-images', 1)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const store = db.transaction('images', 'readonly').objectStore('images')
  const [keys, values] = await Promise.all([
    new Promise<IDBValidKey[]>((res, rej) => {
      const r = store.getAllKeys()
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    }),
    new Promise<Blob[]>((res, rej) => {
      const r = store.getAll()
      r.onsuccess = () => res(r.result as Blob[])
      r.onerror = () => rej(r.error)
    }),
  ])
  db.close()
  return new Map(keys.map((k, i) => [k, values[i]!]))
}

describe('imagem custom do herói: trocar SOBRESCREVE (sem acumular)', () => {
  it('re-upload no MESMO herói substitui o blob (1 registro por id)', async () => {
    await saveEntityImage('local:Heroi:a', png(1))
    await saveEntityImage('local:Heroi:a', png(2))
    const store = await dump()
    // UM registro só pro herói — a antiga não tem ONDE ficar (key=entityId +
    // `put` = replace, garantia do IndexedDB; o conteúdo do Blob não é
    // inspecionável no clone do fake-indexeddb/jsdom).
    expect([...store.keys()]).toEqual(['local:Heroi:a'])
  })

  it('trocar a imagem de UM herói não toca a dos OUTROS personagens do jogador', async () => {
    await saveEntityImage('local:Heroi:a', png(1))
    await saveEntityImage('local:Heroi:b', png(9))
    await saveEntityImage('local:Heroi:a', png(2)) // troca só o A
    const store = await dump()
    // segue 1 registro POR personagem (a troca do A não cria nem apaga o do B)
    expect([...store.keys()].sort()).toEqual(['local:Heroi:a', 'local:Heroi:b'])
  })

  it('remover volta ao fallback (registro some de vez)', async () => {
    await saveEntityImage('local:Heroi:a', png(1))
    await deleteEntityImage('local:Heroi:a')
    expect((await dump()).size).toBe(0)
  })
})
