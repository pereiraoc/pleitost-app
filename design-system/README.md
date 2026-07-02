# Design System das Fichas — Pleitost

Retrato estruturado e **lossless** do design atual das fichas, gerado a partir do
código-fonte do plugin `pleitost-autosheet`. Feito pra alimentar geração de UI
(claude design), recriação no Figma e o futuro app.

> **Gerado automaticamente — não editar à mão.** Regenere com `npm run gen` na raiz
> do pleitost-app (lê a fonte do plugin). Determinístico: mesma fonte → mesmo arquivo.

## Arquivos
- `design-system.json` — o bundle completo (índice abaixo).
- `README.md` — este arquivo (também gerado).

## Conteúdo do `design-system.json`

Camada L1 — contrato estático do código:
- `tokens` — emojis (35 namespaces), cores (16 grupos), emojiCostExtra, tipografia.
- `dataModel` — modelo interno (23 interfaces, enums, jsdoc verbatim).
- `modes` — Resumo/Leitura (seções ordenadas + hideWhenEmpty/noop) e Editável (abas por família).
- `interativa` — grafo completo: 4 clusters, 29 diamantes, estados, clique→painel, pills EM, fórmula da Vida, abas v2 ocultas.
- `components` — inventário (17 groups, 19 widgets): role, props, tokensUsed, iconSources (inline vs supercharged).
- `tooltips` — templates breakdown + source (campos, componentes, gatilhos).
- `grupo` / `combatTracker` — estrutura, tokens e iconSources desses modos.

Camada L3 — ícones externos:
- `icons.supercharged` — mapa data-link-* → ícone/cor injetado pelo supercharged-links, cruzado por uid com o registry (66 entries).

Camada L2 — render real:
- `goldens` — fatos destilados do DOM realmente renderizado das fixtures (emojis renderizados, roles ocultos).
- `goldens.interactive` — estados pós-interação da Interativa: tooltips (texto real destilado, ex.: linhas do breakdown com valores) e painéis pós-clique por losango. DOM cru em `reference/goldens/` (estáticos) e `reference/goldens/interactive/` (interativos, referenciados por `artifact`).
- `screens` — captura RICA por TELA da ficha VIVA (largura real do pane, ~118 telas em 6 fixtures: Carlos real c/ retrato + goldens). Cada modo + cada aba da Editável + cada painel de losango da Interativa, com `landmarks` (rect [x,y,w,h] por região/card/painel) + refs pra screenshot/geometry/html/css completos em `reference/goldens/screens/` (gitignored, regenerável via `scripts/capture-screens.sh`).

Narrativa:
- `docs` — trechos verbatim da documentação, indexados por heading.

## Transparência
- `$sourceCommit` — commit do plugin (na vault) no momento da geração.
- `$gaps` — dados ausentes/incertos por seção (NUNCA chutados): tooltips, supercharged, goldens.

## Como regenerar
1. (opcional, p/ L2) Com o Obsidian aberto, capture os estados interativos via CLI:
   `obsidian open file="GOLDEN <X>"` + `obsidian eval` com `require(generator/capture-interactive.cjs).captureCurrent(app,{slug,outDir})` apontando outDir pra `reference/goldens/interactive/`. (Goldens estáticos vêm do comando "Capturar goldens" do plugin.)
2. `npm run gen` na raiz do pleitost-app.
