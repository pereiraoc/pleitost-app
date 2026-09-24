# Dano final com os valores do personagem (#466) — estudo e plano

> Sugestão via app (2026-08-14): "Mostrar dano final de habilidades usando os
> valores dos status dos personagens, ao invés de termos genéricos. Ex:
> Sussurro sombrio = 1d6 x 4 (potência) ao invés de somente '1d6 x potência'."
> Estudo em 2026-09-24. Nada implementado ainda.

## 1. O que existe hoje

**Nas notas da vault** (127 magias em `Sistema/Criação de Personagem/Magia`,
mais habilidades e técnicas), as fórmulas são PROSA com um vocabulário
pequeno e estável:

| Padrão | Notas | Exemplos reais |
|---|---|---|
| `NdM×potência` | 44 magias | `1d6×potência de dano de fogo`, `1d8×potência`, `1d10×potência` |
| `[expr]×potência` | 8 | `[1d6+(MOD/2)]×potência` (curas), `[3+(MOD/2)]×potência` (EH temporária) |
| `N×potência` (não-dado) | ~10 | `5×potência` (EV de invocação), `2×potência`, `2 minutos×potência`, `30 minutos×potência` |
| `(potência+N)` | 1 | `1d4×(potência+2)` |
| "potência mágica 2 maior" | ~24 | linha **Sucesso Decisivo:** das magias de ataque |
| `+MOD`, `13+MOD`, `2d6+MOD` | 7 | ataques/CDs em prosa |
| "bônus de especialização" | 32 | habilidades e técnicas (já é valor derivado: rank) |

Não há campo estruturado de dano nas magias (o FM tem `categoria`,
`subcategoria`, `elemento`, `rank`, `custo`). "MOD" não está definido em
nenhuma nota de regra: é convenção (modificador do atributo de conjuração da
escola). A regra [[Potência Mágica]] diz que a potência é **por fonte**: "você
pode ter valores diferentes de potência mágica para cada magia, dependendo de
qual habilidade proveu acesso".

**No app**, os mesmos textos passam por poucos pontos de renderização:

- `components/item-card.tsx` — `bodyHtml` / `bodyDesc` / `val('resumo')`: os
  cards de hover (`ItemHover`, `ConsumivelHover`) usados na ficha (Habilidades →
  Magias, Combate → MAGIAS) e no compêndio. Pipeline de STRING (markdown →
  HTML próprio).
- `markdown/MarkdownBody.tsx` — o corpo da nota nos DETALHES (sidebar) e no
  compêndio. Pipeline React (remark), sem rehype-raw.
- `components/detail/ResumoDetail.tsx` — o bloco de magias mostra a potência
  do bloco, não as fórmulas.

Já existe precedente de "valor final" em três lugares: `interativa/dano.ts`
(dano de ARMA: base + dados de proficiência → "2d6+2", espelho do
`calcDanoArma` do plugin), `interativa/invocacao.ts` (`EV_MULT_RE` parseia
"5×potência" com a PM da instância) e os `Efeitos_Interativos` (seletor
"Potência Mágica" como magnitude). E a cascata de reskin (`reskinText`) é a
prova de que transformar TEXTO na borda de display, com fonte de verdade
intacta, é o idioma do app.

## 2. Decisões a confirmar com o mestre

1. **Formato.** `1d6×4 (potência)`: mantém a estrutura da frase, troca o
   termo pelo número e nomeia o termo entre parênteses. Não vira `4d6` — a
   multiplicação é por dado rolado, não por quantidade de dados.
2. **MOD.** = valor do atributo de conjuração da escola da magia
   (`Magias.Lista.<Escola>.Atributo` → `Atributos.<X>` do FM derivado).
   `MOD/2` arredonda pra baixo. Ex.: `[1d6+(MOD/2)]×potência` com INT 3 e
   potência 4 → `[1d6+1]×4 (MOD 3, potência 4)`.
