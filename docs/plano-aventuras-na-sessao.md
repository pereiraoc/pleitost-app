# Aventuras na sessão — estudo de arquitetura (v1, 2026-09-05)

> Pedido (AS-IS): "uma forma boa de conseguir usar a nota de campanha dentro
> do pleitost-app, de uma forma que também mostre na prática as fases, os
> combates, de forma que eu tenha o botão de adicionar ele na sessão e coisas
> do tipo. […] uma arquitetura boa pra aventuras genéricas, considerando quais
> são bons campos […] não ficar refém apenas dessa aventura especificamente
> que é um one-shot com alguns sistemas adicionais […] funcional pro sistema
> no modo fantasia também."
>
> Status: **PROPOSTA — nada implementado.** Decisões abertas na §9.

## TL;DR

1. **A nota continua sendo a fonte.** Uma Aventura é markdown Obsidian-first:
   o que já existe (fence `bounty`, fences `combat-marker`, callouts, wikilinks,
   headings) vira a estrutura que o app lê. **Uma única convenção nova**: a
   seção `## Roteiro`, cujos filhos `###` são as **Cenas**, em ordem. Metadados
   de cena usam **inline fields** (`Tipo:: Social`), mecanismo que a vault já
   usa e o extractor já parseia. Nenhum DSL novo pra objetivos/papéis/relógio —
   isso é prosa e continua prosa (vira handout, não dado).
2. **Modelo: Aventura → Cena → anexos** (combates, leituras 🔊, referências a
   Pessoa/Localização/Combate). Tudo opcional: uma aventura da fantasia que é
   só bounty continua válida; um "Encontro" com um `combat-marker` continua
   válido; a one-shot completa usa tudo. Nada é específico de mundo.
3. **Sessão: um `aventura` no `SessionState`** (jsonb aditivo, RLS gm-only já
   existente) guarda qual aventura está rodando e a cena atual; **combates
   viram `session_encounters` preparados por cena** (fluxo que já existe:
   `insertEncounter` → card "▶ INICIAR" na Sessão); um **mural** opcional
   deixa o mestre "mostrar pra mesa" uma leitura 🔊, o bounty ou uma imagem.
4. **Duas telas**: a página da Aventura no compêndio vira **roteiro navegável**
   (cenas como stepper vertical, combates com `Preparar` / `+ Iniciativa`,
   chips de elenco/locais); a Sessão ganha o painel **AVENTURA** (mestre:
   runner ◀ ▶; jogador: cena atual + mural). As duas precisam de passe no
   Claude Design antes de codar (§7).
5. **Reuso, nada reimplementado**: `parseBountyBlock`, `parseCombatMarkerBlocks`
   /`CombatMarkerBlock`, `addRosterToInitiative`, `insertEncounter`,
   `updateSessionState`, `encounter-speeds`, `remarkCallouts`, `doc.headings`,
   `doc.links`, gm-split. Módulo novo e puro: `app/src/aventura/`.

## 1. O que já existe (base do plano)

