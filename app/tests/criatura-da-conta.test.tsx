// @vitest-environment jsdom
// A CRIATURA DA CONTA no bloco de combate (report 2026-09-10):
//   "editei o Sargento Valdir Brum na ficha mas não aparece corrigido na
//    campanha" · "fiz mais caras do bestiário, tem que ficar mantido na conta".
// Duas pontas:
//   A. edição da FICHA (pleitost.heroEdits.<id>, que sincroniza na conta) não
//      entrava em `effectiveDoc` — só a ficha via; o resto do app lia a base
//      da vault. Agora é a 4ª camada da projeção.
//   B. criatura CRIADA no app é entidade local e o fence resolvia só pelo
//      catálogo da vault: a entrada ficava "sem ficha no catálogo" (sem tier,
//      sem vida, sem retrato). Agora cai nas entidades locais por basename,
//      como o resolve de regras já faz (useHeroRules).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { useDocs } from '../src/data/useDoc'
import { writeHeroEdit, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyMonstroFrontmatter,
  setLocalEntityFm,
} from '../src/data/local-entities'
import { resolveRosterEntries, rosterMonsterIds } from '../src/mestre/roster'
import { npcInputsFromRoster } from '../src/data/session-repo/encounter-actions'
import { rosterFromFence } from '../src/aventura/roster-speeds'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const GOBLIN = 'Sistema/Criaturas/Bestiário/Goblin Batedor'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

describe('A — a edição da ficha vale em qualquer tela', () => {
  it('doc do bestiário lido por useDocs já vem com a edição da conta', async () => {
    writeHeroEdit(GOBLIN, 'fm', 'Vida.Vitalidade', 99, { origem: 'teste' })
    const { result } = renderHook(() => useDocs([GOBLIN]))
    await waitFor(() => expect(result.current?.get(GOBLIN)).toBeTruthy(), { timeout: 15000 })
    const fm = result.current!.get(GOBLIN)!.frontmatter as Record<string, unknown>
    expect((fm['Vida'] as Record<string, unknown>)['Vitalidade']).toBe(99)
  }, 20000)
})

describe('B — criatura criada no app entra no fence', () => {
  function criarBrigadiano() {
    const id = createLocalEntity('Monstro', 'Brigadiano Atirador', emptyMonstroFrontmatter())
    setLocalEntityFm(id, 'Tier', 2)
    setLocalEntityFm(id, 'Vida.Vitalidade', 40)
    return id
  }

  it('rosterMonsterIds acha a entidade local por nome (catálogo primeiro)', () => {
    const id = criarBrigadiano()
    const roster = rosterFromFence('- 1 [[Brigadiano Atirador]] rápido\n- 1 [[Arruaceiro]] lento\n')
    const ids = rosterMonsterIds(roster, catalog)
    expect(ids).toContain(id)
    expect(ids.some((x) => x.endsWith('Bestiário/Arruaceiro'))).toBe(true)
  })

  it('a entrada local PONTUA no combate (tier do que o user criou)', () => {
    const id = criarBrigadiano()
    const roster = rosterFromFence('- 1 [[Brigadiano Atirador]] rápido\n')
    const docs = new Map([[id, JSON.parse(JSON.stringify({ id, basename: 'x' }))]])
    void docs
    const resolvidas = resolveRosterEntries(roster, catalog, undefined)
    expect(resolvidas[0]!.motivo).toBeNull()
    expect(resolvidas[0]!.item?.tier).toBe(2)
    expect(resolvidas[0]!.item?.sourceId).toBe(id)
  })
})

// G — a MESA de amanhã: o caminho "adicionar à sessão" publica o NPC a partir
// do MESMO doc que a tela mostra (edição da conta + criatura local inclusas).
describe('G — sessão: o NPC que entra na iniciativa', () => {
  it('criatura da vault entra com a edição da ficha (a classe que a conta trocou)', async () => {
    // é o que o mestre fez de verdade no Brum: trocou a Classe na ficha.
    // Vitalidade não serve de sonda: ela é DERIVADA das regras no publish
    // (effectiveFmForPublish), então o valor cru do FM não manda nela.
    writeHeroEdit(GOBLIN, 'fm', 'Classe', '[[Líder|Líder Competente]]', { origem: 'teste' })
    const roster = rosterFromFence(`- 1 [[Goblin Batedor]] rápido\n`)
    const npcs = await npcInputsFromRoster(catalog, roster.entries, 'membro-1')
    expect(npcs).toHaveLength(1)
    expect(npcs[0]!.characterPath).toBe(GOBLIN)
    expect(npcs[0]!.summary?.classe).toContain('Líder')
  }, 30000)

  it('criatura criada no app entra pelo NOME do fence (não vira genérico)', async () => {
    const id = createLocalEntity('Monstro', 'Brigadiano Atirador', emptyMonstroFrontmatter())
    setLocalEntityFm(id, 'Tier', 2)
    const roster = rosterFromFence(`- 2 [[Brigadiano Atirador]] rápido\n`)
    const npcs = await npcInputsFromRoster(catalog, roster.entries, 'membro-1')
    expect(npcs).toHaveLength(2)
    for (const npc of npcs) {
      expect(npc.characterPath).toBe(id)
      expect(npc.summary?.nome ?? npc.summary?.basename).toContain('Brigadiano')
    }
  }, 30000)
})
