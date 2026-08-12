// @vitest-environment jsdom
// #448/#449 follow-up (report do usuário: celular travado numa mesa de teste):
// a MESA ATIVA e a EXCLUSÃO de mesa precisam propagar entre dispositivos.
// - sessaoAtiva vira blob carimbado {codigo, updatedAt} → newer-wins (a escolha
//   mais recente vence; ponteiro não fica mais preso ao valor velho do device).
// - deleteSession deixa um TOMBSTONE no blob de sessoes → a exclusão propaga e a
//   mesa não ressuscita pela união do sync.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createSession,
  deleteSession,
  getActiveSessionCode,
  listSessions,
  setActiveSessionCode,
  __resetSessionStoreForTests,
} from '../src/data/session-store'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const ACTIVE = 'pleitost.sessaoAtiva'
const SESSOES = 'pleitost.sessoes'

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  __resetSessionStoreForTests()
})
afterEach(() => __resetSessionStoreForTests())

describe('mesa ATIVA carimbada (newer-wins)', () => {
  it('setActiveSessionCode grava blob {codigo, updatedAt}; o getter lê de volta', () => {
    setActiveSessionCode('EYMSMC')
    expect(getActiveSessionCode()).toBe('EYMSMC')
    const blob = JSON.parse(window.localStorage.getItem(ACTIVE)!)
    expect(blob.codigo).toBe('EYMSMC')
    expect(typeof blob.updatedAt).toBe('string')
  })

  it('limpar (null) carimba blob {codigo:null} — o "sem mesa" também propaga', () => {
    setActiveSessionCode('EYMSMC')
    setActiveSessionCode(null)
    expect(getActiveSessionCode()).toBeNull()
    const blob = JSON.parse(window.localStorage.getItem(ACTIVE)!)
    expect(blob.codigo).toBeNull()
    expect(typeof blob.updatedAt).toBe('string')
  })

  it('getter TOLERA valor legado (string crua) sem quebrar', () => {
    window.localStorage.setItem(ACTIVE, 'TQDMER') // formato antigo, pré-fix
    __resetSessionStoreForTests() // só zera cache de memória
    window.localStorage.setItem(ACTIVE, 'TQDMER')
    expect(getActiveSessionCode()).toBe('TQDMER')
  })
})

describe('EXCLUSÃO de mesa deixa tombstone', () => {
  it('deleteSession esconde a mesa da lista mas mantém o marcador __deleted__ no blob', () => {
    const a = createSession('Mesa A', null, '')
    const b = createSession('Mesa B', null, '')
    deleteSession(a.codigo)
    // some da lista visível
    expect(listSessions().map((s) => s.codigo)).toEqual([b.codigo])
    // mas o tombstone fica persistido (pra propagar a deleção)
    const blob = JSON.parse(window.localStorage.getItem(SESSOES)!) as Array<Record<string, unknown>>
    const tomb = blob.find((x) => x['codigo'] === a.codigo && typeof x['__deleted__'] === 'string')
    expect(tomb).toBeTruthy()
  })

  it('deletar a mesa ATIVA limpa o ponteiro', () => {
    const a = createSession('Mesa A', null, '')
    setActiveSessionCode(a.codigo)
    deleteSession(a.codigo)
    expect(getActiveSessionCode()).toBeNull()
  })
})
