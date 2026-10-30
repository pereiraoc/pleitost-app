// @vitest-environment node
// Report 2026-10-29 ("Habilidade de ladino mestre 'Letalidade' não está
// aplicando seu modificador na aba de combate"). Letalidade.md: "Quando você
// obtém um sucesso decisivo com um Ataque que causa dano de Ataque Furtivo,
// dobre o dano adicional do Ataque Furtivo" — a nota ganhou o mesmo dado do
// furtivo (DadoExtraPorNivel, Unico soma) condicionado ao Acerto Decisivo,
// no idioma da Maestria Letal.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { computeInterativaCtx, CONDICOES_FOLDER, ERGUER_ESCUDO_ID, type DescriptorSources } from '../src/interativa/hero-context'
import { applyDanoCtx } from '../src/interativa/dano'
import { parseDanoArma, PROF_DICE, str, wikiTarget } from '../src/components/ficha/hero-model'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const loadSync = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const refDoc = (value: unknown): VaultDoc | undefined => {
  const target = wikiTarget(str(value))
  if (!target) return undefined
  const res = catalog.resolve(target)
  return res.kind === 'doc' ? loadSync(res.id) : undefined
}
const condicaoDocs = catalog.content
  .filter((e) => e.id.startsWith(CONDICOES_FOLDER) && e.basename !== 'Condições')
  .map((e) => loadSync(e.id))
const extraDocs = [loadSync(ERGUER_ESCUDO_ID)]
const golden = JSON.parse(fs.readFileSync(path.join(appDir, 'tests/fixtures/golden-bardo.json'), 'utf8')) as VaultDoc

function ladinoComAdaga(interativa: Record<string, unknown>, letalidade: boolean) {
  const fm = structuredClone(golden.frontmatter) as Record<string, any>
  fm['Nível'] = 8
  fm.Habilidades = { ...fm.Habilidades, Lista: [...fm.Habilidades.Lista, { '[[Ataque Furtivo]]': 'Regra.[[Ladino]]' }] }
  if (letalidade) fm.Tecnicas = { ...fm.Tecnicas, Lista: [...fm.Tecnicas.Lista, { '[[Letalidade]]': 'Slot.M' }] }
  fm.Inventario = structuredClone(fm.Inventario)
  fm.Inventario.Armas = {
    ...fm.Inventario.Armas,
    Proficiencia: { Simples: 'E', Marciais: 'E', Especificas: [] },
    Lista: [{ Nome: '[[Adaga]]', Atributo: 'AGI', Bonus_Item: 0, Bonus_Especial: 0, Categoria: '[[Simples]]', Propriedade: '' }],
  }
  fm.Ataques = { ...fm.Ataques, Proficiencia: 'E' }
  fm.Interativa = { ...fm.Interativa, Condicoes_Ativas: {}, Efeitos_Ativos: {}, Seletores: {}, ...interativa }
  const sources: DescriptorSources = { fm, refDoc, condicaoDocs, extraDocs }
  return computeInterativaCtx(sources)
}
const adaga = refDoc('[[Adaga]]')!
const calc = parseDanoArma(str(adaga.frontmatter['dano']))
const base = { baseDice: calc.dice, profDice: PROF_DICE['E']!, dieSize: calc.die, offset: calc.offset }
const VC = { 'Vantagem de Combate': { value: 1 } }
const DECISIVO = { 'Acerto Decisivo': { on: true } }

describe('Letalidade (Ladino Mestre): no decisivo, o dado do Ataque Furtivo dobra', () => {
  it('sem Letalidade: Furtivo 1d12 no N8 (com VC), decisivo só +1 dado da arma', () => {
    const vc = applyDanoCtx(base, ladinoComAdaga({ Condicoes_Ativas: VC }, false).ctx, 'Adaga')
    const dec = applyDanoCtx(base, ladinoComAdaga({ Condicoes_Ativas: VC, Efeitos_Ativos: DECISIVO }, false).ctx, 'Adaga')
    expect(vc.display).toBe('2d4+1d12+2')
    expect(dec.display).toBe('3d4+1d12+2')
  })
  it('com Letalidade: fora do decisivo nada muda; no decisivo +1d12 (o furtivo dobra)', () => {
    const vc = applyDanoCtx(base, ladinoComAdaga({ Condicoes_Ativas: VC }, true).ctx, 'Adaga')
    expect(vc.display).toBe('2d4+1d12+2')
    const dec = applyDanoCtx(base, ladinoComAdaga({ Condicoes_Ativas: VC, Efeitos_Ativos: DECISIVO }, true).ctx, 'Adaga')
    expect(dec.display).toBe('3d4+2d12+2')
    expect(dec.entries.some((e) => e.label.includes('Letalidade'))).toBe(true)
  })
  it('com Letalidade e decisivo mas SEM Vantagem de Combate: nem furtivo nem letalidade', () => {
    const dec = applyDanoCtx(base, ladinoComAdaga({ Efeitos_Ativos: DECISIVO }, true).ctx, 'Adaga')
    expect(dec.display).toBe('3d4+2')
  })
})
