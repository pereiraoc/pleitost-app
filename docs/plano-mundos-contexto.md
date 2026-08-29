# Mundos por Contexto (Fantasia | Cyberpunk POA 1987) — plano de implementação v3

> Pedido (2026-08-27/28): o CONTEXTO do config vira um MUNDO completo —
> sessões, heróis, conteúdo, imagens e mapa próprios; trocar contexto
> desconecta a sessão ativa. Cenário: **Porto Alegre 1987**
> (`/data/vaults/POA 1987/`). A vault POA vira **fork git do pleitost-vault**
> pra puxar updates da fantasia e evoluir separada.
> Decisões já tomadas: cyberpunk pré-dataset = funcional (fallback + banner);
> imagem sem versão cyberpunk usa a da fantasia.

## 1. Princípio

**Um eixo `world` derivado do contexto do tema, com FALLBACK em camadas:**

```
conteúdo efetivo (cyberpunk) =
  vault-data-cyberpunk/ (extract completo da vault POA 1987)
  ⊕ fallback fantasia por rel (doc/imagem ausente no dataset do mundo)
  ⊕ overrides publicados do mundo (ajuste fino via overlay #243, opcional)
```

Cada superfície consulta o mundo num ponto de costura único; conteúdo entra
como dados. `world.ts` + `world-dataset.ts` (já rascunhados): `WorldId`,
`activeWorld()`/`useWorld()` derivados de `theme.context`, `onWorldChange()`,
e o registro de rels do dataset do mundo que o `vaultUrl` consulta.

## 2. F0 — Fork git da vault POA 1987 (pré-requisito de tudo)

A pleitost é git (remote `sfynz/pleitost.git`, .git 591MB). A POA não tem git.
**Fork com HISTÓRIA COMPARTILHADA** (merge 3-way real ao puxar updates):

1. `git clone /data/vaults/pleitost <tmp>` (local, hardlinks — barato).
2. No clone: remote `upstream` → `https://github.com/sfynz/pleitost.git`
   (origin fica pro repo próprio da POA quando existir).
3. Substituir o working tree pelo conteúdo ATUAL da POA 1987 (rm tracked +
   copiar; preservar o `.obsidian/` da POA — os itens sensíveis já estão no
   .gitignore herdado) e commit único `fork: Porto Alegre 1987`.
4. Trocar os diretórios: `/data/vaults/POA 1987` passa a ser o clone.
5. Update flow: `git fetch upstream && git merge upstream/main` — mudanças da
   fantasia em `Sistema/` entram de graça onde a POA não divergiu; onde os
   DOIS mexeram (classe renomeada etc.) dá conflito — que é a semântica certa
   (decisão humana). Atlas/Contexto/heróis da fantasia foram deletados no fork
   → updates deles chegam como modify/delete, resolve-se com `git rm` (ruído
   conhecido, documentado no README do fork).

Por que história compartilhada e não repo novo: o Sistema da POA é CÓPIA
byte-idêntica do da pleitost de hoje (verificado) — o merge-base perfeito.
Sem isso, todo update da fantasia seria copy-paste manual.

**Renomes de classes** (Compiladão.md §Classes: Sabotador, Hacker, Ressonante,
Nóia, Pirata, Agente, Estrategista, Guerrilheiro, Meliante, Artista Marcial —
10 pra 10): fazer NA VAULT via Obsidian (rename propaga wikilinks) DEPOIS do
fork (git dá rede de segurança). Falta o usuário definir o MAPEAMENTO
fantasia→cyberpunk de cada classe.

## 3. As superfícies e o ponto de costura

