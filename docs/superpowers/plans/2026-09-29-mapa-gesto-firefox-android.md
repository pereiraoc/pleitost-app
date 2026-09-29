# Plano de implementação — mapa responsivo no Firefox Android (#573)

Spec: `docs/superpowers/specs/2026-09-29-mapa-gesto-firefox-android-design.md`. Regras do repo que valem aqui: TDD (teste que falha antes do código), gate de deploy pelo exit code do vitest (pipefail), auto-deploy do pleitost-app ao fim de lote verde, nunca `git add -A` (vault-data é symlink), commits com `Refs #573` e o último com `Fixes #573`.

Cada tarefa: escrever o teste → ver falhar → implementar → ver passar → `tsc -b` → commit.

## T1 — Driver de transform por motor

Arquivos: `app/src/map/transform-driver.ts` (novo), `app/src/map/useMapView.ts`, `app/tests/transform-driver.test.ts` (novo), `app/tests/mapview-pinch-572.test.tsx` (ajuste).

Testes (jsdom):
1. `detectarAmbiente` — UA do Firefox Android ("Gecko/156.0 Firefox/156.0") → gecko; UA do Chrome Android ("(KHTML, like Gecko)") → não; UA do Safari iOS → não.
2. `escolherDriver('auto', {gecko:true})` → compositor quando `el.animate` existe; `estilo` sem `animate` (jsdom) e com pref `'estilo'`; `'compositor'` forçado sem `animate` cai em `estilo`.
3. Driver compositor com `animate` falso (registra `animate`, `setKeyframes`, `play`, `cancel`, `currentTime`): 1ª aplicação cria a animação com `[{transform:'translate(1px, 2px) scale(3)'}]`, `fill:'forwards'`; 2ª aplicação faz `setKeyframes` + `currentTime=0` + `play` no MESMO objeto; `encerrar` escreve `style.transform` final e SÓ DEPOIS `cancel`; `descartar` cancela; com `contraEscala` escreve `--map-escala` a cada `aplicar` e no `encerrar` (mesma regra do driver estilo); sem `contraEscala` nunca toca na var.
4. Driver estilo: comportamento atual (transform + will-change no aplicar; limpa will-change no encerrar; `--map-escala` a cada aplicar só com `contraEscala`).
5. useMapView: `onQuadro` recebe a view a cada rAF do gesto, no `zoomBy` e no fim do gesto; `useMapView()` sem opção NÃO escreve `--map-escala`; `useMapView({contraEscala:true})` escreve (o teste 572 que lia a var passa a montar com a opção).

Implementação: driver estilo = extração 1:1 do que o hook faz hoje; hook delega; MapaLocal passa `{ contraEscala: true }`; log `mapa/gesto` ganha `driver`.

Commit: `perf(mapa): transform do gesto pelo compositor no Gecko (WAAPI), estilo direto nos demais motores (Refs #573)`.

## T2 — Overlay assado

Arquivos: `app/src/map/mapa-assado.ts` (novo), `app/tests/mapa-assado.test.ts` (novo), `app/src/components/compendium/AtlasMapaPage.tsx`, `app/src/grupo/PanelExploracao.tsx`, `app/tests/atlas-mapa-regioes.test.tsx` e `app/tests/exploracao-gating-jogador.test.tsx` (só confirmar que seguem verdes).

Testes:
1. `chaveDoAssado` muda com src do mapa, do overlay e com os anéis (ordem dos pontos conta); igual pra entradas iguais.
2. `desenharAssado` com contexto falso: chamadas na ordem `drawImage(mapa)`, depois por anel `save, beginPath, moveTo/lineTo… (escalados por bitmap÷fonte), closePath, clip, drawImage(overlay), restore`; dois anéis → dois blocos; nenhum `fill`.
3. `tamanhoDoAssado(naturalW, naturalH)`: ≤ 4096 no lado maior, proporção preservada (7440×5262 → 4096×2897; 4000×2829 → igual).
4. `useMapaAssado` com `Image`, canvas e `createObjectURL` falsos: `ativo:false` → `src null` sem carregar nada; ativo → carrega as duas imagens, desenha, codifica webp, entrega `blob:` URL; tipo devolvido `image/png` → recodifica jpeg; erro de carga → `null`; trocar anéis → nova chave, novo URL, o anterior revogado depois de 3 chaves; desmontar cancela.
5. Integração (AtlasMapaPage em jsdom, sem canvas): com regiões desabilitadas o `[data-overlay-desabilitado]` continua no SVG e o `<img>` não tem `data-mapa-assado` (o assado nunca fica pronto sem canvas) — prova a regra "sem quadro sem overlay".

