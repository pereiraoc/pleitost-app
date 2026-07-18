// @vitest-environment jsdom
// #294: marcador "conectado agora" no painel MEMBROS da sessão ativa. O
// SessionRealtime.subscribePresence alimenta o store de presença (userIds
// conectados); MembrosColapsavel marca o MESTRE e cada jogador conectado com a
// bolinha "Conectado agora".
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MembrosColapsavel } from '../src/components/sessao/SessaoPage'
import { setConnectedUserIds } from '../src/data/session-repo/session-presence'
import type { SessionMember } from '../src/data/session-repo/contract'

afterEach(() => {
  cleanup()
  setConnectedUserIds([])
})

const membro = (userId: string, displayName: string, role: 'gm' | 'player'): SessionMember => ({
  sessionId: 's1',
  userId,
  role,
  displayName,
  joinedAt: '2026-01-01T00:00:00Z',
})

const live = {
  sessionId: 's1',
  gmUserId: 'gm1',
  state: null,
  characters: [],
  members: [membro('gm1', 'Mestre Ana', 'gm'), membro('p1', 'João', 'player'), membro('p2', 'Bia', 'player')],
  encounters: [],
} as unknown as NonNullable<Parameters<typeof MembrosColapsavel>[0]['live']>

describe('MembrosColapsavel — presença (#294)', () => {
  it('marca "Conectado agora" só nos conectados (mestre + jogador), não nos offline', () => {
    setConnectedUserIds(['gm1', 'p1']) // mestre e João online; Bia offline
    render(<MembrosColapsavel live={live} />)
    // 2 bolinhas de presença (gm1 + p1); p2 (Bia) sem.
    expect(screen.getAllByTitle('Conectado agora').length).toBe(2)
  })

  it('ninguém conectado → sem marcador', () => {
    setConnectedUserIds([])
    render(<MembrosColapsavel live={live} />)
    expect(screen.queryByTitle('Conectado agora')).toBeNull()
  })
})
