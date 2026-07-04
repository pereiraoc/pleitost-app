// Integração sobre o vault-data real: valida os tipos escritos à mão contra o
// extractor e o comportamento do catálogo (agrupamento, resolver de wikilinks).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { docJsonUrl } from '../src/data/useDoc'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')

const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const ADAGA_ID = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga'

describe('catalog sobre vault-data real', () => {
  it('separa content de scaffolding conforme counts', () => {
    expect(catalog.content).toHaveLength(manifest.counts.content)
  })

  it('árvore de pastas cobre todos os docs content', () => {
    expect(catalog.folderTree.count).toBe(manifest.counts.content)
    const herois = catalog.folderByPath.get('Sistema/Criaturas/Heróis')
    expect(herois).toBeDefined()
    expect(herois!.docs.length).toBe(
      catalog.content.filter((d) => d.id.startsWith('Sistema/Criaturas/Heróis/')).length,
    )
  })

  it('agrupamento por tipo reproduz manifest.byType exatamente', () => {
    const counts = Object.fromEntries(
      [...catalog.docsByType].map(([type, docs]) => [type, docs.length]),
    )
    expect(counts).toEqual(manifest.byType)
  })

  it('resolve por basename único, path completo e alvo com âncora', () => {
    expect(catalog.resolve('Adaga')).toEqual({ kind: 'doc', id: ADAGA_ID })
    expect(catalog.resolve(ADAGA_ID)).toEqual({ kind: 'doc', id: ADAGA_ID })
    expect(catalog.resolve('Adaga#qualquer-âncora')).toEqual({ kind: 'doc', id: ADAGA_ID })
  })

  it('basename duplicado → ambiguous com todos os candidatos', () => {
    // acha uma duplicata real nos dados em vez de hardcodar uma
    const seen = new Map<string, string[]>()
    for (const doc of catalog.content) {
      if (!doc.basename) continue
      seen.set(doc.basename, [...(seen.get(doc.basename) ?? []), doc.id])
    }
    const dup = [...seen.entries()].find(([, ids]) => ids.length > 1)
    expect(dup, 'esperava ao menos um basename duplicado na vault').toBeDefined()
    const [basename, ids] = dup!
    const res = catalog.resolve(basename)
    expect(res.kind).toBe('ambiguous')
    if (res.kind === 'ambiguous') expect(res.candidates).toEqual(ids)
  })

  it('alvo inexistente → missing', () => {
    expect(catalog.resolve('doc-que-nao-existe-xyz')).toEqual({ kind: 'missing' })
  })

  it('doc real (Adaga) bate com o shape VaultDoc', () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(vaultDataDir, `${ADAGA_ID}.json`), 'utf8'),
    ) as VaultDoc
    expect(doc.id).toBe(ADAGA_ID)
    expect(doc.type).toBe('Item')
    expect(doc.subtype).toBe('Arma')
    expect(doc.inlineFields['dano']).toBe('"d4+2"')
    expect(doc.links.some((l) => l.target === 'Precisa')).toBe(true)
    expect(typeof doc.body).toBe('string')
    expect(Array.isArray(doc.ruleElements)).toBe(true)
    expect(Array.isArray(doc.headings)).toBe(true)
  })

  it('docJsonUrl escapa espaços e acentos por segmento', () => {
    expect(docJsonUrl(ADAGA_ID)).toBe(
      '/vault-data/Sistema/Equipamento/Armas/Armas%20Simples/Corpo-a-Corpo%20Simples/Adaga.json',
    )
    expect(docJsonUrl('a/Ágil')).toBe('/vault-data/a/%C3%81gil.json')
  })
})
