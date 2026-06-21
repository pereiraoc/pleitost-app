# Design System das Fichas — pleitost-autosheet

Retrato estruturado e **lossless** do design atual das fichas, gerado a partir do código-fonte.
Feito pra alimentar geração de UI (claude design), recriação no Figma e um futuro app.

> **Gerado automaticamente — não editar à mão.** Regenere com `npm run gen:design-spec`
> (do diretório do plugin). Determinístico: mesma fonte → mesmo arquivo.

## Arquivos
- `design-system.json` — o bundle completo (índice abaixo).
- `README.md` — este arquivo (também gerado).

## Conteúdo do `design-system.json`

Camada L1 — contrato estático do código:
- `tokens` — emojis (34 namespaces), cores (16 grupos), emojiCostExtra, tipografia.
- `dataModel` — modelo interno (23 interfaces, enums, jsdoc verbatim).
- `modes` — Resumo/Leitura (seções ordenadas + hideWhenEmpty) e Editável (abas por família).
- `interativa` — grafo completo: 4 clusters, 29 diamantes, estados, clique→painel, pills EM, fórmula da Vida, abas v2 ocultas.
- `components` — inventário (17 groups, 19 widgets): role, props, tokensUsed, iconSources (inline vs supercharged).
- `tooltips` — templates breakdown + source (campos, componentes, gatilhos).
- `grupo` / `combatTracker` — estrutura, tokens e iconSources desses modos.

Camada L3 — ícones externos:
- `icons.supercharged` — mapa data-link-* → ícone/cor injetado pelo supercharged-links, cruzado por uid com o registry (66 entries).

Camada L2 — render real:
- `goldens` — fatos destilados do DOM realmente renderizado das fixtures (emojis renderizados, roles ocultos).
- `goldens.interactive` — estados pós-interação da Interativa: tooltips (texto real destilado, ex.: linhas do breakdown com valores) e painéis pós-clique por losango. DOM cru em `<plugin>/tests/visual-capture/captures/` (estáticos) e `.../captures/interactive/` (interativos, referenciados por `artifact`).

Narrativa:
- `docs` — trechos verbatim da documentação, indexados por heading.

## Transparência
- `$sourceCommit` — commit do plugin no momento da geração.
- `$gaps` — dados ausentes/incertos por seção (NUNCA chutados): tooltips, supercharged, goldens.

## Como regenerar
1. (opcional, p/ L2) Com o Obsidian aberto, via CLI: o comando "Capturar goldens" (DOM estático) e `scripts/capture-interactive.cjs` (tooltips/painéis interativos, dirige o DOM vivo) re-renderizam as fixtures. Sem este passo, o `gen` usa os goldens já em disco e declara em `$gaps` o que faltar.
2. No diretório do plugin: `npm run gen:design-spec`.
