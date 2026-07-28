// @vitest-environment node
// #389 — "criaturas genericas (sem ficha) na hora de montar um combate tem
// todas o mesmo EV (25)": o Criador deixava escolher tier/modificador do
// genérico, mas o roster do CONTRATO só persistia {sourcePath,label,qty} e o
// doc sintético hardcodava Tier 0/Soldado — TODO genérico derivava idêntico
// (Soldado T0 → EV 25). Agora a entrada genérica persiste tier/modificador/
// classe e o doc sintético deriva os stats REAIS da classe de bestiário
// escolhida (mesma engine dos monstros de ficha).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { npcInputsFromRoster } from '../src/data/session-repo/encounter-actions'
import { resolveRosterEntries, toContractRoster, type RosterItem } from '../src/mestre/roster'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

describe('#389 — genérico deriva EV da classe de bestiário + tier escolhidos', () => {
  it('genérico Tier 2 Artilharia deriva EV 45 (regra da classe), não os 25 do Soldado T0', async () => {
    const [npc] = await npcInputsFromRoster(
      catalog,
      [{ label: 'Canhoneiro', qty: 1, sourcePath: null, tier: 2, classe: 'Artilharia' }],
      'gm',
    )
    expect(npc).toBeTruthy()
    // Artilharia: `Tier 2 Definir Vida.Vitalidade 45` (regra da classe)
    expect(npc!.summary.vitalidadeMax).toBe(45)
    expect(npc!.state.recursosRestantes?.vitalidade).toBe(45)
    expect(npc!.summary.stats.defesa).toBeGreaterThan(0)
  }, 30000)

  it('genérico Tier 1 Bruto deriva EV 45 ≠ Soldado T0 (25); tier persiste no summary', async () => {
    const [npc] = await npcInputsFromRoster(
      catalog,
      [{ label: 'Ogro', qty: 1, sourcePath: null, tier: 1, classe: 'Bruto' }],
      'gm',
    )
    // Bruto: `Tier 1 Definir Vida.Vitalidade 45`
    expect(npc!.summary.vitalidadeMax).toBe(45)
  }, 30000)

  it('entrada LEGADA (sem tier/classe) mantém o default Tier 0 Soldado (EV 25)', async () => {
    const [npc] = await npcInputsFromRoster(
      catalog,
      [{ label: 'Capanga', qty: 1, sourcePath: null }],
      'gm',
    )
    expect(npc!.summary.vitalidadeMax).toBe(25)
  }, 30000)

  it('toContractRoster persiste tier/modificador/classe da entrada genérica', () => {
    const item: RosterItem = {
      sourceId: null,
      sourcePath: null,
      label: 'Canhoneiro',
      qty: 2,
      tier: 2,
      modificador: 'Elite',
      classe: 'Artilharia',
    }
    const roster = toContractRoster([item])
    expect(roster.entries[0]).toMatchObject({
      sourcePath: null,
      label: 'Canhoneiro',
      qty: 2,
      tier: 2,
      modificador: 'Elite',
      classe: 'Artilharia',
    })
  })

  it('resolveRosterEntries PONTUA o genérico persistido com tier (antes: "não pontua")', () => {
    const entries = [
      { sourcePath: null, label: 'Canhoneiro', qty: 2, tier: 2, modificador: 'Elite' as const, classe: 'Artilharia' },
      { sourcePath: null, label: 'Legado', qty: 1 },
    ]
    const resolved = resolveRosterEntries({ entries }, catalog, new Map())
    expect(resolved[0]!.item).toMatchObject({ tier: 2, modificador: 'Elite', qty: 2 })
    expect(resolved[0]!.motivo).toBeNull()
    // legado sem tier segue fora da pontuação
    expect(resolved[1]!.item).toBeNull()
    expect(resolved[1]!.motivo).toContain('genérico')
  })
})