Commit: `perf(mapa): overlay anti-spoiler assado num bitmap só; o SVG do mapa fica só com vetor (Refs #573)`.

## T3 — Grade hex em canvas de tela

Arquivos: `app/src/map/grade-tela.ts` (novo), `app/src/map/GradeCanvas.tsx` (novo), `app/tests/grade-tela.test.ts` (novo), `app/src/grupo/PanelExploracao.tsx`, `app/src/components/compendium/HexMapEditor.tsx`, `app/tests/exploracao.test.tsx` (contrato da grade), `app/src/map/useMapView.ts` (`geometriaBase`).

Testes:
1. `fonteParaTela` = ponto que o SVG produziria: para geo {layoutLeft:20, layoutTop:0, baseW:800, baseH:600}, crop {x:1000,y:500,w:2000,h:1500} e view identidade, o canto do crop cai em (20,0) e o canto oposto em (820,600); com view {scale:2,tx:-100,ty:-50} o centro do crop cai em (20−100+800, 0−50+600); com crop inteiro (0,0,W,H) coincide com `p.x/W·baseW·scale + tx + layoutLeft`.
2. `retanguloFonteVisivel` inverte a viewport (0,0)-(vpW,vpH) pra px da fonte, clampado ao crop.
3. `celulasVisiveis` inclui só células cujos vértices tocam o retângulo (+1 hex de margem) e exclui as de fora; grade inteira em identidade → todas as células do crop.
4. `desenharGrade` com contexto falso: `setTransform(dpr,…)`, `lineWidth 1`, por célula `moveTo(v2) lineTo(v3) lineTo(v4) lineTo(v5)` em coordenadas de tela, um `stroke` só; `globalAlpha` = alpha pedido.
5. GradeCanvas em jsdom: renderiza `<canvas data-hexgrid data-grade-hexes=N>` sem estourar quando `getContext` devolve null; com `map.onQuadro` falso, uma notificação agenda um redesenho (rAF falso) e chama `desenharGrade` uma vez por quadro mesmo com várias notificações.
6. `exploracao.test.tsx`: `[data-hexgrid]` é canvas com `data-grade-hexes = vistaGridCells(crop).length`; não existe `path[data-hexgrid]`; o viewBox do SVG continua igual ao crop.

Commit: `perf(mapa): grade hex e trilha do hexcrawl desenhadas em canvas de tela, fora do div transformado (Refs #573)`.

## T4 — Toggles de A/B no modo debug + log

Arquivos: `app/src/map/mapa-debug.ts` (novo), `app/tests/mapa-debug.test.ts` (novo), `app/src/components/layout/BugReportButton.tsx`, `useMapView` (usa a pref do driver), viewers (usam `assar`/`grade`).

Testes: leitura tolerante (chave ausente/corrompida → padrões), gravação dispara evento e o hook `useMapaDebug` re-renderiza; `escolherDriver` respeita a pref; log de gesto traz `driver`, `assar`, `grade`.

Commit: `feat(debug): toggles do mapa (driver, overlay assado, grade) no modo debug e no log de gesto (Refs #573)`.

## T5 — Bancada no repo

Arquivos: `scripts/bench-mapa-gesto.mjs`, `scripts/bench-mapa-parse.mjs`, `package.json` (`bench:mapa`), `docs/superpowers/specs/…design.md` (§4.6 já descreve).

Sem teste unitário (é ferramenta de dev). Verificação: rodar contra o build e comparar com a tabela do spec. Inclui a comparação de pixels overlay SVG × assado.

Commit: `chore(bench): bancada de gesto do mapa em Firefox (Gecko Profiler) e Chromium (Refs #573)`.

## T6 — Verificação final e deploy

1. `cd app && npx tsc -b && npx vitest run` (pipefail) e `npm run build` na raiz com `VITE_BASE=/pleitost-app/`.
2. `npm run bench:mapa` no build: critérios do spec §5.2.
3. Screenshot em repouso /mapa e Exploração (Chromium) — conferir visualmente overlay e grade nos PNGs.
4. `git status` limpo de `vault-data`; push main; `npm run deploy`.
5. Comentar na issue #573 com a tabela antes/depois e o passo de validação no aparelho; último commit `Fixes #573`.
