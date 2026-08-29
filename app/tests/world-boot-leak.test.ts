// @vitest-environment jsdom
// Report 2026-08-29: "entrar já logado no poa1987 E no Carlos Facão" — o Carlos
// é da FANTASIA. `pleitost.selectedCreature`/`pleitost.sessaoAtiva` são
// espelhados no servidor (#84) e os clears de #519/#520 só rodam no EVENTO de
// troca de mundo — no BOOT (ou num pull do sync, que escreve o storage sem
// evento) a seleção do outro mundo chegava sem disparar nada. Fix: a seleção é
// CARIMBADA com o mundo e validada na LEITURA; a sessão ativa valida o mundo
// da sessão apontada.
//
// Nos testes, o BOOT é simulado assim: contexto já no mundo alvo → seed escrito
// DIRETO no storage (como o sync faz) → reset dos caches de memória → leitura.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  getSelectedCreature,
  setSelectedCreature,
  __resetSelectedCreatureForTests,
} from '../src/data/selected-creature-store'
import { getActiveSessionCode, __resetSessionStoreForTests } from '../src/data/session-store'
import { useTheme, __resetThemeForTests } from '../src/theme'

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

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
  __resetSelectedCreatureForTests()
  __resetSessionStoreForTests()
})

const seedSelecao = (blob: object) =>
  window.localStorage.setItem('pleitost.selectedCreature', JSON.stringify(blob))

describe('seleção de personagem por mundo (boot/sync, não só o evento de troca)', () => {
  it('BOOT no cyberpunk com blob LEGADO (sem mundo = fantasia) → sem seleção', () => {
    setContext('cyberpunk')
    seedSelecao({ id: 'Personagens/Carlos Facão' }) // pull do sync: sem evento
    __resetSelectedCreatureForTests() // boot: re-hidrata do storage
    expect(getSelectedCreature()).toBeNull()
  })

  it('blob legado segue valendo na fantasia', () => {
    seedSelecao({ id: 'Personagens/Carlos Facão' })
    __resetSelectedCreatureForTests()
    expect(getSelectedCreature()).toBe('Personagens/Carlos Facão')
  })

  it('seleção CARIMBADA do outro mundo não vaza; a do mundo ativo vale', () => {
    seedSelecao({ id: 'local:heroi-poa', world: 'cyberpunk' })
    __resetSelectedCreatureForTests()
    expect(getSelectedCreature()).toBeNull() // fantasia ativa
    setContext('cyberpunk')
    seedSelecao({ id: 'local:heroi-poa', world: 'cyberpunk' })
    __resetSelectedCreatureForTests()
    expect(getSelectedCreature()).toBe('local:heroi-poa')
  })

  it('setSelectedCreature carimba o mundo ativo na escrita', () => {
    setSelectedCreature('Personagens/Carlos Facão') // fantasia
    const raw = JSON.parse(window.localStorage.getItem('pleitost.selectedCreature')!)
    expect(raw.world).toBe('fantasia')
  })

  it('a troca de mundo AO VIVO segue limpando (comportamento #520 mantido)', () => {
    setSelectedCreature('Personagens/Carlos Facão')
    setContext('cyberpunk')
    expect(getSelectedCreature()).toBeNull()
    setContext('fantasia')
    expect(getSelectedCreature()).toBeNull() // o clear do evento apagou o raw
  })
})

describe('sessão ativa valida o mundo da sessão apontada', () => {
  const seedSessao = () => {
    window.localStorage.setItem(
      'pleitost.sessoes',
      JSON.stringify([{ codigo: 'MESA-1', nome: 'Mesa Fantasia', claims: {}, world: 'fantasia' }]),
    )
    window.localStorage.setItem(
      'pleitost.sessaoAtiva',
      JSON.stringify({ codigo: 'MESA-1', updatedAt: '2026-08-29T00:00:00Z' }),
    )
  }

  it('BOOT no cyberpunk com ponteiro pra sessão da FANTASIA → desconectado', () => {
    setContext('cyberpunk')
    seedSessao()
    __resetMemSessionStore()
    expect(getActiveSessionCode()).toBeNull()
  })

  it('mesmo ponteiro conecta normalmente na fantasia', () => {
    seedSessao()
    __resetMemSessionStore()
    expect(getActiveSessionCode()).toBe('MESA-1')
  })
})

/** Reset SÓ dos caches de memória do session-store — o helper oficial também
 *  apaga o storage, que aqui é a fixture do boot. */
function __resetMemSessionStore() {
  const sess = window.localStorage.getItem('pleitost.sessoes')
  const ativa = window.localStorage.getItem('pleitost.sessaoAtiva')
  __resetSessionStoreForTests()
  if (sess) window.localStorage.setItem('pleitost.sessoes', sess)
  if (ativa) window.localStorage.setItem('pleitost.sessaoAtiva', ativa)
}
