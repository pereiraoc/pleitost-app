// @vitest-environment node
// #491 — Flexibilidade Marcial (técnica Mestre do Guerreiro) agora oferece as
// duas escolhas na ficha: 1 técnica Adepta + 1 Experiente de Guerreiro
// ("Técnica do Dia" ×2 — MESMO label de propósito: labels distintos fariam os
// dois picks gravarem `Escolha.[[pai]]` sem NN e um apagaria o outro, a
// família #484; irmãs numeradas gravam Escolha.01/02). O "que não tenha" sai
// do filtro "já tem" dos dropdowns.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

describe('#491 — Flexibilidade Marcial oferece Adepta + Experiente', () => {
  it('duas escolhas irmãs numeradas, com as listas certas', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 9,
      Tecnicas: { Lista: [{ '[[Flexibilidade Marcial]]': 'Slot.M' }] },
    }
    const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
    const p = projection as never as {
      habilidadeChoices?: Array<{ sourceNote?: string; label?: string; options?: string[]; occurrenceWithinParent?: number }>
    }
    const flex = (p.habilidadeChoices ?? []).filter((c) => c.sourceNote === 'Flexibilidade Marcial')
    expect(flex).toHaveLength(2)
    // irmãs numeradas (mesma assinatura sourceNote|label) — save collision-free
    expect(flex[0]!.occurrenceWithinParent).toBe(1)
    expect(flex[1]!.occurrenceWithinParent).toBe(2)
    const opts = (c: { options?: string[] }) => c.options ?? []
    expect(opts(flex[0]!).some((o) => o.includes('Aparar'))).toBe(true) // Adepta
    expect(opts(flex[0]!).some((o) => o.includes('Arsenal Diverso'))).toBe(false)
    expect(opts(flex[1]!).some((o) => o.includes('Arsenal Diverso'))).toBe(true) // Experiente
    expect(opts(flex[1]!).some((o) => o.includes('Aparar'))).toBe(false)
  })

  it('picks das duas gravariam tags NN distintas (sem colisão)', async () => {
    // pick salvo nas DUAS ocorrências → cada uma re-infere o próprio
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 9,
      Tecnicas: {
        Lista: [
          { '[[Flexibilidade Marcial]]': 'Slot.M' },
          { '[[Aparar]]': 'Escolha.01.[[Flexibilidade Marcial]]' },
          { '[[Arsenal Diverso]]': 'Escolha.02.[[Flexibilidade Marcial]]' },
        ],
      },
    }
    const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
    const p = projection as never as {
      habilidadeChoices?: Array<{ sourceNote?: string; pick?: string | null }>
    }
    const flex = (p.habilidadeChoices ?? []).filter((c) => c.sourceNote === 'Flexibilidade Marcial')
    const picks = flex.map((c) => c.pick)
    expect(picks).toContain('[[Aparar]]')
    expect(picks).toContain('[[Arsenal Diverso]]')
  })
})
