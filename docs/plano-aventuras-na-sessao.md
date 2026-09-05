# Formato de Aventura + uso na sessão — proposta v2 (2026-09-05)

> v1 (derivar estrutura de headings livres) foi REJEITADA pelo user: "quero um
> formato de aventura que consigamos fazer várias aventuras da mesma forma,
> mas complementando com coisas diferentes". Esta v2 é **formato-first**: um
> template fixo, com seções numeradas e registros com campos nomeados, que o
> app renderiza seção a seção. Nada implementado; campos em aberto na §6.

## 0. Ideia em uma frase

A Aventura é uma nota com **esqueleto fixo** (Resumo · Contexto · Cenas) e
**registros com campos** (Personagem, Local, Cena) escritos do jeito que a
vault já escreve Pessoa/Organização/Localização: callout `[!info]` com
`**Rótulo:** valor`. O app lê os rótulos (parser que já existe:
`calloutTemplateFields`), mostra cada seção com o componente certo, expande
contexto referenciado ali mesmo, desenha o mapa (`leaflet`, como a
Localização), exporta o mapa em PDF (como a ficha de papel) e coloca combate
na sessão (bloco que já existe). **Campos-núcleo são fixos; qualquer rótulo
extra vira campo também** — é assim que uma aventura complementa a outra sem
quebrar o formato.

## 1. O esqueleto (template)

```markdown
---
categoria: Aventura
subcategoria: Recuperação de Relíquia   # TIPO DE MISSÃO (registro do bounty)
Formato: One-Shot                      # One-Shot · Arco · Encontro
rank: C
disponivel: ["[[Porto Alegre]]"]
Duração: "3h a 4h30"
Jogadores: {min: 3, max: 5}
Tom: ["thriller urbano", "sátira política", "violência de rua"]
Completo: false
---
```bounty
Titulo: …            ← o CONTRATO (inalterado)
Recompensa: …
Objetivo: …
Local: …
Contato: …
Financiador: …
```

# 1. Resumo
> [!abstract] Resumo
> Um ou dois parágrafos. (prosa)

> [!info] Estrutura da sessão
> **Duração:** `= this.Duração`
> **Jogadores:** `= this.Jogadores`
> **Rank:** `= this.rank`
> **Formato:** `= this.Formato`
> **Tom:** `= this.Tom`

## Roteiro em uma página
1. **[[#Cena 1 — Título]]** — uma linha
2. …

# 2. Contexto
## 2.1 Contexto da Aventura
### Premissa do grupo
(prosa: formação, vínculos, perguntas pra mesa)
### Verdades não contadas
> [!gm] …o que só o mestre sabe…

## 2.2 Notas para o Mestre
### Dicas de condução
### Papéis e objetivos
(callouts [!info] de objetivo público/secreto, distribuição — como já é)
### Frases úteis
(vozes SEM registro próprio: cânticos, "anti-selênico de botequim"…)

## 2.3 Personagens
### Nome do Personagem
> [!info] Personagem
> **Nota:** [[Pessoa da vault]]            ← opcional: liga ao compêndio (expande)
> **Organização:** [[…]]
> **Função:** …
> **Papel:** Patrão relutante                ← papel NA AVENTURA (livre)
> **Personalidade:** …
> **Aparência:** …
> **Objetivo de Longo Prazo:** …
> **Objetivo Imediato:** …
> **O que sabe:** …
> **Como usar:** …
> **Entrada:** [[#Cena 3 — Casa da Drenagem]]
> **Frases:**
> - "…"
> - "…"

> [!quote] 🔊 Como descrever
> (visão · som · cheiro · tato — 3 a 5 frases, "vocês")

> [!gm] Segredo
> …

## 2.4 Locais
### Nome do Local
> [!info] Local
> **Atlas:** [[Passo D'Areia]]                ← opcional: nota do Atlas (expande)
> **Contexto:** …
> **Descrição:** …
> **Aparência:** …
> **Influências:**
> - **[[Org]]:** …
> **Quem está lá:** …
> **Zonas:** (1) … (2) …
> **Elementos de cena:** …
> **Cenas:** [[#Cena 6 — Retífica Sertório]]

> [!quote] 🔊 Como descrever
> …

> [!gm] Segredo
> …

### Mapa
```leaflet
image: [[Mapa de Porto Alegre RPG.png]]
bounds: [[0,0], [1170,850]]
defaultZoom: -1
marker: Local,790,256,Casa da Drenagem,,,
marker: Local,942,446,Retífica Sertório,,,
marker: Bairro,852,248,Centro Histórico,,,-0.1
```

# 3. Cenas
## Abertura
> [!info] Abertura
> **Situação:** o que aconteceu antes da 1ª cena
> **Gancho:** como os personagens entram
> **Contrato:** quem pede, o que paga (aponta pro bounty)
> **Início:** a primeira imagem da mesa
### (subseções livres: Contexto do incidente, A carga, O acordo…)

## Cena 1 — Título
> [!info] Cena
> **Tipo:** Social                     ← registro: Social · Exploração · Investigação · Combate · Interlúdio · Epílogo
> **Local:** [[#Casa da Drenagem]]     ← registro 2.4 (ou nota do Atlas)
> **Personagens:** [[#Arlindo “Bomba” Fagundes]], [[#Nico “Faixa Preta” Ferraz]]
> **Objetivo:** …
> **Duração:** ~30 min

> [!quote] 🔊 Ler pra mesa
> …

#### O que acontece
#### Interações e testes
#### Saídas
#### Combate — Fase 1                  ← opcional, quantos precisar
```combat-marker-small
- 4 [[Arruaceiro]]
- 1 [[Guarda]]
```

## Cena 2 — …

## Desfecho
> [!info] Desfecho
> **Decide:** o que define o final (ex.: quem fica com a Matriz)
### Desfechos possíveis
### Consequências
### Ganchos
```

