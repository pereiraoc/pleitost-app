// Device flow com fetch FAKE — pending → autorizado → token emitido.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../lib/store.mjs'
import { createAuth } from '../lib/auth.mjs'

function fakeFetch(routes) {
  return async (url, opts = {}) => {
    const handler = routes[url]
    assert.ok(handler, `fetch inesperado: ${url}`)
    const body = handler(opts)
    return { ok: true, status: 200, json: async () => body }
  }
}

test('deviceCode devolve user_code/verification_uri', async () => {
  const store = createStore(join(mkdtempSync(join(tmpdir(), 'pleitost-')), 's.json'))
  const auth = createAuth({
    clientId: 'cid',
    store,
    fetchImpl: fakeFetch({
      'https://github.com/login/device/code': () => ({
        device_code: 'dev123',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        interval: 5,
        expires_in: 900,
      }),
    }),
  })
  const dc = await auth.deviceCode()
  assert.equal(dc.user_code, 'ABCD-1234')
  assert.equal(dc.verification_uri, 'https://github.com/login/device')
})

test('poll: pending enquanto não autoriza; depois token + user', async () => {
  const store = createStore(join(mkdtempSync(join(tmpdir(), 'pleitost-')), 's.json'))
  let autorizado = false
  const auth = createAuth({
    clientId: 'cid',
    store,
    fetchImpl: fakeFetch({
      'https://github.com/login/oauth/access_token': () =>
        autorizado ? { access_token: 'gh_tok' } : { error: 'authorization_pending' },
      'https://api.github.com/user': (opts) => {
        assert.equal(opts.headers.Authorization, 'Bearer gh_tok')
        return { login: 'octavio', name: 'Octavio', avatar_url: 'a.png' }
      },
    }),
  })
  const p1 = await auth.poll('dev123')
  assert.equal(p1.pending, true)
  autorizado = true
  const p2 = await auth.poll('dev123')
  assert.equal(p2.user.login, 'octavio')
  assert.equal(store.userOf(p2.token).login, 'octavio')
})
