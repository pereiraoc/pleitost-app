// @vitest-environment jsdom
// #440 — o Modo Mestre é DEFINIDO pela sessão ativa: GM da sessão → mestre;
// jogador → não-mestre; fora de sessão → livre. useIsSessionMestre deriva o
// papel de live.gmUserId vs o usuário logado; o AppShell força o setting.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsSessionMestre } from '../src/data/session-mestre'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import { __setUserForTests } from '../src/data/session-repo/auth-state'

function mesa(gmUserId: string | null): LiveSession {
  return {
    sessionId: 's1',
    gmUserId,
    state: null,
    characters: [],
    members: [],
    encounters: [],
  } as unknown as LiveSession
}

beforeEach(() => {
  setLiveSession(null)
  __setUserForTests(null)
})
afterEach(() => {
  setLiveSession(null)
  __setUserForTests(null)
})

describe('#440 useIsSessionMestre', () => {
  it('GM da sessão ativa → travado como MESTRE', () => {
    __setUserForTests({ id: 'u-gm', nome: 'GM' })
    setLiveSession(mesa('u-gm'))
    const { result } = renderHook(() => useIsSessionMestre())
    expect(result.current).toEqual({ locked: true, roleMestre: true })
  })

  it('JOGADOR na sessão ativa → travado como NÃO-mestre', () => {
    __setUserForTests({ id: 'u-player', nome: 'Jog' })
    setLiveSession(mesa('u-gm')) // GM é outro
    const { result } = renderHook(() => useIsSessionMestre())
    expect(result.current).toEqual({ locked: true, roleMestre: false })
  })

  it('FORA de sessão → não travado (toggle livre)', () => {
    __setUserForTests({ id: 'u1', nome: 'X' })
    setLiveSession(null)
    const { result } = renderHook(() => useIsSessionMestre())
    expect(result.current.locked).toBe(false)
  })

  it('sessão sem gmUserId (offline/legado) → não travado', () => {
    __setUserForTests({ id: 'u1', nome: 'X' })
    setLiveSession(mesa(null))
    const { result } = renderHook(() => useIsSessionMestre())
    expect(result.current.locked).toBe(false)
  })

  it('conectado mas usuário ainda não carregou → não travado', () => {
    __setUserForTests(null)
    setLiveSession(mesa('u-gm'))
    const { result } = renderHook(() => useIsSessionMestre())
    expect(result.current.locked).toBe(false)
  })
})
