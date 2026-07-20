// tipo Arma (9º efeito interativo): ataques custom escalados por FOR do Garras
// do Rei-Mago. Parse (blocoParaDescritor) + resolução por FOR + dedupe, contra
// o doc REAL do artefato (item estável na vault). Espelha o plugin
// extract/inject-arma-custom.ts + parse-bloco.ts.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blocoParaDescritor, type EffectDescriptor } from '../src/interativa/descriptor'
import { collectCustomAtaques, resolvePorFor } from '../src/interativa/arma-custom'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const garras = JSON.parse(
  fs.readFileSync(
    path.join(vaultDataDir, 'Sistema/Equipamento/Tesouros/Artefatos/Garras do Rei-Mago.json'),
    'utf8',
  ),
) as VaultDoc

const blocos = (garras.frontmatter['Efeitos_Interativos'] ?? []) as unknown[]
const descriptors = blocos
  .map((b) => blocoParaDescritor(b, garras.id))
  .filter((d): d is EffectDescriptor => d != null)

describe('parse tipo Arma (blocoParaDescritor)', () => {
  it('extrai porFor/bonusItem/grupoAtaque/link dos 2 efeitos do Garras', () => {
    expect(descriptors).toHaveLength(2)
    const prim = descriptors.find((d) => /Prim[áa]ria/.test(d.label))!
    expect(prim.tipo).toBe('Arma')
    expect(prim.bonusItem).toBe(3)
    expect(prim.grupoAtaque).toBe('cac-marcial')
    expect(prim.link).toBe('[[Garras do Rei-Mago]]')
    expect(prim.porFor![1]).toEqual({ dano: 'd6+3', tipo: 'corte', propriedades: ['[[Precisa]]'] })
    expect(prim.porFor![3]).toEqual({ dano: 'd8+4', tipo: 'corte', propriedades: [] })
  })
})

describe('resolvePorFor (clamp [min,max], maior degrau ≤ FOR)', () => {
  const pf = descriptors.find((d) => /Prim[áa]ria/.test(d.label))!.porFor!
  it('FOR 0 → clampa em 1', () => expect(resolvePorFor(pf, 0)!.dano).toBe('d6+3'))
  it('FOR 2 → degrau 2', () => expect(resolvePorFor(pf, 2)!.propriedades).toContain('[[Apunhalante]]'))
  it('FOR 5 → clampa em 3', () => expect(resolvePorFor(pf, 5)!.dano).toBe('d8+4'))
})

describe('collectCustomAtaques (Mera FOR=2)', () => {
  const ataques = collectCustomAtaques(descriptors, 2)
  it('resolve os 2 ataques do Garras pro FOR da Mera', () => {
    expect(ataques.map((a) => a.label).sort()).toEqual([
      'Garras do Rei-Mago (Mão Primária)',
      'Garras do Rei-Mago (Mão Secundária)',
    ])
    const prim = ataques.find((a) => /Prim[áa]ria/.test(a.label))!
    expect(prim).toMatchObject({
      atributo: 'FOR',
      bonusItem: 3,
      dano: 'd6+3',
      tipo: 'corte',
      grupo: 'cac-marcial',
      link: '[[Garras do Rei-Mago]]',
    })
    expect(prim.propriedades).toEqual(['[[Precisa]]', '[[Apunhalante]]'])
    const sec = ataques.find((a) => /Secund[áa]ria/.test(a.label))!
    expect(sec.propriedades).toEqual(['[[Precisa]]', '[[Ágil]]'])
  })
  it('dedupe por label', () => {
    expect(collectCustomAtaques([...descriptors, ...descriptors], 2)).toHaveLength(2)
  })
})
