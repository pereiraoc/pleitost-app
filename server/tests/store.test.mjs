// Testes do estado do servidor (sessões/patch/heroVol/tokens) — node:test,
// estado em arquivo temporário.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore, genCode } from '../lib/store.mjs'

function freshStore() {
  return createStore(join(mkdtempSync(join(tmpdir(), 'pleitost-')), 'state.json'))
}

test('genCode: 6 chars do alfabeto sem ambíguos', () => {
  for (let i = 0; i < 50; i++) {
    const c = genCode()
    assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  }
})

test('createSession → join → patch → rev cresce e campos protegidos ficam', () => {
  const store = freshStore()
  const sess = store.createSession({ nome: 'Mesa', grupoId: 'G/x', mestre: 'octavio' })
  assert.equal(sess.mestre, 'octavio')
  assert.deepEqual(sess.membros, ['octavio'])
  assert.equal(sess.round, 1)

  const joined = store.joinSession(sess.codigo.toLowerCase(), 'fulano')
  assert.deepEqual(joined.membros, ['octavio', 'fulano'])
  const revAposJoin = joined.rev

  const patched = store.patchSession(sess.codigo, {
    round: 3,
    init: { 'Heróis/Carlos': 18 },
    mestre: 'hacker', // protegido — não pode trocar via patch
    codigo: 'XXXXXX', // protegido
  })
  assert.equal(patched.round, 3)
  assert.equal(patched.init['Heróis/Carlos'], 18)
  assert.equal(patched.mestre, 'octavio')
  assert.equal(patched.codigo, sess.codigo)
  assert.ok(patched.rev > revAposJoin)
})

test('deleteSession: só o mestre', () => {
  const store = freshStore()
  const sess = store.createSession({ nome: 'Mesa', grupoId: null, mestre: 'octavio' })
  store.joinSession(sess.codigo, 'fulano')
  assert.equal(store.deleteSession(sess.codigo, 'fulano'), false)
  assert.equal(store.deleteSession(sess.codigo, 'octavio'), true)
  assert.equal(store.getSession(sess.codigo), null)
})

test('setHeroVol: só paths Interativa.*, acumula por herói', () => {
  const store = freshStore()
  const sess = store.createSession({ nome: 'Mesa', grupoId: null, mestre: 'octavio' })
  const ok = store.setHeroVol(sess.codigo, 'Heróis/Carlos', 'Interativa.Recursos_Restantes.Vitalidade', 12)
  assert.equal(ok.heroVol['Heróis/Carlos']['Interativa.Recursos_Restantes.Vitalidade'], 12)
  const nope = store.setHeroVol(sess.codigo, 'Heróis/Carlos', 'Atributos.FOR', 99)
  assert.equal(nope, null)
})

test('tokens: issue → userOf resolve; token inválido → null', () => {
  const store = freshStore()
  const token = store.issueToken({ login: 'octavio', name: 'Octavio', avatar_url: 'x.png' })
  assert.equal(store.userOf(token).login, 'octavio')
  assert.equal(store.userOf('nope'), null)
})
