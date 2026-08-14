// RECOMENDAÇÃO DE EQUIPAMENTO do wizard (#452 §6.1.1–6.1.4/§6.2, issue #457) —
// matriz do módulo puro rules/equip-recomendacao.
import { describe, expect, it } from 'vitest'
import {
  armaInfoDoFm,
  proficienciasArmaduraDoFm,
  proficienciasDoFm,
  proficienteNaArma,
  recomendacaoArma,
  recomendacaoArmadura,
  type ArmaInfo,
  type ProficienciasArmas,
} from '../src/rules/equip-recomendacao'

const arma = (over: Partial<ArmaInfo>): ArmaInfo => ({
  basename: 'Arma Teste',
  grupo: 'cac-simples',
  maos: 1,
  forca: 0,
  precisa: false,
  ...over,
})
const soSimples: ProficienciasArmas = { simples: true, marciais: false, especificas: [] }
const comMarciais: ProficienciasArmas = { simples: true, marciais: true, especificas: [] }

describe('armaInfoDoFm — parse do doc da arma', () => {
  it('extrai grupo/mãos/Força N/Precisa das propriedades (wikilinks)', () => {
    const info = armaInfoDoFm('Martelo de Guerra', {
      grupo: 'cac-marcial',
      'mãos': 2,
      propriedades: ['[[Força X|Força 2]]', '[[Precisa]]'],
    })
    expect(info).toMatchObject({ grupo: 'cac-marcial', maos: 2, forca: 2, precisa: true })
  })
  it('grupo fora do wizard (especial/natural) → null', () => {
    expect(armaInfoDoFm('Cauda', { grupo: 'especial', propriedades: [] })).toBeNull()
  })
  it('sem propriedade Força → forca 0', () => {
    expect(armaInfoDoFm('Adaga', { grupo: 'cac-simples', propriedades: ['[[Precisa]]'] })?.forca).toBe(0)
  })
})

describe('recomendacaoArma — spec 6.1.1–6.1.4 + step-down das simples (#464 item 14)', () => {
  it('6.1.1: Força X == FOR em arma MARCIAL → MUITO recomendada', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, comMarciais)
    expect(r.nivel).toBe('muito')
  })
  it('6.1.2: Força X == FOR-1 em arma MARCIAL → recomendada', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 1 }), { FOR: 2, AGI: 0 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('Força acima do FOR não recomenda', () => {
    expect(recomendacaoArma(arma({ forca: 3 }), { FOR: 1, AGI: 0 }, soSimples).nivel).toBeNull()
  })
  it('STEP-DOWN: arma SIMPLES que seria MUITO vira RECOMENDADA; a recomendada vira POUCO', () => {
    expect(recomendacaoArma(arma({ forca: 2 }), { FOR: 2, AGI: 0 }, soSimples).nivel).toBe('recomendada')
    expect(recomendacaoArma(arma({ forca: 1 }), { FOR: 2, AGI: 0 }, soSimples).nivel).toBe('pouco')
  })
  it('STEP-DOWN ignorado com BÔNUS DE ESPECIALIZAÇÃO cobrindo a arma', () => {
    const espec = new Set(['Arma Teste'])
    expect(recomendacaoArma(arma({ forca: 2 }), { FOR: 2, AGI: 0 }, soSimples, espec).nivel).toBe('muito')
    expect(recomendacaoArma(arma({ forca: 1 }), { FOR: 2, AGI: 0 }, soSimples, espec).nivel).toBe('recomendada')
  })
  it('6.1.3: AGI 2 → PRECISA marcial vira MUITO; simples fica RECOMENDADA (step-down)', () => {
    expect(
      recomendacaoArma(arma({ grupo: 'cac-marcial', precisa: true, forca: 0 }), { FOR: 3, AGI: 2 }, comMarciais).nivel,
    ).toBe('muito')
    expect(
      recomendacaoArma(arma({ precisa: true, forca: 0 }), { FOR: 3, AGI: 2 }, soSimples).nivel,
    ).toBe('recomendada')
  })
  it('6.1.3: A DISTÂNCIA marcial com Força==FOR é a MAIS recomendada (score máximo)', () => {
    const dist = recomendacaoArma(arma({ grupo: 'd-marcial', forca: 0 }), { FOR: 1, AGI: 2 }, comMarciais)
    const distForca = recomendacaoArma(arma({ grupo: 'd-marcial', forca: 1 }), { FOR: 1, AGI: 2 }, comMarciais)
    expect(dist.nivel).toBe('muito')
    expect(distForca.nivel).toBe('muito')
    expect(distForca.score).toBeGreaterThan(dist.score)
  })
  it('AGI 1 NÃO ativa a regra de precisas/distância', () => {
    // marcial Força==FOR-1 fica recomendada; a PRECISA sem AGI ≥ 2 não eleva.
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', precisa: true, forca: 0 }), { FOR: 1, AGI: 1 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('6.1.4: sem proficiência NA arma → nunca recomendada (marcial sem prof)', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, soSimples)
    expect(r.nivel).toBeNull()
  })
  it('proficiência ESPECÍFICA numa marcial sem prof de grupo mantém a recomendação', () => {
    const prof: ProficienciasArmas = { simples: true, marciais: false, especificas: ['Adaga de Duelo'] }
    const r = recomendacaoArma(
      arma({ basename: 'Adaga de Duelo', grupo: 'cac-marcial', forca: 2 }),
      { FOR: 2, AGI: 0 },
      prof,
    )
    expect(r.nivel).toBe('muito')
  })
})