| Superfície | Costura |
|---|---|
| **Conteúdo/catálogo** | `vaultUrl(rel)` consulta o registro do dataset do mundo: rel presente → `vault-data-cyberpunk/`; ausente → `vault-data/` (fallback, vale pra docs E imagens). `CatalogProvider` carrega o manifest do mundo (união com fantasia) e REMONTA na troca (`key={world}`); dataset ausente → catálogo fantasia + banner "dataset em preparação". |
| **Heróis locais** | `StoredEntity.world` (ausente = fantasia); criação grava o mundo ativo; listagens filtram. |
| **Sessões** | `sessions.state.world` na criação; listagem/entrada filtram; `onWorldChange` limpa `pleitost.sessaoAtiva` + unsubscribe dos channels realtime. |
| **Mapa** | chaves `pleitost.hexMap.<world>.*` (legado = fantasia); mapa cyberpunk = `Mapa de Porto Alegre RPG.png` + Atlas POA (leitores de raiz já são genéricos — verificado). |
| **Imagens** | mesmo registro do vaultUrl (fallback fantasia — decisão do usuário). |
| **Overrides (opcional)** | `doc_overlays` ganha escopo `world` (registros antigos = fantasia); `disabled` filtra do catálogo; editor só em modo dev. |
| **Modo dev** | já existe (#243); falta ativação por SENHA no Config (hash client-side = gate de UI; segurança real = auth Supabase nas escritas) + editor de overrides. |

## 4. Gaps encontrados na revisão (e tratamento)

- **G1 · Sincronização do contexto entre devices**: `pleitost.theme` sincroniza
  por conta — trocar de mundo no celular trocaria no desktop e DESCONECTARIA a
  sessão de lá. Proposta: **`context` vira local-do-device** (sai do payload
  sincado do tema; os outros eixos seguem sincando). PRECISA DE DECISÃO.
- **G2 · Service worker/cache**: bucket único 'vault-data' + stamp
  `db-version.json`. Tratar: regra de runtime-caching pro
  `vault-data-cyberpunk/*` + stamp por mundo (`pleitost.dbVersionVista.<world>`)
  + purge por mundo.
- **G3 · Deploy**: `scripts/deploy-pages.sh` trata vault-data especialmente —
  incluir `vault-data-cyberpunk/` no mesmo tratamento.
- **G4 · Caches de módulo** (assets.ts indexPromise, links.ts edgesPromise):
  resetar em `onWorldChange` (ou keyar por mundo).
- **G5 · Plugin na POA**: pro Obsidian da POA editar fichas, o autosheet
  precisa estar na `.obsidian` de lá (passo manual do usuário; symlink de
  node_modules NUNCA — regra da casa).
- **G6 · extract:cyberpunk**: envs já existem (`PLEITOST_VAULT_ROOT`,
  `PLEITOST_EXTRACT_OUT`, `PLEITOST_PLUGIN_ROOT`→pleitost); path com espaço →
  script quoted.
- **G7 · Testes**: default fantasia; suíte atual roda inalterada (world só
  muda por opt-in do teste). Invariante final: fluxo fantasia byte-idêntico.

## 5. Fases de implementação (cada uma shippável, fantasia sempre verde)

| # | Entrega |
|---|---|
| F0 | Fork git da POA 1987 (história compartilhada + upstream) + README do update-flow |
| C1 | `world.ts`/`world-dataset.ts` + testes (já rascunhados) |
| C2 | `vaultUrl` via registro + CatalogProvider por mundo (união/fallback/banner) + reset de caches de módulo (G4) + SW/stamp por mundo (G2) |
| C3 | `StoredEntity.world` + criação/listagem filtradas |
| C4 | Sessões: world na criação, filtro, desconexão limpa na troca (G1 conforme decisão) |
| C5 | hexMap por mundo + mapa Porto Alegre |
| C6 | Modo dev por senha no Config |
| C7 | Overrides por mundo (`doc_overlays.world` + `disabled` + editor em modo dev) |
| C8 | `extract:cyberpunk` + deploy do dataset (G3, G6) |
| C9 | Invariantes: fantasia byte-idêntica; suíte de mundo |

## 6. Decisões pendentes do usuário

1. **G1**: contexto/mundo sincroniza entre devices (comportamento atual do
   tema) ou vira preferência POR DEVICE (recomendado — trocar de mundo no
   celular não desconecta a sessão do desktop)?
2. **Fork remoto**: criar repo GitHub pra POA (qual conta/nome — sfynz como a
   pleitost?) ou por ora só git local com upstream no GitHub da pleitost?
3. **Mapeamento das classes** fantasia→cyberpunk (Compiladão lista as 10 novas
   com atributos, mas não diz qual vira qual).
