// @vitest-environment jsdom
// Jogador DESCONECTADO via "tudo coberto" (relato 2026-09-30): fora da mesa o
// viewer lia a config LOCAL do atlas, que no aparelho do jogador é o seed
// (sem as regiões/habilitações que o mestre marcou). Agora o jogador lembra a
// ÚLTIMA config da mesa que viu e usa ela offline — sem virar "autoria local"
// (o gate de adoção/push do mestre continua intacto).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { setLiveSession } from '../src/data/session-repo/live-session'
import { useMapaAtlasSync } from '../src/map/use-mapaatlas-sync'
import { __resetMapaAtlasForTests, mapaAtlasFoiEditadoLocalmente, ultimaMesaLembrada } from '../src/map/mapa-atlas-store'

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
beforeAll(() => {
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
})
beforeEach(() => {
  window.localStorage.clear()
  __resetMapaAtlasForTests()
  setLiveSession(null)
})
afterEach(() => setLiveSession(null))

const mesa = {
  regioes: [{ id: 'r1', nome: 'Mundo Livre', cells: [{ col: 1, row: 1 }], pontos: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }],
  pins: [],
  habilitadas: { default: ['r1'], 'Grupos/Carlos': ['r1'] },
}
const live = (state: unknown) => ({ sessionId: 's1', gmUserId: 'gm', state: state as never, characters: [], members: [], encounters: [] })

describe('#573 — última config da mesa lembrada pro jogador offline', () => {
  it('conectado, o jogador lembra a config da mesa; desconectado, usa ela (não o seed local); sem marcar edição local', () => {
    const { result, rerender } = renderHook(() => useMapaAtlasSync(false))
    // sem mesa e sem memória: seed local (nada habilitado pro grupo)
    expect(result.current.cfg.habilitadas['Grupos/Carlos']).toBeUndefined()
    act(() => setLiveSession(live({ mapaAtlas: mesa })))
    rerender()
    expect(result.current.cfg.habilitadas['Grupos/Carlos']).toEqual(['r1'])
    expect(ultimaMesaLembrada()?.habilitadas['Grupos/Carlos']).toEqual(['r1'])
    expect(mapaAtlasFoiEditadoLocalmente()).toBe(false)
    // desconecta: continua vendo o que a mesa habilitou
    act(() => setLiveSession(null))
    rerender()
    expect(result.current.cfg.habilitadas['Grupos/Carlos']).toEqual(['r1'])
    expect(result.current.cfg.regioes.map((r) => r.nome)).toEqual(['Mundo Livre'])
  })
  it('mestre segue no local (autoria), sem ser afetado pela memória da mesa', () => {
    act(() => setLiveSession(live({ mapaAtlas: mesa })))
    const { result } = renderHook(() => useMapaAtlasSync(true))
    // mestre sem edição própria ADOTA a mesa (contrato #423/#424) — cfg = local adotado
    expect(result.current.cfg.regioes.length).toBeGreaterThanOrEqual(1)
  })
})