| Peça | Onde | O que faz hoje |
|---|---|---|
| Doc `type: Aventura` | extractor (`categoria`) · `AventuraView.tsx` | `BountyCard` (fence `bounty` ou FM da aventura local) + "Disponível em" + **corpo renderizado como coluna de leitura** (report Pós Grenal) |
| Aventura LOCAL | `local-entities.ts` kind `Aventura` · `AventuraForm.tsx` · `criador-aventura-doc.ts` | criada no Modo Mestre, só FM (sem corpo) |
| Combate | `CombateView.tsx` · `mestre/CombatMarkerBlock.tsx` · `mestre/combat-marker.ts` | roster + dificuldade; **`+ Adicionar à sessão`** (mestre + sala viva) via `addRosterToInitiative`; prep por monstro (velocidade/escondido/disfarçado) em `encounter-speeds.ts` chaveado por `encounterPath` |
| Fence dentro de QUALQUER corpo | `markdown/fence-registry.tsx` | `combat-marker(-small)` já renderiza `CombatMarkerBlock` inline — **na Pós Grenal os dois rosters já aparecem com o botão**, mas sem `encounterPath` (sem prep por monstro) e sem "preparar" (só "adicionar agora") |
| Encounters da sala | `session-repo/contract.ts` · `encounter-actions.ts` · `SessaoPage.tsx` §"combate da sala" | `prepared` → card com ▶ INICIAR; `active` → iniciativa por blocos; `insertEncounter` (Criador de Combate), `startEncounterFromRoster`, `addRosterToInitiative` |
| State da sessão | `SessionState` (jsonb, merge por chave de topo) | `exploracao`, `inventarioGrupo`, `mapaAtlas`, `hexMapMundo` — **chaves aditivas; o pleitost-sync ignora extras**. Escrita gm-only (RLS) via `updateSessionState`; membro só via RPC (`exploracao`) |
| Segredo mestre×jogador | `extractor/gm-split.mjs` · `gm-bundle.ts` · `MarkdownBody` | `[!gm]` cortado do dataset público; `GM: true` tira a nota do índice; **pasta Campanhas é só-mestre no app (#441)** — jogador não vê Aventura nem Combate |
| Headings/links do doc | `extractor/parse-doc.mjs` → `VaultDoc.headings`, `links`, `inlineFields` | já extraídos — o parser de cenas não precisa de extract novo |
| Callouts | `markdown/remark-callouts.ts` | `[!x]` → classe `callout-x` (sem título inventado) |
| Design | `design/pulled/Companion App.dc.html` | SESSÃO tem painéis Iniciativa + Detalhes ("⚙ FERRAMENTAS DE MESTRE — EM BREVE"); **não há tela de Aventura nem de runner** |

## 2. Princípio

1. **Obsidian-first, app lê.** A nota tem que continuar boa de ler e mestrar no
   Obsidian sem plugin novo. O app deriva estrutura do que o markdown já tem;
   quando precisa de dado de máquina, usa mecanismos que a vault já declara
   (fence, inline field, wikilink, callout). Nunca heurística de texto
   ("se o heading contém 'Cena'…"): o que é estrutura é **declarado** — pelo
   nome fixo de seção da família Aventura, registrado no Contexto Base
   (`aventura.roteiro`), como o `gm.campos_publicos`.
2. **Tudo opcional, nada de mundo.** O modelo degrada: bounty só → carta;
   bounty + combate → carta + roster com botões; roteiro → runner. Reskin,
   bestiário, moeda e Marcas já vêm do mundo ativo; o runner não sabe se é
   Pencas ou Porto Alegre.
3. **Sistemas extras são conteúdo, não schema.** Objetivos secretos, papéis-
   base, relógio, pistas: prosa/callout/tabela na nota. O app não modela; no
   máximo deixa o mestre **mostrar** um bloco pra mesa (mural). Se um dia um
   desses virar mecânica recorrente, ganha fence própria no registro — não
   antes.

## 3. Modelo de dados

```
Aventura (doc type Aventura)
├─ contrato        ← fence bounty (ou FM da local)        [existe]
├─ ficha técnica   ← FM opcional (Formato/Duração/Jogadores) [novo, opcional]
├─ roteiro         ← seção `## Roteiro`                     [novo, opcional]
│   └─ Cena[]      ← headings `###` filhos, em ordem
│       ├─ meta    ← inline fields no corpo da cena (Tipo::, Local::, Duração::)
│       ├─ leituras← callouts `[!quote]` (🔊 Ler pra mesa)
│       ├─ combates← fences combat-marker(-small) NA cena  +  wikilinks pra docs `type: Combate`
│       ├─ refs    ← wikilinks resolvidos por tipo: Pessoa · Localização · Organização
│       └─ corpo   ← o resto do markdown da cena (render normal)
├─ combates soltos ← fences/links fora do roteiro (ex.: "Encontro" da fantasia)
└─ referência      ← todas as outras seções (Elenco, Mapa, Desfechos, Objetivos…) — leitura vertical
```

### 3.1 Campos da Aventura

| Campo | Onde vive | Estado | Por quê |
|---|---|---|---|
| Titulo, Recompensa (Marcas/Ouro/Extra/Promoção/Reconhecimento), Objetivo, Local, Contato, Financiador | fence `bounty` / FM da local | existe | contrato — a carta que a mesa vê |
| `categoria: Aventura`, `subcategoria` (tipo de missão), `rank`, `disponivel`, `aliases` | FM | existe | catálogo, grade por rank/tipo, quadro por local |
| `Formato` | FM | **novo, opcional** | `One-Shot` · `Arco` · `Encontro`. Hoje "One-Shot" está em `subcategoria` da Pós Grenal, que é o eixo de TIPO DE MISSÃO (Neutralização/Resgate/…) — ver decisão §9.2 |
| `Duração`, `Jogadores` (`{min,max}`), `Nível` (se diferente do rank) | FM | **novo, opcional** | ficha técnica na página; filtro futuro ("cabe numa noite?") |
| `Combates` | FM (lista de wikilinks pra `Campanhas/Combates/*`) | **novo, opcional** | ordem explícita + "Preparar todos"; sem ele, derivado dos links/fences do roteiro |
| `Elenco`, `Locais` | FM (wikilinks) | **novo, opcional** | ordem/curadoria explícita; sem eles, derivados dos links do roteiro por tipo |
| Cenas | **derivado** de `## Roteiro` + `###` | novo | nunca FM: a cena é prosa com anexos, e a ordem é a do texto |
| Meta de cena (`Tipo::`, `Local::`, `Duração::`, `Pistas::` …) | inline fields dentro da cena | novo | mecanismo já existente (templates usam `up::/prev::/next::`; extractor parseia) — chips na cena, sem heurística |
| Leituras 🔊 | callout `[!quote]` dentro da cena | existe (convenção adotada 2026-09-05) | render "ler pra mesa" + botão "mostrar pra mesa" |
| Segredos | `[!gm]` / `GM: true` | existe | irrelevante no app enquanto Campanhas for só-mestre; continua valendo pro dataset (§9.5) |

Fora do schema de propósito: objetivos público/secreto, papéis-base, relógio,
tabela de pistas, desfechos. Continuam seções livres da referência.

### 3.2 As três formas que precisam funcionar

| Forma | Exemplo real | O que o app mostra |
|---|---|---|
| **Só bounty** | `Covil dos Orcs (Safira)`, todas as da fantasia | carta + Disponível em + `Mostrar contrato pra mesa` (mural). Sem roteiro, sem runner. Igual a hoje + 1 botão |
| **Bounty (ou nada) + combate** | `Emboscada de Goblins (Exemplo Sync)`; qualquer aventura com `Combates:` ou fence solta | carta (se houver) + bloco de combate com `Preparar` e `+ Iniciativa`; "Iniciar na sessão" = preparar os combates |
| **Roteiro completo** | `Pós Grenal` (com `## Roteiro` e combates dentro da Cena 6) | tudo acima + stepper de cenas + runner na Sessão + mural |

## 4. Convenções de nota (o que muda na vault)

Mudanças mínimas, todas legíveis no Obsidian sem plugin:

1. **`## Roteiro`** — nome fixo da seção de cenas, declarado no Contexto Base
   (`Contexto.aventura.roteiro: Roteiro`; um mundo pode sobrescrever — o POA
   não precisa). Filhos `###` = cenas, na ordem do texto; `####` dentro da
   cena = subpartes (fases de combate, pistas, saídas).
2. **Meta de cena por inline field** (opcional, 1 linha logo abaixo do `###`):
   `Tipo:: Social` · `Local:: [[Estádio Beira-Rio]]` · `Duração:: 30min`.
   Vocabulário de `Tipo` registrado no Contexto Base
   (`aventura.tipos_de_cena: [Social, Exploração, Investigação, Combate,
   Interlúdio, Epílogo]`) — ícone/cor por tipo vêm de um registro central no
   app (`tokens`), nunca de `if tipo === …` no render.
3. **Combates**: dois jeitos, ambos válidos.
   - inline: fence `combat-marker-small` dentro da cena (one-shot, sem reuso);
     chave de prep = `<docId>#<cena>#<n>`.
   - por nota: wikilink pra `Campanhas/Combates/<Nome>` na cena (ou em
     `Combates:` do FM) — reaproveitável entre aventuras; o prep por monstro
     fica na nota do combate (já existe).
4. **Elenco/Locais**: wikilinks. Um NPC só vira card se for nota
   (`Contexto/Pessoas`, ou Pessoa local). Perfis inline (como os 7 da Pós
   Grenal) continuam prosa — decisão §9.3.
5. **Template** `Recursos e Mídia/Templates/Templates de Campanhas/TEMPLATE
   categoria=Aventura.md` (nas DUAS vaults) ganha, comentado, o esqueleto
   opcional: `## Roteiro` → `### Cena 1 — Título` → `Tipo::` → `> [!quote]
   🔊 Ler pra mesa —` → corpo.
6. **Pós Grenal**: `## Cenas da one-shot` → `## Roteiro`; a seção "Combate
   final em 2 fases" passa a ser `####` dentro da Cena 6 (os dois fences já
   estão lá); "Desfechos" vira `### Epílogo` com `Tipo:: Epílogo`. Só mover
   headings — o texto não muda.

## 5. Sessão

### 5.1 State (aditivo no jsonb — `contract.ts`)

```ts
interface SessionState {
  // … existentes …
  /** Aventura em curso na mesa. Só o MESTRE escreve (updateSessionState, RLS
   *  gm-only). Jogadores leem: título + cena atual. */
  aventura?: {
    docId: string          // id do doc (vault ou local)
    titulo: string
    cenaAtual: string | null   // slug da cena (heading → slug estável)
    concluidas: string[]
    iniciadaEm: string
  }
  /** MURAL: o que o mestre "mostrou pra mesa". Mapa id→item (mesmo padrão do
   *  inventarioGrupo). Jogadores leem; só o mestre escreve. */
  mural?: Record<string, MuralItem>
}
type MuralItem =
  | { kind: 'leitura'; texto: string; cena: string; em: string }
  | { kind: 'bounty'; docId: string; em: string }
  | { kind: 'imagem'; rel: string; legenda?: string; em: string }
  | { kind: 'texto'; texto: string; em: string }
