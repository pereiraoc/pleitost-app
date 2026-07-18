# Combates (compêndio) + Iniciativa por blocos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar a lista/página de combates no compêndio (barras + ordenar + banners por monstro + badge de dificuldade com tooltip explicativo) e trocar a iniciativa numérica por **blocos de velocidade** (Super/Rápido/Lento × Jogadores/Inimigos) no encontro e no combate ao vivo.

**Architecture:** Um modelo puro de blocos (`data/initiative-blocks.ts`) compartilhado por compêndio e sessão. A velocidade do monstro é definida pelo GM e guardada num store app-side (`data/encounter-speeds.ts`, chave `pleitost.*` que sincroniza por conta). No combate ao vivo, `EncounterTurnState` ganha `speeds` (jsonb, sem migração) e a ordem de turno é derivada dos blocos. Dificuldade reusa o port existente (`mestre/encounter-compute.ts`) e o tooltip reusa `TipHover`/`renderBreakdownHtml`.

**Tech Stack:** Vite + React 19 + TS, vitest + @testing-library/react (jsdom), CSS puro com custom properties, Supabase (jsonb), localStorage via `createStoreChannel`.

**Spec:** `docs/superpowers/specs/2026-07-18-combates-e-iniciativa-por-blocos-design.md`

## Global Constraints

- **Vault é READ-ONLY.** Nenhuma escrita em `vault-data/` nem nas notas `.md`. Blocos/estados vivem app-side.
- **Ignorar os `init=` numéricos da vault** (dado de teste do design antigo). Sem import.
- **Nada hardcodado no call-site**: labels/emojis vêm de um registro central. Velocidade/estado (house-rule do app, não existe no plugin) → exportados por `data/initiative-blocks.ts`. Emojis de dificuldade → `tokens.emojis.dificuldade` (já existe). NÃO adicionar velocidade no `generated/tokens.ts` (é gerado do plugin, seria sobrescrito por `npm run gen`).
- **Verde a verde**: cada task fecha com `npx tsc --noEmit` limpo + os testes daquela task passando. Ao fim de cada FASE (verde: tsc + `npx vitest run` + `npm run build` + `npx eslint src` 0 erros), commit e deploy (`git push origin main` + `npm run deploy`) — fluxo auto-deploy do pleitost-app.
- **Diretório de trabalho dos comandos:** `/data/projects/pleitost-app/app`.
- **Modo Mestre**: as afordâncias de edição (definir velocidade/estado do monstro) só aparecem quando `useSettings().mestre` é true.
- **Lado derivado, nunca armazenado**: `jogador` vs `inimigo` sempre vem da família do combatente.

---

# FASE 1 — Modelo de blocos + dificuldade-por-nível + lista

### Task 1: Modelo puro de blocos de iniciativa

**Files:**
- Create: `app/src/data/initiative-blocks.ts`
- Test: `app/tests/initiative-blocks.test.ts`

**Interfaces:**
- Produces:
  - `type SpeedTier = 'super' | 'rapido' | 'lento'`
  - `type Lado = 'jogador' | 'inimigo'`
  - `const SPEED_ORDER: SpeedTier[]`
  - `const SPEED_EMOJI: Record<SpeedTier, string>` e `SPEED_LABEL: Record<SpeedTier, string>`
  - `function ladoDe(family: string): Lado`
  - `function blocoLabel(tier: SpeedTier, lado: Lado): string`
  - `interface BlocoView<T> { tier: SpeedTier; lado: Lado; label: string; itens: T[] }`
  - `function agruparEmBlocos<T>(itens: T[], keyOf: (t: T) => { tier: SpeedTier | null; lado: Lado }): { blocos: BlocoView<T>[]; semBloco: T[]; sequencia: T[] }`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ladoDe, agruparEmBlocos, SPEED_ORDER, blocoLabel } from '../src/data/initiative-blocks'

type C = { id: string; family: string; tier: 'super' | 'rapido' | 'lento' | null }
const key = (c: C) => ({ tier: c.tier, lado: ladoDe(c.family) })

