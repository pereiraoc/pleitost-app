// @vitest-environment node
// #57 — PARALELIZAÇÃO do BFS de regras. Prova, sobre o herói REAL (Carlos), que:
//   (a) determinismo: a extração produz o MESMO resultado com resolver imediato
//       e com resolver de latência ALEATÓRIA (fora de ordem) — a paralelização
//       por nível não depende da ordem de chegada dos docs;
//   (b) concorrência: docs do mesmo nível são resolvidos EM PARALELO
//       (maxInFlight > 1), não um-a-um como o loop serial do plugin;
//   (c) ganho: com latência fixa por doc, o tempo total ~= nº de NÍVEIS × d, e
//       não nº de DOCS × d (o que a versão serial custaria).
// A CORREÇÃO absoluta do resultado é travada pelos oráculos rules-golden /
// rules-cascade* / interativa; aqui o foco é a invariância à ordem/concorrência.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { rulesModelFromFm } from '../src/rules/rules-model'
import { extractHeroRules, ruleModelKey, type DocResolver, type HeroRulesResult } from '../src/rules/extract'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8')) as VaultDoc
const model = rulesModelFromFm(carlos.frontmatter as Record<string, unknown>)

const docCache = new Map<string, VaultDoc | null>()
function readDoc(id: string): VaultDoc | null {
  if (docCache.has(id)) return docCache.get(id)!
  const file = path.join(vaultDataDir, `${id}.json`)
  const doc = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as VaultDoc) : null
  docCache.set(id, doc)
  return doc
}

interface Instrumented {
  resolver: DocResolver
  stats: { calls: number; inFlight: number; maxInFlight: number }
}

/** Resolvedor wikilink→doc com latência configurável + medição de concorrência. */
function makeResolver(delay: (i: number) => number): Instrumented {
  const stats = { calls: 0, inFlight: 0, maxInFlight: 0 }
  let i = 0
  const resolver: DocResolver = async (wikilinkOrName) => {
    const n = i++
    stats.calls++
    stats.inFlight++
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight)
    const d = delay(n)
    if (d > 0) await new Promise((r) => setTimeout(r, d))
    else await Promise.resolve()
    const res = catalog.resolve(wikilinkOrName)
    const doc = res.kind === 'doc' ? readDoc(res.id) : null
    stats.inFlight--
    return doc
  }
  return { resolver, stats }
}

/** Assinatura canônica e comparável de um resultado de extração. */
function signature(r: HeroRulesResult): string {
  return JSON.stringify({
    calculated: Object.keys(r.calculated)
      .sort()
      .map((k) => [k, r.calculated[k]]),
    choices: r.choices
      .map((c) => [c.choiceKey, c.pick, c.source])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    appliedRules: r.appliedRules.length,
    rejectedRules: r.rejectedRules.length,
    visitedDocs: [...r.visitedDocs.keys()].sort(),
  })
}

describe('#57 BFS paralelo — determinismo (invariância à ordem de chegada)', () => {
  it('(a) resolver imediato vs latência aleatória → resultado IDÊNTICO', async () => {
    const immediate = makeResolver(() => 0)
    const shuffled = makeResolver(() => Math.floor(Math.random() * 8)) // 0..7ms

    const [rImmediate, rShuffled] = await Promise.all([
      extractHeroRules(model, immediate.resolver),
      extractHeroRules(model, shuffled.resolver),
    ])

    // Mesmo conjunto de regras aplicadas + mesmos deltas + mesmos picks.
    expect(signature(rShuffled)).toBe(signature(rImmediate))
    // Sanidade: a extração fez trabalho real (classe Bardo → deltas + subclasses).
    expect(Object.keys(rImmediate.calculated).length).toBeGreaterThan(0)
    expect(rImmediate.visitedDocs.size).toBeGreaterThan(5)
    expect(rImmediate.choices.length).toBeGreaterThan(0)
  })
})

