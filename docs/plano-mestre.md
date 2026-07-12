# PLANO-MESTRE — integração das issues abertas (2026-07-12)

**Pedido do usuário AS-IS:** "quero que tu pegue todas as issues, revise a
forma que pretentemos implementar e faça um planejamento mais detalhado com
calma em uma issue que integre as outras, de forma que a implementação seja
muito mais estruturada e com menos retrabalhos e chance de problemas
estruturais. Também quero que tu estruture de forma que possamos disparar
agentes paralelos e planos paralelos que não se atrapalhem e consigamos chegar
no final mais rapidamente. Toda issue deve ter um teste com uma definição de
complitude (que não vai ser eu testando), pra garantir que tu consiga ir até o
fim e fechar sozinho, e de preferencia quero que tu faça testes que cubram de
fato onde o negócio vai ser usado, considerando também pegar informação da
tela mesmo, não só código."

Este doc é a fonte de verdade; a issue integradora no GitHub espelha ele.

## Estado (o que JÁ está pronto e não entra no plano)

Fechadas localmente (commits `9c2ca64`/`012740f`/`e7cb3ff`, aguardando push):
#101, #142, #150, #165, #171-#175, #176-#184. Ficam: **#185** (futuro
declarado), **#159** (tracker). Escopo do plano: **#186 #187 #188 #189 #190
#191 #192 #193 #194 #195 #196 #197**.

## Definição de completude (DoD) — vale pra TODA issue

Uma issue só fecha quando:
1. **Teste automatizado do fluxo real** verde — hierarquia de fidelidade:
   - **E2E de TELA (Playwright)** quando o valor é um fluxo de UI: navega no
     browser real (`vite preview`), interage e **lê da tela** (texto/ARIA/
     atributos), screenshot anexado em falha. Pasta `app/e2e/`.
   - **Integração jsdom (vitest + testing-library)** quando é composição de
     componentes com stores (padrão já estabelecido na suíte).
   - **Node puro** só pra lógica sem UI (repo/regras).
   - Fluxos multi-cliente da sessão: 2 contexts Playwright na MESMA página
     contra `InMemorySessionRepo` injetável (mesmo padrão de teste do
     pleitost-sync) + contract-test do `SupabaseSessionRepo` (rodável manual
     contra o projeto real, skip por default sem env).
2. `npx tsc -b` + `npm run build` + suíte inteira verdes.
3. Commit `Fixes #N` + fechamento (sem depender de validação manual do usuário
   — a validação visual dele vira revisão a posteriori, não gate).

## Fase 0 — FUNDAÇÕES (serial, bloqueia as trilhas)

### F1 — Camada Supabase de sessão (substitui `server/`)
- Copiar como CONTRATO a interface `SessionRepo` + tipos do pleitost-sync
  (`.obsidian/plugins/pleitost-sync/src/core/session.ts`, leitura) pra
  `app/src/data/session-repo/contract.ts`. NÃO tocar o plugin.
- `app/src/data/session-repo/supabase.ts`: `SupabaseSessionRepo` com
  `@supabase/supabase-js` (env `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`,
  já em `app/.env`) + realtime channel + auth GitHub (OAuth redirect PKCE) e
  anônimo (jogador sem conta entra com nickname — o schema permite).
- `app/src/data/session-repo/in-memory.ts`: fake completo pra testes/E2E
  (injeção via provider/context `SessionRepoProvider`).
- Claim model verbatim: `isMine = member_id === auth.uid()`; RLS já protege
  server-side (install.sql aplicado pelo usuário).
- Publicação do herói local: `extractState/Summary/FmBlob` do app (modelo já
  existe — summary alimenta o RESUMO; fmBlob alimenta a ficha readonly do GM).
- REMOVER: `server/` (workspace inteiro), device flow custom em
  `session-sync.ts` (refeito sobre o repo), `EmBar`-era WS.
- **DoD**: contract-tests do InMemory + Supabase (mesmos casos: create/join/
  claim/patch/heroVol/realtime-callback); jsdom da SessaoPage criando/entrando
  via InMemory; suíte verde sem `server/`.

### F2 — Infra de teste E2E de tela (Playwright)
- `@playwright/test` como devDep do app; `app/playwright.config.ts` com
  `webServer: vite preview` (build com vault-data); helpers: reset de
  localStorage, seed de entidades locais via `page.evaluate`.
- Smoke inicial: abre app → cria herói → nome na TELA e na topbar.
- CI local: `npm run e2e` (headless). **DoD**: smoke verde headless.

Ordem: F1 e F2 são paralelas entre si (arquivos disjuntos).

## Trilhas paralelas (ownership de arquivos — agentes NÃO cruzam)

