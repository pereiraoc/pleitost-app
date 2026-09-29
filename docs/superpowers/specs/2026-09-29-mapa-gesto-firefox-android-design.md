# Mapa do mundo: gesto responsivo no Firefox Android — design (#573)

Data: 2026-09-29 · Issue: #573 · Estado: aprovado pelo usuário ("implementa tudo já direto e só vou ver bem no fim").

## 1. Problema

Relato: no celular e no tablet o mapa do mundo fantasia (/mapa e a aba EXPLORAÇÃO da ficha do grupo) está lento; pan e pinça por touch não seguem o dedo. No computador está bom.

Fato decisivo: todos os bug reports do usuário vindos de aparelho móvel têm user-agent **Firefox Android** (Gecko). Todo o trabalho do #572 foi medido só em Chromium emulado, onde o mapa já roda a 60 fps.

## 2. Causa medida

Bancada: build de produção (`vite preview`), Playwright Firefox 151 (mesma engine do celular) com o Gecko Profiler, e Chromium com trace (Pixel 7 emulado, CPU 4×). Sequência real de gestos: pinça → pan → pinça de volta → pan, duas vezes, 30 quadros por gesto, com `performance.mark` delimitando cada gesto. Variantes por CSS injetado isolam quem paga.

| Firefox, por gesto de 30 quadros | paint do conteúdo por quadro | rasterizações de blob (8 threads) |
|---|---|---|
| /mapa como está | 2,4 ms | ~280 |
| /mapa sem o `<image>` do overlay no SVG | 0,6 ms | 0 |
| /mapa em tela cheia | 3,4 ms | ~460 |
| Exploração como está | 5,0 ms | ~150 (grade: 57 ms por thread) |
| Exploração sem a grade hex | 2,0 ms | ~150 |
| Exploração sem SVG nenhum | 1,0 ms | 0 |

O Gecko não trata `style.transform` mudado por JS como animação do compositor: a cada quadro do gesto (pan inclusive) refaz o paint completo do subtree transformado e re-rasteriza como blob, na CPU, todo SVG com conteúdo raster ou pesado dentro dele. No desktop isso cabe em 16 ms; no celular (núcleos 4–5× mais lentos, DPR 2,6) não cabe. `will-change` não muda nada. Não há re-decodificação de imagem durante a pinça. Chromium mantém a camada composta e só aplica o transform na GPU (0 frames dropados a CPU 4×).

Culpados em ordem: (1) o `<image>` do overlay anti-spoiler clipado por polígono dentro do `<svg>` transformado (/mapa e Exploração); (2) a grade hex como `<path>` de 11k segmentos no mesmo SVG (Exploração e editor do Mundo Livre); (3) o paint completo por quadro, proporcional ao que está dentro do div.

## 3. Spikes que decidem o desenho

- **Transform por Web Animations (WAAPI)** no lugar de `style.transform`: o compositor do Gecko assume. /mapa: blobs 1688 → 36 por sequência, paint 2,4 → 1,2 ms/quadro, thread Renderer −80%. Exploração: blobs 916 → 18, worker de blob 57 → 2 ms. Vale até o zoom máximo (8×, 36 blobs) e em tela cheia (2767 → 303 blobs). **No Chromium a mesma receita piora** (commit por quadro, 1–3 frames dropados por gesto a CPU 4×): a estratégia tem que ser por motor.
- **Overlay assado num bitmap só** (canvas → `<img>`): blobs 0, paint 0,6 ms/quadro — o piso de "sem SVG". Overlay como `<img>` + `clip-path` CSS foi testado e descartado (o Gecko rasteriza a máscara por quadro).
- **Prefs do Gecko** (StaticPrefList.yaml): `layout.animation.prerender.partial` é **false** por padrão; o prerender completo exige área transformada ≤ (1,125 × maior lado da viewport)² e ≤ 4096 px por eixo. Ou seja, animação de compositor de elemento grande pode cair pra thread principal em algum aparelho/tamanho; por isso o assado e a grade em canvas ficam como segunda linha de defesa, independente de heurística.

Descartado por não servir ao objetivo: MapLibre/tiles (reescrita de quatro viewers e dez arquivos de teste, overlay anti-spoiler não nativo, offline com centenas de tiles; o ganho extra — zoom nítido a 8× no celular — não foi pedido). Fica como follow-up se o usuário quiser zoom nítido.

