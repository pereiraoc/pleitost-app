# Plano — visualização por item no Compêndio do Sistema (#128)

Hoje o compêndio (`/compendio`, `/doc/*`) mostra cada item como a página genérica do
doc (frontmatter + `InlineFieldsTable` + markdown do body). Falta uma apresentação
BOA e específica por TIPO de item — é o que este documento mapeia para resolver depois.

## Reaproveitar o que já existe
Já temos, no `item-card.tsx`, um renderizador de card por tipo com fonte de verdade
no doc:
- `docKind(doc)` → arma / armadura / escudo / tesouro / habilidade / tecnica / magia /
  acao / propriedade / pericia / generic.
- `CARD_SCHEMA` → os campos (rótulo → inline/frontmatter) por tipo, na ordem.
- `itemCardHtml` → figura + nome + stats + descrição (resumo ou `bodyHtml` completo),
  borda por rank/qualidade, preço com multiplicador de tier.
- `bodyHtml` → prosa completa da regra (headings/listas/tabelas, imagem flutuante).

A página do compêndio deveria usar essa MESMA base (em vez do dump genérico),
adaptando a densidade pra tela cheia.

## Visualização por tipo (proposta)
- **Arma / Armadura / Escudo:** figura grande à esquerda; stats (dano/tipo/mãos/
  alcance/defesa/dureza/preço) numa grade; propriedades como chips com tooltip;
  prosa do body abaixo. Combos arma × imbuição por tier (A/E/M) num seletor.
- **Tesouro / Consumível:** as 3 qualidades (A/E/M) lado a lado, cada uma com sua
  figura + Usos/Bônus/descrição do tier. Preço por tier (com multiplicador).
- **Habilidade / Técnica / Ação:** classe + rank + custo no topo; corpo COMPLETO da
  regra (bodyHtml), com wikilinks navegáveis; borda por rank (básica azul).
- **Magia:** tipo (Arcana/Anima) + elemento + rank + custo; corpo completo; escola.
- **Perícia / Ofício / Defesa / Sentido / Categoria de equipamento:** a nota de
  regra do compêndio (corpo), com as ações de perícia relacionadas listadas
  (via `useAcoesPorPericia`).
- **Classe:** retrato no canto; características de classe + tabela de nível +
  habilidades; subclasses/variações com os papéis (`class-roles`) e estrelinhas.

## Trabalho de infra pendente pra viabilizar
1. Renderizar `class-roles` (fence) como visualização de papéis com estrelinhas —
   hoje `bodyHtml` descarta o fence.
2. Componente React de página (`CompendiumItem`) que escolhe o layout por `docKind`
   e reusa `itemCardHtml`/`bodyHtml` (ou versões React equivalentes) — em vez de
   `dangerouslySetInnerHTML` só no tooltip.
3. Navegação de wikilinks dentro do corpo renderizado (já temos no `MarkdownBody`;
   unificar com o `bodyHtml`).
4. Índice do compêndio por tipo com o card/preview de cada item (não só o nome).

## Não-objetivos (por ora)
- Edição no compêndio (é read-only).
- Alterar a vault (fonte de verdade; qualquer campo faltante é populado na vault).