### Trilha S — SESSÃO (depende F1+F2) — owns `src/components/sessao/`, `src/data/session-*`, `e2e/sessao*`
1. **#186** entrar por código → lista de jogadores com vida ao vivo → clique
   abre RESUMO nos DETALHES. *(DoD E2E: 2 contexts InMemory; ctx B muda vida →
   ctx A vê barra/label mudarem NA TELA; clique → texto "// VIDA" no painel.)*
2. **#187** criar sessão SEM herói/grupo; jogador entra, seleciona personagem
   (claim) → companheiro do herói entra automático (Tutor); grupo da sessão é
   EDITADO incremental (membros novos não resetam estado). *(DoD E2E: criar →
   2 joins → roster cresce sem perder init/estado; sair/swap preserva.)*
3. **#188** GM clica jogador → ficha completa READONLY (todas as abas, via
   fmBlob; flag readonly no FichaPage desabilita writes) + botão resumo.
   *(DoD E2E: GM abre ficha do player; inputs disabled — lidos da tela; botão
   resumo abre painel.)*
4. **#196** iniciativa completa: iniciar/encerrar combate, estimativa de
   saúde de monstros (faixas como o combat-tracker), hide/mask de nome
   (lógica do plugin, GM controla; jogador vê "???" mascarado). *(DoD E2E:
   GM adiciona monstro → player vê nome mascarado + estimativa, não números.)*

### Trilha C — COMPÊNDIO/MESTRE — owns `src/components/compendium/`, `src/components/mestre/` (novo), `e2e/compendio*`
1. **#192** visualização por tipo pra Mestres (cards/tabela por categoria com
   colunas próprias do tipo, filtros). *(DoD E2E: navegar tipo → colunas
   certas lidas da tela; filtro reduz a lista.)*
2. **#193** rule elements por instância (bloco "ELEMENTOS DE REGRA" no
   DocPage lendo `doc.ruleElements`, formato do rules-viewer do plugin).
   *(DoD jsdom: nota com rules mostra raw+parsed; E2E: visível no doc.)*
3. **#194** criador de aventura (recompensas + dificuldade por nível — port
   da lógica do plugin). *(DoD jsdom: tabela de recompensa/dificuldade bate
   com fixtures do plugin para níveis 1/5/10.)*
4. **#195** criador de combate + `insertEncounter` do SessionRepo (contrato
   F1 — integração por interface, sem tocar arquivos da Trilha S). *(DoD:
   encounter criado aparece na sessão InMemory; E2E fluxo GM.)*

### Trilha P — PERSONAGEM — owns `src/data/images.ts` (novo), `src/components/ficha/Perfil*`, `src/grupo/*`, `e2e/imagens*`
1. **#197** imagem no herói/companheiro/grupo: upload local-first em
   IndexedDB (`pleitost.images`, key = entityId, dataURL/blob), resolvers de
   retrato passam a olhar o store local ANTES do assets.json; UI de upload no
   Perfil (herói/CA) e no Grupo. *(DoD E2E: upload de PNG → retrato aparece
   na ficha, na lista de heróis e na topbar; sobrevive reload.)*

### Trilha I — INFRA/DEPLOY — owns `.github/`, `scripts/`, `vite.config.ts`, `package.json` raiz
1. **#189** deploy grátis: build estático (vault-data embutida) publicado em
   GitHub Pages via `gh-pages` branch; `base` configurável; SPA fallback
   (404.html). Supabase já é free tier. Script `npm run deploy`. *(DoD: build
   com base path passa; script publica (dry-run testável); doc de operação.)*
2. **#190** re-extract prático: `npm run publish-db` = extract da vault +
   build + deploy numa tacada (roda LOCAL porque a vault é local); stamp de
   versão da database no build. *(DoD: script roda end-to-end local e o stamp
   muda; teste do stamp no build.)*
3. **#191** update pros usuários: `vite-plugin-pwa` com `registerType:
   'prompt'` + toast "Atualização disponível → Recarregar" + versão visível
   no CONFIG. *(DoD E2E: build A servido, build B publicado → toast aparece;
   no mínimo, teste de unidade do hook de update + smoke do SW em preview.)*

Contratos compartilhados (definidos na F1, congelados durante as trilhas):
`SessionRepo` (S implementa, C consome), `images.ts` (P define, S/C só leem),
rotas/`App.tsx` (só F1/I mexem). Cada trilha roda em worktree próprio; merges
na ordem F→S/C/P/I conforme fecham.

## Sequência sugerida de disparo

1. F1 + F2 (paralelos).
2. Trilhas S, C, P, I em paralelo (4 agentes/worktrees).
3. #195 (parte sessão) e #196 por último dentro das trilhas (dependem de
   contratos estáveis).
4. #185 e #159 ficam fora (futuro/tracker).
