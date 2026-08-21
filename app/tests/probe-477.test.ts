// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

describe('probe 477', () => {
  it('escolhas + listas do Uni', async () => {
    const ent = JSON.parse(fs.readFileSync('/tmp/heroi-477.json', 'utf8'))
    const fm = ent.frontmatter as Record<string, unknown>
    const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
    const p = projection as never as {
      habilidadeChoices?: Record<string, unknown>[]
      subclassChoices?: Record<string, unknown>[]
    }
    const d = (projection.derivedFm ?? fm) as Record<string, unknown>
    const listas: Record<string, unknown> = {}
    for (const k of ['Habilidades', 'Tecnicas']) {
      listas[k] = ((d[k] as Record<string, unknown>)?.['Lista'] ?? []) as unknown[]
    }
    fs.writeFileSync(
      '/tmp/probe477.json',
      JSON.stringify(
        {
          habChoices: (p.habilidadeChoices ?? []).map((c) => ({
            sourceNote: c['sourceNote'],
            source: c['source'],
            pick: c['pick'],
            label: c['label'],
            targetRaw: c['targetRaw'],
          })),
          listas,
        },
        null,
        1,
      ),
    )
    expect(true).toBe(true)
  })
})
