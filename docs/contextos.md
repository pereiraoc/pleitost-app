# Arquitetura de Contextos/Mundos (#519 — Opção 1, implementada 2026-08-30)

O Sistema é ESTÁVEL e agnóstico de contexto; cada mundo declara seu delta
numa **nota de Contexto-Def** (frontmatter `Contexto:`) na própria vault:

| Mundo | Nota-fonte | Artefato compilado |
|---|---|---|
| fantasia | `pleitost-vault: Recursos e Mídia/Configurações de Contextos/Contexto Fantasia.md` | `vault-data/contexto.json` |
| poa-1987 (cyberpunk) | `vault POA 1987: Recursos e Mídia/Configurações de Contextos/Contexto POA 1987.md` | `vault-data-cyberpunk/contexto.json` |
| base (garantias) | `pleitost-vault: Recursos e Mídia/Configurações de Contextos/Contexto Base.md` | embutido nos artefatos (`base.sempreDisponiveis` + `base.conteudoDeMundo`) |

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
reskin{notas, notasFuturas, termos, excecoes, descricoes, chamadas,
chamadasSintonia, execucao}, disponibilidade{padrao, indisponiveis,
restritos}, base{sempreDisponiveis} }`

### `reskin.execucao` (2026-10-01)

Como cada **classe**, **habilidade** (treinamento secundário) ou **sintonia**
(criatura sem classe de herói) executa cada **escola** de magia no mundo —
a frase do gesto, nunca mecânica. Escola = os `Nome` de `Magias.Lista`
(`Arcana Branca`, `Arcana Negra`, `Anima`, `Tesouros`). O compilador valida
cada chave como basename (e o tipo: Classe / Habilidade|Técnica / Sintonia)
e rejeita escola fora do vocabulário. No app, `reskinExecucao(alvo, escola)`
resolve na cascata `habilidades → classes → sintonias → padrao → null`; a
fantasia, sem o bloco, não mostra linha nenhuma. A linha aparece na barra de
magias da ficha, no card da magia e no DocView aberto a partir da ficha.

**Ordem obrigatória ao editar o FM da Contexto-Def:** `npm run
contexto:doc[:cyberpunk]` (regenera o bloco `<!-- auto:contexto -->`) ANTES
de `npm run extract[:cyberpunk]` — o extract audita o bloco contra o FM e
quebra se divergir; e como ele apaga a pasta antes de reescrever, uma
falha deixa o dataset vazio.

## Princípios

- **Identidade canônica nunca muda**: regras/wikilinks operam nos basenames
  de fantasia; reskin é display puro (mesma filosofia do alias das fichas).
- **Termos**: cascata por chave mais longa primeiro, fronteira de palavra,
  case-preserving, exceto strings em `excecoes`.
- **Base**: `sempre_disponiveis` são inegociáveis em qualquer mundo (o
  compilador quebra se um contexto tentar excluí-los).
- Testes: `extractor/tests/compile-contexto.test.mjs`.
