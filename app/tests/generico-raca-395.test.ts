// @vitest-environment node
// #395 — "adição de criatura genérica não ta funcionando: não ta colocando a
// evolução básica do monstro com todas as habilidades padrão. Também não ta
// deixando escolher a raça."
//   - A Evolução Básica de Monstro é concedida pela CLASSE de bestiário
//     (Complementar Habilidades.Lista [[Evolução Básica de Monstro]]) e aplica
//     via cascata (effectiveFmForPublish) — o genérico já leva a classe (#389).
//   - A RAÇA agora é escolhível: o roster persiste `raca`, o doc sintético
//     grava `Raça: [[X]]` e a cascata concede as habilidades raciais.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { genericoMonstroDoc } from '../src/data/session-repo/encounter-actions'
import { effectiveFmForPublish } from '../src/data/session-repo/publish'
import { toContractRoster, resolveRosterEntries, type RosterItem } from '../src/mestre/roster'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest,
)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

/** Nomes das habilidades no Habilidades.Lista do FM derivado. */
function habilidades(fm: Record<string, unknown>): string[] {
  const lista = ((fm.Habilidades as { Lista?: unknown[] })?.Lista ?? []) as Record<string, unknown>[]
  return lista.flatMap((row) => Object.keys(row).map((k) => k.replace(/^\[\[|\]\]$/g, '').split('|')[0]!))
}

describe('#395 — Evolução Básica + Raça do genérico', () => {
  it('doc sintético com classe leva a EVOLUÇÃO BÁSICA DE MONSTRO na cascata', async () => {
    const doc = genericoMonstroDoc('Capanga', { tier: 1, classe: 'Soldado', raca: 'Incomum' })
    const efm = await effectiveFmForPublish(doc, catalog)
    expect(habilidades(efm)).toContain('Evolução Básica de Monstro')
  }, 30000)

  it('doc sintético com raça Goblin leva a habilidade racial (Escaramuça Goblin) + Sintonia', async () => {
    const doc = genericoMonstroDoc('Goblin Genérico', { tier: 1, classe: 'Soldado', raca: 'Goblin' })
    const efm = await effectiveFmForPublish(doc, catalog)
    const habs = habilidades(efm)
    expect(habs).toContain('Evolução Básica de Monstro') // da classe
    expect(habs).toContain('Escaramuça Goblin') // da raça
    // Goblin define Sintonia [[Traço Elemental do Fogo]] e Tamanho Pequeno
    expect(String(efm.Sintonia ?? '')).toContain('Fogo')
    expect(String(efm.Tamanho ?? '')).toBe('Pequeno')
  }, 30000)

  it('raça default Incomum quando não escolhida (retrocompat)', async () => {
    const doc = genericoMonstroDoc('Sem Raça', { tier: 0, classe: 'Soldado' })
    expect(String((doc.frontmatter as Record<string, unknown>).Raça)).toBe('[[Incomum]]')
  })

  it('toContractRoster + resolveRosterEntries preservam `raca`', () => {
    const item: RosterItem = {
      sourceId: null,
      sourcePath: null,
      label: 'Goblin Genérico',
      qty: 3,
      tier: 1,
      modificador: null,
      classe: 'Soldado',
      raca: 'Goblin',
    }
    const roster = toContractRoster([item])
    expect(roster.entries[0]).toMatchObject({ raca: 'Goblin', classe: 'Soldado', tier: 1 })
    const resolved = resolveRosterEntries(roster, catalog, new Map())
    expect(resolved[0]!.item).toMatchObject({ raca: 'Goblin', classe: 'Soldado' })
  })
})