3. **Potência por fonte.** Magia no bloco primário usa `Magias.Potencia`; no
   secundário, `Magias.Secundaria.Potencia`; magia concedida por
   especialidade/maestria (#477/#478) NÃO tem potência própria no modelo de
   hoje → fica genérica até o vocabulário novo existir. Efeito de aliado usa a
   potência do conjurador (`sharedFromMeta`), como já é.
4. **Sucesso Decisivo.** "considere sua potência mágica 2 maior" ganha o
   número ao lado: `… 2 maior (6)`. Sem reescrever a frase.
5. **Compêndio sem herói.** Texto genérico, como hoje. (Um seletor "simular
   com potência N" no compêndio é possível, mas fora deste escopo.)
6. **Onde aparece.** Hovers e listas da ficha (Habilidades → Magias, Combate →
   MAGIAS) e os DETALHES abertos a partir da ficha. Resumo (`resumo::`) da
   linha também.

## 3. Opções

**A — Interpolação na borda de display (recomendada agora).** Um módulo puro
lê o texto, acha os padrões da tabela acima e substitui pelos valores do
herói; onde faltar valor, deixa o texto original. Zero mudança na vault.
Cobre as 44+8+10 notas de cara. Risco: frase fora do padrão fica genérica —
mitigado por um teste que varre o dataset real e lista toda ocorrência de
"potência" que o parser não reconheceu (vira pendência de vault, não bug
silencioso).

**B — Campo estruturado na vault.** `Dano:` / `Fórmula:` no FM de cada magia
(ex.: `{ base: "1d6", vezes: "potência", tipo: "fogo" }`) e o app renderiza
uma linha "Dano final" própria. Mais robusto e abre porta pra rolagem no
Combate, mas duplica a prosa (drift) e exige editar ~60 notas (dá pra
semear por script a partir do parser da opção A e guardar com teste
FM×prosa). Fica pra uma fase 2, se e quando o Combate quiser o valor
numérico.

**C — Marcação na prosa** (`{{1d6×potência}}`): edita a vault e não ganha
robustez de verdade sobre A. Descartada.

## 4. Arquitetura da opção A

```
app/src/interativa/formulas.ts            (novo, puro, unit-testado)
  FormulaCtx { potencia: number | null; mod: number | null }
  interpolarFormulas(texto, ctx) → { texto, substituicoes: { de, para, motivo }[] }
    - "NdM×potência" / "[expr]×potência" / "N×potência" / "×(potência+N)"
    - "MOD", "(MOD/2)" (arredonda pra baixo)
    - "potência mágica N maior" → acrescenta "(valor)"
    - ctx sem o valor → não substitui (texto intacto)
  ocorrenciasNaoReconhecidas(texto) → string[]   (pro teste de cobertura)

app/src/interativa/formula-ctx.ts        (novo)
  formulaCtxDaMagia(derivedFm, bloco: 'primaria' | 'secundaria', escola) → FormulaCtx
    - potência do bloco; MOD = Atributos[Magias(.Secundaria).Lista.<escola>.Atributo]
```

Pontos de costura (cada um recebe um `formulaCtx` opcional; sem ele, nada muda):

1. `item-card.tsx`: `ItemHover`/`itemCardHtml` aplicam `interpolarFormulas`
   no texto de `bodyHtml`, `bodyDesc` e `val('resumo')` antes do `esc`/reskin.
   As substituições viram `<span class="shc-formula" title="potência 4 =
   Magias.Potencia · MOD 3 = INT">` no HTML do card.
2. `HabilidadesTab.tsx` (`MagiasHabPanel`, já sabe `sec`) e `CombateTab.tsx`
   (`MagiasPanel`/`MagiasLista`, já separa primário/secundário) montam o ctx
   por magia e passam pro hover e pro resumo da linha.
3. `MarkdownBody.tsx`: prop `formulaCtx`; a transformação entra no
   `useMemo` do corpo, depois do reskin. Os DETALHES ganham contexto quando
   abertos da ficha: `DetailTarget` recebe `ctx?: { heroId, bloco, escola }`
   (as chamadas `detail.open({ kind: 'doc', id })` das listas de magia passam
   o ctx; o resto segue sem).
4. Efeitos de aliado (Combate → EFEITOS): o descritor já carrega
   `sharedFromMeta.potenciaMagica`; o resumo do chip usa ela.

Fonte dos valores: sempre o FM DERIVADO (`rules.derivedFm`) — nunca cálculo
próprio de potência.

## 5. Fases

| Fase | Entrega | Teste | Tamanho |
|---|---|---|---|
| F1 | `formulas.ts` + `formula-ctx.ts` | unit (todos os padrões da tabela) + cobertura sobre `vault-data` (lista o que não parseia) | meio dia |
| F2 | Habilidades → Magias e Combate → MAGIAS (hover + resumo da linha) | componente sobre herói fixture (Carlos: Bardo com potência conhecida) | meio dia |
| F3 | DETALHES com contexto da ficha | componente: abrir magia da ficha → corpo interpolado; do compêndio → genérico | meio dia |
| F4 (opcional) | FM estruturado + linha "Dano final" + rolagem no Combate | — | depois, se o Combate pedir |

Plugin (Obsidian): o módulo puro é espelhável em `util/` do pleitost-autosheet
se o mestre quiser paridade nas fichas do Obsidian; fora deste plano.

## 6. Riscos e limites

- Frases que fogem do padrão ficam genéricas — o teste de cobertura torna
  isso visível, e a correção é na vault (padronizar a frase), não no parser.
- Magia de especialidade/maestria (#477/#478) sem potência própria: fica
  genérica até o vocabulário novo (não rotear por classe/bloco).
- "MOD" precisa da confirmação da decisão 2 antes da F1 — é a única regra que
  não está escrita na vault.