Regras do formato:

- **H1 fixos** (`1. Resumo`, `2. Contexto`, `3. Cenas`) e **H2 fixos** (`2.1`…
  `2.4`, `Abertura`, `Desfecho`). Cenas são `## Cena N — Título`, na ordem.
  Os nomes ficam declarados no Contexto Base (`aventura.secoes`), como o
  `gm.campos_publicos` — nunca heurística no render.
- **Registro** = `### Nome` + callout `[!info] <Tipo>` com campos
  `**Rótulo:** valor` (+ bullets de continuação), opcionalmente seguido de
  `[!quote] 🔊` (descrever) e `[!gm]` (segredo). É o MESMO parser dos
  templates de Pessoa/Org (`calloutTemplateFields`).
- **Campos-núcleo × livres**: os núcleo têm lugar fixo no render (ordem,
  ícone, destaque); qualquer outro `**Rótulo:**` aparece como campo comum, na
  ordem da nota. É o "complementando com coisas diferentes": a Pós Grenal
  põe `**Onde ele está (A/B/C):**` no Juninho e isso rende sem schema novo.
- **Referência interna** `[[#Nome]]` liga cena→registro e registro→cena
  (Obsidian resolve; o app resolve contra os `###` da própria nota).
- **Referência externa** `[[Nota]]` em `Nota:`/`Atlas:`/`Organização:` liga ao
  compêndio e habilita o "expandir contexto".
- Tudo que não é registro é prosa livre (H3/H4, tabelas, listas) — renderiza
  como hoje.

## 2. Como o app mostra cada parte

Página `AventuraSheet` com **sub-nav fixa** (Resumo · Contexto · Personagens ·
Locais · Cenas) e conteúdo empilhado (leitura vertical, `FieldBlock` label
mono + prosa — padrão aprovado do Local/Org/Pessoa).

