# generator/ — o motor do design-system

Gera `../design-system/design-system.json` (a spec lossless) lendo a **fonte de
verdade do plugin** `pleitost-autosheet` (registries, `model.ts`, árvore de
render, docs) + os **goldens** em `../reference/goldens/` (render real).

## Rodar

```bash
# na raiz do pleitost-app:
npm install          # uma vez (typescript + jsdom)
npm run gen          # gera design-system/design-system.json + README.md
```

Config (env, opcionais):
- `PLEITOST_PLUGIN_ROOT` — raiz do plugin. Default: o caminho deste setup
  (`/data/vaults/pleitost/.obsidian/plugins/pleitost-autosheet`). **A vault
  precisa existir no disco** — o motor lê o código do plugin por caminho.
- `GEN_DESIGN_SPEC_OUT` — pasta de saída. Default: `../design-system`.

Determinístico: mesma fonte → mesmo `design-system.json` (chaves ordenadas, sem
timestamp; `$sourceCommit` registra o commit do plugin lido).

## Arquivos

- `gen-design-spec.mjs` — entry (orquestra, escreve a saída).
- `collect.mjs` — junta todos os extratores + agrega `$gaps`.
- `ast-helpers.mjs` — utilitários da TS Compiler API (eval de literais, etc.).
- `extract-*.mjs` — um por camada/seção: tokens, data-model, modes, components,
  interativa, tooltips, grupo, combat-tracker, supercharged, fold-docs.
- `ingest-goldens.mjs` — lê os goldens (render real) e destila os fatos.
- `build.mjs` — assembleia + serialização determinística.
- `capture-interactive.cjs` — captura os estados interativos (tooltips/painéis)
  **dirigindo o DOM vivo do Obsidian via CLI** (não muta a ficha). Uso:
  ```bash
  export XDG_RUNTIME_DIR=/run/user/1000/.flatpak/md.obsidian.Obsidian/xdg-run
  obsidian open file="GOLDEN Bardo"
  obsidian eval code='(async()=>{const P="<abs>/generator/capture-interactive.cjs";
    delete require.cache[require.resolve(P)];
    return await require(P).captureCurrent(app,{slug:"golden-bardo",
      outDir:"<abs>/reference/goldens/interactive"});})()'
  ```
  (Repita por fixture; os goldens estáticos vêm do comando "Capturar goldens" do plugin.)

## tests/ — suíte de validação (referência)

Carregada do plugin; documenta os invariantes do gerador (cobertura, sem strings
inventadas, `$gaps` reais, etc.). Os imports dos módulos do gerador já são locais
(`../*.mjs`), mas os testes também importam a **fonte do plugin**
(`../../src/...`: EMOJI/PALETTE/CUSTO_EXTRA, fixtures, source-tooltip). Pra
executá-los é preciso o `src/` do plugin acessível nesse caminho relativo + um
mock de `obsidian` + vitest — i.e., o ambiente de teste do plugin. Mantidos aqui
como **referência** dos invariantes, não como suíte rodável out-of-the-box.
