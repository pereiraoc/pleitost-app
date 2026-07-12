# Servidor de sessão (#101b) — arquitetura e operação

Multi-jogador da SESSÃO: um servidor pequeno (Node, workspace `server/`) que
autentica por **GitHub (device flow)**, guarda as **sessões por código** e
sincroniza a sala por **WebSocket**. O app continua **local-first**: sem
servidor configurado ou sem login, tudo funciona local (localStorage).

## Peças

```
server/
  server.mjs        # node:http + ws — rotas + salas
  lib/store.mjs     # sessões/tokens persistidos em server/data/state.json
  lib/auth.mjs      # GitHub device flow (fetch injetável p/ teste)
  tests/*.test.mjs  # node --test
app/src/data/session-sync.ts   # adapter local-first (login, REST, sala WS)
app/src/data/session-store.ts  # fonte local (SessionRec) — o sync espelha nela
```

## Fluxo

1. **Login**: app → `POST /auth/device` → mostra `user_code` + link
   (github.com/login/device); app faz poll em `POST /auth/poll` até o GitHub
   autorizar; servidor troca por `access_token` (fica NO servidor), busca
   `/user` e emite um token próprio → app guarda `{token, user}` em
   `pleitost.serverAuth`.
2. **Sessões**: `POST /sessions` (cria — mestre = login), `POST
   /sessions/:code/join`, `GET /sessions` (minhas), `DELETE /sessions/:code`
   (só mestre). Shape = `SessionRec` do app + `membros` (logins), `heroVol`
   (volátil de vida por herói) e `rev`.
3. **Sala** (`/ws?token=…&code=…`): servidor manda `{t:'session', sess}` na
   entrada e re-broadcast a cada mudança; cliente manda
   `{t:'patch', patch}` (init/round/vezIdx/claims/nome — last-write-wins) e
   `{t:'hero', heroId, path, value}` (só `Interativa.*`). No app, o volátil
   remoto entra pelo hero-store com **origem `'sync'`** — a guarda de eco: o
   `onHeroWrite` do adapter ignora essa origem e encaminha o resto que for
   `Interativa.*` (vida mexida em QUALQUER aba flui pra sala).

## Rodando

```bash
# 1. registrar um OAuth App no GitHub (uma vez):
#    Settings → Developer settings → OAuth Apps → New OAuth App
#    - Homepage/callback: qualquer coisa (device flow não usa callback)
#    - MARCAR "Enable Device Flow"
#    → copiar o Client ID

# 2. subir o servidor
PLEITOST_GITHUB_CLIENT_ID=<client id> npm run server
# porta: PLEITOST_SERVER_PORT (default 8787); estado: server/data/state.json

# 3. apontar o app
#    - build/dev: VITE_SESSION_SERVER=http://<host>:8787 npm run dev:lan
#    - ou em runtime: localStorage.setItem('pleitost.serverUrl','http://<host>:8787')
```

Na tela SESSÃO aparece o box `🌐 SERVIDOR` com **Entrar com GitHub**; depois do
login, "+ Criar nova sessão" e "Entrar →" passam pelo servidor (o código da
sala é o do servidor) e a sessão ativa conecta a sala ao vivo.

## Decisões

- **Device flow** (não web flow): sem client secret, sem redirect URL — serve
  igual pra LAN/host caseiro; o `access_token` do GitHub nunca chega no
  navegador.
- **Last-write-wins** com `rev`: suficiente pra mesa (poucos escritores,
  campos disjuntos — cada jogador mexe na própria vida; iniciativa é do
  mestre na prática).
- **`Interativa.*` only** no sync de herói: o resto da ficha é local de cada
  um (edição de ficha não é estado de mesa).
- **Persistência JSON com debounce**: hosting caseiro, sem banco.

## Limites conhecidos (próximas iterações)

- Claims de personagem ainda não têm UI (o shape `claims` já sincroniza).
- Sem reconexão automática do WS (recarregar a página reconecta).
- `GET /sessions` (minhas sessões do servidor) ainda não alimenta a LISTA —
  a lista mostra as sessões locais (que espelham as remotas já visitadas).
