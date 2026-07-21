# Armazenamento no Supabase — diagnóstico e plano de contenção

> Pedido do usuário (sessão 2026-07-20): "estamos com problemas de espaço no
> supabase, então preciso conseguir ter uma rotina melhor de armazenamento do que
> precisa mesmo, de forma que não fiquemos aumentando drasticamente o uso de GB e
> possamos deixar o sistema funcional a longo prazo. Sugira diferentes soluções...
> explique de forma detalhada e também simplificada com resumos."

---

## 🟢 Resumo em uma tela (a versão simplificada)

**O que ocupa espaço hoje, do pior pro melhor:**

| # | Onde | Problema | Cresce sozinho? |
|---|------|----------|-----------------|
| 1 | Imagem do grupo dentro de `sessions.state` | Foto em base64 misturada com turno/inventário/exploração. Toda vez que **qualquer** coisa da mesa muda (andar um hex na exploração, mexer no inventário), o Postgres **reescreve a foto inteira** como uma nova versão da linha. Vira "lixo" (dead tuples) que incha o banco. | **Sim, rápido** |
| 2 | Sessões/personagens antigos nunca apagados | Cada mesa criada deixa linhas em `sessions`, `session_members`, `session_characters`, `session_encounters` **para sempre**. Testes e mesas velhas acumulam. | **Sim** |
| 3 | Inchaço de MVCC (dead tuples) | `session_characters.state` (vida/moral) é reescrito a **cada** alteração. Postgres guarda a versão velha até o autovacuum limpar. Com muita edição, incha antes de limpar. | **Sim, durante o jogo** |
| 4 | `fm_blob` grande | Guardamos a ficha inteira (frontmatter cru) por personagem. Se a ficha é pesada, cada edição de ouro/inventário reescreve tudo. | Devagar |
| 5 | `session_events` | Tabela existe mas **NÃO é usada** (nunca inserimos nem lemos). Zero de espaço hoje — mas se um dia ligarmos, vira a #1 do crescimento. | Não (dormente) |

**As 3 ações que resolvem 90% do problema:**

1. **Tirar a foto do grupo de dentro do `state`** e guardar no **Storage** do Supabase (bucket de arquivos, que é barato e separado do banco). No `state` fica só a URL. → mata a causa #1 e #3 de uma vez. *(precisa de você: criar o bucket no painel.)*
2. **Rotina de faxina**: apagar mesas inativas há mais de X dias (cascata leva junto membros/personagens/encontros). → resolve #2. *(precisa de você: rodar 1 SQL, ou agendar com pg_cron.)*
3. **Agrupar as gravações (debounce)** e **enxugar o `fm_blob`**: em vez de gravar a cada tecla, esperar ~400ms e mandar uma vez; e publicar só os campos que o Mestre realmente lê. → reduz #3 e #4. *(código — proposto abaixo, precisa da sua validação.)*

Nada disso muda o que o jogador vê. É só onde/quando os bytes são gravados.

---

## 🔬 Diagnóstico detalhado (a versão longa)

### Como o banco está organizado

Tabelas em uso (fonte: `app/src/data/session-repo/supabase.ts` + `supabase/*.sql`):

| Tabela | Conteúdo | Padrão de escrita | Risco de espaço |
|--------|----------|-------------------|-----------------|
| `sessions` | 1 linha/mesa. Coluna `state` jsonb = `{ turn, grupoImagem, inventarioGrupo, exploracao }` | `updateSessionState` faz **read-merge-write da linha inteira** | **Alto** (imagem inline + churn) |
| `session_members` | 1 linha/jogador/mesa | insert no join | Baixo |
| `session_characters` | 1 linha/personagem. Colunas `summary`, `state`, `fm_blob` (todas jsonb) | UPDATE a cada edição (vida, ouro, inventário) | **Médio-alto** (churn + fm_blob) |
| `session_encounters` | combate/iniciativa; `roster` jsonb | UPDATE durante combate | Médio |
| `doc_overlays` | edições publicadas do compêndio; 1 linha/doc | upsert (replace) | Baixo (limitado por nº de docs) |
| `user_state` | espelho do localStorage por conta; 1 linha/usuário | upsert | Baixo (limitado por nº de usuários) |
| `bug_reports` | reportes abertos (agora com logs do modo debug) | insert (append) | Baixo (texto; logs limitados a 200 entradas) |
| `session_events` | histórico da sessão | **nenhuma** — definido no contrato, nunca chamado no app | Zero hoje |

### Por que `sessions.state` é o vilão

`updateSessionState(sessionId, patch)` (supabase.ts) **lê o `state` atual, faz spread do patch e grava o objeto inteiro de volta**:

```ts
const merged = { ...atual.state, ...patch }
await sb.from('sessions').update({ state: merged }).eq('id', sessionId)
```

Isso é correto para consistência, mas tem duas consequências de espaço:

1. **Amplificação de escrita.** Andar um hex na exploração chama `updateSessionState({ exploracao })`. Mas o merge reescreve `grupoImagem` (a foto base64, ~30–50 KB) junto, mesmo sem ela ter mudado. Uma sessão de exploração com 100 movimentos = 100 reescritas da foto = ~4 MB de versões mortas da linha até o autovacuum passar.
2. **base64 é +33%.** Uma foto de 30 KB vira ~40 KB em base64, e base64 dentro de jsonb text não comprime tão bem quanto o binário no Storage.

Os 4 pontos que escrevem em `sessions.state` hoje:
- `GrupoView.tsx:646,655` → `exploracao` (alta frequência durante exploração)
- `GrupoView.tsx:691` → `grupoImagem` (raro, mas é o payload pesado)
- `PanelInventario.tsx:367` → `inventarioGrupo` (média frequência)