## 4. Desenho

Princípio: o subtree transformado tem que ser barato de repintar em qualquer motor, e o transform do gesto tem que chegar ao compositor pelo caminho que cada motor trata como assíncrono.

### 4.1 Driver de transform por motor (`app/src/map/transform-driver.ts`)

```ts
export interface TransformDriver {
  readonly nome: 'estilo' | 'compositor'
  aplicar(el: HTMLElement, v: MapView, o: { contraEscala: boolean }): void   // rAF do gesto
  encerrar(el: HTMLElement, v: MapView, o: { contraEscala: boolean }): void  // fim do gesto
  descartar(el: HTMLElement | null): void                                     // unmount
}
export function escolherDriver(pref: 'auto' | 'estilo' | 'compositor', amb = detectarAmbiente()): TransformDriver
```

- `estilo` = comportamento atual (escreve `style.transform`, `will-change: transform` durante o gesto). Chromium/WebKit e fallback.
- `compositor` = uma `Animation` por elemento (`WeakMap`), de duração infinita (`1e9` ms, `fill: forwards`), com keyframes CONSTANTES `[{transform: T}, {transform: T}]` trocados por `effect.setKeyframes` a cada quadro — o valor é T em qualquer progresso. **Nunca** `play()`/`currentTime = 0` por quadro: o primeiro corte fazia isso (reiniciando uma animação de 16 ms já terminada) e o compositor mostrava o mapa parado no ponto inicial durante todo o arraste, só pulando no soltar (relato do usuário no PC/Firefox e reproduzido: leitura imediata do transform computado dava 0 px com o dedo já a 150 px; com keyframes constantes, erro 0). `encerrar`: escreve `style.transform` final **antes** de `cancel()` (sem flash do transform antigo; um paint nítido na escala final). Só é escolhido se `el.animate` e `KeyframeEffect.prototype.setKeyframes` existem.
- `detectarAmbiente()`: Gecko = `/\bGecko\/\d/` no user-agent (Chromium/WebKit trazem "like Gecko", que não casa); Android = `/\bAndroid\b/`. `auto` só liga o compositor (e a grade em canvas, §4.4) em **Firefox Android** (`geckoMovel`): é onde o problema foi medido e relatado; no Firefox de desktop o estilo direto sempre foi "muito bom" (usuário) e a troca ali só somou risco — voltou ao caminho de antes (2026-09-29, depois do relato do PC). Único ponto de detecção de motor do app; a pref do modo debug permite A/B no aparelho (§4.5).
- `--map-escala` (contra-escala de rótulos) passa a ser escrita só quando o viewer pede (`useMapView({ contraEscala: true })`, MapaLocal): a var custa um restyle dos descendentes por quadro e /mapa, Exploração, editor e malha não a usam. Com `contraEscala` os DOIS drivers escrevem a var a cada quadro (os rótulos da POA continuam do tamanho certo durante o gesto, como hoje; o custo do restyle fica restrito a quem precisa).

### 4.2 useMapView

- `aplicarAoVivo` → rAF → `driver.aplicar`; `encerrarGesto` → `driver.encerrar` antes do `setView`; unmount → `driver.descartar`. O `useLayoutEffect` que reaplica o vivo depois de um render no meio do gesto chama `driver.aplicar` (com o compositor a animação já vence o inline style; é inofensivo).
- Novo `onQuadro(cb: (v: MapView) => void): () => void`: notificado depois de cada `aplicar`, de cada `commitView` (roda/botões/reset) e do `encerrar`. É o relógio da grade em canvas.
- Novo `geometriaBase(): Geo | null` (a mesma medida do `medirGeo`, exposta): caixa de layout do div do mapa antes do transform, em px da viewport.
- Log de debug `mapa/gesto` ganha `driver` e os toggles ativos.
- Contratos existentes preservados: `readLiveView`, `view` só sincroniza no fim, `consumeMoved`, pinça por touch nativo, testes `mapview-pinch-572` (jsdom não tem `animate` → driver `estilo`).

### 4.3 Overlay assado (`app/src/map/mapa-assado.ts`)