```

Sem migração: `sessions.state` é jsonb e o merge por chave de topo já existe.
O pleitost-sync ignora chaves extras (comentário do contrato). Nenhuma RPC
nova: tudo é escrita do mestre.

### 5.2 Combates por cena → `session_encounters`

- **Preparar** (novo botão no bloco de combate dentro de uma aventura):
  `repo.insertEncounter({ sourceNotePath: '<docId>#<cenaSlug>#<n>', name:
  '<Cena> — <título do bloco>', roster, difficulty })` → status `prepared` →
  aparece no card "▶ INICIAR" da Sessão (fluxo existente). O fragmento em
  `sourceNotePath` é string livre (sem schema) e permite o runner agrupar
  "combates desta cena".
- **+ Iniciativa** = o `addRosterToInitiative` de hoje (mantido).
- **Iniciar aventura** (página da aventura, mestre + sala viva): grava
  `state.aventura` com `cenaAtual` = primeira cena e prepara TODOS os combates
  do roteiro de uma vez (idempotente: não duplica `prepared` com o mesmo
  `sourceNotePath`).
- Prep por monstro (`encounter-speeds`) passa a receber `encounterPath` também
  nos fences inline (hoje só a CombateSheet passa) — chave `<docId>#<cena>#<n>`.

### 5.3 Ações do runner (mestre)

