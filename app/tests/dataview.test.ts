// TDD do avaliador dataview: queries REAIS do corpus da vault, avaliadas
// contra os docs reais, com expectativas computadas independentemente.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { parseQuery } from '../src/dataview/parse'
import { runQuery, type DataviewCtx } from '../src/dataview/eval'
import { isDvLink } from '../src/dataview/model'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')

const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const edges = (
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'links.json'), 'utf8')) as {
    edges: Record<string, string[]>
  }
).edges

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const ctxFor = (current: VaultDoc): DataviewCtx => ({
  catalog,
  current,
  loadDoc: async (id) => readDoc(id),
  edges,
})

/** Primeira fence dataview do body de um doc real. */
const firstQueryOf = (doc: VaultDoc): string => {
  const match = /```dataview\n([\s\S]*?)```/.exec(doc.body)
  expect(match, `query em ${doc.id}`).toBeTruthy()
  return match![1].trim()
}

const linkLabelOf = (cell: unknown): string => {
  expect(isDvLink(cell), `esperava link, veio ${JSON.stringify(cell)}`).toBe(true)
  const link = cell as { target: string; label?: string }
  return link.label ?? link.target.split('/').pop()!
}

describe('parse', () => {
  it('query malformada lança (component cai no fallback)', () => {
    expect(() => parseQuery('TABELA sem sentido')).toThrow()
    expect(() => parseQuery('TABLE couro FROM "x" WHERE and and')).toThrow()
  })
})

describe('TABLE de itens (Armas marciais de duas mãos)', () => {
  const query = `TABLE WITHOUT ID
  link(file.link, title) AS "Arma",
  dano AS "Dano",
  tipo AS "Tipo",
  mãos AS "Mãos",
  propriedades AS "Propriedades",
  up as "Grupo"
FROM "Sistema/Equipamento/Armas"
SORT grupo DESC, ordem, file.name ASC
WHERE subcategoria="Arma" and grupo="d-marcial"`

  it('filtra por FM, projeta colunas e ordena', async () => {
    const current = readDoc('Sistema/Equipamento/Equipamento')
    const result = await runQuery(parseQuery(query), ctxFor(current))

    expect(result.headers).toEqual(['Arma', 'Dano', 'Tipo', 'Mãos', 'Propriedades', 'Grupo'])

    // expectativa independente: varre o índice + FM real
    const expected = catalog.content
      .filter(
        (d) => d.id.startsWith('Sistema/Equipamento/Armas/') && d.grupo === 'd-marcial',
      )
      .map((d) => readDoc(d.id))
      .filter((d) => d.frontmatter['subcategoria'] === 'Arma')
    expect(result.rows.length).toBe(expected.length)
    expect(result.rows.length).toBeGreaterThan(0)

    const names = result.rows.map((r) => linkLabelOf(r[0]))
    expect(new Set(names)).toEqual(new Set(expected.map((d) => d.basename)))

    // SORT ordem (numérico) como critério efetivo dentro do grupo único
    const ordens = result.rows.map((r) => {
      const doc = expected.find((d) => d.basename === linkLabelOf(r[0]))!
      return Number(doc.inlineFields['ordem'])
    })
    expect(ordens).toEqual([...ordens].sort((a, b) => a - b))
  })
})

describe('LIST com null e this.file.name (Ações)', () => {
  it('exclui a própria página e respeita subcategoria = null', async () => {
    const current = readDoc('Sistema/Regras/Ações/Ações')
    const query = firstQueryOf(current)
    expect(query.toUpperCase().startsWith('LIST')).toBe(true)

    const result = await runQuery(parseQuery(query), ctxFor(current))
    const names = result.rows.map((r) => linkLabelOf(r[0]))
    expect(names.length).toBeGreaterThan(0)
    expect(names).not.toContain('Ações')
    // ordenado por file.name como pede a query
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})

describe('contains(Recursos, this.file.link) — backlinks do Atlas (Adaga)', () => {
  it('acha as localizações cujo FM Recursos linka a Adaga', async () => {
    const current = readDoc(
      'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga',
    )
    const query = firstQueryOf(current)
    const result = await runQuery(parseQuery(query), ctxFor(current))

    // expectativa independente: docs do Atlas com [[Adaga]] em Recursos
    const expected = catalog.content
      .filter((d) => d.id.startsWith('Atlas/'))
      .map((d) => readDoc(d.id))
      .filter((d) => {
        const rec = d.frontmatter['Recursos']
        const list = Array.isArray(rec) ? rec : typeof rec === 'string' ? [rec] : []
        return (
          list.some((v) => typeof v === 'string' && /\[\[Adaga(\||\]\])/.test(v)) &&
          d.frontmatter['categoria'] === 'Localização'
        )
      })
    expect(result.rows.length).toBe(expected.length)
    const names = result.rows.map((r) => linkLabelOf(r[0]))
    for (const doc of expected) {
      // coluna usa link(file.link, title): title do FM quando houver, senão basename
      const label = (doc.frontmatter['title'] as string) || doc.basename
      expect(names).toContain(label)
    }
  })
})

describe('FROM [[]] AND !outgoing([[]]) — backlinks só de entrada', () => {
  it('inlinks menos outlinks, filtrado pelo WHERE', async () => {
    // acha um doc real que usa o padrão
    const host = catalog.content
      .map((d) => readDoc(d.id))
      .find((d) => d.body.includes('!outgoing([[]])'))
    expect(host, 'nenhum doc com !outgoing([[]])').toBeDefined()
    const query = /```dataview\n([\s\S]*?!outgoing[\s\S]*?)```/.exec(host!.body)![1].trim()

    const result = await runQuery(parseQuery(query), ctxFor(host!))

    const inlinks = Object.entries(edges)
      .filter(([, targets]) => targets.includes(host!.id))
      .map(([id]) => id)
    const outlinks = new Set(edges[host!.id] ?? [])
    const whereCat = /categoria\s*=\s*"([^"]+)"/.exec(query)?.[1]
    const expected = inlinks
      .filter((id) => !outlinks.has(id))
      .map(readDoc)
      .filter((d) => (whereCat ? d.frontmatter['categoria'] === whereCat : true))
    expect(result.rows.length).toBe(expected.length)
  })
})
