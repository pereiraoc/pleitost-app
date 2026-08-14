# Wizard de Criação de Herói — Design (issue #452)

Data: 2026-08-12 · Spec do usuário (verbatim): issue #452 · Status: aprovado (bloco de arquitetura) — implementação sequencial.

## Objetivo

Experiência acompanhada (10 passos) ao criar um herói novo. Ao concluir, a ficha vira a
visualização padrão com todas as edições de hoje. Toda escolha é gated pelos **elementos de
regra** existentes — o wizard não duplica lógica de regra, só **lê** o `RulesModel` e escreve
no FM pelos mesmos setters dos painéis atuais.

## Decisões (confirmadas com o usuário)

1. **Ciclo de vida**: "Criar Herói" cria a entidade local NA HORA (como hoje) com marcador
   `Wizard: { passo: 1 }` no FM. O wizard edita o herói real (write-through → sincroniza).
   Reabrir a ficha retoma do passo salvo. Cancelar (com confirmação) deleta o herói
   (`removeLocalEntity`, tombstone propaga).
2. **Navegação**: sequencial — avançar só com o passo completo; voltar sempre livre; trocar
   escolha estrutural (ex.: classe) **reseta os dependentes** (ver Ownership map).
3. **Layout**: é um MODO da FichaPage (mesma rota `/heroi/{id}`). Com `Wizard` presente:
   CHAR_TABS desabilitadas (AppShell), seleção lateral segue em Heróis, RightSidebar mostra
   SÓ a parte de Detalhes (sem a aba Sessão), seletor de personagem do topo já aponta pro
   herói novo (comportamento atual de navegar pra ficha). Os "mostra nos detalhes" do spec
   usam o canal de detalhes existente (`useDetail().open`) — funciona igual no celular (drawer).
4. **Equipamento inicial** = SÓ as armas das mãos + armadura (sem ouro/tesouros/consumíveis).
5. **Sintonia × atributos é LEGADO** — não mostrar pareamento de atributos da sintonia. As
   restrições de atributo-chave corretas vêm de elementos de regra
   (`Definir Atributos.Principal X` → `__constraint__Atributos.Principal`,
   `applyPrincipalToModel` em `rules/extract.ts`) e são mantidas.

## Arquitetura

- `src/components/wizard/WizardView.tsx` — casca: barra de progresso (passos visíveis),
  corpo do passo atual, rodapé Voltar/Avançar (gate por `complete(ctx)`), botão “Descartar
  criação”. Passo persistido em `Wizard.passo` via `model.set`.
- `src/components/wizard/steps/*` — um arquivo por passo. Registro central de passos
  (`steps.ts`): `{ id, titulo, Component, complete(ctx), visible(ctx) }` (Magias tem
  `visible` condicional).
- `src/components/wizard/reset.ts` — **ownership map + resets** (ver abaixo). Única fonte
  do que cada passo possui no FM e do que é limpo quando uma escolha estrutural muda.
- `src/rules/equip-recomendacao.ts` — recomendação de armas/armadura (spec 6.1.x/6.2.x),
  puro e unit-testado; parsing de propriedades reutiliza helpers existentes
  (`deriveArmaAtributo`, `wikiTarget`, shape `propriedades: string[]`).
- FichaPage: `fm.Wizard` em herói local → renderiza `WizardView` no lugar do conteúdo de aba.
- AppShell/RightSidebar: hook `useWizardAtivo(heroId)` (lê a entidade local reativa) →
  desabilita CharTabButtons e esconde a aba Sessão da sidebar.
- Reuso de painéis (passos 7–9): `HabilidadesArvorePanel` (já exportado), `TecnicasPanel`
  (já exportado), `MagiasHabPanel` (passa a ser exportado), `PericiasProfPanel` (passa a ser
  exportado com props opt-in `forceEdit`/`hideItemBonus` — comportamento default intocado).

## Ownership map (FM por passo) e resets