`aventura/session-actions.ts` (puro sobre `SessionRepo`, testável com o
InMemory): `iniciarAventura`, `irParaCena(slug)`, `concluirCena(slug)`,
`encerrarAventura`, `mostrarNoMural(item)`, `limparMural(id)`. Cada ação = 1
`updateSessionState` com patch mínimo. Opcional: `insertEvent({type:
'aventura.cena', payload})` pra histórico — `session_events` existe e está sem
uso no app; entra só se o user quiser log.

### 5.4 O que o jogador vê

- Painel AVENTURA (Sessão): título + "Cena atual: …" (só o título) + mural.
- Nada do corpo da nota (Campanhas segue só-mestre). O bounty só aparece se o
  mestre mostrou no mural — resolve o "spoiler do quadro" sem `GM: true`.

## 6. Módulo novo — `app/src/aventura/` (puro, sem React)

| Arquivo | Responsabilidade | Reusa |
|---|---|---|
| `parse-aventura.ts` | `parseAventura(doc, ctx) → AventuraModel` — fatia o corpo em seções pelos headings (`doc.headings` + offsets no `body`), acha `## Roteiro` pelo nome declarado, monta `Cena[]` com slug, corpo, leituras, combates, refs | `doc.headings`, `doc.links` (kind/target por seção), gramática de inline field do extractor (portar 1:1, como `parse-bounty.ts` portou o pleitost-views), `parseCombatMarkerBlocks`/`extract` do `combat-marker.ts` |
| `cena-slug.ts` | slug estável do título (chave em `state.aventura` e em `sourceNotePath`) | — |
| `aventura-config.ts` | lê `Contexto.aventura` do `contexto.json` do mundo com fallback base (`roteiro`, `tipos_de_cena`) | `context-def.ts` |
| `session-actions.ts` | ações §5.3 | `SessionRepo`, `encounter-actions.ts` |
| `types.ts` | `AventuraModel`, `Cena`, `CenaCombate`, `MuralItem` | `contract.ts` |

