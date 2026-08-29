# Mundos por Contexto (Fantasia | Cyberpunk POA 1987) — infraestrutura

> Pedido (2026-08-27): o CONTEXTO do config deixa de ser só vibe/fontes e vira
> um **mundo completo** — sessões, heróis, conteúdo, imagens e mapa próprios.
> Trocar contexto ≈ entrar em outra versão do app; sessão ativa desconecta.
> Cenário cyberpunk: **Porto Alegre 1987** (vault `/data/vaults/POA 1987/`).
> Decisões do usuário: cyberpunk ANTES do conteúdo = funcional com catálogo
> vazio/banner; **imagem sem versão cyberpunk cai na da fantasia**.

## 1. Princípio

**Um eixo `world` derivado do contexto do tema, com FALLBACK em camadas:**

```
conteúdo efetivo (cyberpunk) =
  dataset cyberpunk (só o que é REALMENTE diferente: Atlas/Contexto/imagens)
  ⊕ fallback fantasia (tudo que o cyberpunk não redefine — inclusive imagens)
  ⊕ overrides do mundo (renomes/desabilitações/re-descrições, editados no
    modo dev e publicados via a infra de overlay JÁ EXISTENTE do #243)
```

Cada superfície consulta o mundo num único ponto de costura; conteúdo novo
entra como dados, nunca como código.

- `world.ts` (novo): `WorldId = 'fantasia' | 'cyberpunk'`; `activeWorld()` /
  `useWorld()` derivados de `theme.context`; `onWorldChange(cb)`.
- Fantasia = default e formato legado (dado sem marca de mundo = fantasia).

## 2. Organização das VAULTS (proposta)

**Duas vaults, cada uma coerente pro Obsidian; o app funde por fallback:**

1. **pleitost (atual)** — intocada, segue 100% fantasia. Nenhuma pasta
   cyberpunk dentro dela: colidiria basenames de wikilink (classes renomeadas),
   sujaria os dataviews/QuickAdd e arriscaria o plugin.
2. **POA 1987** — vira a fonte SÓ de **Atlas + Contexto + mídia curada** do
   cyberpunk. O `Sistema/` antigo (953 md, sistema defasado) fica FORA do
   extract (ignore list) — não é migrado nem apagado; o Obsidian da vault segue
   funcionando como está.
3. **Sistema cyberpunk NÃO vive em vault nenhuma por ora**: deriva do sistema
   fantasia via OVERRIDES por mundo (renomear/desabilitar/re-descrever armas,
   equipamentos, tesouros, consumíveis, classes…) editados no app em modo dev
   e publicados no Supabase. Quando/SE o cyberpunk ganhar notas de sistema
   próprias na vault, elas entram no dataset e vencem o fallback — o formato já
   está pronto.

Compatibilidade verificada: as notas de Atlas da POA 1987 usam as MESMAS
convenções (categoria: Localização, subcategoria, cadeia `Geolocalização`) —
o extractor e os leitores do app (naturalidade, Atlas, mapa) funcionam nelas
sem mudança. A raiz prática do mundo é **Porto Alegre** (equivalente ao Mundo
Livre): árvore de bairros (Restinga, Centro Histórico, Delta Radioativo, …) e
mapa próprio `Mapa de Porto Alegre RPG.png` (a nota de Porto Alegre já tem até
o bloco leaflet com bounds).

**Extract:** `npm run extract` ganha o alvo cyberpunk →
`vault-data-cyberpunk/` (mesmo formato), varrendo SÓ Atlas/Contexto/imagens
curadas da POA 1987.

## 3. As superfícies e o ponto de costura de cada uma

| Superfície | Costura |
|---|---|
| **Conteúdo/catálogo** | `vaultUrl()` resolve pelo mundo com FALLBACK: cyberpunk tenta `vault-data-cyberpunk/`, cai em `vault-data/` no miss (vale pra docs E imagens — decisão do usuário). `CatalogProvider` remonta na troca; manifest cyberpunk = união (Atlas/Contexto próprios + sistema fantasia herdado). |
| **Overrides por mundo** | Reusa `doc_overlays`/overlay do #243 com escopo de mundo: patch ganha `world`; jogador no cyberpunk lê base(fallback) ⊕ overlay publicado do mundo. `disabled: true` no patch → o catálogo/listas filtram o doc. Editor de overrides (renomear/desabilitar/re-descrever) = os editores F9 já existentes + campo de mundo + toggle de desabilitar, visíveis SÓ em modo dev. |
| **Heróis locais** | `StoredEntity.world` (ausente = fantasia); criação grava o mundo ativo; listagem filtra. |
| **Sessões** | `sessions.state.world` na criação; listagem/entrada filtram; trocar contexto limpa `pleitost.sessaoAtiva` (desconecta). |
| **Mapa** | chaves `pleitost.hexMap.<world>.*` (legado = fantasia); mapa cyberpunk = Porto Alegre (imagem + lugares do Atlas POA). |
| **Imagens** | resolvem pelo dataset do mundo com fallback fantasia (mesma costura do vaultUrl). |

## 4. Modo desenvolvedor (estado real + o que falta)

**Já implementado (épico #243 F8/F9, fechado):** flag
`pleitost.settings.desenvolvedor` (settings.ts), overlay em 3 camadas no
choke-point `loadDoc` (base ⊕ publicado ⊕ rascunho local), editores de
doc/regras com validação viva, Publicar → Supabase `doc_overlays`, export
round-trip pro Obsidian. **Sem UI de ativação** (decisão da época).

**Falta (este plano):**
- **Ativação por SENHA** no Config: campo de senha → confere hash → liga a
  flag; usuário pode desligar depois (a flag persiste por conta como as demais
  settings). Verificação client-side por hash embutido (gate de UI; as
  ESCRITAS publicadas continuam atrás do auth Supabase — a senha não é a
  fronteira de segurança, o auth é).
- **Editor de overrides por mundo** (renomear/desabilitar/re-descrever itens
  por contexto) montado sobre os editores existentes, habilitado só em modo
  dev.

## 5. Commits sequenciais

| # | Entrega |
|---|---|
| C1 | `world.ts` + testes (derivação, default, onWorldChange) |
| C2 | `vaultUrl`/CatalogProvider por mundo com FALLBACK fantasia (docs+imagens); cyberpunk sem dataset = funcional com banner |
| C3 | `StoredEntity.world` + criação/listagem filtradas |
| C4 | Sessões: world na criação, filtro, desconexão na troca |
| C5 | hexMap por mundo + fallback legado; mapa cyberpunk = Porto Alegre quando o dataset chegar |
| C6 | Modo dev: ativação por senha no Config (liga/desliga) |
| C7 | Overrides por mundo: escopo world no overlay + `disabled` filtrando catálogo + editor em modo dev |
| C8 | Extract da POA 1987 (Atlas/Contexto/mídia curada) → `vault-data-cyberpunk/` |
| C9 | Invariantes: fluxo fantasia byte-idêntico com o eixo introduzido; suíte nos dois mundos |

## 6. Garantias de não-quebra

- Vault pleitost intocada; POA 1987 intocada (extract é read-only, com ignore
  do Sistema antigo).
- Nenhum rename de chave existente; dado legado = fantasia.
- Cyberpunk sem dataset/overrides = app funcional (fallback total na fantasia
  + banners).
- Overlay por mundo NUNCA se aplica na fantasia (world scoping estrito).
