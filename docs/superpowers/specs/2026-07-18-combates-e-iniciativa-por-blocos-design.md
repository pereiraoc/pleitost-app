# Combates (compêndio) + Iniciativa por blocos — Design

Data: 2026-07-18
Status: proposto (aguardando revisão)

## Contexto

Duas frentes que se cruzam:

- **A. Compêndio de Combates** — a lista e a página de um combate estão pobres.
- **B. Rework de iniciativa** — trocar números de iniciativa por **blocos de velocidade**
  (Super Rápido / Rápido / Lento), separados por lado (Jogadores / Inimigos), tanto na
  definição do encontro quanto no combate ao vivo (mesa/sessão).

As duas se cruzam porque a **página do combate** já precisa mostrar o **bloco de iniciativa
por monstro** (B) — por isso um design único, implementado em fases.

### Decisões fechadas (com o usuário)

1. **Um design só, em fases** (não dois ciclos separados).
2. **Blocos dos monstros: o GM define no app.** A vault é read-only.
3. **Ignorar os `init=` da vault.** Onde existem (ex.: `Vila de Goblins`, `init=20.4`) são
   dado de teste do design ANTIGO (iniciativa rolada a cada combate, sem pré-definição) e
   estão incorretos. **Sem import, sem derivar-de-números.** O bloco começa vazio e o GM
   atribui fresco por encontro.
4. **Jogadores: o GM encaixa manual** no combate ao vivo (o app é TRACKER, não rola dado).
   A rolagem acontece na mesa física; o GM clica o bloco resultante.
5. **Badge de dificuldade: reusar o modelo de PONTOS** que já alimenta as barrinhas
   (pontos dos monstros vs 4 heróis do nível → Trivial/Fácil/Difícil/Letal), fixado no
   **nível do grupo** configurável. Sem regra nova.
6. **Atribuição por monstro individual** (cada monstro tem seu bloco + estado inicial).

### Não-objetivos

- Não rolar iniciativa no app (sem dado). Sem CD-Nível pra classificar (a rolagem é da mesa).
- Não escrever na vault. Nenhum dado de bloco/estado vai pras notas `.md`.
- Não importar/migrar os `init=` numéricos existentes.

## 1. Modelo de blocos (novo, puro — `app/src/data/initiative-blocks.ts`)

Fonte de verdade única, sem UI, importável tanto pelo compêndio (`mestre/`) quanto pelo
`session-repo/`.

```ts
export type SpeedTier = 'super' | 'rapido' | 'lento'         // velocidade (3)
export type Lado = 'jogador' | 'inimigo'                     // DERIVADO da família
export const SPEED_ORDER: SpeedTier[] = ['super', 'rapido', 'lento']

// lado nunca é armazenado — vem da família do combatente
export function ladoDe(family: string): Lado                 // Heroi/Jogador → jogador; resto → inimigo

// agrupa combatentes nos 6 blocos, na ordem fixa:
//   Jogadores Super, Inimigos Super, Jogadores Rápidos, Inimigos Rápidos,
//   Jogadores Lentos, Inimigos Lentos
export interface BlocoView<T> { tier: SpeedTier; lado: Lado; label: string; itens: T[] }
export function agruparEmBlocos<T>(itens: T[], keyOf: (t: T) => { tier: SpeedTier | null; lado: Lado }): {
  blocos: BlocoView<T>[]          // só os não-vazios, na ordem canônica
  semBloco: T[]                    // tier == null (a definir)
  sequencia: T[]                   // flat = blocos concatenados na ordem → "a vez de cada um"
}
```

- Rótulos/emojis vêm do **registro central `tokens`** (estendido), nunca hardcode no
  call-site (regra de arquitetura do projeto). Ver §7.
- `sequencia` preserva "ainda terá a vez pra cada um": é a concatenação dos blocos na ordem
  canônica; o combate ao vivo caminha por ela.

## 2. Lista de combates (compêndio) — `CombateView.tsx` (`CombateGrid`/`CombateCard`)

- Cada card ganha as **barrinhas de dificuldade** inline (reusa `EncounterLevelBar` de
  `components/mestre/ui.tsx`) — o mesmo cálculo que já aparece ao abrir.
- **Tooltip explicando a classificação** (ver §3.1) também nos cards da lista.
- **Ordenar do mais fácil pro mais difícil**: escalar de dificuldade do encontro
  (pontos dos monstros via `encounter-compute`), empate por nome. `CombateGrid` computa a
  faceta por doc (como o `ItemGrid` faz), ordena, e renderiza.