Regras: sem `fetch`, sem DOM; toda função pura testada sobre docs REAIS
(fixture congelada da Pós Grenal adaptada + uma aventura da fantasia só-bounty
+ o "Encontro"). A UI só consome `AventuraModel`.

## 7. Telas

### 7.1 Página da Aventura (compêndio, `AventuraSheet`) — rework

Leitura vertical (preferência registrada do user), sem grade de cards:

```
[kicker COMPÊNDIO]
[BountyCard]                                  ← existe
Disponível em: 📌 …                           ← existe
// FICHA   Formato · Duração · Jogadores · Rank · N cenas · N combates
[▶ Iniciar na sessão] [Preparar combates]     ← mestre + sala viva; senão some
// ROTEIRO (stepper vertical; cena atual da sessão marcada)
 ● 1 Saída do Gre-Nal          Social · 📍 Beira-Rio
 ○ 2 Fuga subterrânea          Exploração
 ○ 6 Retífica Sertório         Combate
      ⚔ Fase 1 — 4× Arruaceiro · 1× Guarda   [Preparar] [+ Iniciativa]
      ⚔ Fase 2 — Guarda Oficial · Guarda       [Preparar] [+ Iniciativa]
// CENA (expandida ao clicar; a atual expande sozinha)
 🔊 Ler pra mesa … [Mostrar pra mesa]
 corpo da cena (markdown normal, [!gm] etc.)
 chips: 📍 locais · 👤 pessoas · 🛡 organizações (links pro compêndio)
// REFERÊNCIA — demais seções, como hoje (coluna de leitura)
```

Sem roteiro: some o stepper, fica ficha + carta + combates soltos +
referência. É a página de hoje com mais duas faixas.

### 7.2 Painel AVENTURA na Sessão (`SessaoPage`)

