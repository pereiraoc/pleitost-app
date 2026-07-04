# Pleitost App

Repositório do futuro **app** do sistema Pleitost — a UI das fichas de personagem
(Resumo / Interativa / Editável / Leitura + Ficha de Grupo + Combat Tracker).

Por enquanto, contém a **documentação de design** (fonte de verdade da UI) **e o
motor que a gera** a partir do plugin Obsidian `pleitost-autosheet`. Pensado pra
alimentar o **claude design**, recriar no Figma e guiar a construção do app —
sem perder nada do que existe hoje, e **regenerável** a qualquer momento.

## Estrutura

```
pleitost-app/
  package.json                 # workspaces (app) + scripts: gen, extract, dev, build, ...
  app/                         # O APP: PWA Vite+React (compêndio navegável — ver app/README.md)
  design/                      # round-trip com o Claude Design "Companion App" (ver design/README.md)
  extractor/                   # extração lossless da vault → vault-data/ (1 JSON por .md)
  vault-data/                  # saída do extractor (gitignored; regenerável: npm run extract)
  generator/                   # O MOTOR: gera a spec lendo o código do plugin
    gen-design-spec.mjs        #   entry
    collect.mjs, build.mjs, ast-helpers.mjs
    extract-*.mjs              #   um por camada/seção
    ingest-goldens.mjs
    capture-interactive.cjs    #   captura interativa (roda no Obsidian via CLI)
    tests/                     #   suíte de validação (referência — ver generator/README.md)
    README.md
  design-system/
    design-system.json         # ← A SPEC (feed pro claude design)
    README.md                  #   índice gerado do bundle
  reference/goldens/           # render real (input do motor): estáticos + interactive/
```

## A spec — `design-system/design-system.json`

JSON estruturado, lossless e determinístico:
- `tokens` — emojis (34 namespaces), cores (16 grupos), `emojiCostExtra`, tipografia.
- `dataModel` — modelo interno das fichas (23 interfaces, enums, jsdoc verbatim).
- `modes` — Resumo/Leitura (seções ordenadas + `hideWhenEmpty`/`noop`) e Editável (abas por família).
- `interativa` — grafo completo: 4 clusters, 29 losangos, estados (selected/dim/disabled
  com condição exata), clique→painel, pills de EM, fórmula da Vida, abas v2 ocultas.
- `components` — inventário (17 cards + 19 widgets): papel, props, `tokensUsed`, `iconSources`
  (ícone **inline** vs **supercharged**).
- `tooltips` — templates de breakdown e source.
- `grupo` / `combatTracker` — estrutura, tokens e ícones.
- `icons.supercharged` — mapa `data-link-* → ícone/cor` (com `matchOp` do seletor), cruzado por uid.
- `goldens` — render real destilado, incl. `goldens.interactive` (tooltips com valores reais + painéis pós-clique).
- `$gaps` — o que falta/é incerto, declarado (nunca chute silencioso).

## Regenerar

```bash
npm install        # uma vez (typescript + jsdom)
npm run gen        # lê a fonte do plugin + reference/goldens → escreve design-system/
```

O motor **lê o código do plugin por caminho** (`PLEITOST_PLUGIN_ROOT`, default = a vault
deste setup) — então a vault precisa existir no disco. Detalhes e captura interativa:
ver [`generator/README.md`](generator/README.md).

## Status

- ✅ Design system: spec completa e validada; motor runnable aqui.
- ✅ Extractor: vault inteira em JSON lossless (`npm run extract`).
- 🚧 App (`app/`): PWA com compêndio navegável sobre os dados reais
  (tipos, listas, docs com wikilinks/inline fields/imagens). Próximo:
  pull do design ("Companion App" no Claude Design) → home + theme.css,
  push de previews, e fichas nos milestones seguintes.
