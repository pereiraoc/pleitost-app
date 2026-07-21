// @vitest-environment node
// #364 (F4/#347, report c8516c85): "magias de tesouros" — POSTERGADO até o
// usuário corrigir o elemento de regra na vault. CORRIGIDO (2026-07-21): o
// Garras do Rei-Mago agora declara `Complementar Magias.Lista.Tesouros.Lista
// [[X]]` (a escola de TESOUROS, não a lista raiz). Este teste é a validação
// combinada: a projeção da MERA (dona do Garras) materializa as 6 magias na
// escola Tesouros, e o agrupamento do painel de magias do Combate as expõe no
// grupo "Tesouro" (a seção Magias de Tesouros do plugin, tesouros.ts:73-130).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { loadDoc } from '../src/data/useDoc'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const MERA_ID = 'Sistema/Criaturas/Heróis/Mera'
const mera = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${MERA_ID}.json`), 'utf8'),
) as VaultDoc

const MAGIAS_DO_GARRAS = ['Avivar', 'Aturdir', 'Empoderar', 'Celeridade', 'Enfraquecer', 'Entorpecer']

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

describe('#364 — magias do Garras entram na escola Tesouros (vault corrigida)', () => {
  it('projeção da Mera: escola Tesouros com as 6 magias do artefato', async () => {
    // guarda: a Mera segue com o Garras no inventário
    const tesouros = ((mera.frontmatter as Record<string, any>).Inventario?.Tesouros ?? []) as string[]
    expect(tesouros.some((t) => /Garras do Rei-Mago/.test(String(t))), 'Mera tem o Garras').toBe(true)

    const { projection } = await projectHeroRules(mera.frontmatter as never, catalog, loadDoc)
    const escolas = ((projection.derivedFm as Record<string, any>).Magias?.Lista ?? []) as Record<string, any>[]
    const tes = escolas.find((e) => String(e.Nome) === 'Tesouros')
    expect(tes, 'escola Tesouros presente no derivedFm').toBeTruthy()
    const links = (tes!.Lista as unknown[]).map((row) => Object.keys(row as Record<string, unknown>)[0] ?? '')
    for (const magia of MAGIAS_DO_GARRAS) {
      expect(links.some((l) => l.includes(magia)), `escola Tesouros tem ${magia}`).toBe(true)
    }
  }, 60000)

  it('painel de magias do Combate agrupa as magias do Garras no grupo Tesouro', async () => {
    const { magiaGroups } = await import('../src/components/ficha/CombateTab')
    const { projection } = await projectHeroRules(mera.frontmatter as never, catalog, loadDoc)
    const groups = magiaGroups(projection.derivedFm as never, () => undefined)
    const tesouroGroup = groups.find((g) => g.titulo.toUpperCase().includes('TESOURO'))
    expect(tesouroGroup, 'grupo Tesouro no painel de magias').toBeTruthy()
    const nomes = tesouroGroup!.magias.map((m) => m.n)
    for (const magia of MAGIAS_DO_GARRAS) {
      expect(nomes.some((n) => n.includes(magia)), `grupo Tesouro tem ${magia}`).toBe(true)
    }
    // Tesouros não consomem EM (plugin #149)
    expect(tesouroGroup!.emCusto).toBeNull()
  }, 60000)
})
