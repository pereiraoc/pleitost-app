// RECOMENDAÇÃO DE EQUIPAMENTO do wizard (#452 §6.2 + regras de arma
// 2026-08-15) — matriz do módulo puro rules/equip-recomendacao.
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

describe('recomendacaoArma — regras 2026-08-15 (recomendada/muito/extremamente)', () => {
  // — Base por AGILIDADE: precisas e à distância —
  it('AGI > FOR ativa precisas/distância como RECOMENDADAS (mesmo AGI 1)', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', precisa: true }), { FOR: 0, AGI: 1 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('AGI ≥ 2 ativa mesmo com AGI ≤ FOR', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', precisa: true }), { FOR: 3, AGI: 2 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('AGI 1 == FOR 1: nem AGI>FOR nem AGI≥2 → precisa NÃO recomendada', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', precisa: true }), { FOR: 1, AGI: 1 }, comMarciais)
    expect(r.nivel).toBeNull()
  })

  // — Base por FORÇA —
  it('FOR 3: armas de Força 3 são MUITO recomendadas', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 3 }), { FOR: 3, AGI: 0 }, comMarciais)
    expect(r.nivel).toBe('muito')
  })
  it('FOR 2: armas de Força 2 são RECOMENDADAS (não muito)', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('FOR 1: armas de Força 1 são RECOMENDADAS', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 1 }), { FOR: 1, AGI: 0 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('FOR 0 com arma sem Força e sem regra de AGI → nada', () => {
    expect(recomendacaoArma(arma({ grupo: 'cac-marcial' }), { FOR: 0, AGI: 0 }, comMarciais).nivel).toBeNull()
  })
  it('Força acima do FOR do herói não recomenda', () => {
    expect(recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 3 }), { FOR: 1, AGI: 0 }, comMarciais).nivel).toBeNull()
  })

  // — Upgrade das À DISTÂNCIA com Força casada (FOR 0/1/2) —
  it('FOR 2: distância já recomendada (pela Força) e de Força 2 → MUITO', () => {
    const r = recomendacaoArma(arma({ grupo: 'd-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, comMarciais)
    expect(r.nivel).toBe('muito')
  })
  it('FOR 0: distância já recomendada (por AGI>FOR) e sem Força → MUITO', () => {
    const r = recomendacaoArma(arma({ grupo: 'd-marcial' }), { FOR: 0, AGI: 1 }, comMarciais)
    expect(r.nivel).toBe('muito')
  })
  it('distância com Força ≠ FOR fica só RECOMENDADA', () => {
    const r = recomendacaoArma(arma({ grupo: 'd-marcial' }), { FOR: 2, AGI: 3 }, comMarciais)
    expect(r.nivel).toBe('recomendada')
  })
  it('o upgrade por Força casada NÃO vale pra PRECISA corpo-a-corpo', () => {
    const r = recomendacaoArma(
      arma({ grupo: 'cac-marcial', precisa: true, forca: 2 }),
      { FOR: 2, AGI: 3 },
      comMarciais,
    )
    expect(r.nivel).toBe('recomendada')
  })

  // — Bônus de ESPECIALIZAÇÃO: sobe um degrau nas já recomendadas —
  it('especialização: recomendada → MUITO (Guerreiro de duelo, precisa Força 2, FOR 2/AGI 3)', () => {
    const espec = new Set(['Arma Teste'])
    const r = recomendacaoArma(
      arma({ grupo: 'cac-marcial', precisa: true, forca: 2 }),
      { FOR: 2, AGI: 3 },
      comMarciais,
      espec,
    )
    expect(r.nivel).toBe('muito')
  })
  it('especialização: muito → EXTREMAMENTE (distância Força 2, FOR 2)', () => {
    const espec = new Set(['Arma Teste'])
    const r = recomendacaoArma(arma({ grupo: 'd-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, comMarciais, espec)
    expect(r.nivel).toBe('extremamente')
  })
  it('especialização NÃO cria recomendação onde não há (arma pesada demais)', () => {
    const espec = new Set(['Arma Teste'])
    expect(
      recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 3 }), { FOR: 1, AGI: 0 }, comMarciais, espec).nivel,
    ).toBeNull()
  })

  // — Ordenação: score cresce com o nível —
  it('score ordena extremamente > muito > recomendada', () => {
    const espec = new Set(['Arma Teste'])
    const ext = recomendacaoArma(arma({ grupo: 'd-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, comMarciais, espec)
    const muito = recomendacaoArma(arma({ grupo: 'd-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, comMarciais)
    const rec = recomendacaoArma(arma({ grupo: 'd-marcial' }), { FOR: 2, AGI: 3 }, comMarciais)
    expect(ext.score).toBeGreaterThan(muito.score)
    expect(muito.score).toBeGreaterThan(rec.score)
  })

  // — Gate de proficiência (inalterado) —
  it('sem proficiência NA arma → nunca recomendada', () => {
    const r = recomendacaoArma(arma({ grupo: 'cac-marcial', forca: 2 }), { FOR: 2, AGI: 0 }, soSimples)
    expect(r.nivel).toBeNull()
  })
  it('proficiência ESPECÍFICA numa marcial sem prof de grupo mantém a recomendação', () => {
    const prof: ProficienciasArmas = { simples: true, marciais: false, especificas: ['Adaga de Duelo'] }
    const r = recomendacaoArma(
      arma({ basename: 'Adaga de Duelo', grupo: 'd-marcial', forca: 2 }),
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
