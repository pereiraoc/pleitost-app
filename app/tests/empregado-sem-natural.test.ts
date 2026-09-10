// @vitest-environment jsdom
// EMPREGADO SEM ARMA NATURAL (report 2026-09-10: "tem empregado com mandíbula
// por aí; no POA não vai ter arma natural no empregado — só manobras e
// inventário"). O Contexto declara `regras.companheiro_animal.
// sem_armas_naturais`; o pós-processo do mundo existia, mas olhava a CHAVE da
// linha de Ataques.Lista — e no FM derivado a linha é {Nome: '[[Mandíbula]]',
// …}, então nada saía. O teste projeta o Canino DE VERDADE nos dois mundos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarContextoAosDocs, buildCatalog } from '../src/data/catalog'
import { setActiveContexto } from '../src/data/reskin'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { loadDoc } from '../src/data/useDoc'
import { emptyCompanheiroFrontmatter } from '../src/data/local-entities'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temMundo = fs.existsSync(path.join(cyberDir, 'contexto.json'))

function nomesDosAtaques(fm: Record<string, unknown>): string[] {
  const lista = ((fm['Ataques'] as Record<string, unknown> | undefined)?.['Lista'] ?? []) as unknown[]
  return lista.map((r) =>
    typeof r === 'string'
      ? r
      : String((r as Record<string, unknown>)['Nome'] ?? Object.keys(r as Record<string, unknown>)[0] ?? ''),
  )
}

describe.skipIf(!temMundo)('Empregado (POA) não luta de mandíbula', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  const catalogPoa = {
    ...buildCatalog({ ...manifest, docs: aplicarContextoAosDocs(manifest.docs, def) }),
    contextoDef: def,
  }
  const catalogSemMundo = buildCatalog(manifest)
  const fm = { ...emptyCompanheiroFrontmatter('Neide'), Classe: '[[Companheiro Animal Canino]]' }

  beforeAll(() => {
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
      const file = path.join(cyberDir, rel)
      const ok = fs.existsSync(file)
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
    }) as typeof fetch
  })
  afterAll(() => setActiveContexto(null))

  it('sem as regras do mundo o Canino tem Mandíbula (controle)', async () => {
    setActiveContexto(null)
    const { projection } = await projectHeroRules(fm as never, catalogSemMundo, loadDoc)
    expect(nomesDosAtaques(projection.derivedFm as Record<string, unknown>).join(' ')).toContain('Mandíbula')
  }, 30000)

  it('no POA o Empregado fica só com o que não é natural (manobras etc.)', async () => {
    setActiveContexto(def)
    const { projection } = await projectHeroRules(fm as never, catalogPoa, loadDoc)
    const nomes = nomesDosAtaques(projection.derivedFm as Record<string, unknown>)
    expect(nomes.join(' ')).not.toContain('Mandíbula')
    expect(nomes.some((n) => n.includes('Manobras'))).toBe(true)
  }, 30000)
})
