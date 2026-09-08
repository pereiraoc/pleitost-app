// RECURSOS DO MUNDO v3 (2026-09-08): custo de vida = três PLANOS mensais
// (uma nota por classe) + MANUTENÇÃO da posse (da nota do item); nada avulso
// se controla; dinheiro inteiro (régua à dezena, ficha pra cima ao milhar);
// semântica da nota pela CONFIG + Cobrança, nunca por rótulo inventado.
import { describe, expect, it } from 'vitest'
import { aluguelDia, carajas, cesta, cfg, estilos, gasolina, kitnet, onibus, pensao, polar, porNome, uisque } from './fixtures/recursos-fixtures'
import {
  RECURSOS_VAZIO,
  acaoDe,
  comprarItem,
  custoEmOuro,
  custoMensal,
  escolherEstilo,
  fecharMes,
  nomeNivel,
  pagarAvista,
  precoDeCompra,
  precoNaRegua,
  recursosDoFm,
  venderItem,
} from '../src/recursos/hero-recursos'

const FATOR = 1000

describe('acaoDe — semântica pela config + Cobrança', () => {
  it('plano=escolher; tarifa avulsa=info; única=comprar (posse); dia/noite=diária; consumo por valor', () => {
    expect(acaoDe(cfg, estilos.t3, FATOR)).toBe('escolher')
    expect(acaoDe(cfg, onibus, FATOR)).toBe('info')
    expect(acaoDe(cfg, carajas, FATOR)).toBe('comprar')
    expect(acaoDe(cfg, aluguelDia, FATOR)).toBe('diaria')
    expect(acaoDe(cfg, pensao, FATOR)).toBe('diaria')
    expect(acaoDe(cfg, gasolina, FATOR)).toBe('miudeza')
    expect(acaoDe(cfg, polar, FATOR)).toBe('miudeza')
    expect(acaoDe(cfg, uisque, FATOR)).toBe('avista')
    expect(acaoDe(cfg, cesta, FATOR)).toBe('avista')
  })
  it('moradia por mês: com `Compra` vira posse (imóvel); sem, é só referência', () => {
    expect(acaoDe(cfg, kitnet, FATOR)).toBe('comprar')
    expect(acaoDe(cfg, { ...kitnet, compra: undefined }, FATOR)).toBe('referencia')
    expect(precoDeCompra(kitnet)).toBe(600000)
    expect(precoDeCompra(carajas, 'usado')).toBe(150000)
    expect(precoDeCompra(carajas)).toBe(400000)
  })
})

describe('dinheiro inteiro', () => {
  it('régua à dezena (mín. 10); ficha pra cima ao milhar', () => {
    expect(precoNaRegua(50, 0.7)).toBe(40)
    expect(precoNaRegua(10, 0.7)).toBe(10)
    expect(precoNaRegua(4000, 1.5)).toBe(6000)
    expect(custoEmOuro(2800, FATOR)).toBe(3)
    expect(custoEmOuro(0, FATOR)).toBe(0)
  })
  it('posse: compra com régua, venda devolve metade (pra baixo); à vista só desconta', () => {
    expect(comprarItem(RECURSOS_VAZIO, carajas, { preco: 150000, estado: 'usado' }, 100, FATOR)).toBeNull()
    const c = comprarItem(RECURSOS_VAZIO, carajas, { preco: precoNaRegua(150000, 0.7), estado: 'usado' }, 200, FATOR)!
    expect(c.ouro).toBe(95)
    expect(c.recursos.itens).toEqual([{ nome: 'Gurgel Carajás', aba: 'Transporte', qtd: 1, estado: 'usado', pago: 105000 }])
    const v = venderItem(c.recursos, 0, c.ouro!, FATOR)!
    expect(v.ouro).toBe(95 + 52)
    expect(v.recursos.itens).toEqual([])
    expect(pagarAvista(RECURSOS_VAZIO, 4000, 3, FATOR)).toBeNull()
    expect(pagarAvista(RECURSOS_VAZIO, 4000, 4, FATOR)!.ouro).toBe(0)
  })
})

describe('custo de vida: planos + manutenção da posse', () => {
  it('soma os planos; posse entra no eixo da aba com a manutenção da nota; classe = menor eixo', () => {
    let r = escolherEstilo(RECURSOS_VAZIO, 'transporte', estilos.t3).recursos
    r = escolherEstilo(r, 'moradia', estilos.m4).recursos
    r = escolherEstilo(r, 'alimentacao', estilos.a5).recursos
    r = comprarItem(r, carajas, { preco: 400000, estado: 'novo' }, 500, FATOR)!.recursos
    r = comprarItem(r, kitnet, { preco: 600000 }, 700, FATOR)!.recursos
    const c = custoMensal(r, porNome, FATOR, cfg)
    const por = Object.fromEntries(c.eixos.map((e) => [e.papel, e]))
    expect(por.moradia).toMatchObject({ planoValor: 6000, posseValor: 1500, total: 7500, nivel: 4 })
    expect(por.transporte).toMatchObject({ planoValor: 2500, posseValor: 3000, total: 5500, nivel: 3 })
    expect(por.alimentacao).toMatchObject({ planoValor: 9000, posseValor: 0, total: 9000, nivel: 5 })
    expect(por.moradia!.posse[0]!.item.nome).toBe('Kitnet do Aeromóvel')
    expect(c.total).toBe(22000)
    expect(c.ouro).toBe(22)
    expect(c.classe).toBe(3)
    expect(c.eixos.map((e) => e.papel)).toEqual(['moradia', 'transporte', 'alimentacao'])
    const vazio = custoMensal(RECURSOS_VAZIO, porNome, FATOR, cfg)
    expect(vazio.total).toBe(0)
    expect(vazio.classe).toBe(1)
    expect(nomeNivel(cfg, 2)).toBe('Classe Baixa')
  })
  it('fechar o mês desconta planos + posse (ou nega)', () => {
    const r = escolherEstilo(escolherEstilo(RECURSOS_VAZIO, 'moradia', estilos.m4).recursos, 'alimentacao', estilos.a2).recursos
    expect(fecharMes(r, porNome, cfg, 7, FATOR)).toBeNull()
    expect(fecharMes(r, porNome, cfg, 8, FATOR)!.ouro).toBe(0)
  })
  it('recursosDoFm tolera lixo e round-trips', () => {
    expect(recursosDoFm({})).toEqual(RECURSOS_VAZIO)
    expect(recursosDoFm({ Recursos_do_Mundo: 'x' })).toEqual(RECURSOS_VAZIO)
    const r = comprarItem(escolherEstilo(RECURSOS_VAZIO, 'transporte', estilos.t4).recursos, carajas, { preco: 400000, estado: 'novo' }, 500, FATOR)!.recursos
    expect(recursosDoFm({ Recursos_do_Mundo: JSON.parse(JSON.stringify(r)) })).toEqual(r)
    expect(recursosDoFm({ Recursos_do_Mundo: { tri: 250, estilos: { moradia: 'X' }, itens: [{ nome: '' }] } })).toEqual({ ...RECURSOS_VAZIO, estilos: { ...RECURSOS_VAZIO.estilos, moradia: 'X' } })
  })
})