| Seção | Render |
|---|---|
| Bounty | `BountyCard` (existe) + Disponível em |
| 1. Resumo | prosa + **Estrutura** como bloco de campos lidos do FM (Duração/Jogadores/Rank/Formato/Tom) + contagens derivadas (cenas, combates, personagens, locais) + Roteiro em uma página com links que rolam até a cena |
| 2.1 / 2.2 | prosa; `[!gm]` no estilo de segredo (já existe); objetivos (callouts) como cards |
| 2.3 Personagens | um **card por registro**: retrato (da `Nota:` se houver, senão iniciais), campos-núcleo em ordem fixa, campos livres depois, **Frases** como lista de balões destacada, 🔊 como bloco "ler pra mesa", Segredo. Botão `Nota ↗ expandir` abre a `PessoaView` do compêndio ALI DENTRO (`<details>`, como os cards do Contexto Atual) |
| 2.4 Locais | idem: campos, 🔊, segredo, `Atlas ↗ expandir` (LocationSheet: Descrição/Aparência/Influências/Acontecimento) e, no fim da seção, o **Mapa** |
| Mapa | o bloco `leaflet` renderizado pelo `MapaLocal` (viewer com pan/zoom que a Localização já usa); marker cujo nome = `### Local` → clique expande o registro; demais markers linkam a nota do Atlas. Botão **Imprimir mapa** → `/papel/mapa/<docId>` |
| 3 Abertura | campos (Situação/Gancho/Contrato/Início) + prosa |
| 3 Cenas | **stepper vertical** (número, título, chip de Tipo, chips de Local/Personagens); cena aberta mostra 🔊, corpo, e os **combates como bloco de combate** (roster + dificuldade + `Preparar` / `+ Iniciativa`), um por fence, com `encounterPath = <docId>#Cena N#k` pra prep por monstro. Chips **expandem contexto inline**: `Local` → registro 2.4 (e dali, Atlas); `Personagens` → registro 2.3 (e dali, Pessoa); orgs citadas → OrgView |
| 3 Desfecho | campos + prosa (tabela de consequências renderiza como tabela) |

Sem sessão viva ou sem Modo Mestre os botões somem; a página segue de leitura.

### Mapa em PDF (`/papel/mapa/<docId>`)

Mesmo padrão da ficha de papel (`FichaPapelPage`: rota fora do AppShell,
pré-visualização A4 paisagem, `window.print`): página 1 = mapa com os
markers da aventura numerados; página 2+ = legenda (nº · Local · 🔊 · Descrição
· Zonas). Tudo lido do registro 2.4 e do bloco `leaflet`. Escolha do mestre:
com ou sem os `[!gm]`.

## 3. Sessão (mantido da v1 — não foi contestado)

- `SessionState.aventura` `{docId, titulo, cenaAtual, concluidas, iniciadaEm}`
  e `SessionState.mural` (o que o mestre "mostrou pra mesa": 🔊, bounty,
  imagem). Aditivos no jsonb; RLS gm-only (`updateSessionState`); sem migração.
- Combate de cena → `insertEncounter` **prepared** com `sourceNotePath =
  "<docId>#Cena N#k"` (idempotente) → card "▶ INICIAR" da Sessão (existe).
  `+ Iniciativa` = `addRosterToInitiative` (existe).
- Painel AVENTURA na Sessão: mestre (cena ◀ ▶, 🔊 com "mostrar pra mesa",
  combates da cena); jogador (título, cena atual, mural). Precisa de desenho
  no Claude Design (a Sessão é tela desenhada).

## 4. Módulos

