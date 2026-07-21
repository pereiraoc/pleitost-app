# N4 — Report do app vira issue no GitHub (aberta pelo autor)

> Pedido (sessão 2026-07-20): "seria legal se quando alguém fizesse um problem
> report, fosse aberto por esse usuário que fez ele... uma issue dentro do repo."

## ✅ IMPLEMENTADO — Opção 2 (OAuth do próprio autor)

Você escolheu a **Opção 2**: a issue é aberta **literalmente pela conta GitHub
do autor**, via `provider_token` da sessão Supabase. Como funciona agora:

- **Autor logado com GitHub** → o report cria a issue direto na API do GitHub,
  como ele, com texto + contexto + logs do modo debug. Retorna o link `#N`.
- **Convidado (nick, sem GitHub)** → cai no canal anônimo atual (INSERT em
  `bug_reports`). **Sem regressão** — ninguém perde o report.
- Se a criação falhar (escopo/rede/token), o report **cai no canal anônimo**
  automaticamente (fallback silencioso).

Arquivos: `data/github-issue.ts` (token + POST), `data/bug-report.ts` (escolhe o
canal), `auth-state.ts` (captura o `provider_token` no login), `supabase.ts`
(pede o escopo `public_repo` no `signInWithGitHub`).

### ⚠️ O que você precisa saber (não precisa mexer em painel)
- O escopo `public_repo` é pedido **no login** (client-side) — **nenhuma config
  no painel do Supabase é necessária**. O GitHub mostra o consentimento na
  próxima vez que alguém logar.
- **Quem já estava logado** tem um token SEM `public_repo` (de antes) → a
  primeira tentativa cai no anônimo até a pessoa **deslogar e logar de novo**
  (aí o token novo já abre a issue). Você e a Mera, por exemplo, relogam uma vez.
- O `provider_token` não é persistido pelo Supabase entre sessões longas — a
  gente guarda em `sessionStorage` pra sobreviver a reload; num dispositivo novo
  ou depois de expirar, é só o próximo login recapturar.

---

## Histórico das opções consideradas

Antes de implementar, as três abordagens avaliadas (a Opção 2 foi a escolhida):

## Como funciona hoje (não quebrar)

`REPORTAR BUG` → `enviarBugReport` faz INSERT anônimo em `bug_reports` (Supabase),
sem login. Eu leio no dashboard e crio a issue à mão. **Com o modo debug ligado,
o report já carrega os logs em `contexto.logs`** — então a matéria-prima da issue
(inclusive o rastro técnico) já existe.

## Opções para abrir a issue "pelo autor"

### Opção 1 — Supabase Edge Function com bot do repo ⭐ (recomendada)
O report continua indo pro Supabase; uma **Edge Function** (server-side) recebe o
insert (via trigger/webhook) e cria a issue no GitHub usando **um token de bot do
repo** (fine-grained PAT com escopo Issues:write, guardado como secret na função).
A issue cita o autor ("reportado por @fulano" quando logado; "anônimo" quando não)
e cola `texto` + `contexto` + `logs`.
- **Prós:** funciona para reporter anônimo E logado; token nunca vai pro cliente;
  não precisa o jogador ter conta GitHub; carrega os logs do modo debug direto.
- **Contras:** a issue é aberta pelo *bot*, não literalmente pela conta do autor
  (mas menciona o autor). Precisa criar 1 PAT + 1 Edge Function.
- **Precisa de você:** criar o PAT do bot + decidir o repo alvo; eu escrevo a função.

### Opção 2 — OAuth GitHub do próprio usuário (issue REALMENTE dele)
O Supabase Auth já suporta provider GitHub (arquitetura-servidor-sessao.md). No
login GitHub com escopo `public_repo`, o `provider_token` permite o **cliente**
criar a issue como o próprio usuário.
- **Prós:** a issue é literalmente aberta pela conta do autor.
- **Contras:** só funciona se o reporter estiver logado COM GitHub (jogador sem
  conta GitHub cai no fluxo anônimo); exige escopo `public_repo` (amplo) no OAuth
  app; o `provider_token` some no refresh (Supabase não guarda por padrão) →
  precisa re-login ou capturar no callback. Mais frágil.
- **Precisa de você:** configurar o escopo `public_repo` no GitHub OAuth app do
  Supabase e topar pedir esse escopo no login.

### Opção 3 — Manter manual, mas com triagem melhor
Continuar lendo `bug_reports` no dashboard e criar issue à mão (como fiz com
#331-#337), mas com os logs do modo debug já anexados. Zero setup.
- **Prós:** nada a configurar; controle total sobre o que vira issue.
- **Contras:** não é automático (você/eu no loop).

## Recomendação

**Opção 1.** Cobre todo mundo (anônimo e logado), não vaza token, e leva os logs
do modo debug pra issue automaticamente — que é exatamente o "subir logs junto com
um bug report pra ele entrar junto na issue" do mesmo pedido. A Opção 2 (issue
literalmente do autor) pode vir depois por cima, só para reporters logados.

**O que preciso de você:** (a) escolher a opção; (b) se for a 1, criar um
fine-grained PAT com Issues:write no `pereiraoc/pleitost-app` e me passar como
secret da Edge Function. Aí eu implemento e ligo no botão existente.
