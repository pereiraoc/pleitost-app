// Auth por GitHub DEVICE FLOW — o app pede um user_code, o jogador autoriza em
// github.com/login/device, o servidor troca o device_code por access_token e
// emite um token PRÓPRIO (o access_token do GitHub não sai do servidor).
// Só precisa do client_id de um OAuth App com "Device flow" habilitado —
// nenhum secret (docs: docs.github.com/apps/oauth-apps/building-oauth-apps/
// authorizing-oauth-apps#device-flow).
//
// `fetchImpl` injetável pra teste (node:test com fetch fake).

export function createAuth({ clientId, store, fetchImpl = fetch }) {
  if (!clientId) {
    console.warn(
      '[pleitost-server] PLEITOST_GITHUB_CLIENT_ID ausente — auth desabilitada (endpoints devolvem 503).',
    )
  }

  return {
    enabled: Boolean(clientId),

    /** Passo 1: código de dispositivo pro usuário autorizar no GitHub. */
    async deviceCode() {
      const res = await fetchImpl('https://github.com/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scope: 'read:user' }),
      })
      if (!res.ok) throw new Error(`github device/code ${res.status}`)
      const data = await res.json()
      return {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        interval: data.interval ?? 5,
        expires_in: data.expires_in ?? 900,
      }
    },

    /** Passo 2 (poll do app): troca device_code por token quando autorizado.
     *  Retorna {pending:true} enquanto o usuário não autorizou;
     *  {token, user} quando sim. */
    async poll(deviceCode) {
      const res = await fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      if (!res.ok) throw new Error(`github access_token ${res.status}`)
      const data = await res.json()
      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        return { pending: true, interval: data.interval }
      }
      if (data.error) throw new Error(`github: ${data.error}`)
      const userRes = await fetchImpl('https://api.github.com/user', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${data.access_token}` },
      })
      if (!userRes.ok) throw new Error(`github /user ${userRes.status}`)
      const ghUser = await userRes.json()
      const token = store.issueToken(ghUser)
      return { token, user: { login: ghUser.login, name: ghUser.name ?? ghUser.login, avatar: ghUser.avatar_url ?? '' } }
    },
  }
}