describe('proficienteNaArma', () => {
  it('específica vale mesmo sem proficiência do grupo', () => {
    const prof: ProficienciasArmas = { simples: false, marciais: false, especificas: ['Lâmina Rara'] }
    expect(proficienteNaArma(arma({ basename: 'Lâmina Rara', grupo: 'cac-marcial' }), prof)).toBe(true)
  })
})

describe('recomendacaoArmadura — spec 6.2.1–6.2.3 (cascata literal)', () => {
  const prof = { sem: true, leve: true, pesada: true }
  it('pesada: proficiente + FOR > AGI', () => {
    expect(recomendacaoArmadura(prof, { FOR: 3, AGI: 1 })).toBe('Pesada')
  })
  it('leve: sem pesada (ou FOR ≤ AGI) + proficiente leve + AGI > FOR', () => {
    expect(recomendacaoArmadura({ ...prof, pesada: false }, { FOR: 1, AGI: 3 })).toBe('Leve')
    expect(recomendacaoArmadura(prof, { FOR: 1, AGI: 3 })).toBe('Leve')
  })
  it('empate FOR==AGI cai em Sem (cascata literal do spec)', () => {
    expect(recomendacaoArmadura(prof, { FOR: 2, AGI: 2 })).toBe('Sem')
  })
  it('sem proficiências → Sem', () => {
    expect(recomendacaoArmadura({ sem: true, leve: false, pesada: false }, { FOR: 3, AGI: 0 })).toBe('Sem')
  })
})

describe('parsers de proficiência do FM', () => {
  it('armas: Simples/Marciais P + Específicas (wikilinks → basename)', () => {
    const p = proficienciasDoFm({
      Inventario: {
        Armas: { Proficiencia: { Simples: 'P', Marciais: 'N', Especificas: ['[[Adaga de Duelo]]'] } },
      },
    })
    expect(p).toEqual({ simples: true, marciais: false, especificas: ['Adaga de Duelo'] })
  })
  it('armadura: Sem/Leve/Pesada P', () => {
    const p = proficienciasArmaduraDoFm({
      Inventario: { Armadura: { Proficiencia: { Sem: 'P', Leve: 'P', Pesada: 'N' } } },
    })
    expect(p).toEqual({ sem: true, leve: true, pesada: false })
  })
})