- Puro: `chaveDoAssado(srcMapa, srcOverlay, aneis)`; `desenharAssado(ctx, mapa, overlay, aneis, escala)`: desenha o mapa e, **por anel**, `save → beginPath → polígono → clip → drawImage(overlay) → restore` — a mesma semântica de união do `<clipPath>` com vários `<polygon>`; nada de even-odd. Anéis = `r.aneis ?? [r.pontos]`, em px da fonte × (bitmap ÷ fonte).
- Hook `useMapaAssado({ srcMapa, srcOverlay, fonteW, fonteH, aneis, ativo }) → { src: string | null }`: carrega as duas imagens (`Image` + `decode()`), canvas (`OffscreenCanvas` se houver) no tamanho natural do mapa carregado com teto de 4096 no lado maior (a média já tem ≤ 4000; em dev a cheia de 7440 é reduzida), codifica `image/webp` 0,9 (se o navegador devolver outro tipo, `image/jpeg` 0,92), `URL.createObjectURL`. Cache LRU de 3 por chave (revoga ao evictar); cancela ao trocar a chave; qualquer erro → `null`.
- Regra de segurança (anti-spoiler): enquanto `src` é `null`, o viewer mantém o overlay em SVG como hoje. O `<image>` do SVG só sai quando o bitmap assado está no `<img>`. Nunca há um quadro do mapa sem overlay.
- Viewers: AtlasMapaPage e PanelExploracao. `<img src={assado ?? média} data-mapa-assado>`; o `<svg>` fica só com vetor. Na Exploração o `<img>` continua posicionado pelo crop (o bitmap cobre o atlas inteiro, como a média). Editor do Mundo Livre não tem overlay.
- Contrato de teste: `[data-overlay-desabilitado]` continua existindo enquanto não há assado (em jsdom, sempre — os testes de gating atuais seguem válidos); o assado é testado em unidade com canvas falso que grava as chamadas (ordem mapa → clip por anel → overlay; chave; fallback de tipo; erro → null).

### 4.4 Grade hex em canvas de tela (`app/src/map/grade-tela.ts` + `GradeCanvas.tsx`)

- Puro (`grade-tela.ts`): `fonteParaTela(geo, view, fonte, p)` mapeia px da fonte (com crop) → px da viewport: `layoutLeft + tx + ((p.x − fonte.x) / fonte.w) · baseW · scale` (idem y); `retanguloFonteVisivel(geo, view, fonte)`; `celulasVisiveis(cells, vertices, retangulo)` com 1 hex de margem; `desenharGrade(ctx, dpr, geo, view, fonte, cells, vertices, estilo)` traça, por célula, as arestas v2→v3→v4→v5 (as mesmas do `hexGridPath`, cada aresta interna uma vez), `lineWidth` 1 px de tela.
- Componente `GradeCanvas({ map, fonte, cells, vertices, cor, alpha })`: `<canvas data-hexgrid data-grade-hexes={cells.length} aria-hidden>` absoluto cobrindo a viewport (a viewport ganha `position: relative`), `pointer-events: none`, fora do div transformado. Redesenha em rAF coalescido a cada `onQuadro`, mudança de `view`/`cells`/`fonte` e resize (`ResizeObserver` guardado). Cor: `--accent` resolvida por `getComputedStyle` + `globalAlpha` (15% normal, 34% em modo de marcação — os mesmos do SVG). Sem contexto 2D (jsdom) o elemento existe e não desenha.
- Viewers: PanelExploracao (`vistaGridCells(crop)` + `atlasHexVertices`) e HexMapEditor (`hexGridCells()` + `hexVertices`, fonte = imagem inteira). Hover, hexes com lugar, trilha, bolinhas, laço e seleção continuam em SVG (poucos nós).
- **Por motor, como o driver** (medido no build, 2026-09-29): no Chromium o canvas redesenhado a cada quadro custa `LayerTreeHost::DoUpdateLayers` (50–180 ms por gesto a CPU 4×) enquanto o path no SVG dentro da camada composta não custa nada por quadro — o inverso do Gecko. `escolherGrade('auto')` = canvas só no Firefox Android (mesma regra do driver), SVG no Firefox desktop e nos demais; `canvas`/`svg` forçam (A/B). Vértices e caixas das células são pré-computados uma vez por grade (`prepararGrade`), e a conta fonte→tela é afim fatorada fora do laço.
- Alinhamento é provado por teste, não a olho: para células amostrais, `fonteParaTela` tem que coincidir com o ponto que o SVG produziria (viewBox = crop → caixa do div → transform), em identidade, com pan, com zoom e com crop deslocado.
- Contrato de teste: `exploracao.test.tsx` cobre os dois caminhos — em jsdom (não-Gecko) `auto` mantém o `path[data-hexgrid]` com o `d` de `vistaGridPath(crop)`; forçando `canvas`, o canvas `[data-hexgrid]` com `data-grade-hexes = vistaGridCells(crop).length` no lugar do path.

