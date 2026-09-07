// RECURSOS DO MUNDO v2 (2026-09-07b): custo de vida em três eixos escolhidos
// entre os estilos (uma nota por classe), moradia específica substitui o
// eixo, itens tidos (veículo/estoque), dinheiro inteiro (régua à dezena,
// ouro pra cima ao milhar), semântica da nota pela CONFIG + Cobrança.
import { describe, expect, it } from 'vitest'
import { aluguelDia, carajas, cesta, cfg, estilos, gasolina, kitnet, onibus, pensao, polar, porNome, recarga, uisque } from './fixtures/recursos-fixtures'
import {
  RECURSOS_VAZIO,
  acaoDe,
  alugarMoradia,
  comprarImovel,
  comprarItem,
  consumirItem,
  custoEmOuro,
  custoMensal,
  escolherEstilo,
  fecharMes,
  hospedar,
  loteDeMiudeza,
  nomeNivel,
  precoNaRegua,
  recarregarTri,
  recursosDoFm,
  usarPassagem,
  venderItem,
} from '../src/recursos/hero-recursos'

const FATOR = 1000

describe('acaoDe — semântica pela config + Cobrança', () => {
  it('estilo=escolher, recarga=recarga, passagem=tri, única=comprar, dia=diária, litro=miudeza', () => {
    expect(acaoDe(cfg, estilos.t3, FATOR)).toBe('escolher')
    expect(acaoDe(cfg, recarga, FATOR)).toBe('recarga')
    expect(acaoDe(cfg, onibus, FATOR)).toBe('tri')
    expect(acaoDe(cfg, carajas, FATOR)).toBe('comprar')
    expect(acaoDe(cfg, aluguelDia, FATOR)).toBe('diaria')
    expect(acaoDe(cfg, gasolina, FATOR)).toBe('miudeza')
  })
  it('moradia: mês=alugar, noite=hospedar; alimentação: por valor', () => {
    expect(acaoDe(cfg, kitnet, FATOR)).toBe('alugar')
    expect(acaoDe(cfg, pensao, FATOR)).toBe('hospedar')
    expect(acaoDe(cfg, polar, FATOR)).toBe('miudeza')
    expect(acaoDe(cfg, uisque, FATOR)).toBe('avista')
    expect(acaoDe(cfg, cesta, FATOR)).toBe('avista')
  })
})

describe('dinheiro inteiro', () => {
  it('régua à dezena (mín. 10); ouro pra cima ao milhar; lote de miudeza fecha um milhar', () => {
    expect(precoNaRegua(50, 0.7)).toBe(40)
    expect(precoNaRegua(10, 0.7)).toBe(10)
    expect(precoNaRegua(4000, 1.5)).toBe(6000)
    expect(custoEmOuro(2800, FATOR)).toBe(3)
    expect(custoEmOuro(0, FATOR)).toBe(0)
    expect(loteDeMiudeza(40, FATOR)).toBe(25)
    expect(loteDeMiudeza(600, FATOR)).toBe(1)
  })
  it('TRI recarrega em milhares 1:1; passagem sai do TRI', () => {
    expect(recarregarTri(RECURSOS_VAZIO, 500, 10, FATOR)).toBeNull()
    const r1 = recarregarTri(RECURSOS_VAZIO, 1000, 10, FATOR)!
    expect(r1.ouro).toBe(9)
    expect(usarPassagem(r1.recursos, 50)!.recursos.tri).toBe(950)
    expect(usarPassagem(RECURSOS_VAZIO, 50)).toBeNull()
  })
  it('item tido: veículo usado com régua; venda devolve metade; estoque soma quantidade e consome', () => {
    expect(comprarItem(RECURSOS_VAZIO, carajas, { preco: 150000, estado: 'usado' }, 100, FATOR)).toBeNull()
    const c = comprarItem(RECURSOS_VAZIO, carajas, { preco: precoNaRegua(150000, 0.7), estado: 'usado' }, 200, FATOR)!
    expect(c.ouro).toBe(95)
    expect(c.recursos.itens).toEqual([{ nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, estado: 'usado', pago: 105000 }])
    const v = venderItem(c.recursos, 0, c.ouro!, FATOR)!
    expect(v.ouro).toBe(95 + 52)
    expect(v.recursos.itens).toEqual([])
    const e1 = comprarItem(RECURSOS_VAZIO, uisque, { preco: 4000 }, 10, FATOR)!
    const e2 = comprarItem(e1.recursos, uisque, { preco: 4000 }, e1.ouro!, FATOR)!
    expect(e2.ouro).toBe(2)
    expect(e2.recursos.itens).toEqual([{ nome: 'Uísque de Contrabando', aba: 'Alimentação', qtd: 2, pago: 4000 }])
    expect(consumirItem(e2.recursos, 0)!.recursos.itens[0]!.qtd).toBe(1)
    const lote = comprarItem(RECURSOS_VAZIO, polar, { preco: 25 * 40, qtd: 25 }, 3, FATOR)!
    expect(lote.ouro).toBe(2)
    expect(lote.recursos.itens[0]).toMatchObject({ nome: 'Polar Tradicional', qtd: 25, pago: 40 })
  })
})

