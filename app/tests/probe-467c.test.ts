// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { collectDescriptors, collectEffectTargets, CONDICOES_FOLDER } from '../src/interativa/hero-context'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc | undefined => {
  const f = path.join(vaultDataDir, `${id}.json`)
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as VaultDoc) : undefined
}

describe('probe 467c', () => {
  it('descriptors do Carlos incluem Encantar Arma?', () => {
    const ent = JSON.parse(fs.readFileSync('/tmp/heroi-467.json', 'utf8'))
    const fm = ent.frontmatter as Record<string, unknown>
    const refDoc = (value: unknown) => {
      const t = String(value ?? '').replace(/^\[\[|\]\]$/g, '').split('|')[0]!
      const r = catalog.resolve(t)
      return r.kind === 'doc' ? load(r.id) : undefined
    }
    const descs = collectDescriptors({ fm, refDoc, condicaoDocs: [], extraDocs: [] })
    const enc = descs.find((d) => d.label === 'Encantar Arma')
    fs.writeFileSync(
      '/tmp/probe467c.json',
      JSON.stringify(
        {
          targetsTemEncantar: collectEffectTargets(fm).includes('Encantar Arma'),
          nDescs: descs.length,
          enc: enc
            ? { label: enc.label, selectsWeapon: enc.selectsWeapon, numericSelector: enc.numericSelector, tipo: enc.tipo }
            : null,
        },
        null,
        1,
      ),
    )
    expect(true).toBe(true)
  })
})
