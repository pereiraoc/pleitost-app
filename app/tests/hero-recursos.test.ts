// RECURSOS DO MUNDO (2026-09-07): operações puras sobre o estado do herói —
// dinheiro em moeda do mundo → ouro da ficha PRA CIMA ao milhar (nada
// fracionário), custo do mês por eixo, nível = menor eixo, semântica da nota
// (acaoDe) derivada da CONFIG + Cobrança, nunca de rótulo inventado.
import { describe, expect, it } from 'vitest'
import type { Recurso, RecursosCfg } from '../src/recursos/types'
import {
  RECURSOS_VAZIO,
  acaoDe,
  alugarMoradia,
  assinarPasse,
  comprarImovel,
  comprarVeiculo,
  custoEmOuro,
  custoMensal,
  escolherAlimentacao,
  fecharMes,
  hospedar,
  nivelDoHeroi,
  nomeNivel,
  precoNaRegua,
  recarregarTri,
  recursosDoFm,
  usarPassagem,
  venderVeiculo,
} from '../src/recursos/hero-recursos'

const cfg: RecursosCfg = {
  raiz: 'Contexto/Recursos',
  abas: [
    { nome: 'Transporte', papel: 'transporte' },
    { nome: 'Moradia', papel: 'moradia' },
    { nome: 'Alimentação', papel: 'alimentacao' },
  ],
  precoEm: 'moeda',
  niveis: ['Na Rua', 'Palafita', 'Operário', 'Kitnet', 'Executivo', 'Elite'],
  tipos: { passagem: 'Passagem', estilo: 'Estilo de Vida' },
}
const FATOR = 1000

function rec(p: Partial<Recurso> & Pick<Recurso, 'nome' | 'aba' | 'tipo' | 'preco' | 'cobranca'>): Recurso {
  return { id: `Contexto/Recursos/${p.aba}/${p.nome}`, marca: '', onde: [], resumo: '', ...p }
}
const onibus = rec({ nome: 'Passagem de Ônibus', aba: 'Transporte', tipo: 'Passagem', preco: 50, cobranca: 'viagem' })
const passe = rec({ nome: 'Passe TRI Mensal', aba: 'Transporte', tipo: 'Passe', preco: 2000, cobranca: 'mês' })
const carajas = rec({ nome: 'Gurgel Carajás', aba: 'Transporte', tipo: 'Veículo', preco: 400000, cobranca: 'única', usado: 150000, manutencao: 3000 })
const aluguelDia = rec({ nome: 'Gurgel de Aluguel', aba: 'Transporte', tipo: 'Aluguel', preco: 4000, cobranca: 'dia' })
const gasolina = rec({ nome: 'Gasolina Ipiranga', aba: 'Transporte', tipo: 'Combustível', preco: 30, cobranca: 'litro' })
const kitnet = rec({ nome: 'Kitnet do Aeromóvel', aba: 'Moradia', tipo: 'Aluguel', preco: 6000, cobranca: 'mês', compra: 600000, nivel: 4 })
const pensao = rec({ nome: 'Pensão por Noite', aba: 'Moradia', tipo: 'Hotel', preco: 150, cobranca: 'noite', nivel: 2 })
const pf = rec({ nome: 'PF de Cantina', aba: 'Alimentação', tipo: 'Estilo de Vida', preco: 3000, cobranca: 'mês', nivel: 3 })
const polar = rec({ nome: 'Polar Tradicional', aba: 'Alimentação', tipo: 'Bebida', preco: 40, cobranca: 'unidade', nivel: 2 })
const uisque = rec({ nome: 'Uísque de Contrabando', aba: 'Alimentação', tipo: 'Bebida', preco: 4000, cobranca: 'unidade', nivel: 5 })
const porNome = new Map([onibus, passe, carajas, aluguelDia, gasolina, kitnet, pensao, pf, polar, uisque].map((r) => [r.nome, r]))

describe('acaoDe — semântica pela config + Cobrança', () => {
  it('transporte: passagem=TRI, mês=assinar, única=comprar, dia=diária, litro=miudeza', () => {
    expect(acaoDe(cfg, onibus, FATOR)).toBe('tri')
    expect(acaoDe(cfg, passe, FATOR)).toBe('assinar')
    expect(acaoDe(cfg, carajas, FATOR)).toBe('comprar')
    expect(acaoDe(cfg, aluguelDia, FATOR)).toBe('diaria')
    expect(acaoDe(cfg, gasolina, FATOR)).toBe('miudeza')
  })
  it('moradia: mês=alugar, noite=hospedar; alimentação: estilo=escolher, resto por valor', () => {
    expect(acaoDe(cfg, kitnet, FATOR)).toBe('alugar')
    expect(acaoDe(cfg, pensao, FATOR)).toBe('hospedar')
    expect(acaoDe(cfg, pf, FATOR)).toBe('escolher')
    expect(acaoDe(cfg, polar, FATOR)).toBe('miudeza')
    expect(acaoDe(cfg, uisque, FATOR)).toBe('avista')
  })
})