Mestre: título · "cena 3/6" · `◀ ▶` · 🔊 da cena com `Mostrar pra mesa` ·
combates preparados desta cena (▶ INICIAR, os mesmos cards) · `Abrir no
compêndio` · `Encerrar aventura`.
Jogador: título · cena atual · mural (leituras/bounty/imagens na ordem).
Sem aventura: o painel não aparece (mestre vê "Iniciar uma aventura → abre
Campanhas/Aventuras").

### 7.3 Design

O design puxado não tem nenhuma das duas. Regra do projeto (memória): tela
nova = desenhar no Claude Design ("Companion App") e copiar verbatim; enquanto
não houver, usar a linguagem visual (kicker/painéis/vars) e sinalizar. Proposta:
**F2 (página) sai na linguagem visual** — é extensão de uma página que já
existe fora do design; **F3 (painel AVENTURA na Sessão) espera o desenho**, porque
a Sessão É desenhada e o painel entra no slot "⚙ FERRAMENTAS DE MESTRE — EM
BREVE". Decisão §9.6.

## 8. Extractor / dataset

- **MVP: nada.** `headings`, `links`, `inlineFields` e `body` já saem.
- Contexto Base ganha `aventura: { roteiro: Roteiro, tipos_de_cena: [...] }`
  → `compile-contexto` leva pro `contexto.json` (mesmo caminho do `gm`).
- Opcional (§9.5): `gm.pastas_mestre: [Campanhas]` no Contexto Base → gm-split
  move `Campanhas/**` inteiro pro `gm.json` (hoje o corpo das aventuras vai
  no dataset público, só escondido pela UI).

## 9. Decisões abertas (pro user)

1. **Nome da seção de cenas**: `## Roteiro` (proposta) — declarado no Contexto
   Base. Alternativa: `## Cenas`.
2. **`subcategoria: One-Shot`** da Pós Grenal: (a) manter e aceitar "One-Shot"
   como tipo de missão (entra no registro `BOUNTY_SUBCAT` com ícone) ou (b)
   mover pra `Formato: One-Shot` e dar um tipo de missão real (ex.:
   "Recuperação de Relíquia"). Proposta: (b).
3. **NPCs de aventura**: só inline (como está) ou notas de Pessoa numa subpasta
   (`Contexto/Pessoas/Pós Grenal/`) pra virarem cards/links no app. Proposta:
   promover só os que voltam em outras aventuras (Arlindo, Brum); o resto fica
   inline.
4. **Mural pros jogadores** no MVP (F4) ou depois. Proposta: F4 — é o que dá
   "mostrar pra mesa" e substitui o `GM: true` do bounty.
5. **Campanhas no `gm.json`** (dataset público sem corpo de aventura): sim/não.
   Proposta: sim, é 1 chave declarada + 1 filtro no gm-split.
6. **Design**: F3 espera desenho no Claude Design; F2 sai na linguagem visual.
7. **Log em `session_events`** ("cena avançou"): adiar.
8. **Editor de roteiro pra aventura LOCAL** (criada no app): adiar — hoje a
   local é só FM; a autoria de cena continua na vault.

## 10. Fases / commits (verde a verde, deploy por fase — padrão do repo)

| Fase | Entrega | DoD (teste) |
|---|---|---|
| **F0** | este doc aprovado; Contexto Base com `aventura.*`; template + Pós Grenal adaptados nas vaults (headings e inline fields, texto intacto) | extract das duas vaults verde; `contexto.json` com `aventura` |
| **F1** | `app/src/aventura/` puro | vitest sobre fixtures reais: Pós Grenal → 7 cenas (6 + Epílogo), Cena 6 com 2 combates, refs por tipo; fantasia só-bounty → `roteiro: null`; "Encontro" → 1 combate solto; slug estável; roteiro sob nome sobrescrito pelo mundo |
| **F2** | `AventuraSheet` rework (ficha, stepper, cena expandida, `Preparar`/`+ Iniciativa` com `encounterPath`, chips) | jsdom: botões só com mestre + sala viva (InMemory); `Preparar` cria `prepared` com `sourceNotePath` fragmentado e não duplica; fence inline sem aventura continua igual (regressão `combate-encontro-266`) |
| **F3** | `state.aventura` + ações + painel AVENTURA (mestre/jogador) | InMemory: iniciar → cenaAtual = 1ª; ▶ avança; combates da cena listados; jogador vê só título/cena; troca de mundo desconecta (já existe) |
| **F4** | mural (`Mostrar pra mesa` em 🔊/bounty/imagem) | jogador recebe item; mestre limpa; sanitize no consumo |
| **F5** (opc.) | `gm.pastas_mestre`; log de eventos; editor de roteiro local | — |

Cada fase: `tsc` + vitest + build verdes → push main → `npm run deploy`
(regra do pleitost-app). Vault: commits de conteúdo separados, sem tag.

## 11. Riscos e limites

- **Headings como estrutura**: renomear um `###` muda o slug → `cenaAtual`
  aponta pro nada. Mitigação: o runner cai pra "cena não encontrada, volte
  pra 1ª" e o slug ignora numeração/emoji ("Cena 1 — Saída…" → `saida-do-gre-nal`).
- **Fences inline vs. `parseCombatMarkerBlocks`** (regra MVP do sync: nota com
  2+ blocos é rejeitada): o parser de cena usa a extração por bloco, não a
  função de nota inteira — a regra do sync fica intacta pra `type: Combate`.
- **Duplicidade de combate preparado**: idempotência por `sourceNotePath`.
- **Aventura local sem corpo**: continua carta-only até F5 — dito de saída.
- **Mundo**: nada de específico; o reskin entra em nomes (já), bestiário do
  mundo resolve o roster (já), Marcas/Cz$ pelo bounty (já).