describe('#57 gate — ruleModelKey (assinatura estável do que a regra lê)', () => {
  const fm = carlos.frontmatter as Record<string, unknown>
  const keyOf = (f: Record<string, unknown>) => ruleModelKey(rulesModelFromFm(f))
  const base = keyOf(fm)

  it('campos de BIO (nome/motivação/idade/apelido) NÃO mudam a key', () => {
    const bio = (fm['Biografia'] ?? {}) as Record<string, unknown>
    expect(keyOf({ ...fm, nome: 'Outro Nome' })).toBe(base)
    expect(keyOf({ ...fm, Biografia: { ...bio, Motivacao: 'nova motivação' } })).toBe(base)
    expect(keyOf({ ...fm, Biografia: { ...bio, Idade: 999, Apelido: 'X' } })).toBe(base)
  })

  it('campos que SEMEIAM/CONDICIONAM regra MUDAM a key', () => {
    expect(keyOf({ ...fm, Classe: '[[Mago]]' })).not.toBe(base)
    expect(keyOf({ ...fm, Sintonia: '[[Traço Elemental da Água|Água]]' })).not.toBe(base)
    expect(keyOf({ ...fm, Subclasses: ['[[Método Artístico (Manipulador)]]'] })).not.toBe(base)
    expect(keyOf({ ...fm, ['Nível']: 5 })).not.toBe(base)
    expect(keyOf({ ...fm, Tier: 2 })).not.toBe(base)
    // Uma habilidade a mais é seed do BFS → muda a key.
    expect(keyOf({ ...fm, Habilidades: { Lista: [{ '[[Ataque Poderoso]]': '' }] } })).not.toBe(base)
    expect(keyOf({ ...fm, Atributos: { ...(fm['Atributos'] as object), Principal: 'FOR' } })).not.toBe(base)
    // Passado é rule-relevant (perícia/ofício do passado) e vive na Biografia.
    const bio = (fm['Biografia'] ?? {}) as Record<string, unknown>
    expect(keyOf({ ...fm, Biografia: { ...bio, Passado: 'Um passado totalmente diferente' } })).not.toBe(base)
  })

  it('key é determinística (mesmo fm → mesma string)', () => {
    expect(keyOf(fm)).toBe(base)
    expect(keyOf(structuredClone(fm))).toBe(base)
  })
})

describe('#57 BFS paralelo — concorrência e ganho', () => {
  it('(b) docs do mesmo nível resolvem EM PARALELO (maxInFlight > 1)', async () => {
    const inst = makeResolver(() => 3) // 3ms/doc: força sobreposição no nível
    await extractHeroRules(model, inst.resolver)
    expect(inst.stats.calls).toBeGreaterThan(1)
    expect(inst.stats.maxInFlight).toBeGreaterThan(1)
  })

  it('(c) ganho: os docs de cada nível resolvem em LOTE (concorrência), não 1-a-1', async () => {
    const d = 5
    const inst = makeResolver(() => d)
    const t0 = performance.now()
    await extractHeroRules(model, inst.resolver)
    const elapsed = performance.now() - t0
    const C = inst.stats.calls

    // Prova ESTRUTURAL do ganho, robusta a carga (#255): o BFS resolve os docs de
    // um mesmo nível em LOTE — a concorrência de pico (maxInFlight > 1) é a causa
    // do speedup; serial (1-a-1) daria maxInFlight = 1. NÃO se compara o tempo de
    // parede MEDIDO (sob carga do runner) com um serial TEÓRICO não-carregado:
    // sob CPU saturada o próprio paralelo passa da estimativa serial → flaky. O
    // wall-clock fica só como LOG informativo.
    expect(inst.stats.maxInFlight).toBeGreaterThan(1)
    expect(C).toBeGreaterThan(6) // trabalho suficiente pro ganho fazer sentido

    // eslint-disable-next-line no-console
    console.log(
      `[#57 ganho] resolver calls=${C}, maxInFlight=${inst.stats.maxInFlight}, ` +
        `parallel=${elapsed.toFixed(1)}ms, serial-equiv≈${C * d}ms (d=${d}ms)`,
    )
  })
})