describe('dinheiro inteiro', () => {
  it('régua arredonda pra dezena e nunca abaixo de 10; ouro sobe ao milhar', () => {
    expect(precoNaRegua(50, 0.7)).toBe(40) // 35 → dezena mais próxima (40)
    expect(precoNaRegua(10, 0.7)).toBe(10)
    expect(precoNaRegua(4000, 1.5)).toBe(6000)
    expect(custoEmOuro(2800, FATOR)).toBe(3)
    expect(custoEmOuro(1000, FATOR)).toBe(1)
    expect(custoEmOuro(0, FATOR)).toBe(0)
  })
  it('TRI recarrega só em milhares e desconta 1:1 do ouro; passagem sai do TRI', () => {
    expect(recarregarTri(RECURSOS_VAZIO, 500, 10, FATOR)).toBeNull()
    const r1 = recarregarTri(RECURSOS_VAZIO, 1000, 10, FATOR)!
    expect(r1.ouro).toBe(9)
    expect(r1.recursos.tri).toBe(1000)
    expect(usarPassagem(r1.recursos, onibus).recursos?.tri).toBe(950)
    expect(usarPassagem(r1.recursos, onibus, 0.7)!.recursos.tri).toBe(960)
    expect(usarPassagem(RECURSOS_VAZIO, onibus)).toBeNull()
    expect(recarregarTri(RECURSOS_VAZIO, 5000, 4, FATOR)).toBeNull()
  })
  it('veículo: novo/usado com régua; venda devolve metade em ouro (pra baixo)', () => {
    expect(comprarVeiculo(RECURSOS_VAZIO, carajas, 'usado', 100, FATOR)).toBeNull()
    const c = comprarVeiculo(RECURSOS_VAZIO, carajas, 'usado', 200, FATOR, 0.7)!
    expect(c.ouro).toBe(200 - 105)
    expect(c.recursos.veiculos).toEqual([{ nome: 'Gurgel Carajás', estado: 'usado', pago: 105000 }])
    const v = venderVeiculo(c.recursos, 0, c.ouro!, FATOR)!
    expect(v.ouro).toBe(95 + 52)
    expect(v.recursos.veiculos).toEqual([])
  })
  it('imóvel: compra pelo FM Compra e passa a morar sem aluguel', () => {
    expect(comprarImovel(RECURSOS_VAZIO, kitnet, 500, FATOR)).toBeNull()
    const c = comprarImovel(RECURSOS_VAZIO, kitnet, 700, FATOR)!
    expect(c.ouro).toBe(100)
    expect(c.recursos.moradia).toEqual({ nome: 'Kitnet do Aeromóvel', modo: 'propria' })
    expect(c.recursos.imoveis).toEqual(['Kitnet do Aeromóvel'])
    expect(custoMensal(c.recursos, porNome, FATOR).moradia).toBe(0)
  })
})

describe('mês e nível', () => {
  it('custo do mês = aluguel + estilo + passe + manutenção; hotel = 30 noites', () => {
    let r = alugarMoradia(RECURSOS_VAZIO, kitnet).recursos
    r = escolherAlimentacao(r, pf).recursos
    r = assinarPasse(r, passe).recursos
    r = comprarVeiculo(r, carajas, 'usado', 1000, FATOR)!.recursos
    const c = custoMensal(r, porNome, FATOR)
    expect(c).toEqual({ moradia: 6000, alimentacao: 3000, transporte: 5000, total: 14000, ouro: 14 })
    const h = custoMensal(hospedar(RECURSOS_VAZIO, pensao).recursos, porNome, FATOR)
    expect(h.moradia).toBe(4500)
    expect(h.ouro).toBe(5) // 4.500 sobe pro milhar
  })
  it('fechar o mês desconta o total em ouro (ou nega)', () => {
    const r = escolherAlimentacao(alugarMoradia(RECURSOS_VAZIO, kitnet).recursos, pf).recursos
    expect(fecharMes(r, porNome, 8, FATOR)).toBeNull()
    expect(fecharMes(r, porNome, 9, FATOR)!.ouro).toBe(0)
  })
  it('nível = menor eixo; sem nada = 1; nomes vêm da config', () => {
    expect(nivelDoHeroi(RECURSOS_VAZIO, porNome)).toEqual({ moradia: 1, alimentacao: 1, nivel: 1 })
    const r = escolherAlimentacao(alugarMoradia(RECURSOS_VAZIO, kitnet).recursos, pf).recursos
    expect(nivelDoHeroi(r, porNome)).toEqual({ moradia: 4, alimentacao: 3, nivel: 3 })
    expect(nomeNivel(cfg, 3)).toBe('Operário')
    expect(nomeNivel(cfg, 9)).toBe('Nível 9')
  })
  it('recursosDoFm tolera lixo e round-trips o estado', () => {
    expect(recursosDoFm({})).toEqual(RECURSOS_VAZIO)
    expect(recursosDoFm({ Recursos_do_Mundo: 'x' })).toEqual(RECURSOS_VAZIO)
    const r = comprarVeiculo(alugarMoradia(RECURSOS_VAZIO, kitnet).recursos, carajas, 'novo', 500, FATOR)!.recursos
    expect(recursosDoFm({ Recursos_do_Mundo: JSON.parse(JSON.stringify(r)) })).toEqual(r)
    expect(recursosDoFm({ Recursos_do_Mundo: { tri: '250', moradia: { nome: 'X', modo: 'errado' }, veiculos: [{ nome: '' }] } })).toEqual({ ...RECURSOS_VAZIO, tri: 250 })
  })
})
