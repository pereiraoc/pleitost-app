// @vitest-environment node
// Feedback do mestre: no painel de DETALHES faltava DESCONECTAR (voltar à lista
// de sessões sem sair de fato) e o "Sair da sessão" precisava virar um ABANDONO
// claro — igual ao pleitost-sync. Semântica (espelho do plugin):
//   - Desconectar → só desativa a sessão local; membership intacta; rejoin pelo
//     histórico. (view.ts:472 "Desconectar — sessão fica no histórico")
//   - Abandonar (jogador) → removeMember no server + tira do histórico local.
//   - Encerrar (CRIADOR/gm) → endSession no server (acaba pra TODOS) + histórico.
// O gate de "criador" é o PAPEL da sessão (live.gmUserId), NÃO o toggle Modo
// Mestre da ficha — um jogador com Modo Mestre continua sendo jogador na mesa.
import { afterEach, describe, expect, it } from 'vitest'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import {
  abandonSession,
  disconnectSession,
  endSessionAsGm,
  isSessionCreator,
} from '../src/data/session-repo/session-actions'
import {
  __resetSessionStoreForTests,
  createSession,
  getActiveSessionCode,
  getSession,
  setActiveSessionCode,
  updateSession,
} from '../src/data/session-store'

afterEach(() => __resetSessionStoreForTests())

describe('disconnectSession', () => {
  it('desativa a sessão local mas mantém o registro no histórico (rejoin depois)', () => {
    const rec = createSession('Mesa', null, 'Mestre')
    setActiveSessionCode(rec.codigo)
    disconnectSession()
    expect(getActiveSessionCode()).toBeNull()
    expect(getSession(rec.codigo)).toBeTruthy()
  })
})

describe('abandonSession (jogador)', () => {
  it('remove o member no server e tira a sessão do histórico local; a mesa segue no server', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC123' })
    await repo.insertMember({ sessionId: sess.id, userId: 'gm-1', role: 'gm', displayName: 'Mestre' })
    await repo.insertMember({ sessionId: sess.id, userId: 'p-1', role: 'player', displayName: 'Ana' })
    const rec = createSession('Mesa', null, 'Mestre')
    updateSession(rec.codigo, { remoteId: sess.id })
    setActiveSessionCode(rec.codigo)

    await abandonSession(repo, sess.id, 'p-1', rec.codigo)

    expect(await repo.findMember(sess.id, 'p-1')).toBeNull()
    expect(await repo.findMember(sess.id, 'gm-1')).toBeTruthy()
    expect(getSession(rec.codigo)).toBeUndefined()
    expect(getActiveSessionCode()).toBeNull()
    expect(await repo.findSessionByCode('ABC123')).toBeTruthy()
  })

  it('sessão local pura (sem remoteId): só remove do histórico local, sem tocar o repo', async () => {
    const repo = new InMemorySessionRepo()
    const rec = createSession('Local', null, 'Você')
    setActiveSessionCode(rec.codigo)
    await abandonSession(repo, undefined, 'p-1', rec.codigo)
    expect(getSession(rec.codigo)).toBeUndefined()
    expect(getActiveSessionCode()).toBeNull()
  })
})

describe('endSessionAsGm (criador)', () => {
  it('encerra a sessão no server (some pra todos) e tira do histórico local', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC123' })
    await repo.insertMember({ sessionId: sess.id, userId: 'gm-1', role: 'gm', displayName: 'Mestre' })
    const rec = createSession('Mesa', null, 'Mestre')
    updateSession(rec.codigo, { remoteId: sess.id })
    setActiveSessionCode(rec.codigo)

    await endSessionAsGm(repo, sess.id, rec.codigo)

    // endSession marca endedAt → findSessionByCode não acha mais (acabou pra todos)
    expect(await repo.findSessionByCode('ABC123')).toBeNull()
    expect(getSession(rec.codigo)).toBeUndefined()
    expect(getActiveSessionCode()).toBeNull()
  })
})

describe('isSessionCreator', () => {
  it('conectado: true só quando user.id === live.gmUserId', () => {
    expect(isSessionCreator({ gmUserId: 'gm-1' }, { id: 'gm-1', nome: 'M' }, { mestre: 'M' })).toBe(true)
    expect(isSessionCreator({ gmUserId: 'gm-1' }, { id: 'p-1', nome: 'Ana' }, { mestre: 'M' })).toBe(false)
  })
  it('NÃO deriva de settings.mestre — jogador com Modo Mestre continua jogador', () => {
    // um jogador (p-1) que ativou Modo Mestre na ficha NÃO é o criador da mesa
    expect(isSessionCreator({ gmUserId: 'gm-1' }, { id: 'p-1', nome: 'Ana' }, { mestre: 'Mestre' })).toBe(false)
  })
  it('offline (sem live): fallback pelo nome do criador da sessão local', () => {
    expect(isSessionCreator(null, { id: 'x', nome: 'Mestre' }, { mestre: 'Mestre' })).toBe(true)
    expect(isSessionCreator(null, { id: 'x', nome: 'Ana' }, { mestre: 'Mestre' })).toBe(false)
  })
  it('sem user: nunca é criador', () => {
    expect(isSessionCreator({ gmUserId: 'gm-1' }, null, { mestre: 'M' })).toBe(false)
  })
})
