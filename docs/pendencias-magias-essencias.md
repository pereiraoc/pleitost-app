# Pendências — magias de essências / escolhas (checkpoint 2026-07-12, ATUALIZADO)

Estado: **TODOS os bugs desta frente estão RESOLVIDOS no working tree, NÃO
COMMITADO** (aguardando validação visual do usuário). Suíte: **496 verdes**,
`tsc -b` e `npm run build` limpos.

## Resolvidos nesta retomada

### 1. Bug #4c — magias não aparecem AO VIVO no Animista criado no app ✅
- Causa: `useHeroRefs.collectTargets` coletava wikilinks do FM CRU do doc —
  itens concedidos por regra (só no derivedFm) nunca carregavam e o
  MagiasHabPanel não resolvia o rank deles (linha sumia).
- Fix: `FichaPage` monta model+rules e passa `rules?.derivedFm ?? model.fm`
  pro `useHeroRefs(doc, fmEffective)`; collectTargets também varre
  `Magias.Secundaria.Lista`. E2E `tests/animista-local-e2e.test.tsx` verde.

### 2. Bug #4d — dropdowns de essência: spread + repetição ✅
- (a) Spread: DIVERGÊNCIA CONSCIENTE do plugin em
  `resolve-choices.ts:resolveChoice` — escolha IRMÃ (occurrenceWithinParent
  definido) sem tag da própria ocorrência fica VAZIA (sem fallback 2b nem
  default options[0]; no plugin o default é transitório porque o save
  consolida — o app não salva defaults). Escolhas ÚNICAS mantêm 2b+default.
- (b) Opção pega some das irmãs: `choiceOptionsSiblingAware` (HabilidadesTab)
  filtra opções escolhidas pelas outras ocorrências + opção vazia '—' no topo.
- Teste: `animista-local-e2e.test.tsx` ("dropdowns irmãos nascem VAZIOS…").

### 3. Bug #5 — Elementalista: filtro de linhagem nas Experientes ✅
- Nem o plugin nem os dados tinham o requisito explícito; implementado filtro
  DATA-DRIVEN (sem parse de nome): linha da essência = PASTA da vault
  (`Essência Flamejante/{base, Adepta, Experiente}`) + `rank::` da nota.
  Opção Experiente exige irmã Adepta possuída na mesma pasta; Mestre exige
  Experiente; opções sem rank (Treinamentos) ficam livres.
- Onde: `extract.ts` anota `optionsMeta` (pasta+rank via resolver);
  `projection.ts:filterChoiceOptionsByLineage` filtra com possuídas
  (salvas + concedidas). Teste: `tests/elementalista-filtro.test.ts`.

## Feito nesta frente (não commitado, user validou só o #1)

- **Bug #1** ✓ validado — escolha de `Escolha_Habilidades` cuja fonte é TÉCNICA
  renderiza no painel de Técnicas (picker de Treinamento de Classe Secundária).
  `HabilidadesTab.tsx` (TecnicasPanel) + `tests/tecnica-choice.test.tsx`.
- **Bug #4** — essências plenas: `Complementar Magias.Lista` com fonte por item
  (rule-applier) + `distributeMagiasCalculated` (projection.ts) distribui o
  delta plano por escola (subcategoria da nota → escola; Arcana roteia
  Negra/Branca/prof). `tests/magias-essencia.test.ts`.
- **Bug #4b** — essências Menores (multiclass): cadeia `Magias.Secundaria`
  inteira (applier byListItem, merge handlers escola/Potencia/EM/Slots,
  distribuição, card "Magias Secundárias" no MagiasHabPanel parametrizado
  `sec` com gate hasMagiasContent) + destrave: pick de escolha COM escolhas
  próprias não é mais pulado da árvore (habTree). `tests/magias-secundaria.test.ts`
  + `tests/magias-secundaria-ui.test.tsx`.

## Outras pendências antigas (fora desta frente)

- #101 servidor/sessão — **avisar o user antes** (ele quer trocar pro Fable).
- #126 Combate "Identificar Magia" renderiza estranho (user disse que parou de
  acontecer — descopado, confirmar antes de fechar).
- #142 aguardando print do user; #159 roadmap tracker.
- Flake: `tests/inventario.test.tsx` ("tier seta a Obra-prima…") falha
  intermitente por ORDEM da suíte; passa isolado e em re-runs. Investigar
  poluição de estado entre arquivos (candidato: localStorage/módulo singleton).

## Como retomar

```bash
cd /data/projects/pleitost-app/app
npx vitest run          # 496 verdes
npx tsc -b && npm run build
```
Commit pendente de: validação visual do user (#4/#4b/#4c/#4d/#5 + bug #1 já
validado). Depois, ciclo de release normal.
