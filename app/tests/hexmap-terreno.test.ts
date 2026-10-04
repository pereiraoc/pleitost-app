// @vitest-environment jsdom
// TERRENO por hex (viagem do hexcrawl, 2026-10-04): a célula do hexmap ganha
// `terreno` (chave do bloco `viagem` do Contexto-Def). Uma célula SÓ com
// terreno (sem lugar nem área) é válida e sobrevive à normalização/hidratação,
// ao sync da mesa (setHexMapFull) e às edições de lugar/área do mesmo hex.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetHexMapStoreMemoryForTests,
  __setSeedsForTests,
  cellAt,
  getHexMapState,
  removeHex,
  removeHexAreaBulk,
  setHexAreaBulk,
  setHexLocal,
  setHexMapFull,
  setHexTerrenoBulk,
} from '../src/data/hexmap-store'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

const R = 'teste:terreno'

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __setSeedsForTests({})
  __resetHexMapStoreMemoryForTests()
})

describe('terreno no hexmap', () => {
  it('célula só com terreno sobrevive ao reload (normalize)', () => {
    setHexTerrenoBulk(R, [{ col: 3, row: 4 }], 'dificil')
    __resetHexMapStoreMemoryForTests()
    expect(cellAt(getHexMapState(R).cells, 3, 4)).toEqual({ col: 3, row: 4, terreno: 'dificil' })
  })

  it('setHexMapFull (sync da mesa) mantém célula só com terreno', () => {
    setHexMapFull(R, [{ col: 1, row: 1, terreno: 'mar' }, { col: 2, row: 2 }])
    expect(getHexMapState(R).cells).toEqual([{ col: 1, row: 1, terreno: 'mar' }])
  })

  it('lugar/área preservam o terreno; limpar terreno some com a célula vazia', () => {
    setHexTerrenoBulk(R, [{ col: 5, row: 5 }, { col: 6, row: 5 }], 'estrada')
    setHexLocal(R, 5, 5, 'Atlas/Safira')
    setHexAreaBulk(R, [{ col: 5, row: 5 }], 'Atlas/Mundo Livre')
    expect(cellAt(getHexMapState(R).cells, 5, 5)).toEqual({
      col: 5,
      row: 5,
      localId: 'Atlas/Safira',
      areaIds: ['Atlas/Mundo Livre'],
      terreno: 'estrada',
    })
    removeHex(R, 5, 5)
    removeHexAreaBulk(R, [{ col: 5, row: 5 }])
    expect(cellAt(getHexMapState(R).cells, 5, 5)).toEqual({ col: 5, row: 5, terreno: 'estrada' })
    setHexTerrenoBulk(R, [{ col: 5, row: 5 }, { col: 6, row: 5 }], null)
    expect(getHexMapState(R).cells).toEqual([])
  })
})
