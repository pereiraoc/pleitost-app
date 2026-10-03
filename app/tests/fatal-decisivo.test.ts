// @vitest-environment node
// Report 2026-10-02 ("o Fatal não tá somando o dano adicional no decisivo:
// 2d6+3 vira 3d10+3 em vez de 3d10+5"). Convenção do sistema: o dano base da
// arma ACOMPANHA o dado (d4+2, d6+3, d8+4, d10+5, d12+6 — +1 por passo), então
// quem sobe o dado sobe o flat junto. A Apunhalante já declarava isso
// (PassoDeDado 1 + DanoArmaFixo 1); a Fatal.md só tinha os 2 passos — ganhou
// DanoArmaFixo 2 nos dois efeitos (alvo Ferido e acerto decisivo). Atacar.md:
// "Sucesso Decisivo: adicione um dado de dano da arma extra"; o dado do
// Decisivo CONTA pros bônus por dado. Pistola Arcanônica (d6+3, Fatal) em E.
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

function heroiComPistola(interativa: Record<string, unknown>) {
  const fm = structuredClone(golden.frontmatter) as Record<string, any>
  fm.Inventario = structuredClone(fm.Inventario)
  fm.Inventario.Armas = {
    ...fm.Inventario.Armas,
    Proficiencia: { Simples: 'E', Marciais: 'E', Especificas: ['[[Pistola Arcanônica]]'] },
    Lista: [{ Nome: '[[Pistola Arcanônica]]', Atributo: 'AGI', Bonus_Item: 0, Bonus_Especial: 0, Categoria: '[[Experiente]]', Propriedade: '' }],
  }
  fm.Ataques = { ...fm.Ataques, Proficiencia: 'E' }
  fm.Interativa = { ...fm.Interativa, Condicoes_Ativas: {}, Efeitos_Ativos: {}, Seletores: {}, ...interativa }
  const sources: DescriptorSources = { fm, refDoc, condicaoDocs, extraDocs }
  return computeInterativaCtx(sources)
}
const pistola = refDoc('[[Pistola Arcanônica]]')!
const danoRaw = str(pistola.frontmatter['dano'])
const calc = parseDanoArma(danoRaw)
const base = { baseDice: calc.dice, profDice: PROF_DICE['E']!, dieSize: calc.die, offset: calc.offset }

describe('Fatal + Acerto Decisivo (regras escritas)', () => {
  it('Pistola Arcanônica d6+3 em E: 2d6+3; no Decisivo +1 dado da arma e Fatal 2 passos (+2 no base) → 3d10+5', () => {
    expect(danoRaw).toBe('d6+3')
    const normal = heroiComPistola({})
    expect(applyDanoCtx(base, normal.ctx, 'Pistola Arcanônica').display).toBe('2d6+3')
    const decisivo = heroiComPistola({ Efeitos_Ativos: { 'Acerto Decisivo': { on: true } } })
    const r = applyDanoCtx(base, decisivo.ctx, 'Pistola Arcanônica')
    expect(r.display).toBe('3d10+5')
    expect(r.entries.some((e) => e.label.includes('Fatal') && e.value === 2)).toBe(true)
    expect(r.baseDieSize).toBe(6)
    expect(r.finalDieSize).toBe(10)
    expect(r.dieStepSources.some((l) => l.includes('Fatal'))).toBe(true)
  })
  it('bônus POR DADO contam o dado do Decisivo (Enfraquecido: −1 fixo −1/dado → 3 dados no decisivo) e somam com o +2 da Fatal', () => {
    const sem = heroiComPistola({ Condicoes_Ativas: { Enfraquecido: { value: 1 } } })
    expect(applyDanoCtx(base, sem.ctx, 'Pistola Arcanônica').display).toBe('2d6') // +3 −1 −2
    const com = heroiComPistola({ Condicoes_Ativas: { Enfraquecido: { value: 1 } }, Efeitos_Ativos: { 'Acerto Decisivo': { on: true } } })
    expect(applyDanoCtx(base, com.ctx, 'Pistola Arcanônica').display).toBe('3d10+1') // +3 +2 (Fatal) −1 −3
  })
})

describe('Fatal (alvo Ferido) — o mesmo +2 do decisivo, pelo estado manual', () => {
  it('ligar "Fatal (alvo Ferido)" sem decisivo: 2d10+5', () => {
    const c = heroiComPistola({ Condicoes_Ativas: { 'Fatal (alvo Ferido)': { value: 1 } } })
    expect(applyDanoCtx(base, c.ctx, 'Pistola Arcanônica').display).toBe('2d10+5')
  })
  it('Ferido E decisivo não acumulam os passos (tipoBonus Unico): 3d10+5', () => {
    const c = heroiComPistola({ Condicoes_Ativas: { 'Fatal (alvo Ferido)': { value: 1 } }, Efeitos_Ativos: { 'Acerto Decisivo': { on: true } } })
    expect(applyDanoCtx(base, c.ctx, 'Pistola Arcanônica').display).toBe('3d10+5')
  })
})
