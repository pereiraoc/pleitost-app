# Arquitetura de Contextos/Mundos (#519 — Opção 1, implementada 2026-08-30)

O Sistema é ESTÁVEL e agnóstico de contexto; cada mundo declara seu delta
numa **nota de Contexto-Def** (frontmatter `Contexto:`) na própria vault:

| Mundo | Nota-fonte | Artefato compilado |
|---|---|---|
| fantasia | `pleitost-vault: Contexto/Contexto Fantasia.md` | `vault-data/contexto.json` |
| poa-1987 (cyberpunk) | `vault POA 1987: Contexto/Reskin/Contexto POA 1987.md` | `vault-data-cyberpunk/contexto.json` |
| base (garantias) | `pleitost-vault: Contexto/Contexto Base.md` | embutido nos artefatos (`base.sempreDisponiveis`) |

## Pipeline

1. Autor edita a Contexto-Def no Obsidian (YAML comentável + corpo de doc).
2. `npm run extract` / `npm run extract:cyberpunk` → `extractor/compile-contexto.mjs`
   localiza a def do `PLEITOST_WORLD_ID`, **valida** (basenames de
   `reskin.notas`/`indisponiveis` existem; garantia do Base não violada;
   campos obrigatórios) e emite `contexto.json`. Def inválida QUEBRA o
   extract — nunca deriva silencioso.
3. Build/deploy publicam o artefato junto do dataset do mundo (vite já copia
   `vault-data-cyberpunk` opcionalmente).
4. App: `app/src/data/context-def.ts` (`loadContextoDef(world)`) — ponto único
   de consumo. Ligar nas superfícies de display é o próximo passo.

## O que o artefato carrega

`{ id, nome, fonte, moeda{simbolo,nome}, atlas{raiz,mapa}, pericias{...},
reskin{notas, notasFuturas, termos, excecoes}, disponibilidade{padrao,
indisponiveis, restritos}, base{sempreDisponiveis} }`

## Princípios

- **Identidade canônica nunca muda**: regras/wikilinks operam nos basenames
  de fantasia; reskin é display puro (mesma filosofia do alias das fichas).
- **Termos**: cascata por chave mais longa primeiro, fronteira de palavra,
  case-preserving, exceto strings em `excecoes`.
- **Base**: `sempre_disponiveis` são inegociáveis em qualquer mundo (o
  compilador quebra se um contexto tentar excluí-los).
- Testes: `extractor/tests/compile-contexto.test.mjs`.