### Por que faltam faxina e vacuum

- **Sem retenção.** Nenhum `DELETE` de sessão em lugar nenhum. Cada mesa/teste fica para sempre. `ON DELETE CASCADE` já existe no schema (o `arquitetura-servidor-sessao.md` confirma), então basta apagar a `sessions` que membros/personagens/encontros vão junto — só falta *acionar*.
- **Inchaço MVCC.** `session_characters.state` (vida/moral) é reescrito a cada clique de dano. O autovacuum do Supabase limpa, mas tabelas de alto churn incham entre passadas. Um `VACUUM` manual ou tuning do autovacuum ajuda; reduzir a frequência de escrita (debounce) ajuda mais.

### Limites do plano free (referência)

- Banco Postgres: **500 MB**. É aqui que o inchaço dói.
- Storage (arquivos): **1 GB**, cobrado à parte e barato — é para onde a imagem **deveria** ir.
- Egress: 5 GB/mês — cada refetch baixa a foto base64 junto, então tirar a foto do `state` **também economiza banda**.

---

## 🧰 Menu de soluções (escolha o que topar)

Cada uma tem **impacto / esforço / risco / o que precisa de você**.

### Solução A — Imagem do grupo no Storage, não no `state` ⭐ (recomendada)
- **Impacto:** altíssimo. Mata a amplificação (#1) e o egress da foto de uma vez.
- **Esforço:** médio (upload → URL pública → guardar URL). Já preparei o SQL do bucket em `supabase/storage-grupo.sql`.
- **Risco:** baixo-médio (troca o caminho da imagem; testável).
- **Precisa de você:** criar o bucket `grupo-imagens` (público) no painel **ou** rodar o SQL; depois eu ligo o código.
- **Como:** `comprimirImagem` já gera o blob; em vez de `updateSessionState({ grupoImagem: dataUrl })`, faz `storage.upload(path, blob)` e grava só `grupoImagemUrl` no state. Migração: fotos antigas em base64 continuam válidas (o leitor aceita os dois).

### Solução B — Rotina de faxina de sessões inativas ⭐ (recomendada)
- **Impacto:** alto e permanente (bounda o crescimento #2).
- **Esforço:** baixo (1 função SQL + 1 agendamento). Preparei em `supabase/retencao-sessoes.sql`.
- **Risco:** baixo (só apaga o que passou do prazo; cascata cuida do resto).
- **Precisa de você:** decidir o prazo (sugestão: 60 dias sem atividade) e habilitar `pg_cron`, **ou** rodar o SQL manualmente de vez em quando.

### Solução C — Debounce das publicações
- **Impacto:** médio (reduz churn/dead tuples #3 e nº de writes → menos banda).
- **Esforço:** baixo-médio (coalescer `pushState` com ~400ms, como o pleitost-sync já faz com 300ms).
- **Risco:** médio (mexe no *timing* do sync; precisa de teste de mesa).
- **Precisa de você:** validação visual multiplayer depois de implementado. **Proponho, não auto-shipo.**

### Solução D — Enxugar o `fm_blob`
- **Impacto:** médio (menor payload por personagem #4).
- **Esforço:** médio (whitelist dos campos que o Mestre lê no readonly, em vez do frontmatter inteiro).
- **Risco:** médio (pode faltar campo na ficha readonly do GM — precisa saber exatamente o que ela consome).
- **Precisa de você:** confirmar o que a ficha readonly do Mestre mostra, pra não cortar campo em uso.

### Solução E — Aparar o `session_events` dormente
- **Impacto:** zero hoje (não usamos), mas **preventivo**.
- **Esforço:** mínimo (documentar; se um dia ligar, já nasce com TTL/cap).
- **Risco:** nenhum.
- **Precisa de você:** nada. Só a decisão de manter dormente ou dropar a tabela.

### Solução F — VACUUM / tuning de autovacuum
- **Impacto:** médio (recupera o espaço dos dead tuples #3 já existentes).
- **Esforço:** mínimo (rodar `VACUUM (FULL, ANALYZE)` uma vez; opcional ajustar `autovacuum_vacuum_scale_factor` nas tabelas de churn).
- **Risco:** baixo (`VACUUM FULL` trava a tabela brevemente — fazer fora de sessão).
- **Precisa de você:** rodar 1 SQL no painel.

---

## ✅ O que já dá pra fazer sem você (baixo risco, código)

1. **Comprimir a imagem do grupo mais forte** (384px→256px, q0.8→0.72) enquanto ela ainda vive no `state` — corta o payload ~2–3×. Reversível quando a Solução A entrar. *(shipável agora.)*
2. **SQL prontos** em `supabase/` (retenção + bucket + vacuum) — arquivos que **não executam sozinhos**; ficam versionados esperando você aplicar quando quiser.
3. **Limitar os logs do modo debug** a 200 entradas no report (já feito) pra o novo campo não inflar `bug_reports`.

## 📋 Sequência recomendada

1. Rodar **F** (VACUUM) uma vez → recupera o espaço já perdido, dá fôlego imediato.
2. Aplicar **B** (faxina) → estanca o crescimento das mesas velhas.
3. Aplicar **A** (imagem no Storage) → mata a maior fonte de amplificação.
4. Avaliar **C** e **D** com validação de mesa, se ainda precisar apertar.

> Ordem pensada pra dar alívio imediato (F) antes das mudanças estruturais (A/B),
> e deixar as que mexem no sync (C/D) por último, com você validando ao vivo.