| Passo | FM que possui |
|---|---|
| 1 Classe | `Classe`; subclasse = escolha em `Habilidades.Lista` (`Escolha.[[parent]]`) |
| 2 Sintonia | `Sintonia` |
| 3 Passado | `Biografia.{Naturalidade,Passado,Motivacao,Genero,Idade,Altura,Peso}`; perícia do passado (`Pericias.Lista[*].Incrementos A: Passado`); `Oficios.Lista[*]` (prof A + Complemento) |
| 4 Personalidade | `Biografia.{Ideais,Desprezos,Qualidades,Defeitos}` |
| 5 Atributos | `Atributos.{FOR,AGI,INT,PRE,Principal}` |
| 6 Equipamento | `Inventario.Armas.Lista`, `Inventario.Escudo.Nome`, `Inventario.Armadura.Nome` |
| 7 Perícias | `Pericias.Lista[*].Incrementos` com `Slot.*` |
| 8 Magias | `Magias.*.Lista` (picks) |
| 9 Hab./Técnicas | `Tecnicas.Lista`, escolhas em `Habilidades.Lista` |
| 10 Nome | `nome` (espelha basename), `apelido` |

**Reset ao trocar CLASSE** (`resetOnClasseChange`): limpa `Habilidades.Lista` (inclui
subclasse), `Tecnicas.Lista`, picks de `Magias`, incrementos `Slot.*` de Perícias (mantém o
do Passado), equipamento (armas/escudo; armadura volta a `[[Sem Armadura]]`). Atributos NÃO
são resetados — a restrição de Principal revalida no gate do passo 5 (se o Principal salvo
não for permitido pela nova classe, o passo 5 exige re-escolha).
**Trocar ATRIBUTOS** não reseta perícias/armas: os slots recontam ao vivo
(`computeSlotsView`) e o gate do passo 7 barra sobre-gasto; as recomendações do passo 6 são
recomputadas (equipar continua válido — recomendação ≠ requisito).
**Trocar SINTONIA/PASSADO** não tem dependentes fora do próprio passo (perícia/ofício do
passado são trocados dentro do passo, mesma mecânica do PassadoBox de hoje).

## Passos (fontes de dados → writes → gate)

1. **Classe** — lista de cards dos docs de `Sistema/Criação de Personagem/Classes/` (sem a
   folder-note). Click = seleciona + abre nos Detalhes. Write `Classe: [[X]]` (+ reset de
   dependentes se mudou). **Subclasse**: opções de `useHeroRules().habilidadeChoices`
   (mesma derivação do `ClasseNivelPanel`, extraída em helper); write via mecânica atual
   (`Escolha.[[parent]]` em `Habilidades.Lista`). Sub-etapa some se a classe não tem
   subclasses. Gate: classe escolhida (+ subclasse, se existir).
2. **Sintonia** — cards dos docs de `Sintonia/Traços Elementais/`. Write `Sintonia: [[X]]`.
   Sem pareamento de atributos (legado). Gate: sintonia escolhida.
3. **Passado** — 3.1 Naturalidade: opções atuais (`naturalidade.ts`) + preview do mapa com
   zoom no hex do local (`cellsOfArea(localId)` no mapa oficial + `atlasHexCenter` +
   `atlas.webp` com transform; sem célula → só a nota nos Detalhes). 3.2–3.4.1 reusa a
   mecânica do `PassadoBox` (Passado, perícia adepta via `periciasPassadoOptions`,
   Ofício×Atuação via `oficiosPassadoOptions` + Complemento) com detalhes ao lado.
   3.5 Motivação; 3.6 Gênero (M/F/Outro); 3.7–3.9 Idade/Altura/Peso → `Biografia.*`.
   Gate: naturalidade, passado, perícia, ofício e identidade preenchidos.
4. **Personalidade** — Ideais/Desprezos em pares (mesmo número, gate); Qualidades↔Defeitos
   linkados (uma linha = qualidade + contrapartida). Writes nos arrays de `Biografia`.
   Gate: ≥1 par de cada e contagens iguais.
5. **Atributos** — 4 cards com LEGENDA (resumo dos docs de `Sistema/Regras/Atributos/*`;
   click abre o doc nos Detalhes). Distribuição: chave=3 (vira `Principal`; filtrado pelas
   restrições de regra), secundário=2, depois 1 e 0. Preview imediato de
   defesas/resistências/sentidos/movimentos (breakdowns existentes). Gate: 3/2/1/0
   distribuídos + `Principal` permitido pela regra.