describe('custo de vida em três eixos', () => {
  it('soma os estilos escolhidos; sem estilo = 0 e classe 1; classe do herói = menor eixo', () => {
    let r = escolherEstilo(RECURSOS_VAZIO, 'transporte', estilos.t3).recursos
    r = escolherEstilo(r, 'moradia', estilos.m4).recursos
    r = escolherEstilo(r, 'alimentacao', estilos.a5).recursos
    const c = custoMensal(r, porNome, FATOR, cfg)
    expect(c.total).toBe(2000 + 6000 + 9000)
    expect(c.ouro).toBe(17)
    expect(c.classe).toBe(3)
    expect(c.eixos.map((e) => [e.papel, e.origem, e.nivel])).toEqual([
      ['transporte', 'estilo', 3],
      ['moradia', 'estilo', 4],
      ['alimentacao', 'estilo', 5],
    ])
    const vazio = custoMensal(RECURSOS_VAZIO, porNome, FATOR, cfg)
    expect(vazio.total).toBe(0)
    expect(vazio.classe).toBe(1)
    expect(nomeNivel(cfg, 3)).toBe('Classe Média Baixa')
  })
  it('moradia específica substitui o eixo: aluguel = preço da nota, hotel ×30, própria 0', () => {
    const base = escolherEstilo(RECURSOS_VAZIO, 'moradia', estilos.m4).recursos
    const al = custoMensal(alugarMoradia(base, kitnet).recursos, porNome, FATOR, cfg).eixos[1]!
    expect(al).toMatchObject({ origem: 'aluguel', valor: 6000, nivel: 4 })
    const ho = custoMensal(hospedar(base, pensao).recursos, porNome, FATOR, cfg).eixos[1]!
    expect(ho).toMatchObject({ origem: 'hotel', valor: 4500, nivel: 2 })
    const pr = comprarImovel(base, kitnet, 600000, 700, FATOR)!
    expect(pr.ouro).toBe(100)
    expect(custoMensal(pr.recursos, porNome, FATOR, cfg).eixos[1]).toMatchObject({ origem: 'propria', valor: 0, nivel: 4 })
    expect(comprarImovel(base, kitnet, 600000, 500, FATOR)).toBeNull()
  })
  it('fechar o mês desconta o total em ouro (ou nega)', () => {
    const r = escolherEstilo(escolherEstilo(RECURSOS_VAZIO, 'moradia', estilos.m4).recursos, 'alimentacao', estilos.a2).recursos
    expect(fecharMes(r, porNome, cfg, 7, FATOR)).toBeNull()
    expect(fecharMes(r, porNome, cfg, 8, FATOR)!.ouro).toBe(0)
  })
  it('recursosDoFm tolera lixo e round-trips', () => {
    expect(recursosDoFm({})).toEqual(RECURSOS_VAZIO)
    expect(recursosDoFm({ Recursos_do_Mundo: 'x' })).toEqual(RECURSOS_VAZIO)
    const r = comprarItem(escolherEstilo(RECURSOS_VAZIO, 'transporte', estilos.t4).recursos, carajas, { preco: 400000, estado: 'novo' }, 500, FATOR)!.recursos
    expect(recursosDoFm({ Recursos_do_Mundo: JSON.parse(JSON.stringify(r)) })).toEqual(r)
    expect(recursosDoFm({ Recursos_do_Mundo: { tri: '250', moradia: { nome: 'X', modo: 'errado' }, itens: [{ nome: '' }] } })).toEqual({ ...RECURSOS_VAZIO, tri: 250 })
  })
})
