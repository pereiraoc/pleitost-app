# Deploy grátis — GitHub Pages (#189) e re-extract da database (#190)

O app é um build **estático** (Vite) com a vault-data **embutida** — não há
backend obrigatório (sessão usa Supabase free tier). Isso permite publicar de
graça no GitHub Pages.

**O deploy roda LOCAL, não em CI**: o extractor (`npm run extract`) lê a vault
do Obsidian em `/data/vaults/pleitost` — que só existe nesta máquina. O fluxo
é sempre: extract local → build local → push da pasta `app/dist` pra branch
`gh-pages`.

## Scripts (raiz do repo)

| Script | O que faz |
| --- | --- |
| `npm run deploy` | `npm run build` + `npx gh-pages -d app/dist --dotfiles` — publica o dist na branch `gh-pages` do `origin`. |
| `npm run publish-db` | `npm run extract && npm run deploy` — re-extrai a vault **e** publica numa tacada (#190). Use este quando o conteúdo da vault mudou. |
| `npm run test:infra` | Valida os artefatos de deploy (404.html, .nojekyll, scripts) sem publicar nada. |

O `--dotfiles` é necessário pra branch `gh-pages` levar o `.nojekyll`
(versionado em `app/public/.nojekyll`, copiado pro dist pelo Vite): sem ele o
Pages roda Jekyll e pode ignorar arquivos/pastas com `_` ou `%` nos nomes —
e a vault-data tem nomes de arquivo arbitrários.

## Configuração do repositório (uma vez)

1. Rode `npm run deploy` uma primeira vez (cria/atualiza a branch `gh-pages`).
2. No GitHub: **Settings → Pages → Build and deployment**:
   - *Source*: **Deploy from a branch**;
   - *Branch*: **gh-pages**, pasta **/ (root)**.
3. A URL fica `https://<user>.github.io/pleitost-app/` (Pages **de projeto**).

## `base` do Vite — env `VITE_BASE`

O Pages de projeto serve o app num SUBCAMINHO (`/pleitost-app/`), então o
build precisa saber a base. Ela é configurável por env (default `/`):

```sh
VITE_BASE=/pleitost-app/ npm run deploy
# ou, com re-extract:
VITE_BASE=/pleitost-app/ npm run publish-db
```

O que a base afeta (tudo automático no build):

- URLs de assets no `index.html` (`/pleitost-app/assets/...`);
- `start_url`/`scope` do manifest PWA e o registro do service worker;
- os padrões do workbox (`vault-data`/`app-state` fora do cache/fallback SPA).

Pra deploy em **raiz de domínio** (Pages de usuário `<user>.github.io`, ou
domínio próprio via *custom domain*), não defina `VITE_BASE` — o default `/`
já serve.

### Limitação conhecida com base ≠ `/`

Os fetches de dados do app (`src/data/catalog.ts`, `assets.ts`, `links.ts`,
`useDoc.ts`...) usam caminhos absolutos de raiz (`/vault-data/...`). Com
`VITE_BASE=/pleitost-app/` o shell do app carrega, mas esses fetches apontam
pra raiz do domínio e falham (404). **Follow-up necessário** antes do primeiro
deploy em subcaminho: prefixar os fetches de dados com `import.meta.env.BASE_URL`
(fora do escopo da Trilha I — os arquivos de dados pertencem a outras trilhas).
Enquanto isso, o caminho sem atrito é deploy em raiz (`VITE_BASE` ausente).

## SPA fallback — `404.html`

Rotas do app (`/heroi/...`, `/doc/...`) não existem como arquivos no Pages;
um acesso direto cairia no 404 do GitHub. O build copia `index.html` pra
`404.html` (plugin `pleitost:spa-fallback-404` no `app/vite.config.ts`):
o Pages serve o 404.html — que é o próprio app — e o router resolve a rota.

## Stamp da database — `vault-data/db-version.json` (#190)

Todo `npm run extract` grava, ao final, `vault-data/db-version.json`:

```json
{ "extractedAt": "2026-07-12T20:00:00.000Z", "docCount": 999 }
```

É o ÚNICO arquivo não determinístico do output do extractor (o resto não tem
timestamps de propósito). O app mostra esse stamp no **CONFIG** (rodapé
`PLEITOST COMPANION//OS`): linha `DATABASE` com data da extração e contagem
de docs — jogador sabe de quando é a database publicada.

## O que NÃO existe no Pages

- `/app-state` (persistência server-side do dev/preview, `vite/app-state.ts`):
  é middleware do servidor Vite; no Pages não há servidor. O app degrada pro
  `localStorage` (comportamento já previsto do `remote-persist.ts`).
- Deploy via CI: sem acesso à vault, o GitHub Actions não consegue extrair.
  Não configurar workflow de Pages — a branch `gh-pages` é a fonte.

## Update pros usuários (#191)

O PWA usa `registerType: 'prompt'`: quando um deploy novo sobe, o service
worker novo fica em espera e o app mostra o toast **"Atualização disponível —
Recarregar"** (hook `app/src/pwa-update.ts`, toast no `AppShell`). Recarregar
ativa o SW novo (`updateSW(true)`). A versão do app (package.json do app) e o
stamp da database ficam visíveis no CONFIG pra conferir o que está rodando.