6. **Equipamento** — header com proficiências (Ataques + grupos de arma + escudo +
   armadura, lidas do FM já cascateado pela classe). Dois slots de mão; arma `mãos: 2`
   ocupa ambos; mão livre → hint “permite manobras”; escudo na mão secundária; 2 armas de
   1 mão → aviso “requer Lutar com Duas Armas” (penalidade da regra, doc nos Detalhes).
   Picker com filtro Corpo-a-Corpo × A Distância, SÓ grupos `cac-simples|d-simples|
   cac-marcial|d-marcial` (nada de especiais/naturais). Badges MUITO RECOMENDADA /
   RECOMENDADA por `equip-recomendacao.ts` (spec 6.1.1–6.1.4: `Força X` == FOR → muito;
   == FOR-1 → recomendada; AGI≥2 → Precisa/A Distância muito recomendadas priorizando
   `Força X`==FOR; proficiência específica/marcial pesa mais; sem elas, simples).
   Armadura: 3 cards com recomendação 6.2.1–6.2.3. Writes: `Inventario.Armas.Lista`
   (shape atual, `Fonte: 'Manual'`, `Atributo` via `deriveArmaAtributo`), `Escudo.Nome`,
   `Armadura.Nome`. Gate: mão principal preenchida + armadura escolhida.
7. **Perícias** — `PericiasProfPanel` com `forceEdit` + `hideItemBonus`. Gate: sem
   sobre-gasto de slots (`computeSlotsView`).
8. **Magias** — visível só se há escolas com `Proficiencia !== 'N'`/aprendidas/choices.
   `MagiasHabPanel` (primária + secundária quando houver) em edição. Gate: sem sobre-gasto.
9. **Habilidades e Técnicas** — `HabilidadesArvorePanel` + `TecnicasPanel` em edição.
   Gate: livre (pendências de regra continuam visíveis como hoje).
10. **Nome** — Nome (espelha basename) + Apelido. Concluir: remove `Wizard` do FM → ficha
    padrão. Gate: nome não-vazio.

## Riscos e mitigações (considerando o histórico do projeto)

| Risco | Mitigação |
|---|---|
| Regressão de lógica de regra (histórico: #259 — "a teoria já está definida") | Zero regra duplicada: wizard só LÊ `useHeroRules`/RulesModel e escreve pelos setters existentes; recomendações (novas por spec) isoladas em `equip-recomendacao.ts` com unit tests. |
| Seleções órfãs ao voltar/trocar classe (pedido explícito do usuário) | Ownership map central (`reset.ts`) + testes de reset (trocar classe limpa subclasse/técnicas/magias/hab./equip; perícia do Passado sobrevive). Gate do passo 5 revalida Principal. |
| Perda de dados no sync (histórico: #450 clobber) | Nenhuma superfície nova de sync: writes via `setLocalEntityFm` (carimba `updatedAt`), deleção via tombstones. `Wizard.passo` é FM comum. |
| Strings/labels inventados (memória: sempre fonte de verdade) | Opções SEMPRE do catálogo/vault (classes/sintonias/armas/armaduras/atributos) e registries (`tokens`, `display-names`); nada hardcodado no call-site. |
| Quebrar painéis existentes ao reusar (Perícias/Magias) | Props opt-in com default = comportamento atual; suíte existente guarda (habilidades/combate/ficha tests). |
| Tela sem design no Claude Design | Wizard é extensão sancionada (como EXPLORAÇÃO): segue o idioma visual existente (panel/clip/mono-title/BoxSelect/cards). |
| Big-bang | Commits sequenciais por fase, suíte + tsc verdes em cada um; deploy ao final (política pleitost-app). |
| Herói "fantasma" abandonado | Retomável por design; “Descartar criação” com confirmação deleta com tombstone. |

## Testes

- Unit: `equip-recomendacao` (matriz FOR/AGI/proficiências/propriedades), `reset.ts`.
- Integração (jsdom, fixtures reais da vault): fluxo cria→classe→…→concluir (abas
  desbloqueiam); trocar classe reseta dependentes; gates (avançar barrado); Magias
  invisível pra classe sem magia; PericiasProfPanel sem coluna de item bônus no wizard.
