# Arquitetura do servidor de sessão — avaliação pós-migração do Obsidian

**Pergunta do usuário (2026-07-12, AS-IS):** "Também queria entender um pouco
mais a arquitetura como funcionaria do servidor agora que estamos migrando do
obsidian pra outro formato. Se faz sentido criarmos um novo servidor em algum
lugar pra não estragar o obsidian pleitost-sync, e como acontecerá para lidar
com os casos que o pleitost-sync hoje tem que lidar (olhar documentação).
Quero garantir que o que tu vai implementar de arquitetura realmente vai me
atender, e eu acho que da pra se embasar bastante no CYBERPUNK RED COMPANION
APP pra isso, que parece que a arquitetura que usaram lá é MUITO parecida com
o que eu to esperando aqui."

## TL;DR — recomendação

**Não criar servidor novo.** O "servidor" do pleitost-sync já existe e não é
um servidor custom: é **Supabase** (Postgres + Realtime + Auth com GitHub
OAuth + RLS). O app PWA deve implementar a MESMA interface `SessionRepo`
contra o MESMO schema (`sessions`, `session_members`, `session_characters`,
`session_events`, `session_encounters`). Com isso:

- **não estraga o pleitost-sync** — pelo contrário: plugin Obsidian e PWA
  viram dois CLIENTES do mesmo backend, e uma mesa MISTA (jogador no Obsidian
  + jogador no app) funciona de graça;
- o `server/` node+ws que eu criei ontem (#101b) deve ser **aposentado** —
  era uma versão pior do que já estava desenhado (sem claims, sem RLS, sem
  merge per-field, sem eventos/encounters, persistência em JSON).

## Por que é o modelo do Cyberpunk RED Companion

O RED Companion (referência já usada no bootstrap do app): conteúdo do livro
EMPACOTADO no build + estado do usuário LOCAL-FIRST + sync OPCIONAL por conta
num backend gerenciado. Mapeamento 1:1:

| RED Companion | pleitost-app |
|---|---|
| Livro empacotado no build | `vault-data/` (compêndio) no build |
| Estado local-first | localStorage (hero-store/local-entities/session-store) |
| Conta opcional | Supabase Auth (anônimo + email + **GitHub OAuth** — já implementado no transport do pleitost-sync) |
| Sync do estado por conta | `SessionRepo` sobre Postgres+Realtime |

## Como cada caso do pleitost-sync mapeia no app

(fonte: `.obsidian/plugins/pleitost-sync/docs/architecture/*`)

| Caso no pleitost-sync (Obsidian) | Equivalente no PWA |
|---|---|
| watcher de FM (`obsidian/watcher`) detecta edição do dono | `onHeroWrite` do hero-store (JÁ existe — hoje alimenta meu WS) |
| writer (`DB → processFrontMatter`) aplica estado remoto no FM | `writeHeroEdit(..., origem 'sync')` no overlay (JÁ existe) |
| **claim model** ("a verdade é do dono"; GM não edita char claimed) | VERBATIM — é conceito puro + RLS server-side; o app só computa `isMine = member_id === auth.uid()` |
| echo guard + publish debouncer 300ms | mesmo padrão sobre o store (a guarda de origem 'sync' já existe) |
| `extractState/Summary` (snapshot) + diff | o app tem o modelo completo (rules/projection); o **summary jsonb é exatamente a fonte da ficha RESUMO** nos DETALHES (reqs 2/7) |
| `fmBlob` (FM completo publicado, v0.3.3+) | FM do herói local publicado como blob → é o que dá ao MESTRE a **ficha completa readonly** (req 9) |
| placeholder → claimed → swap/leave | é a **ficha de grupo montada automaticamente** (req 8): jogador entra, seleciona personagem (claim), grupo edita incremental sem perder histórico |
| `session_encounters` (combat tracker F7b) | a INICIATIVA da tela SESSÃO |
| `session_events` | histórico da sessão |
| Auth anon + email + GitHub OAuth (`transport/auth.ts`) | mesmo Supabase Auth; no PWA o GitHub entra por redirect PKCE (mais simples que o device flow que implementei) |

## O que muda no que já foi construído

1. **`server/` (node+ws)**: aposentar. Sobra zero responsabilidade que o
   Supabase não cubra melhor (auth, salas, RLS, realtime, persistência).
2. **`app/src/data/session-sync.ts`**: trocar o transporte — de WS custom para
   `supabase-js` implementando `SessionRepo` (a interface do pleitost-sync,
   copiada como contrato) + canal realtime. A UI da SESSÃO (painel direito)
   não muda: lista/criar/entrar por código, jogadores com vida, iniciativa.
3. **GitHub device flow**: substituído pelo OAuth do Supabase (provider GitHub
   — requisito de auth por GitHub atendido do jeito canônico).
4. **Schema**: reusar `pleitost-sync/supabase/install.sql` VERBATIM (o doc diz
   "o schema sobrevive verbatim; RLS policies idem") — mesmo projeto Supabase
   pros dois clientes.

## O que precisa do usuário

- Criar o projeto Supabase (ou usar o que o pleitost-sync já usa!) e passar
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` pro app. Se o projeto do
  pleitost-sync já existe com o install.sql aplicado, é SÓ apontar o app.

## Sequência proposta

1. Copiar o contrato `SessionRepo` + tipos do pleitost-sync pro app
   (read-only da fonte; nada de tocar o plugin).
2. `SupabaseSessionRepo` no app + canal realtime + claim/isMine.
3. Ligar a UI da SESSÃO nele (substituindo o adapter WS).
4. Publicação do herói local: state/summary/fmBlob a partir do modelo do app.
5. Remover `server/` e o device flow custom.
6. Testes: InMemorySessionRepo (mesmo padrão de teste do plugin).