| Módulo | Faz | Reusa |
|---|---|---|
| `app/src/aventura/parse-aventura.ts` (puro) | corpo → `AventuraModel {resumo, estrutura, roteiro, contexto, notasMestre, personagens[], locais[], mapa, abertura, cenas[], desfecho}`; seções pelos H1/H2 declarados; registros por `###` + callout; refs `[[#…]]` resolvidas; combates por fence dentro da cena | `calloutTemplateFields`, `parseLeafletBlock` (portar do extractor ou expor no doc), `combat-marker.ts`, `doc.headings` |
| `aventura/registros.ts` | ordem/ícone dos campos-núcleo de Personagem/Local/Cena/Abertura/Desfecho + vocabulário de `Tipo` de cena (registro central, `tokens`) | — |
| `components/compendium/AventuraSheet.tsx` (rework) | as seções da §2; cards de registro com `FieldBlock`; expand inline (`<details>`) | `PessoaView`, `OrgView`, `LocationSheet` (pedaços reutilizáveis), `MapaLocal`, `CombatMarkerBlock`, `BountyCard` |
| `print/MapaPapelPage.tsx` | mapa + legenda em A4 | `FichaPapelPage` (shell/CSS) |
| `aventura/session-actions.ts` | iniciar/avançar/mural | `SessionRepo`, `encounter-actions` |
| extractor | nada obrigatório (`headings`/`links`/corpo já saem); Contexto Base ganha `aventura.secoes` e `aventura.tipos_de_cena` | `compile-contexto` |

Testes: parser sobre a Pós Grenal reescrita no formato (fixture congelada) +
uma aventura da fantasia só-bounty (só seção 0) + um "Encontro"; jsdom pra
expand inline, mapa com markers ligados, botões gated; InMemory pra sessão.

## 5. O que acontece com as aventuras que existem

- **Fantasia (só bounty)**: continuam válidas — seções ausentes não aparecem.
  Ao ganhar conteúdo, seguem o template. Template `TEMPLATE
  categoria=Aventura.md` (nas duas vaults) passa a trazer o esqueleto.
- **Pós Grenal**: reorganizar pro esqueleto (mover seções, converter os 7
  perfis e os 5 locais em registros `[!info]`, mover os 🔊 pra dentro dos
  registros/cenas, o combate final pra dentro da Cena 6, Desfechos+Ganchos em
  `## Desfecho`, adicionar o `leaflet` com Casa da Drenagem e Retífica). Texto
  intacto; só forma.

## 6. Campos a decidir (proposta)

**Personagem** — núcleo: Nota, Organização, Função, Papel, Personalidade,
Aparência, Objetivo de Longo Prazo, Objetivo Imediato, O que sabe, Como usar,
Entrada, Frases (+ 🔊 Como descrever, [!gm] Segredo). Livres: o que a história
pedir (ex.: "Onde ele está").

**Local** — núcleo: Atlas, Contexto, Descrição, Aparência, Influências, Quem
está lá, Zonas, Elementos de cena, Cenas (+ 🔊, [!gm]). Livres: ex.: "Pontos
úteis", "Como chegar".

**Cena** — núcleo: Tipo, Local, Personagens, Objetivo, Duração (+ 🔊). Corpo
livre em H4 (sugestão: O que acontece · Interações e testes · Saídas ·
Combate — Fase N).

**Abertura** — Situação, Gancho, Contrato, Início. **Desfecho** — Decide.

**Estrutura (FM)** — Formato, Duração, Jogadores, Tom (+ rank/subcategoria/
disponivel que já existem).

Perguntas: (1) esses núcleos servem ou tiro/adiciono algo? (2) `Papel` do
personagem é texto livre ou vocabulário fixo (Patrão · Aliado · Contato ·
Antagonista · Testemunha · Vítima)? (3) `Tipo` de cena: a lista acima serve?
(4) mapa: um por aventura (seção 2.4) basta, ou também mapa por Local (planta
da oficina)? (5) `subcategoria: One-Shot` da Pós Grenal → vira `Formato` e
ganha um tipo de missão? (6) o PDF do mapa leva os segredos `[!gm]` ou nunca?

## 7. Fases (depois do OK nos campos)

F0 template + Contexto Base + Pós Grenal no formato · F1 parser puro + testes ·
F2 AventuraSheet por seção (sem sessão) + expand inline · F3 mapa + PDF ·
F4 combates com Preparar/+Iniciativa e `state.aventura` · F5 painel AVENTURA na
Sessão (após design) · F6 mural. Cada fase verde → push → deploy.
