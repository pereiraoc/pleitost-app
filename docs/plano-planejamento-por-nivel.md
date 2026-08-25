# Planejamento de Personagem por Nível (estilo Pathbuilder)

> Estudo + plano de implementação. **Nada implementado ainda.**
> Pedido (2026-08-24): aba **Planejamento** ao lado de Experiência na Biografia,
> com a progressão vertical nível a nível como no Pathbuilder — o que ganha, o
> que seleciona, e o set de nível ajustando as seleções daquele nível.

## 1. O modelo do Pathbuilder (o que estamos espelhando)

O Pathbuilder 2e organiza o build como uma **linha do tempo vertical**:

- Blocos empilhados "Level 1", "Level 2", … (nível mais baixo no topo), cada um
  listando (a) os **ganhos automáticos** do nível (features da classe,
  proficiências) e (b) os **slots de seleção** do nível (feat de classe, feat de
  perícia, skill increase, boosts) como botões/pickers inline.
- As seleções ficam **associadas ao nível** onde o slot existe. Mudar o nível do
  personagem não apaga o que foi escolhido nos níveis acima: os blocos
  continuam lá (planejáveis) e voltam a valer quando o nível sobe de novo.
- Um marcador visual indica o nível atual; níveis acima são "plano".

## 2. O que o nosso sistema já dá de graça (estudo)

1. **Atribuição por nível SEM estado novo.** Toda regra da vault carrega o
   wrapper `Nivel N` (scope `nivel-min` no `ParsedRule.scope`). As notas de
   classe são literalmente tabelas de progressão:
   - `Classes/Guerreiro.md`: `Nivel 1 Complementar Habilidades.Lista
     [[Evolução Básica]]` … `Nivel 4 … [[Veterano]]` … `Nivel 7 Somar
     Tecnicas.Slots.M 1` … `Nivel 10 … [[Maestria em Arma]]`.
   - `Evolução Básica.md`: slots de perícia/técnica por nível (N2..N9), comum a
     todas as classes.
   O `HeroRulesResult.appliedRules` (extração que a ficha JÁ roda) contém cada
   regra aplicada com seu scope → agrupar por `max(1, nivel-min)` produz a
   timeline inteira. **Custo ~zero: nenhuma projeção extra.**
2. **Escolhas com gate de nível.** `Escolha_Habilidades` sob `Nivel N` (Magias
   Anima N2/N3, Treinamento de Animista N4/N7, …) só descobre a choice quando o
   nível alcança N — ou seja, cada dropdown pertence naturalmente a um nível.
   Falta só EXPOR o gate (`gateLevel`) no `ChoiceDescriptor`/projeção (mudança
   aditiva).
3. **Slots por nível.** `Somar Pericias|Tecnicas|Magias.Slots.R 1` com `Nivel N`
   → o k-ésimo slot do rank R nasce num nível determinável. A economia
   (fungibilidade, `slot-accounting.ts`) já existe e não muda.