### 4.5 Toggles de A/B no modo debug (`app/src/map/mapa-debug.ts`)

`localStorage['pleitost.debug.mapa']` = `{ driver: 'auto'|'estilo'|'compositor', assar: boolean, grade: 'auto'|'canvas'|'svg' }` (padrão auto / true / auto). UI no painel do modo debug do botão de bug (só aparece com o modo debug ligado). Todo log `mapa/gesto` carrega os três valores. É assim que o usuário compara no aparelho sem deploy novo.

### 4.6 Bancada reproduzível (`scripts/bench-mapa-gesto.mjs`, `scripts/bench-mapa-parse.mjs`)

Os scripts da investigação, limpos, no repo: sobem o build em `vite preview`, dirigem a sequência de gestos em Firefox (Gecko Profiler por `MOZ_PROFILER_STARTUP`) e Chromium (trace), e imprimem por gesto: paint por quadro, blobs, thread Renderer, frames dropados. Também tiram screenshot em repouso com overlay SVG e com overlay assado e medem a diferença de pixels (prova anti-vazamento). Não roda no CI; `npm run bench:mapa` documenta o uso.

## 5. Critérios de aceite

1. `tsc -b`, `vitest run` (exit code, com pipefail) e `vite build` verdes.
2. Bancada no build: Firefox /mapa e Exploração — blobs por sequência ≤ 60 e paint por quadro ≤ 1,5 ms nos gestos 2–6; Chromium (Pixel 7, CPU 4×) — 0 frames dropados nos gestos 2–6. Comparação anti-vazamento: overlay assado × SVG em repouso com < 0,5% de pixels diferentes. **E o que o compositor mostra:** leitura do transform computado logo depois do rAF do hook, a cada quadro do arraste, tem que bater com o alvo (erro 0 px) — o perfil não vê uma animação que fica parada no valor de partida.
3. Sem regressão de comportamento: clique em hex/pino, barra de info, gating por grupo, laço e arraste no editor, wheel/botões/reset, tela cheia, POA (MapaLocal com contra-escala) — cobertos pelos testes existentes.
4. Deploy no GitHub Pages; validação final no aparelho pelo usuário com o modo debug (gesto: `gapMax`, `quadros`, `driver`). A PWA só atualiza depois de "Recarregar" no toast.

## 6. Fora de escopo

MapLibre/tiles e zoom nítido acima da média de 4000 px; redesenho da contra-escala de rótulos da POA; medição da POA no Gecko.

## 7. Resultado medido no build (2026-09-29, bancada §4.6)

| Firefox, por gesto de 30 quadros | antes (A/B: estilo + SVG) | depois (padrão) |
|---|---|---|
| /mapa: paint por quadro · blobs | 1,7–2,4 ms · 174–345 | 0,6–0,7 ms · 0 |
| /mapa: thread Renderer (headless = WebRender por software) | 95–140 ms | 72–87 ms |
| Exploração: paint por quadro · blobs | 2,0–4,8 ms · 123–186 | 0,8–1,1 ms · 0–96 (vetores miúdos do SVG na pinça; worker ≤ 2 ms) |
| Exploração: pior worker de blob | 19–75 ms | 0–2 ms |
| /mapa tela cheia · zoom 8× | — | 0,6–0,7 ms · 0 blobs |

Chromium (Pixel 7 emulado, CPU 4×): 0 frames dropados nos gestos 2–6 no /mapa e na Exploração (1 na primeira pinça = decode inicial, igual a antes). Diff de pixels overlay assado × SVG em repouso: 5 em 1,59 milhão. Arraste no Firefox lido quadro a quadro no build publicado (driver sem reinício): erro 0 px contra o alvo. Números medidos com o driver definitivo (commit eb44b69b); a primeira versão, que reiniciava a animação por quadro, dava Renderer 4–11 ms justamente porque o compositor ficava parado no ponto inicial.