describe('initiative-blocks', () => {
  it('ladoDe: heroi/jogador → jogador, resto → inimigo', () => {
    expect(ladoDe('Heroi')).toBe('jogador')
    expect(ladoDe('Jogador')).toBe('jogador')
    expect(ladoDe('Monstro')).toBe('inimigo')
    expect(ladoDe('Criatura')).toBe('inimigo')
  })

  it('SPEED_ORDER é super, rapido, lento', () => {
    expect(SPEED_ORDER).toEqual(['super', 'rapido', 'lento'])
  })

  it('agrupa nos 6 blocos na ordem canônica e monta a sequência flat', () => {
    const itens: C[] = [
      { id: 'm-lento', family: 'Monstro', tier: 'lento' },
      { id: 'j-super', family: 'Heroi', tier: 'super' },
      { id: 'm-super', family: 'Monstro', tier: 'super' },
      { id: 'j-rapido', family: 'Jogador', tier: 'rapido' },
      { id: 'sem', family: 'Heroi', tier: null },
    ]
    const { blocos, semBloco, sequencia } = agruparEmBlocos(itens, key)
    // ordem: Jog Super, Ini Super, Jog Rápido, Ini Rápido, Jog Lento, Ini Lento
    expect(blocos.map((b) => b.label)).toEqual([
      blocoLabel('super', 'jogador'),
      blocoLabel('super', 'inimigo'),
      blocoLabel('rapido', 'jogador'),
      blocoLabel('lento', 'inimigo'),
    ])
    expect(sequencia.map((c) => c.id)).toEqual(['j-super', 'm-super', 'j-rapido', 'm-lento'])
    expect(semBloco.map((c) => c.id)).toEqual(['sem'])
  })

  it('preserva ordem de inserção dentro de um bloco', () => {
    const itens: C[] = [
      { id: 'a', family: 'Monstro', tier: 'rapido' },
      { id: 'b', family: 'Monstro', tier: 'rapido' },
    ]
    expect(agruparEmBlocos(itens, key).sequencia.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run initiative-blocks`
Expected: FAIL (module não existe)

- [ ] **Step 3: Write the implementation**

```ts
// data/initiative-blocks.ts
// Modelo PURO dos blocos de iniciativa (house-rule do app, não existe na vault):
// velocidade Super/Rápido/Lento × lado Jogador/Inimigo. O LADO é sempre derivado
// da família (nunca armazenado). Fonte de verdade única dos labels/emojis de
// velocidade — o registro `tokens` é gerado do plugin e não conhece isto.
export type SpeedTier = 'super' | 'rapido' | 'lento'
export type Lado = 'jogador' | 'inimigo'

export const SPEED_ORDER: SpeedTier[] = ['super', 'rapido', 'lento']
export const SPEED_EMOJI: Record<SpeedTier, string> = { super: '⚡', rapido: '🏃', lento: '🐢' }
export const SPEED_LABEL: Record<SpeedTier, string> = { super: 'Super Rápido', rapido: 'Rápido', lento: 'Lento' }
const LADO_LABEL: Record<Lado, string> = { jogador: 'Jogadores', inimigo: 'Inimigos' }

// famílias/subcategorias que contam como lado JOGADOR (herói ou jogador).
const JOGADOR = new Set(['Heroi', 'Herói', 'Jogador'])

export function ladoDe(family: string): Lado {
  return JOGADOR.has(String(family).trim()) ? 'jogador' : 'inimigo'
}

/** "Jogadores Super Rápidos" / "Inimigos Lentos" etc. (label plural do bloco). */
export function blocoLabel(tier: SpeedTier, lado: Lado): string {
  const speed = tier === 'lento' ? 'Lentos' : tier === 'super' ? 'Super Rápidos' : 'Rápidos'
  return `${LADO_LABEL[lado]} ${speed}`
}

export interface BlocoView<T> {
  tier: SpeedTier
  lado: Lado
  label: string
  itens: T[]
}

/** Agrupa nos 6 blocos na ordem canônica (Jog/Ini × Super/Rápido/Lento),
 *  devolve só os não-vazios, os sem-bloco (tier null) e a sequência flat
 *  (concatenação dos blocos) que preserva "a vez de cada um". */
export function agruparEmBlocos<T>(
  itens: T[],
  keyOf: (t: T) => { tier: SpeedTier | null; lado: Lado },
): { blocos: BlocoView<T>[]; semBloco: T[]; sequencia: T[] } {
  const semBloco: T[] = []
  // bucket[tier][lado] preservando inserção
  const buckets = new Map<string, T[]>()
  const bk = (tier: SpeedTier, lado: Lado) => `${tier}:${lado}`
  for (const it of itens) {
    const { tier, lado } = keyOf(it)
    if (tier == null) {
      semBloco.push(it)
      continue
    }
    const k = bk(tier, lado)
    const arr = buckets.get(k)
    if (arr) arr.push(it)
    else buckets.set(k, [it])
  }
  const blocos: BlocoView<T>[] = []
  const sequencia: T[] = []
  for (const tier of SPEED_ORDER) {
    for (const lado of ['jogador', 'inimigo'] as Lado[]) {
      const arr = buckets.get(bk(tier, lado))
      if (!arr || arr.length === 0) continue
      blocos.push({ tier, lado, label: blocoLabel(tier, lado), itens: arr })
      sequencia.push(...arr)
    }
  }
  return { blocos, semBloco, sequencia }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run initiative-blocks`
Expected: PASS (4 tests)

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit` (esperado: sem erros)
```bash
git add app/src/data/initiative-blocks.ts app/tests/initiative-blocks.test.ts
git commit -m "feat(iniciativa): modelo puro de blocos de velocidade (Super/Rápido/Lento × lado)"
```

---

### Task 2: Dificuldade no nível do grupo + média do grupo ativo

**Files:**
- Create: `app/src/mestre/encounter-difficulty-at.ts`
- Test: `app/tests/encounter-difficulty-at.test.ts`

**Interfaces:**
- Consumes (de `mestre/encounter-compute.ts`, já existe): `computeEncounterDifficultyByLevel(combatants): EncounterDifficultyByLevelEntry[]`, `EncounterCombatant`, `DifficultyMeta`.
- Produces:
  - `function difficultyAtLevel(combatants: readonly EncounterCombatant[], level: number): EncounterDifficultyByLevelEntry` — a entry do nível pedido (clamp 1..10).
  - `function nivelMedioDoGrupo(niveis: readonly (number | null | undefined)[]): number | null` — média arredondada dos níveis dos heróis; `null` se vazio.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { difficultyAtLevel, nivelMedioDoGrupo } from '../src/mestre/encounter-difficulty-at'
import type { EncounterCombatant } from '../src/mestre/encounter-compute'

const monstro = (tier: number, modificador: EncounterCombatant['modificador'] = null): EncounterCombatant => ({
  source: 'x', family: 'Monstro', subcategoria: 'Monstro', tier, nivel: null, modificador,
})

describe('encounter-difficulty-at', () => {
  it('nivelMedioDoGrupo: média arredondada; vazio → null', () => {
    expect(nivelMedioDoGrupo([1, 2, 3, 4])).toBe(3) // 2.5 → 3
    expect(nivelMedioDoGrupo([5, 5])).toBe(5)
    expect(nivelMedioDoGrupo([null, undefined])).toBeNull()
    expect(nivelMedioDoGrupo([])).toBeNull()
  })

  it('difficultyAtLevel: pega a entry do nível pedido (clamp 1..10)', () => {
    const combatants = [monstro(2), monstro(2)] // 2×25 = 50 pts
    const e = difficultyAtLevel(combatants, 5)
    expect(e.level).toBe(5)
    expect(e.monsterTotal).toBe(50)
    // nível 5 → 27×4 = 108 heróis → ratio ~46% → TRIVIAL
    expect(e.label).toBe('TRIVIAL')
    // clamp
    expect(difficultyAtLevel(combatants, 99).level).toBe(10)
    expect(difficultyAtLevel(combatants, 0).level).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run encounter-difficulty-at`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Write the implementation**

```ts
// mestre/encounter-difficulty-at.ts
// Helpers de "dificuldade no nível do grupo": reusa o port existente
// (computeEncounterDifficultyByLevel) e escolhe a entry do nível dado. O nível
// vem da MÉDIA do grupo ativo (nivelMedioDoGrupo).
import {
  computeEncounterDifficultyByLevel,
  type EncounterCombatant,
  type EncounterDifficultyByLevelEntry,
} from './encounter-compute'

export function difficultyAtLevel(
  combatants: readonly EncounterCombatant[],
  level: number,
): EncounterDifficultyByLevelEntry {
  const byLevel = computeEncounterDifficultyByLevel(combatants)
  const n = Math.max(1, Math.min(10, Math.round(Number(level) || 1)))
  // byLevel é 1..10 na ordem → índice n-1
  return byLevel[n - 1]!
}

export function nivelMedioDoGrupo(niveis: readonly (number | null | undefined)[]): number | null {
  const vals = niveis.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
  if (vals.length === 0) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run encounter-difficulty-at`
Expected: PASS

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit`
```bash
git add app/src/mestre/encounter-difficulty-at.ts app/tests/encounter-difficulty-at.test.ts
git commit -m "feat(combate): helper de dificuldade no nível do grupo + média do grupo ativo"
```

---

### Task 3: Lista de combates — barrinhas + ordenar fácil→difícil

**Files:**
- Modify: `app/src/components/compendium/CombateView.tsx` (`CombateGrid`, `CombateCard`)
- Test: `app/tests/combate-view.test.tsx` (criar se não existir; senão adicionar caso)

**Interfaces:**
- Consumes: `computeEncounterDifficulty` (escalar de ordenação via `monsterTotal`), `EncounterLevelBar` (de `components/mestre/ui.tsx`), o parser de roster que `CombatMarkerBlock` já usa para montar `EncounterCombatant[]` a partir do doc. **Ler `CombateView.tsx` + `CombatMarkerBlock.tsx` no início da task** para reusar exatamente a mesma função que resolve o doc → combatentes (não duplicar a lógica de parse; extrair para um helper compartilhado se ela estiver inline no componente).

**Contexto de leitura obrigatória antes de implementar:** `app/src/components/compendium/CombateView.tsx` (linhas ~44–134), `app/src/mestre/CombatMarkerBlock.tsx` (como monta `byLevel` e os combatentes), `app/src/components/mestre/ui.tsx` (`EncounterLevelBar` props).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// Lista de combates: cards mostram as barrinhas de dificuldade e vêm ordenados
// do mais fácil pro mais difícil.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { compendiumFolderPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

it('lista de Combates: barrinhas por card e ordem fácil→difícil', async () => {
  const { container } = render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[compendiumFolderPath('Campanhas/Combates')]}>
        <Routes><Route path="/compendio/*" element={<FolderView />} /></Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
  await waitFor(() => expect(container.querySelector('.gm-enc-levelbar')).toBeTruthy())
  // cada card de combate tem uma barra
  const bars = container.querySelectorAll('.gm-enc-levelbar')
  expect(bars.length).toBeGreaterThan(1)
  // ordenação: o data-attr de escalar de dificuldade é não-decrescente
  const cards = [...container.querySelectorAll<HTMLElement>('[data-enc-dif]')]
  const difs = cards.map((c) => Number(c.getAttribute('data-enc-dif')))
  expect(difs).toEqual([...difs].sort((a, b) => a - b))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run combate-view`
Expected: FAIL (sem `.gm-enc-levelbar` no card / sem `data-enc-dif`)

- [ ] **Step 3: Implementar em `CombateView.tsx`**

Reusando o helper doc→combatentes já existente (ver leitura obrigatória): em `CombateGrid`, resolver os docs (via `useDocs`), computar por doc `{ entry, combatants, monsterTotal, byLevel }`, ordenar por `monsterTotal` (empate por `basename`), e renderizar cada `CombateCard` com `data-enc-dif={monsterTotal}` e `<EncounterLevelBar byLevel={byLevel} />`. Esqueleto:

```tsx
// dentro de CombateGrid, após resolver docs:
const cards = entries
  .map((e) => {
    const doc = docs.get(e.id)
    const combatants = doc ? combatentesDoDoc(doc) : []   // helper já existente/extraído
    return { e, doc, combatants, byLevel: computeEncounterDifficultyByLevel(combatants), total: computeMonsterTotalScalar(combatants) }
  })
  .sort((a, b) => a.total - b.total || (a.doc?.basename ?? '').localeCompare(b.doc?.basename ?? '', 'pt-BR'))

return (
  <div className="combate-grid">
    {cards.map(({ e, doc, byLevel, total }) => (
      <Link key={e.id} to={docPath(e.id)} className="combate-card" data-enc-dif={total}>
        <span className="combate-card-name">{doc?.basename ?? e.id}</span>
        <EncounterLevelBar byLevel={byLevel} />
      </Link>
    ))}
  </div>
)
```

`computeMonsterTotalScalar` = soma de `getMonsterContribution` dos combatentes monstro (ou reusar `byLevel[0].monsterTotal`, que é o mesmo para todo nível). Preferir `byLevel[0]?.monsterTotal ?? 0` para não duplicar. Importar `computeEncounterDifficultyByLevel` de `mestre/encounter-compute`, `EncounterLevelBar` de `components/mestre/ui`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run combate-view`
Expected: PASS

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/components/compendium/CombateView.tsx app/tests/combate-view.test.tsx
git commit -m "feat(combate): barrinhas de dificuldade nos cards + ordenar fácil→difícil"
```

---

### Task 4 (FASE 1 gate): verde + deploy

- [ ] `npx tsc --noEmit` → sem erros
- [ ] `npx vitest run` → tudo passa
- [ ] `npm run build` → OK
- [ ] `npx eslint src` → 0 erros
- [ ] `git push origin main && npm run deploy`

---

# FASE 2 — Página do combate (banners, assign, dificuldade+tooltip, config)

### Task 5: Store de velocidades/estados do encontro (por conta)

**Files:**
- Create: `app/src/data/encounter-speeds.ts`
- Test: `app/tests/encounter-speeds.test.ts`

**Interfaces:**
- Consumes: `createStoreChannel` de `data/create-store.ts`.
- Produces:
  - `type MonsterPrep = { tier: import('./initiative-blocks').SpeedTier | null; escondido: boolean; disfarcado: boolean }`
  - `function getMonsterPrep(encounterPath: string, monsterKey: string): MonsterPrep`
  - `function setMonsterPrep(encounterPath: string, monsterKey: string, patch: Partial<MonsterPrep>): void`
  - `function getEncounterPreps(encounterPath: string): Record<string, MonsterPrep>`
  - `function useEncounterSpeedsVersion(): number` (para re-render reativo)
  - `function __resetEncounterSpeedsForTests(): void`
- `monsterKey` = `"<sourcePath|label>#<n>"` (instância 1-based).

**Padrão:** localStorage chave `pleitost.encounterSpeeds` (JSON), reativo via `createStoreChannel`. Ver `data/session-store.ts` e `settings.ts` para o padrão de leitura/escrita+notify.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  getMonsterPrep, setMonsterPrep, getEncounterPreps, __resetEncounterSpeedsForTests,
} from '../src/data/encounter-speeds'

function makeStorage(): Storage {
  const d = new Map<string, string>()
  return {
    get length() { return d.size },
    clear: () => d.clear(),
    getItem: (k) => (d.has(k) ? d.get(k)! : null),
    key: (i) => [...d.keys()][i] ?? null,
    removeItem: (k) => void d.delete(k),
    setItem: (k, v) => void d.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
})
afterEach(() => { window.localStorage.clear(); __resetEncounterSpeedsForTests() })

describe('encounter-speeds', () => {
  it('default: tier null, não escondido, não disfarçado', () => {
    expect(getMonsterPrep('Campanhas/Combates/X', 'Goblin#1')).toEqual({ tier: null, escondido: false, disfarcado: false })
  })
  it('set/override por monstro e persiste', () => {
    setMonsterPrep('X', 'Goblin#1', { tier: 'super' })
    setMonsterPrep('X', 'Goblin#1', { escondido: true })
    expect(getMonsterPrep('X', 'Goblin#1')).toEqual({ tier: 'super', escondido: true, disfarcado: false })
    // outra instância independente
    expect(getMonsterPrep('X', 'Goblin#2').tier).toBeNull()
    expect(Object.keys(getEncounterPreps('X'))).toEqual(['Goblin#1'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run encounter-speeds`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// data/encounter-speeds.ts
// Prep de encontro (app-side, por conta): velocidade + estado inicial POR
// MONSTRO. Chave localStorage pleitost.encounterSpeeds (sincroniza por conta via
// remote-persist). A vault é read-only — nada disto vai pras notas.
import { useSyncExternalStore } from 'react'
import { createStoreChannel } from './create-store'
import type { SpeedTier } from './initiative-blocks'

export interface MonsterPrep {
  tier: SpeedTier | null
  escondido: boolean
  disfarcado: boolean
}
const DEFAULT: MonsterPrep = { tier: null, escondido: false, disfarcado: false }
type All = Record<string, Record<string, MonsterPrep>> // encPath → monsterKey → prep

const KEY = 'pleitost.encounterSpeeds'
const channel = createStoreChannel()
let cache: All | null = null

function load(): All {
  if (cache) return cache
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    cache = raw ? (JSON.parse(raw) as All) : {}
  } catch {
    cache = {}
  }
  return cache!
}
function persist(next: All) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage indisponível */
  }
  channel.emit()
}

export function getEncounterPreps(encounterPath: string): Record<string, MonsterPrep> {
  return load()[encounterPath] ?? {}
}
export function getMonsterPrep(encounterPath: string, monsterKey: string): MonsterPrep {
  return { ...DEFAULT, ...(load()[encounterPath]?.[monsterKey] ?? {}) }
}
export function setMonsterPrep(encounterPath: string, monsterKey: string, patch: Partial<MonsterPrep>): void {
  const all = load()
  const enc = { ...(all[encounterPath] ?? {}) }
  enc[monsterKey] = { ...DEFAULT, ...(enc[monsterKey] ?? {}), ...patch }
  persist({ ...all, [encounterPath]: enc })
}
export function useEncounterSpeedsVersion(): number {
  return useSyncExternalStore(channel.subscribe, channel.version, channel.version)
}
export function __resetEncounterSpeedsForTests(): void {
  cache = null
  channel.resetForTests()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run encounter-speeds`
Expected: PASS

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/data/encounter-speeds.ts app/tests/encounter-speeds.test.ts
git commit -m "feat(combate): store de velocidade/estado por monstro do encontro (por conta)"
```

---

### Task 6: Config — toggle "mostrar dificuldade"

**Files:**
- Modify: `app/src/settings.ts`
- Modify: `app/src/components/config/ConfigPage.tsx`
- Test: `app/tests/config.test.tsx` (adicionar caso)

**Interfaces:**
- Produces: `Settings.mostrarDificuldade: boolean` (default ON); `useSettings().setMostrarDificuldade(v: boolean)`.

Espelhar EXATAMENTE o padrão de `linkIcons` em `settings.ts` (constante `MOSTRAR_DIF_KEY = 'pleitost.settings.mostrarDificuldade'`, leitura `!== 'false'` para default ON, setter `setMostrarDificuldade`, incluir em `getSettings`, no objeto default, e exportar no `useSettings`). No `ConfigPage.tsx`, adicionar uma linha/pill "Dificuldade dos combates" no mesmo bloco de toggles (padrão do "Ícones nos Links").

- [ ] **Step 1: Write the failing test** (adicionar em `config.test.tsx`)

```tsx
it('toggle Dificuldade dos combates alterna o setting', () => {
  // (usar o mesmo harness/render de config.test.tsx; localizar a pill por texto)
  render(<ConfigHarness />)
  const pill = screen.getByText(/dificuldade dos combates/i).closest('button')!
  expect(pill.getAttribute('aria-pressed')).toBe('true') // default ON
  fireEvent.click(pill)
  expect(pill.getAttribute('aria-pressed')).toBe('false')
})
```
(Ajustar ao harness real do `config.test.tsx` — ver o arquivo; reusar o mesmo `ConfigHarness`/render que os outros toggles usam.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run config`
- [ ] **Step 3: Implementar** `settings.ts` + `ConfigPage.tsx` como acima.
- [ ] **Step 4: Run to verify it passes** — `npx vitest run config`
- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/settings.ts app/src/components/config/ConfigPage.tsx app/tests/config.test.tsx
git commit -m "feat(config): toggle mostrar dificuldade dos combates"
```

---

### Task 7: Tooltip explicativo da dificuldade (breakdown)

**Files:**
- Create: `app/src/mestre/difficulty-tip.ts`
- Modify: `app/src/components/mestre/ui.tsx` (`EncounterLevelBar` usa o tooltip rico)
- Test: `app/tests/difficulty-tip.test.ts`

**Interfaces:**
- Consumes: `getMonsterContribution`, `getPlayerContribution`, `classifyDifficultyRatio`, `EncounterCombatant`, `formatDifficultyValue` (de `encounter-compute`); infra `renderBreakdownHtml`/`buildSourceBreakdown` de `components/ficha/tooltips.tsx`, `TipHover`/`TipProvider`. **Ler `tooltips.tsx` (`renderBreakdownHtml`, `BreakdownResult`, `TipHover` props) antes de implementar.**
- Produces: `function difficultyTipHtml(entry: EncounterDifficultyByLevelEntry, combatants: readonly EncounterCombatant[]): string` — HTML do breakdown (régua dos limiares c/ a faixa atual destacada + linhas de pontos monstros/heróis).

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { difficultyTipHtml } from '../src/mestre/difficulty-tip'
import { computeEncounterDifficultyByLevel, type EncounterCombatant } from '../src/mestre/encounter-compute'

const monstro = (tier: number): EncounterCombatant => ({ source: 'x', family: 'Monstro', subcategoria: 'Monstro', tier, nivel: null, modificador: null })

it('tooltip cita a régua dos limiares e o total de pontos', () => {
  const combatants = [monstro(2), monstro(2)] // 50 pts
  const entry = computeEncounterDifficultyByLevel(combatants)[4]! // nível 5
  const html = difficultyTipHtml(entry, combatants)
  expect(html).toContain('50') // pontos dos monstros
  expect(html).toMatch(/Trivial|Fácil|Difícil|Letal/i) // classificação
  expect(html).toContain('50–75') // faixa da régua (ou '50-75' conforme render)
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run difficulty-tip`
- [ ] **Step 3: Implementar** `difficulty-tip.ts` montando o HTML (reusar `renderBreakdownHtml` no formato dos outros tips do app; a "régua" = 4 faixas com a atual marcada). Em `ui.tsx`, o `EncounterLevelBar` passa a envolver cada seg num `TipHover content={difficultyTipHtml(e, combatants)}` (precisa receber `combatants` como prop nova, além de `byLevel`) e remover o `title=` nativo. Atualizar os call-sites de `EncounterLevelBar` (Task 3 card + Task 8 página) para passar `combatants`.
- [ ] **Step 4: Run to verify it passes** — `npx vitest run difficulty-tip`
- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/mestre/difficulty-tip.ts app/src/components/mestre/ui.tsx app/tests/difficulty-tip.test.ts
git commit -m "feat(combate): tooltip explicativo da dificuldade (limiares + pontos) no lugar do title nativo"
```

---

### Task 8: Página do combate — banners por monstro + badge + remover tabela

**Files:**
- Modify: `app/src/mestre/CombatMarkerBlock.tsx` (remover tabela ~195–227; banners; badge; assign do GM)
- Modify: `app/src/mestre/roster.ts` (expor `vida`, `imagem`, `modificador` por monstro se ainda não expõe — ler o arquivo)
- Modify: `app/src/components/compendium/CombateView.tsx` (`CombateSheet` passa nível médio do grupo ativo + combatants ao bloco)
- Modify: `app/src/styles/app.css` (estilos dos banners)
- Test: `app/tests/combat-marker-page.test.tsx`

**Interfaces:**
- Consumes: `getMonsterPrep`/`setMonsterPrep`/`useEncounterSpeedsVersion` (Task 5), `SPEED_EMOJI`/`SPEED_LABEL`/`SPEED_ORDER` (Task 1), `difficultyAtLevel`/`nivelMedioDoGrupo` (Task 2), `useSettings().mestre`/`.mostrarDificuldade`, `creatureImageUrl` (imagem do monstro), `tokens.emojis` (tier/modificador/dificuldade).
- **Fonte do nível médio do grupo ativo:** ler como a sessão/grupo ativo é obtido hoje (ver `data/session-store.ts` / grupo persistente); extrair os níveis dos heróis do grupo e passar por `nivelMedioDoGrupo`. Se não houver grupo ativo → badge escondido.

**Contexto de leitura obrigatória:** `app/src/mestre/CombatMarkerBlock.tsx` inteiro; `app/src/mestre/roster.ts`; como `CombateSheet` (em `CombateView.tsx`) instancia `CombatMarkerBlock`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// Página de um combate: banners por monstro (nome, tier, vida, modificador) e,
// no Modo Mestre, seletor de velocidade por monstro. A tabela "DIFICULDADE POR
// NÍVEL" não existe mais (as barras bastam).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor, within, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FolderView } from '../src/components/compendium/FolderView'
import { compendiumFolderPath } from '../src/paths'
import { useSettings } from '../src/settings'
import { useEffect } from 'react'
import type { IndexManifest } from '../src/data/types'
import '../src/components/compendium/register-doc-views'
// (mesmo bootstrap de fetch/catalog das outras suites de folder)

function MestreOn() { const { setMestre } = useSettings(); useEffect(() => setMestre(true), [setMestre]); return null }

it('página do combate: banners por monstro, sem a tabela detalhada', async () => {
  const { container } = render(/* CatalogProvider + MemoryRouter em /doc/Campanhas/Combates/<um combate> */)
  await waitFor(() => expect(container.querySelector('.combate-monstro-banner')).toBeTruthy())
  expect(container.querySelectorAll('.combate-monstro-banner').length).toBeGreaterThan(0)
  // tabela detalhada removida
  expect(container.textContent).not.toContain('DIFICULDADE POR NÍVEL')
})
```
(Completar o render com o mesmo harness das outras suites; escolher um combate real, ex.: `Campanhas/Combates/Emboscada Goblin`.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run combat-marker-page`
- [ ] **Step 3: Implementar**
  1. **Remover** o bloco `<div className="combat-difficulty">…` (tabela por nível) em `CombatMarkerBlock.tsx`.
  2. **Banners por monstro**: expandir o roster em instâncias individuais (qty → N banners; `monsterKey = "<sourcePath|label>#<n>"`). Cada banner `.combate-monstro-banner`: espaço de imagem (`creatureImageUrl`, fallback iniciais), nome, `tokens.emojis` de tier + vida (`Vida.Vitalidade`) + modificador (Competente/Elite/Solo) + velocidade (`SPEED_EMOJI[prep.tier]` ou "a definir") + estado (escondido/disfarçado).
  3. **Modo Mestre**: no banner, seletor de velocidade (3 botões `SPEED_ORDER` + limpar) e toggles escondido/disfarçado → `setMonsterPrep(encPath, monsterKey, …)`. Reativo via `useEncounterSpeedsVersion()`.
  4. **Badge de dificuldade**: se `mostrarDificuldade` e há nível médio do grupo ativo, renderizar `difficultyAtLevel(combatants, nivelMedio)` como um badge (label + cor `DIFFICULTY_TONE_COLORS`) com o `TipHover` da Task 7. Senão, esconder.
  5. CSS `.combate-monstro-banner` em `app.css` (banner empilhado, imagem à esquerda, stats em linha com emojis).
- [ ] **Step 4: Run to verify it passes** — `npx vitest run combat-marker-page`
- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/mestre/CombatMarkerBlock.tsx app/src/mestre/roster.ts app/src/components/compendium/CombateView.tsx app/src/styles/app.css app/tests/combat-marker-page.test.tsx
git commit -m "feat(combate): banners por monstro (imagem/tier/vida/modificador/velocidade/estado) + badge de dificuldade + remove tabela"
```

---

### Task 9 (FASE 2 gate): verde + deploy

- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx eslint src` (0 erros)
- [ ] `git push origin main && npm run deploy`
- [ ] **Validação visual do usuário** antes de seguir pra Fase 3 (a página é a superfície que o usuário revisa).

---

# FASE 3 — Combate ao vivo (iniciativa em blocos)

### Task 10: `speeds` no turn state + ordem derivada dos blocos

**Files:**
- Modify: `app/src/data/session-repo/contract.ts` (`EncounterTurnState` ganha `speeds?`)
- Create: `app/src/data/session-repo/turn-blocks.ts` (deriva ordem/sequência dos blocos)
- Test: `app/tests/turn-blocks.test.ts`

**Interfaces:**
- Consumes: `agruparEmBlocos`, `ladoDe`, `SpeedTier` (Task 1); `advanceTurn`/`TurnLike` (de `turn.ts`).
- Produces:
  - `EncounterTurnState.speeds?: Record<string, SpeedTier>`
  - `function ordemDerivada(charIds: string[], familyOf: (id: string) => string, speeds: Record<string, SpeedTier>): { order: string[]; semBloco: string[] }` — order = sequência flat dos blocos (só quem tem speed); semBloco = sem velocidade.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ordemDerivada } from '../src/data/session-repo/turn-blocks'

const fam: Record<string, string> = { j1: 'Heroi', j2: 'Heroi', m1: 'Monstro', m2: 'Monstro' }
const familyOf = (id: string) => fam[id] ?? 'Monstro'

it('ordem derivada segue os blocos; sem-speed fica de fora (semBloco)', () => {
  const { order, semBloco } = ordemDerivada(['m1', 'j1', 'm2', 'j2'], familyOf, {
    j1: 'super', m1: 'super', j2: 'lento',
    // m2 sem speed
  })
  // Jog Super (j1), Ini Super (m1), Jog Lento (j2)
  expect(order).toEqual(['j1', 'm1', 'j2'])
  expect(semBloco).toEqual(['m2'])
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run turn-blocks`
- [ ] **Step 3: Implementar**

```ts
// data/session-repo/turn-blocks.ts
import { agruparEmBlocos, ladoDe, type SpeedTier } from '../initiative-blocks'

export function ordemDerivada(
  charIds: string[],
  familyOf: (id: string) => string,
  speeds: Record<string, SpeedTier>,
): { order: string[]; semBloco: string[] } {
  const { sequencia, semBloco } = agruparEmBlocos(
    charIds,
    (id) => ({ tier: speeds[id] ?? null, lado: ladoDe(familyOf(id)) }),
  )
  return { order: sequencia, semBloco }
}
```
E em `contract.ts`, adicionar `speeds?: Record<string, SpeedTier>` a `EncounterTurnState` (importar `SpeedTier`).

- [ ] **Step 4: Run to verify it passes** — `npx vitest run turn-blocks`
- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/data/session-repo/turn-blocks.ts app/src/data/session-repo/contract.ts app/tests/turn-blocks.test.ts
git commit -m "feat(sessão): speeds no turn state + ordem de turno derivada dos blocos"
```

---

### Task 11: Ação setCombatantSpeed + seed dos monstros na entrada

**Files:**
- Modify: `app/src/data/session-repo/encounter-actions.ts` (`startEncounterFromRoster`/`insertNpc` semeiam `speeds` a partir do prep; nova ação `setCombatantSpeed`)
- Modify: `app/src/data/session-repo/contract.ts` (assinatura `setCombatantSpeed` no `SessionRepo`) + `supabase.ts` (impl: grava `turn_state.speeds` e recomputa `order` via `ordemDerivada`)
- Test: `app/tests/encounter-speeds-live.test.ts` (usar o repo fake/local de sessão que as suites existentes usam)

**Interfaces:**
- Produces: `SessionRepo.setCombatantSpeed(encounterId: string, characterId: string, tier: SpeedTier | null): Promise<void>` — atualiza `turnState.speeds[characterId]` (ou remove se null), recomputa `order` = `ordemDerivada(...)`, clampa `currentIndex`.
- **Seed:** ao inserir NPC de um roster com prep, ler `getMonsterPrep(encounterPath, monsterKey)` e gravar `speeds[charId]` + o mask (escondido/disfarçado) já existente.

**Contexto de leitura obrigatória:** `encounter-actions.ts` (`startEncounterFromRoster`, `insertNpc`, `addRosterToInitiative`), como as suites testam o repo (fake/local), `supabase.ts` (`updateEncounterTurnState`).

- [ ] **Step 1: Write the failing test** (sobre o repo local/fake usado nas suites de sessão; ver `tests/` para o helper existente)

```ts
// esboço — adaptar ao repo fake das suites:
it('setCombatantSpeed atualiza speeds e recomputa a ordem em blocos', async () => {
  // start encounter com j1(Heroi), m1(Monstro)
  await repo.setCombatantSpeed(encId, 'm1', 'super')
  await repo.setCombatantSpeed(encId, 'j1', 'lento')
  const enc = await repo.getEncounter(encId)
  expect(enc.turnState!.speeds).toEqual({ m1: 'super', j1: 'lento' })
  // Jog Lento vem depois de Ini Super? não — ordem: Jog(super) Ini(super) ... → só m1(super), j1(lento)
  expect(enc.turnState!.order).toEqual(['m1', 'j1'])
})
```

- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implementar** a ação (recompute com `ordemDerivada`, usando as famílias dos characters do encounter) + o seed no insertNpc. Espelhar na impl local/fake e no `SupabaseSessionRepo`.
- [ ] **Step 4: Run to verify it passes**
- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/data/session-repo/encounter-actions.ts app/src/data/session-repo/contract.ts app/src/data/session-repo/supabase.ts app/tests/encounter-speeds-live.test.ts
git commit -m "feat(sessão): setCombatantSpeed + seed de velocidade dos monstros na entrada do encontro"
```

---

### Task 12: SessaoPage — roster em 6 blocos + placar do GM

**Files:**
- Modify: `app/src/components/sessao/SessaoPage.tsx` (`CombateDaSala`/`IniciativaPanel`)
- Modify: `app/src/styles/app.css` (estilos dos blocos)
- Test: `app/tests/sessao-blocos.test.tsx`

**Interfaces:**
- Consumes: `agruparEmBlocos`, `SPEED_EMOJI`/`SPEED_LABEL`/`SPEED_ORDER`, `blocoLabel`, `ladoDe`; `setCombatantSpeed` (via a live session/repo); o turnState com `speeds`.
- **Render:** agrupar os combatentes do `turnState.order`/characters em blocos via `agruparEmBlocos` (por família + `speeds`); renderizar cada bloco com header (emoji + `blocoLabel`) e os combatentes; destacar o da vez (`currentIndex` sobre a `sequencia`). Combatentes `semBloco` numa bandeja "a definir" com botões de velocidade (Modo Mestre) → `setCombatantSpeed`.

**Contexto de leitura obrigatória:** `SessaoPage.tsx` (`CombateDaSala` ~690–870, `IniciativaPanel` ~874–965) — reusar os portraits/health bars existentes; só mudar o AGRUPAMENTO (flat → 6 blocos) e adicionar o seletor de velocidade.

- [ ] **Step 1: Write the failing test** (render de `CombateDaSala` com um turnState fake com speeds; assert que aparecem os headers dos blocos e o combatente cai no bloco certo). Usar o padrão de render/fixture das suites de sessão existentes.
- [ ] **Step 2: Run to verify it fails**
- [ ] **Step 3: Implementar** o agrupamento + headers + bandeja "a definir" + seletor de velocidade (Modo Mestre).
- [ ] **Step 4: Run to verify it passes**
- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/src/components/sessao/SessaoPage.tsx app/src/styles/app.css app/tests/sessao-blocos.test.tsx
git commit -m "feat(sessão): iniciativa ao vivo em 6 blocos + encaixe manual dos jogadores pelo GM"
```

---

### Task 13 (FASE 3 gate): verde + deploy

- [ ] `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx eslint src` (0 erros)
- [ ] `git push origin main && npm run deploy`
- [ ] Validação visual do usuário (combate ao vivo).

---

## Self-Review (feito ao escrever)

- **Cobertura do spec:** §1 modelo → Task 1; §2 lista → Task 3; §3 página+banners → Task 8, §3.1 tooltip → Task 7; §4 config → Task 6 (nível = média do grupo ativo → Task 2 + Task 8); §5 store → Task 5; §6 ao vivo → Tasks 10–12; §7 emojis → Task 1 (app-owned) + `tokens.emojis.dificuldade` existente; §9 testes → cada task; §10 fases → gates 4/9/13.
- **Placeholders:** os pontos "ler o arquivo X antes" são deliberados (componentes grandes existentes que o implementador deve reusar, não reescrever) — cada um vem com file:linha e a interface exata a produzir/consumir. Sem TODO/TBD nos módulos NOVOS (código completo dado).
- **Consistência de tipos:** `SpeedTier`/`ladoDe`/`agruparEmBlocos` (Task 1) reusados verbatim em 5, 8, 10, 11, 12. `MonsterPrep`/`monsterKey` iguais em 5 e 8. `ordemDerivada` (10) consumida em 11.
- **Riscos anotados:** origem do "grupo ativo" (Task 8) e o repo fake das suites de sessão (Tasks 11–12) exigem leitura do código atual — marcado como leitura obrigatória, não adivinhado.
