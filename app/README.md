# Pleitost Companion (app/)

PWA web do sistema Pleitost. Modelo de dados no estilo Cyberpunk RED
Companion: o conteúdo da vault vem **empacotado no build** (extraído por
`npm run extract` na raiz), o estado do usuário será local-first (milestones
futuros), e o design faz round-trip com o projeto **"Companion App"** no
Claude Design (ver `../design/README.md`).

## Rodar

```bash
# na raiz do repo
npm install
npm run extract     # gera ../vault-data (obrigatório antes de dev/build)
npm run dev         # dev server (localhost)
npm run dev:lan     # dev server exposto na LAN (testar no celular)
npm run build       # tsc + vite build + cópia do vault-data pra dist/
npm run preview     # serve o build (SW ativo em localhost)
npm run test:app    # vitest (integração sobre vault-data real)
npm run tokens      # regenera tokens.css/tokens.ts do design-system.json
```

## Arquitetura

- `vite/vault-data.ts` — serve `../vault-data` em `/vault-data` no dev e copia pra `dist/` no build.
- `src/data/` — `types.ts` (shape do extractor), `catalog.ts` (índice + resolver de wikilinks), `useDoc.ts` (fetch lazy + cache), `assets.ts` (imagens via assets.json).
- `src/markdown/` — pipeline remark do body: strip `%%..%%`, `= this.x` ← inlineFields, wikilinks → rotas, callouts, e `fence-registry.tsx` (**registro central** lang → renderer; novos blocos entram lá, nunca em if/else no call-site).
- `src/generated/tokens.ts` + `src/styles/tokens.css` — GERADOS por `scripts/gen-tokens.mjs`; registro central de emojis/cores, nunca hardcodar valores no call-site.
- `src/components/compendium/` — TypeGrid, DocList (colunas por tipo em `list-columns.ts`), DocPage/DocView, InlineFieldsTable, VaultImage.

Princípio herdado do plugin: **nenhum label inventado no render** — texto
visível vem dos dados extraídos, da spec ou de registro central.

## Service worker / offline

- SW **só em produção** (`devOptions.enabled: false`): em dev na LAN (http)
  o app roda normal, apenas sem cache offline — SW exige secure context.
- Precache = só o shell do app; `/vault-data/**` é cacheado em **runtime**
  (StaleWhileRevalidate), doc a doc, conforme navegado. Os ~254MB da vault
  nunca entram no precache.
- Validar instalação: `npm run build && npm run preview` em `localhost`.
- HTTPS local pra SW na LAN (mkcert/Caddy): adiado de propósito.

## Pendências conhecidas

- Home real + `src/styles/theme.css` (valores-base das vars `--background-*`
  etc.) virão do pull do Claude Design ("Companion App").
- Ícones do PWA são placeholder até o branding vir do design.
- Fence `dataview`: M1 mostra a query crua colapsada; avaliador mínimo
  (TABLE/FROM/WHERE) é M2. `carta-item` idem (fallback `<pre>`).