## 3. Página do combate (rework) — `CombateSheet` + `CombatMarkerBlock.tsx`

- **Manter** as barrinhas no topo, agora com o **tooltip explicativo** (§3.1).
- **Adicionar** um badge único: **dificuldade do encontro no nível do grupo** (Trivial/
  Fácil/Difícil/Letal — do modelo de pontos, no nível configurado), com o mesmo tooltip.
  Ocultável via CONFIG (§4).
- **Remover** a tabela "DIFICULDADE POR NÍVEL" (`CombatMarkerBlock` ~linhas 195–227) — as
  barrinhas bastam.
- **Banners de monstro empilhados** (um por monstro individual), cada um com:
  - **espaço pra imagem** do monstro (via `creatureImageUrl`, fallback iniciais/emoji);
  - **tier** (emoji + número), **vida** (HP — `Vida.Vitalidade`), **modificador**
    (Competente/Elite/Solo — emoji), **bloco de iniciativa** (emoji da velocidade),
    **estado inicial** (escondido 🙈/👁️, disfarçado 🎭) — tudo com emojis fáceis de ver.
  - No **Modo Mestre**: seletor de velocidade (super/rápido/lento) + toggles de estado,
    **por monstro individual**. Persistido no overlay (§5).

### 3.1 Tooltip da dificuldade (de onde vem a classificação)

Ao passar o mouse numa barrinha (ou no badge), um tooltip **explica a classificação** —
não só mostra o número. Pedido do usuário: "que nem no pleitost-autosheet pra combate".

- **Fonte de verdade (já mapeada, port verbatim do plugin)** — `mestre/encounter-compute.ts`:
  - **Limiares** (`classifyDifficultyRatio`): razão = monstros/heróis × 100 →
    `<50 Trivial · 50–75 Fácil · 75–100 Difícil · >100 Letal`.
  - **Pontos dos monstros** (`getMonsterContribution`): por tier (T0 5, T1 10, T2 25, T3 40)
    × modificador (Elite ×2, Solo ×3, Competente = tabela 6/12/28/48).
  - **Pontos dos heróis** (`getPlayerContribution`): por nível (tabela 10..52), × 4 heróis.
- **Infra a reusar (a mesma dos outros números do app, que espelha o plugin)** —
  `components/ficha/tooltips.tsx`: `TipHover` + `renderBreakdownHtml`/`buildSourceBreakdown`
  (o mesmo padrão de "de onde vem" das perícias/EM/potência). O `EncounterLevelBar` troca o
  `title=` nativo por esse tooltip rico envolto num `TipProvider`.
- **Conteúdo do tooltip**: label + porquê (razão X% e a régua dos limiares, destacando a
  faixa atual) + o breakdown dos pontos (cada monstro: `tier × modificador = pts`; heróis:
  `4 × nível`). Emojis do registro `tokens.emojis.dificuldade` (já existe).
- Sem native `title` no seg (evita tooltip duplo). No mobile (sem hover) o tap abre/fecha,
  como os outros `TipHover` do app.

## 4. Config — `settings.ts` + `ConfigPage.tsx`

- **`nivelGrupo: number`** (nível do grupo) — alimenta o badge de dificuldade. Default
  sensato (ex.: 1, ou média do grupo ativo se houver — a definir na implementação).
- **`mostrarDificuldade: boolean`** — liga/desliga o badge de dificuldade na página/lista.
- Ambos na tela CONFIG, padrão do `settings.ts` (chave `pleitost.settings.*`, sincroniza
  por conta).

## 5. Armazenamento dos blocos/estados do encontro (novo — `app/src/data/encounter-speeds.ts`)

- Store `createStore`-factory sobre `localStorage` chave **`pleitost.encounterSpeeds`**
  (sincroniza por conta via remote-persist, como o resto do `pleitost.*`).
