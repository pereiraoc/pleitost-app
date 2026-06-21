# Pleitost App

Repositório do futuro **app** do sistema Pleitost — a UI das fichas de personagem
(Resumo / Interativa / Editável / Leitura + Ficha de Grupo + Combat Tracker).

Por enquanto, contém a **documentação de design**: a fonte de verdade da UI,
**gerada automaticamente** a partir do plugin Obsidian `pleitost-autosheet`.
Pensada pra alimentar o **claude design**, recriar no Figma e guiar a construção
do app — sem perder nada do que existe hoje.

## Estrutura

- **`design-system/design-system.json`** — a **spec** (feed principal). JSON
  estruturado, lossless e determinístico. Contém:
  - `tokens` — emojis (34 namespaces), cores (16 grupos), `emojiCostExtra`, tipografia.
  - `dataModel` — modelo interno das fichas (23 interfaces, enums, jsdoc verbatim).
  - `modes` — Resumo/Leitura (seções ordenadas + `hideWhenEmpty`/`noop`) e Editável
    (abas por família Heroi/Monstro/CompanheiroAnimal).
  - `interativa` — grafo completo: 4 clusters, 29 losangos, estados (selected/dim/
    disabled com a condição exata), clique→painel, pills de EM, fórmula da Vida,
    abas v2 ocultas, contadores.
  - `components` — inventário (17 cards + 19 widgets): papel, props, `tokensUsed`,
    e `iconSources` (ícone **inline** vs **supercharged**).
  - `tooltips` — templates de breakdown e source (campos, componentes, gatilhos).
  - `grupo` / `combatTracker` — estrutura, tokens e ícones desses modos.
  - `icons.supercharged` — mapa `data-link-* → ícone/cor` injetado pelo plugin
    supercharged-links, cruzado por uid com o registry (com `matchOp` do seletor).
  - `goldens` — **render real** destilado das fixtures, incluindo
    `goldens.interactive`: tooltips com **valores reais** (ex.: linhas do breakdown
    de Defesa) e painéis pós-clique por losango.
  - `$gaps` — o que falta/é incerto, declarado (nunca chute silencioso).
- **`design-system/README.md`** — índice detalhado do bundle + como regenerar.
- **`reference/goldens/interactive/`** — DOM cru das tooltips/painéis interativos
  (referência visual; o `design-system.json` já destila o conteúdo deles).

## Origem / como regenerar

Gerado pelo plugin `pleitost-autosheet` (na vault Obsidian):

```bash
# do diretório do plugin:
npm run gen:design-spec
# (saída padrão = pasta da vault; pra escrever aqui:)
GEN_DESIGN_SPEC_OUT=<este-repo>/design-system npm run gen:design-spec
```

A camada interativa (`goldens.interactive`) é capturada via Obsidian CLI
(`scripts/capture-interactive.cjs`, dirige o DOM vivo). Os goldens **estáticos**
(DOM completo das fichas, ~8.7M) ficam no repo do plugin
(`tests/visual-capture/captures/`) — não copiados aqui; o `design-system.json`
já contém os fatos destilados deles. (Os campos `artifact` no bundle apontam pra
origem no plugin; cópia dos interativos está em `reference/goldens/interactive/`.)

## Status

- ✅ Design system: spec completa e validada (gerador com 156 checagens verdes,
  review adversarial aplicado).
- ⏳ App: a construir, a partir desta spec.
