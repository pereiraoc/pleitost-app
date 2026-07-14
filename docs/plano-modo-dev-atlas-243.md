# Plano — Épico #243, fases restantes (F8 infra dev · F9 editor · F6 Atlas)

Refinado com as decisões do usuário (2026-07-14). Fases anteriores (F0–F5, F7 +
cobertura de Condição #260 + ignore-null #261) já shipadas e no ar.

## Restrições que moldam tudo (decisões do usuário)

1. **Round-trip com Obsidian nos DOIS sentidos.** "Não quero que tu faça de uma
   forma que eu não consiga extrair do obsidian e jogar de volta pra cá também."
   Não estamos abandonando 100% o Obsidian ainda. Logo: `npm run extract`
   (Obsidian→app) continua a fonte, E precisa existir **export (app→Obsidian)**
   que reconstrói `.md` a partir de base+edição pra colar na vault.
2. **Local até publicar.** "No modo dev tu vai poder publicar as alterações em um
   lugar, e aí o pessoal receberia as atualizações; até publicar fica tudo
   realmente local." → edições NÃO são auto-compartilhadas: ficam locais (só o
   editor) até um **Publicar** explícito mandar pro Supabase; aí os jogadores
   recebem (realtime).
3. **Vault READ-ONLY pro app** em todos os cenários (o app nunca escreve na
   vault; o export gera arquivos que o usuário aplica).
4. **Nunca duplicar a gramática de regras.** Reusar o parser do plugin
   (read-only), como o extractor já faz.
5. **Mapa-raiz do Atlas ainda não existe** ("vai existir") → F6 constrói o slot
   do mapa de forma graceful; a raiz entra quando o mapa existir.

## Princípio central: overlay no choke-point único (`loadDoc`)

Toda view lê por `loadDoc(id)` (data/useDoc.ts). Aplicando o overlay ali, TODA
tela mostra o conteúdo editado sem tocar view nenhuma. Três camadas fundidas:

```
effectiveDoc(id) =
  applyOverlay(
    vaultDoc(id),          // 1. base read-only (extract do Obsidian)
    publishedOverlay(id),  // 2. Supabase doc_overlays — compartilhado, realtime
    localDraft(id),        // 3. rascunho deste device — só modo dev, até publicar
  )
```

- **Jogador comum:** base ⊕ publicado.
- **Editor (modo dev):** base ⊕ publicado ⊕ rascunho local (local vence).
- `applyOverlay` é puro e testável: patch parcial de `VaultDoc`
  (`{frontmatter?, body?, ruleElements?, inlineFields?}`); `ruleElements`
  substitui o array. A vault-data nunca muda.

## F8 (#252) — infra do modo dev + persistência

- **`gen-parsers.mjs` (build-step) → `src/generated/`**: transpila
  `rule-parser.ts` + `parse-condition-rule.ts` + `display-names.ts` da
  fonte-de-verdade (plugin) pro bundle. É o MESMO reuso do extractor, agora no
  browser — habilita a validação viva da F9 sem reimplementar a DSL.
- **`local-draft-store.ts`** (IndexedDB/localStorage): rascunhos deste device.
  `useSyncExternalStore` (padrão settings/theme). Só aplicado se `desenvolvedor`.
- **`published-overlay-store.ts`** (Supabase `doc_overlays` + realtime): overlay
  compartilhado. Tabela: `id text PK, patch jsonb, updated_at, updated_by`; RLS
  leitura pública, escrita autenticada (auth do session-repo já existe).
- **`applyOverlay` + integração no `loadDoc`** (único ponto). Testes: projeta
  editado; sem overlay = idêntico ao base.
- **Publicar**: ação que empurra rascunhos locais → Supabase; jogadores recebem.
- **Exportar pro Obsidian**: reconstrói `.md` (frontmatter + body) de base+overlay
  por doc editado — fecha o round-trip. (vault-data é lossless → fiel.)
- **Flag** `pleitost.settings.desenvolvedor` (sem UI de ativação por ora): só
  libera as afordâncias de edição; leitura de overlay publicado é sempre on.

Commits: (a) migration `doc_overlays`+RLS; (b) gen-parsers+generated; (c)
local-draft-store; (d) published-overlay-store+realtime; (e) applyOverlay +
loadDoc + testes; (f) Publicar; (g) Exportar pro Obsidian + teste round-trip.

## F9 (#253) — editor (depende de F8)

- Editor in-place de elemento de regra no painel F7: textarea por linha →
  re-parse ao vivo (parser bundlado, genérico + condição) → **erro de sintaxe
  bloqueia salvar** (reusa `elementIssues`) → salva em rascunho local.
- **Preview de impacto**: re-projeta um herói de teste com o elemento editado.
- Editor de texto/FM das views (Atlas/Aventura/História) → rascunho local;
  derivados (inlineFields/links) re-derivados pelos parsers puros (mjs) bundlados.

Commits: (a) editor rule-element + validação viva; (b) preview de impacto; (c)
editor texto/FM. DoD: teste de tela — erro → mensagem; corrigir → salva e a
projeção muda.

## F6 (#250) — Atlas (mapa-raiz pendente)

`LugarView` 3 zonas: **breadcrumb** (cadeia `Geolocalização` do FM) · **mapa**
(reusa exploracao.ts + region-maps.ts + HexMapEditor; lugares clicáveis trocam o
foco) · **infos** (nota do lugar + Comércio/loja #72 do LocationSheet). Lugar sem
mapa próprio → **só breadcrumb + infos** (escolha do usuário). Mapa-raiz não
existe ainda → zona do mapa graceful (placeholder / sub-mapas disponíveis) até a
raiz existir; slot pluggable em region-maps.

Commits: (a) inventário de mapas + region-maps; (b) LugarView 3 zonas +
navegação + breadcrumb; (c) fallback sem-mapa. DoD: teste navegando Mundo →
região → cidade e voltando pelo breadcrumb.

## Ordem de execução

F8 (infra, desbloqueia F9) → F9 (editor) → F6 (Atlas; parcialmente à espera do
mapa-raiz, mas a estrutura e o fallback já entregam valor). Cada fase shipada em
incrementos verificados (TDD + build + deploy), validação visual antes de
consolidar.
