// @vitest-environment node
// CASCATA de rule elements LIVE (issue #41): uma escolha aplica em cascata na
// ficha inteira SEM salvar. O merge `mergeCalculatedIntoFm` funde o
// `calculated` (adições de regra) no FM salvo → FM derivado que as abas
// renderizam. Espelho de mergeCalculatedIntoModel do plugin.
//
// ORÁCULO: o próprio FM materializado do Carlos (o plugin já cascateou e
// salvou). Provas:
//   (A) idempotência — fundir o calculated no FM materializado REPRODUZ os
//       ranks salvos (o merge cascateia certo, não corrompe);
//   (B) cor por origem — degrau vindo de RULE ELEMENT (fonte Regra) fica OURO;
//       degrau de SELEÇÃO QUE GASTA SLOT (fonte Slot.*) fica VERMELHO;
//   (C) live-add — a partir de um FM SEM as saídas de regra, o merge
//       RECONSTRÓI as proficiências de regra (Atuacao M, Diplomacia A) —
//       "montar a ficha do zero" cascateando na hora.
import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { HeroProjection } from '../src/rules/projection'
import { mergeCalculatedIntoFm } from '../src/rules/merge-calculated'
import { rankStates, type ProfRow } from '../src/components/ficha/hero-model'
import { slugify, type RankStateKey } from '../src/components/ficha/registry'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8')) as VaultDoc
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const savedFm = carlos.frontmatter as Record<string, unknown>

/** Cor efetiva de um estado de degrau: ouro = regra, vermelho = slot/usuário,
 *  cinza = N, inativo = off/passN. Espelho da semântica do RANK_STATES /
 *  as-naem-btn (registry.ts + styles.css do plugin). */
function colorOf(state: RankStateKey): 'gold' | 'red' | 'gray' | 'inactive' {
  if (state === 'selRule' || state === 'ruleSlot') return 'gold'
  if (state === 'sel' || state === 'selSlot') return 'red'
  if (state === 'selN') return 'gray'
  return 'inactive'
}

type Lista = { Nome?: string; Proficiencia?: string; Incrementos?: unknown[] }
function rowsOf(fm: Record<string, unknown>, ns: string): ProfRow[] {
  const root = fm[ns] as { Lista?: unknown } | undefined
  return Array.isArray(root?.Lista) ? (root!.Lista as ProfRow[]) : []
}
function findRow(rows: (Lista | ProfRow)[], name: string): ProfRow | undefined {
  return (rows as ProfRow[]).find((r) => slugify(String(r.Nome)) === name)
}

let projection: HeroProjection
let derived: Record<string, unknown>

beforeAll(async () => {
  const out = await projectHeroRules(savedFm, catalog, loadFromDisk)
  projection = out.projection
  derived = projection.derivedFm
})

describe('cascata de rule elements no FM derivado (issue #41)', () => {
  it('expõe derivedFm no shape do FM (Pericias/Oficios/Defesas/Sentidos)', () => {
    expect(derived).toBeTruthy()
    expect(rowsOf(derived, 'Pericias').length).toBeGreaterThan(0)
    expect(rowsOf(derived, 'Oficios').length).toBeGreaterThan(0)
  })

  it('(A) idempotência: os ranks derivados reproduzem o FM materializado', () => {
    for (const ns of ['Pericias', 'Oficios', 'Defesas_Resistencias', 'Sentidos']) {
      const savedRows = rowsOf(savedFm, ns)
      for (const saved of savedRows) {
        const der = findRow(rowsOf(derived, ns), slugify(String(saved.Nome)))
        expect(der, `${ns}.${saved.Nome} presente no derivado`).toBeTruthy()
        expect(String(der!.Proficiencia ?? 'N'), `${ns}.${saved.Nome} rank`).toBe(
          String(saved.Proficiencia ?? 'N'),
        )
      }
    }
  })

  it('(A) idempotência: proficiências de regra (Atuacao M) e escalares de defesa presentes', () => {
    expect(findRow(rowsOf(derived, 'Oficios'), 'Atuacao')?.Proficiencia).toBe('M')
    expect(findRow(rowsOf(derived, 'Defesas_Resistencias'), 'Defesa')?.Proficiencia).toBe('M')
    expect(findRow(rowsOf(derived, 'Sentidos'), 'Percepcao')?.Proficiencia).toBe('M')
  })

  it('(B) cor por origem: rank de RULE ELEMENT = OURO, rank de SLOT = VERMELHO', () => {
    // Diplomacia (E): A vem de Regra (Método Artístico) → OURO; E de Slot.E → VERMELHO.
    const dip = findRow(rowsOf(derived, 'Pericias'), 'Diplomacia')!
    const dipStates = rankStates(dip)
    expect(colorOf(dipStates.A)).toBe('gold')
    expect(colorOf(dipStates.E)).toBe('red')

    // Acrobacia (E): A e E de Slot → VERMELHO nos dois degraus.
    const acro = findRow(rowsOf(derived, 'Pericias'), 'Acrobacia')!
    const acroStates = rankStates(acro)
    expect(colorOf(acroStates.A)).toBe('red')
    expect(colorOf(acroStates.E)).toBe('red')

    // Ofício Atuacao (M): concedido inteiro por regra (Mestre-Bardo) → OURO.
    const atu = findRow(rowsOf(derived, 'Oficios'), 'Atuacao')!
    const atuStates = rankStates(atu)
    expect(colorOf(atuStates.M)).toBe('gold')
  })

  it('(C) live-add: a partir de um FM SEM as saídas de regra, o merge as reconstrói', () => {
    // Simula uma ficha em construção: remove as proficiências de regra já
    // materializadas (mantém as do usuário: Slot/Passado). O merge deve
    // recolocá-las — a cascata acontece na hora, sem save.
    const stripped = structuredClone(savedFm) as Record<string, unknown>
    const sPer = rowsOf(stripped, 'Pericias')
    const sOfi = rowsOf(stripped, 'Oficios')
    // Atuacao: era M por Regra — zera pra N sem incrementos.
    const atu = findRow(sOfi, 'Atuacao')!
    atu.Proficiencia = 'N'
    atu.Incrementos = []
    // Diplomacia: remove o incremento A:Regra, guarda E:Slot.E.
    const dip = findRow(sPer, 'Diplomacia')!
    dip.Incrementos = (dip.Incrementos ?? []).filter(
      (e) => !('A' in (e as Record<string, string>) && String((e as Record<string, string>).A).startsWith('Regra')),
    )
    dip.Proficiencia = 'A' // rank residual do slot antes da cascata (E:Slot.E vira E depois)

    // MESMO calculated (é dirigido pelos SEEDS: Classe/Habilidades/Subclasses,
    // que continuam no FM). appliedRules vazio → fontes caem em "Regra" (ouro).
    const rebuilt = mergeCalculatedIntoFm(stripped, projection.calculated, [])

    const atu2 = findRow(rowsOf(rebuilt, 'Oficios'), 'Atuacao')!
    expect(atu2.Proficiencia).toBe('M')
    expect(colorOf(rankStates(atu2).M)).toBe('gold')

    const dip2 = findRow(rowsOf(rebuilt, 'Pericias'), 'Diplomacia')!
    expect(dip2.Proficiencia).toBe('E') // A(regra) + E(slot) → max E
    const dip2States = rankStates(dip2)
    expect(colorOf(dip2States.A)).toBe('gold') // reconstruído pela regra
    expect(colorOf(dip2States.E)).toBe('red') // slot do usuário preservado
  })
})