- Shape: `Record<encounterPath, Record<monsterInstanceKey, { tier: SpeedTier | null; escondido: boolean; disfarcado: boolean }>>`.
- `monsterInstanceKey = "<sourcePath|label>#<n>"` (Goblin Batedor #1..#5) — identidade
  estável por instância, alinhada ao `@estado` que já enumera 1:, 2:, …
- Ao **iniciar o encontro** na mesa, o bloco/estado de cada monstro **semeia** o combate ao
  vivo (§6). Prep do GM é local/por-conta; o estado vivo é do Supabase.

## 6. Combate ao vivo / iniciativa (rework) — `session-repo` + `SessaoPage.tsx`

- `EncounterTurnState` (jsonb — **sem migração**) ganha:
  ```ts
  speeds: Record<string, SpeedTier>   // charId → velocidade (ausente = a definir)
  ```
  `order`/`currentIndex`/`round`/`started` continuam. `order` passa a ser **derivado** de
  `speeds` + família via `agruparEmBlocos(...).sequencia` (mantido em sync na escrita).
- **Seed:** `startEncounterFromRoster` / `insertNpc` já resolvem cada monstro; passam a
  gravar `speeds[charId]` a partir do overlay de prep (§5). Jogadores entram **sem tier**
  (a definir).
- **GM encaixa manual:** ação `setCombatantSpeed(charId, tier)` (repo + Supabase). O GM
  toca super/rápido/lento pra cada jogador. `advanceTurn` (turn.ts) passa a caminhar pela
  `sequencia` derivada (mesma semântica de "próximo/anterior", só que a ordem vem dos blocos).
- **UI (`CombateDaSala`/`IniciativaPanel`):** roster renderizado como os **6 blocos
  rotulados** (bonitos, com emoji/cor por velocidade e por lado), destacando o combatente
  da vez. Combatentes **sem bloco** ficam numa bandeja "a definir" até o GM encaixar (não
  entram na `sequencia` enquanto sem tier).

## 7. Emojis/labels (registro central — `tokens`)

Estender o registro (fonte de verdade), nunca `if tier==='super' return '⚡'` no call-site:
- velocidade: super / rápido / lento (ex.: ⚡ / 🏃 / 🐢 — a confirmar no design system);
- estado: escondido / disfarçado (👁️‍🗨️/🙈 · 🎭);
- modificador já tem emoji? senão, adicionar Competente/Elite/Solo.
Onde o registro é gerado a partir do design-system do plugin, adicionar lá e regenerar
(`npm run gen`), consistente com o pipeline atual.

## 8. Arquivos tocados (resumo)

Novos: `data/initiative-blocks.ts`, `data/encounter-speeds.ts`.
Editados: `components/compendium/CombateView.tsx`, `mestre/CombatMarkerBlock.tsx`,
`mestre/roster.ts` (expor vida/modificador/imagem por monstro), `components/mestre/ui.tsx`
(reuso das barras no card), `settings.ts`, `components/config/ConfigPage.tsx`,
`data/session-repo/contract.ts`, `data/session-repo/encounter-actions.ts`,
`data/session-repo/turn.ts`, `data/session-repo/supabase.ts` (setCombatantSpeed),
`components/sessao/SessaoPage.tsx`, `generated/tokens.*` (emojis).

## 9. Testes

- `initiative-blocks`: `ladoDe`, `agruparEmBlocos` (ordem canônica dos 6 blocos, semBloco,
  sequência flat), sob fixtures.
- Ordenação da lista (fácil→difícil) e badge de dificuldade no nível X (sobre encounter real).
- Tooltip da dificuldade: o breakdown cita os limiares e os pontos (monstros por tier×mod,
  heróis por nível) — conteúdo derivado de `encounter-compute`, não string solta.
- `encounter-speeds`: set/override por monstro, persistência, seed no encontro.
- Turn: `advanceTurn` caminhando pela sequência derivada de blocos (próximo/anterior/round).
- Regressão: a página não quebra sem prep (blocos vazios → só banners, sem crash).

## 10. Fases / commits (verde a verde, deploy por fase)

1. **Modelo + lista**: `initiative-blocks.ts` + barras no card + ordenação fácil→difícil.
2. **Página + config**: banners por monstro (imagem/tier/vida/modificador/estado/bloco) +
   assign do GM + `encounter-speeds` + badge de dificuldade + remover tabela + CONFIG
   (nível do grupo, toggle).
3. **Combate ao vivo**: `turnState.speeds` + seed + `setCombatantSpeed` + render em 6 blocos
   + turn pela sequência.

## 11. Itens em aberto / adiados

- Emojis exatos de velocidade — confirmar no design system.
- Default de `nivelGrupo` (fixo vs média do grupo ativo).
- (Futuro, se quiser) rolagem automática vs CD-Nível — hoje é manual por decisão.
