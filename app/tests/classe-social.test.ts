// CLASSE SOCIAL (pedido 2026-09-12): o nome do plano passou a ser o produto
// ("Kitnet", "Marmita"), e a classe virou o RETRATO do mês — padrão de vida,
// patrimônio comprado, equipamento não-consumível e dinheiro em mãos —, com a
// TENDÊNCIA da profissão por cima: o Executivo entra na cidade já de terno; o
// Ressonante começa abaixo de todo mundo e, de Ídolo, passa o Executivo.
// A régua inteira é dado do Contexto-Def, nunca número no código.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { degrauPorFaixa, retratoSocial } from '../src/recursos/classe-social'
import type { ContextoDef } from '../src/data/context-def'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const defPoa = fs.existsSync(cybContexto)
  ? (JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef)
  : null
const cs = defPoa?.recursos?.classeSocial ?? null

describe('degrauPorFaixa', () => {
  const faixas = [0, 10000, 50000, 150000, 400000, 900000]
  it('o degrau é a última faixa que o valor alcança', () => {
    expect(degrauPorFaixa(0, faixas)).toBe(1)
    expect(degrauPorFaixa(9999, faixas)).toBe(1)
    expect(degrauPorFaixa(10000, faixas)).toBe(2)
    expect(degrauPorFaixa(899999, faixas)).toBe(5)
    expect(degrauPorFaixa(5_000_000, faixas)).toBe(6)
  })
})

describe.skipIf(!cs)('retrato social com a régua REAL do POA', () => {
  const vazio = { niveis: [1, 1, 1], patrimonio: 0, equipamento: 0, dinheiro: 0 }

  it('quem não tem nada é E, e a letra vem do contexto', () => {
    const r = retratoSocial(cs!, vazio)
    expect(r.degrau).toBe(1)
    expect(r.letra).toBe('E')
    expect(r.rotulo).toBe('Baixa')
  })

  it('o padrão de vida pesa mais que o resto', () => {
    // planos de Classe Média nos três eixos, sem posse nem equipamento
    const r = retratoSocial(cs!, { ...vazio, niveis: [4, 4, 4] })
    expect(r.degraus.padrao).toBe(4)
    expect(r.degrau).toBe(3) // puxado pra baixo pelos outros três componentes
    expect(r.letra).toBe('D')
  })

  it('patrimônio, equipamento e dinheiro sobem o retrato', () => {
    const r = retratoSocial(cs!, {
      niveis: [4, 4, 4],
      patrimonio: 400_000, // Carajás novo
      equipamento: 1_000_000, // um Mestre
      dinheiro: 500_000,
    })
    expect(r.degrau).toBeGreaterThanOrEqual(4)
    expect(['C', 'B', 'A']).toContain(r.letra)
  })

  it('Executivo (Caçador) tem PISO de Classe Média já no tier 1', () => {
    const r = retratoSocial(cs!, { ...vazio, classe: 'Caçador', tier: 1 })
    expect(r.bruto).toBe(1)
    expect(r.letra).toBe('C')
    expect(r.tendencia?.limite).toBe('piso')
    expect(r.tendencia?.nota).toBeTruthy()
  })

  // NÃO HÁ TETO (2026-09-13): a profissão garante um chão e nunca impede de
  // subir. Quem vive como Classe Alta é lido como Classe Alta, seja executivo,
  // soldado ou profeta — o freio de quem sobe é o imposto (`recursos.imposto`),
  // que é conta, não trava.
  const rico = { niveis: [6, 6, 6], patrimonio: 5_000_000, equipamento: 5_000_000, dinheiro: 5_000_000 }

  it('nenhuma classe é rebaixada pela profissão: quem vive no topo é lido no topo', () => {
    for (const classe of Object.keys(cs!.tendencias)) {
      const r = retratoSocial(cs!, { ...rico, classe, tier: 3 })
      expect(r.letra, `${classe} foi rebaixado`).toBe('A')
      expect(r.tendencia?.limite ?? 'piso').toBe('piso')
    }
  })

  it('o Executivo chega a Classe Alta, igual a quem não declara profissão', () => {
    expect(retratoSocial(cs!, { ...rico, classe: 'Caçador', tier: 3 }).letra).toBe('A')
    expect(retratoSocial(cs!, rico).letra).toBe('A')
  })

  it('o Ressonante começa embaixo de todo mundo, e é só o PISO que difere', () => {
    // No tier 1 o piso do Bardo é o fundo (1) e o do Caçador é Classe Média (4):
    // sem nada no bolso, um entra descalço e o outro entra de terno.
    const pelado = { niveis: [1, 1, 1], patrimonio: 0, equipamento: 0, dinheiro: 0 }
    expect(retratoSocial(cs!, { ...pelado, classe: 'Bardo', tier: 1 }).letra).toBe('E')
    expect(retratoSocial(cs!, { ...pelado, classe: 'Caçador', tier: 1 }).letra).toBe('C')
    // Mas se o Ressonante bancar o topo, ele chega lá como qualquer um.
    expect(retratoSocial(cs!, { ...rico, classe: 'Bardo', tier: 1 }).letra).toBe('A')
  })

  it('o Nóia tem o chão mais baixo da cidade, e ainda assim pode subir', () => {
    const pelado = { niveis: [1, 1, 1], patrimonio: 0, equipamento: 0, dinheiro: 0 }
    expect(retratoSocial(cs!, { ...pelado, classe: 'Druida', tier: 3 }).degrau).toBe(2)
    expect(retratoSocial(cs!, { ...rico, classe: 'Druida', tier: 3 }).letra).toBe('A')
  })

  it('tier 4 (nível 10) usa a linha do tier 3', () => {
    const r = retratoSocial(cs!, { ...vazio, classe: 'Caçador', tier: 4 })
    expect(r.degrau).toBe(5)
  })

  it('classe fora da tabela de tendências passa reto', () => {
    const r = retratoSocial(cs!, { ...vazio, classe: 'Inexistente', tier: 2 })
    expect(r.degrau).toBe(1)
    expect(r.tendencia).toBeUndefined()
  })
})

// CALIBRAÇÃO: o herói ESPERADO de cada nível (tabela "Nível, rank e classe
// esperada" do Custo de Vida) tem que cair na classe que a própria tabela
// declara. É o que garante que as faixas do Contexto não são chute.
describe.skipIf(!cs)('o herói esperado de cada nível cai na classe da tabela', () => {
  //                 nv  planos      veículo   equipamento  dinheiro   classe
  const TABELA: [number, number[], number, number, number, string][] = [
    [1, [2, 2, 2], 0, 40_000, 10_000, 'E'],
    [2, [3, 3, 3], 5_000, 80_000, 10_000, 'D'],
    [3, [3, 3, 3], 15_000, 165_000, 15_000, 'D'],
    [4, [4, 4, 4], 45_000, 390_000, 100_000, 'C'],
    [5, [4, 4, 4], 90_000, 590_000, 100_000, 'C'],
    [6, [5, 5, 5], 150_000, 990_000, 150_000, 'B'],
    [7, [5, 5, 5], 400_000, 1_990_000, 400_000, 'B'],
    [8, [6, 6, 6], 700_000, 2_990_000, 400_000, 'A'],
  ]
  for (const [nv, niveis, patrimonio, equipamento, dinheiro, letra] of TABELA) {
    it(`nível ${nv} → ${letra}`, () => {
      expect(retratoSocial(cs!, { niveis, patrimonio, equipamento, dinheiro }).letra).toBe(letra)
    })
  }
})