4. **Rebaixar nível já é seguro.** Gates param de disparar; a cascata de picks
   órfãos (#490) preserva picks com pai vivo → baixar o nível DESATIVA os
   ganhos sem destruir as escolhas salvas (comportamento verificado no #490;
   ganha teste dedicado na F1).
5. **Nível 1 = wizard.** Classe/subclasse/atributos/Principal/sintonia/passado
   (perícia+ofício pelo Passado) já têm editores prontos (painéis reusados pelo
   wizard #452 via `forceEdit`) — o card do nível 1 reusa, não recria.
6. **FM tolera chave nova.** O plugin preserva chaves desconhecidas no save
   (`rawKept`, serialize-to-fm.ts:147) → um bloco `Planejamento` no FM
   round-tripa Obsidian↔app sem ser destruído, e o sync entre devices já cobre
   (heroEdits sincroniza o FM inteiro).

### Lacuna conhecida (ser honesto na UI)

O FM **não registra em qual nível cada slot foi GASTO** (um incremento
`Slot.A` de perícia não tem nível). A atribuição "essa perícia subiu no nível
5" é ambígua pro histórico existente. Tratamento: v1 mostra no card do nível os
**slots ganhos** ali + agregado do que está gasto; o bloco `Planejamento` passa
a registrar o nível dos gastos feitos DALI EM DIANTE (enriquecimento
progressivo, sem migração).

## 3. Arquitetura proposta (4 camadas, todas aditivas)

### C1 — Timeline derivada (pura, read-only)

`src/rules/level-timeline.ts`:

```ts
interface LevelCard {
  nivel: number
  ganhos: TimelineEvent[]      // habilidade/técnica/magia/proficiência/vida/slots…
  escolhas: TimelineChoice[]   // choices com gateLevel === nivel (+ pick atual)
  slotsGanhos: { pericia: SlotDelta; tecnica: SlotDelta; magia: SlotDelta }
}
buildLevelTimeline(rules: HeroRulesResult, fm, catalog, nivelAlvo): LevelCard[]
```

- Evento = regra aplicada agrupada pelo `nivel-min` do scope (sem scope → 1).
- Tipagem do evento pelo `targetRaw` (Habilidades/Tecnicas/Magias/Slots/
  proficiências/Vida/…), rótulos pelos wikilinks reais — **nada inventado**.
- Choices anotadas com `gateLevel` (novo campo aditivo no descriptor).
- Condicionais que hoje não passam (ex. subclasse não escolhida) aparecem como
  "a definir" no card do nível do gate — igual ao Pathbuilder mostra slot vazio.

### C2 — UI: aba Planejamento

- `PerfilTab.tsx`: `bioTabs` ganha `{ id: 'planejamento', label: 'Planejamento' }`
  (TabStrip/PanelTrack existentes — mesmo padrão de Identidade/Experiência).
- `PlanejamentoPanel`: cards verticais nível 1 → alvo; marcador no nível atual;
  níveis > atual esmaecidos (são plano). Sem inventário/nome/apelido.
- Card N1: classe/subclasse/atributos+Principal/sintonia/perícia+ofício do
  Passado (reuso dos editores do wizard), habilidades N1, slots iniciais.
- Cards N≥2: habilidades/técnicas/magias concedidas no nível, slots ganhos,
  dropdowns das choices com gate naquele nível, aumentos automáticos.
- Seleções em nível ≤ atual: mesmos `SelectBox` + `writeChoicePick`/apply-edits
  de hoje (caminho de escrita EXISTENTE, sem fork).
- Seleções em nível > atual: gravam no bloco `Planejamento` (C3), nunca nas
  listas ativas.

### C3 — Plano persistido (inerte pra engine)

```yaml
Planejamento:
  alvo: 12                 # nível planejado (default: nível atual)
  picks:                   # por choiceKey estável (sourceNote|label|occ)
    "Magias Anima|Essência Elemental Adepta|02": "[[Essência Mineral Adepta]]"
  gastosSlots:             # registro de nível p/ gastos novos (lacuna §2)
    - { nivel: 5, tipo: pericia, rank: E, alvo: "[[Atletismo]]" }
```

- Nenhum leitor existente toca a chave → **zero risco de regressão**.
- Plugin preserva no round-trip (rawKept); sync entre devices já cobre.
- Alternativa avaliada e descartada: localStorage + prefixo de sync (como
  `pleitost.hexMap.`) — não viaja no export portable do herói e cria segunda
  fonte de verdade; FM ganha.

### C4 — Sincronização no set de nível

- **Subir nível**: choices recém-desbloqueadas auto-preenchem do
  `Planejamento.picks` SE a opção ainda é válida (valida contra as options
  atuais + filtro "já tem"); inválida → fica pendência normal (#302 já acende).
- **Baixar nível**: nada a fazer nas listas — o gate desativa sozinho (item 4
  do estudo). Apenas COPIA os picks das choices com gate > novo nível pro
  `Planejamento.picks` (garante restauração fiel ao re-subir).
- Hook no caminho existente de edição de Nível (ClasseNivelPanel) — um
  interceptor aditivo, sem mudar o que o set faz hoje.

## 4. Fases (commits sequenciais, cada uma shippável)

| Fase | Entrega | Risco |
|---|---|---|
| F1 | `level-timeline.ts` + aba Planejamento **read-only** (cards verticais, marcador de nível) + testes (timeline do Guerreiro real N1..N10; derivedFm inalterado byte-a-byte com a aba montada) | zero (não escreve nada) |
| F2 | Seleções de nível ≤ atual editáveis inline (reuso writeChoicePick/apply-edits) | baixo (caminhos existentes) |
| F3 | Bloco `Planejamento` + níveis futuros editáveis + seletor de nível alvo | baixo (chave inerte) |
| F4 | Sync no set de nível (auto-aplicar plano ao subir; snapshot ao baixar) + testes de round-trip N10→N3→N10 | médio (testar bem) |
| F5 (opc.) | Registro de nível pros gastos de slot novos + exibição por card | baixo |

## 5. Garantias de não-quebra

- Mudanças em código existente limitadas a: (a) expor `gateLevel` no descriptor
  (campo novo, ninguém lê ainda); (b) aba nova no `bioTabs`; (c) interceptor
  aditivo no set de Nível (F4). Todo o resto é módulo/aba novos.
- Testes de blindagem já na F1: projetar herói real (Carlos congelado) com e
  sem a timeline montada → mesmo derivedFm; suíte completa verde por fase.
- O bloco `Planejamento` nunca alimenta a engine de regras — só a UI da aba e o
  sync de nível (F4) leem.

## 6. Decisões em aberto (com recomendação)

1. **Nível alvo default** — recomendo `max(nível atual, maior Nivel N citado
   nas regras alcançáveis)` limitado a 10 (a vault hoje escala até N10;
   Guerreiro para em `Nivel 10`). Configurável no card do topo.
2. **Choices condicionais não-resolvíveis ainda** (ex. essência de sintonia não
   escolhida) — recomendo mostrar o slot "a definir após X" no card do gate.
3. **Perícias/slots gastos legados sem nível** — recomendo seção "sem nível
   registrado" no card do nível atual, migrável manualmente arrastando pro
   nível certo (F5).
