// @vitest-environment jsdom
// #519 C4 — sessões por MUNDO: criação carimba, listagem filtra, legado =
// fantasia, e TROCAR de mundo desconecta a sessão ativa.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  createSession,
  deleteSession,
  espelharSessaoRemota,
  joinSessionByCode,
  listSessions,
  getActiveSessionCode,
  setActiveSessionCode,
  __resetSessionStoreForTests,
} from '../src/data/session-store'
import { useTheme, __resetThemeForTests } from '../src/theme'
import { useSessions } from '../src/data/session-store'

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
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
  __resetSessionStoreForTests?.()
})

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

describe('sessões por mundo (C4)', () => {
  it('mesa criada num mundo não aparece na lista do outro; legado = fantasia', () => {
    const fant = createSession('Mesa Fantasia', null, 'GM')
    expect(fant.world).toBe('fantasia')
    expect(listSessions().map((s) => s.codigo)).toContain(fant.codigo)

    setContext('cyberpunk')
    expect(listSessions()).toHaveLength(0)
    const cyb = createSession('Mesa POA', null, 'GM')
    expect(listSessions().map((s) => s.codigo)).toEqual([cyb.codigo])

    setContext('fantasia')
    expect(listSessions().map((s) => s.codigo)).toEqual([fant.codigo])
  })

  it('useSessions (snapshot da UI) também filtra pelo mundo', () => {
    const fant = createSession('Mesa UI', null, 'GM')
    const { result, rerender } = renderHook(() => useSessions())
    expect(result.current.sessions.map((s) => s.codigo)).toContain(fant.codigo)
    setContext('cyberpunk')
    rerender()
    expect(result.current.sessions).toHaveLength(0)
  })

  it('trocar de mundo DESCONECTA a sessão ativa', () => {
    const rec = createSession('Mesa Ativa', null, 'GM')
    setActiveSessionCode(rec.codigo)
    expect(getActiveSessionCode()).toBe(rec.codigo)
    setContext('cyberpunk')
    expect(getActiveSessionCode()).toBeNull()
    // trocar de volta NÃO reconecta sozinho (desconexão é natural, não toggle)
    setContext('fantasia')
    expect(getActiveSessionCode()).toBeNull()
  })
})

// Report 2026-09-10 ("continuo não conseguindo criar sessão em POA1987"): a
// criação COM SERVIDOR não passa por createSession — o SessaoPage cria no
// servidor e espelha o registro local com joinSessionByCode, que nascia SEM
// mundo (= fantasia). No POA a mesa recém-criada sumia da lista e o ponteiro
// de sessão ativa lia null: parecia que o botão não fazia nada.
describe('entrar/espelhar por código carimba o mundo', () => {
  it('joinSessionByCode no cyberpunk fica no cyberpunk (e aparece na lista)', () => {
    setContext('cyberpunk')
    const rec = joinSessionByCode('ABC123')
    expect(rec.world).toBe('cyberpunk')
    expect(listSessions().map((s) => s.codigo)).toContain('ABC123')
    setContext('fantasia')
    expect(listSessions().map((s) => s.codigo)).not.toContain('ABC123')
  })

  it('a sessão criada pelo servidor no cyberpunk continua ativa lá', () => {
    setContext('cyberpunk')
    const rec = joinSessionByCode('XYZ789')
    setActiveSessionCode(rec.codigo)
    expect(getActiveSessionCode()).toBe('XYZ789')
  })
})

// Conserto das mesas que nasceram no mundo errado (antes do carimbo): entrar
// pelo código ESTANDO no mundo certo move a mesa pra ele. O espelho automático
// das sessões da conta não move nada.
describe('adotar o mundo ao entrar pelo código', () => {
  it('mesa antiga (fantasia) passa pro cyberpunk quando o mestre entra por lá', () => {
    setContext('fantasia')
    const rec = joinSessionByCode('OLD123', { adotarMundo: true })
    expect(rec.world).toBe('fantasia')
    setContext('cyberpunk')
    expect(listSessions().map((s) => s.codigo)).not.toContain('OLD123')
    const movida = joinSessionByCode('OLD123', { adotarMundo: true })
    expect(movida.world).toBe('cyberpunk')
    expect(listSessions().map((s) => s.codigo)).toContain('OLD123')
  })

  it('espelho automático (sem adotarMundo) NÃO muda o mundo da mesa', () => {
    setContext('fantasia')
    joinSessionByCode('KEEP99', { adotarMundo: true })
    setContext('cyberpunk')
    expect(joinSessionByCode('KEEP99').world).toBe('fantasia')
  })
})

// Report 2026-09-10 ("tu migrou uma sessão teste que era fantasia pra
// cyberpunk — a EYMSMC"): ela tinha sido APAGADA no aparelho; o espelho das
// sessões da conta a encontrou no servidor e a trouxe de volta, carimbada com
// o mundo aberto na hora. O espelho agora não ressuscita nem escolhe mundo.
describe('espelho das sessões do servidor', () => {
  it('mesa apagada neste aparelho continua apagada', () => {
    setContext('fantasia')
    createSession('Teste', null, 'Mestre')
    const codigo = listSessions()[0]!.codigo
    deleteSession(codigo)
    setContext('cyberpunk')
    expect(espelharSessaoRemota(codigo)).toBeNull()
    expect(listSessions().map((s) => s.codigo)).not.toContain(codigo)
    setContext('fantasia')
    expect(listSessions().map((s) => s.codigo)).not.toContain(codigo)
  })

  it('mesa desconhecida entra sem mundo (legado = fantasia), mesmo com o POA aberto', () => {
    setContext('cyberpunk')
    const rec = espelharSessaoRemota('NOVA01')!
    expect(rec.world).toBeUndefined()
    expect(listSessions().map((s) => s.codigo)).not.toContain('NOVA01')
    setContext('fantasia')
    expect(listSessions().map((s) => s.codigo)).toContain('NOVA01')
  })
})
