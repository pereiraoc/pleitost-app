# Plano do batch de feedback (#262–#267) — fundamentado na fonte de verdade

Planejar antes, implementar com cuidado, corrigir depois (pedido do usuário).
Já shipado deste batch: #264 (Atlas), #265 (Aventuras), **#262 item 1.4**
(condições/recuperação no layout das defesas). Abaixo, o resto — cada um
ancorado no render REAL do pleitost-autosheet.

## #262 — tooltips de dano/ADO (itens 1.1/1.2/1.3) + editor vida/EM mobile (1.5)

**Fonte de verdade estudada:** `plugin/src/util/ataque-oportunidade.ts`
(`computeDanoAdO` → `DanoAdOResult.parts`). O modelo CERTO do ADO:
- `parts` separadas: **Base** (offset da arma, `tone: neutral`) + **Mestre**
  (`extra: "+1d{size}"`, `tone: neutral`, só se prof=M) + toggles `ado`
  (`tone: pos`=verde) + **passoDado** (`extra: "d4 → d6"`, verde/vermelho) +
  fixo/porDado (verde/vermelho).
- Base do ADO = SÓ o offset da arma (arma "1d4+2" → ADO base **2**); Mestre
  soma **+1 dado** → tooltip mostra "2" e "+1d4" SEPARADOS (não a soma no header).

**Causa-raiz no app:** `app/src/interativa/dano.ts::computeDanoAdO` devolve um
shape ACHATADO `{ display, entries, hasDelta, hasPenalty }` — NÃO tem as `parts`
(base/mestre/passoDado/tones) do plugin. Por isso:
- 1.1 base+mestre não aparecem separados (só `display` "1d4+7" e `entries`);
- 1.2 o chip mostra `AdO {display}` E o tooltip repete `base: display` → modificador redundante no header;
- 1.3 sem passoDado "d4→d6" e sem os tons neutro/verde certos.

**Correção (cuidadosa, é cálculo de dano — testar número a número):**
1. Portar as `parts` do plugin pro `app/src/interativa/dano.ts::computeDanoAdO`
   (base/mestre/ado/passoDado/fixo/porDado + tone), MANTENDO o input atual;
   preservar `display` pra não quebrar o resto.
2. Reescrever o render do ADO no `CombateTab` (~linha 1558) pra listar as parts
   (base neutro, "+1d4" mestre neutro, bônus verdes, "d4 → d6" no passo), SEM o
   `base: display` redundante no header.
3. Aplicar o MESMO tratamento verde/passo no tooltip do dano da arma
   (`danoArmaBreakdown` em tooltips.tsx) — o tone `pos` já pinta `#22c55e`.
4. TESTE de projeção: uma arma "1d4+2" com prof A/E/M → ADO "2" / "2" / "1d4+2";
   Apunhalante → passo "d4 → d6". Comparar com o plugin (fixture).
5. (1.5) editor vida/EM no mobile: popovers em `CombateTab` (linhas ~348/582 e
   os de EM) usam `width: min(Xpx, %)`; endurecer pra `maxWidth: calc(100vw-16px)`
   e reposicionar quando estoura a viewport — verificar em 390px.

## #263 — imagens da Iniciativa (diagnóstico FECHADO)
As linhas de combatente em `CombateDaSala` (SessaoPage ~654-701) mostram nome +
vida mas **NENHUMA imagem** — por isso "não aparecem corretamente". Fix: pôr o
retrato (`creatureImageUrl(synthDocFromCharacter(c), assets)`, como no
`LinhaPersonagem`), respeitando a máscara de NPC (NPC não-revelado + viewer não-GM
→ retrato genérico/oculto, igual ao nome mascarado). Executar SEM esperar input.

## #266 — encontros de combate (espelhar combat-tracker do plugin)
Estudar `plugin/src/render/modes/combat-tracker/*` (barrinhas de dificuldade,
lista de monstros, ações). Entregar: dificuldade em barrinhas no topo + lista
clicável → ficha-resumo na direita (reusa `useDetail`/ResumoDetail) + botão
"adicionar à sessão" (mestre → `addMonsterToInitiative`/`startEncounterFromRoster`)
+ toggles invisível/disfarçado (mask/reveal do sync). Grande.

## #267 — compêndio de itens: agrupamento + filtros (6 categorias)
**Taxonomia estudada:** `subcategoria` do FM só tem Arma(66)/Armadura(3)/
Escudo(2)/Tesouro(47). As categorias do pedido (Consumíveis/Imbuições/
Equipamentos/Implementos) são derivadas do **PATH** do doc (item-card.tsx:233-236
já usa `/Imbuições e Qualidade/`, `/Consumíveis/`, `/Equipamentos/`,
`/Implementos/`). Armas: `grupo` (natural/simples/marcial/especial) + `subgrupo`
(ex.: "contusão"; distância/CaC via grupo-arma.ts). Qualidade (Adepta/Experiente/
Mestre) e obra-prima saem do nome/tier.

**Plano:** criar `item-taxonomy.ts` (deriva categoria→grupo→subgrupo→qualidade de
cada doc por path+FM, reusando grupo-arma.ts e a lógica do item-card) + reescrever
o leaf-view de Item por categoria com seções agrupadas + barra de filtro no topo:
- 6.1 Armas: simples→marcial→especial→natural, cada um distância/CaC; naturais por
  tipo, ordem crescente.
- 6.2 Consumíveis: por tipo (Coragem/Nutrição/Velocidade/Cura) → qualidade.
- 6.3 Imbuições: por tipo → qualidade, com obra-prima junto (sem subitens).
- 6.4 Equipamentos: ataque/defesa/perícia → subgrupo → qualidade.
- 6.5 Implementos: tipo → qualidade.
- 6.6 Escudos: corrigir a carta (infos do plugin — integridade/redução; comparar
  item-card.tsx vs `extract-arma-stats`/carta do autosheet).
Filtro no topo: registro central de facetas (categoria/qualidade/grupo), nada
hardcodado no call-site. GRANDE — vários commits; testar contagem por grupo.

## Ordem sugerida
#262 (1.1/1.2/1.3 com teste de dano → 1.5) → #267 (grande, independente) →
#266 (grande, multiplayer) → #263 (com o input do usuário). Cada um: estudar o
plugin, implementar, TESTAR contra fixture, verificar na tela, corrigir.
