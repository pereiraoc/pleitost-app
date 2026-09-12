// RECURSOS DO MUNDO v3 (2026-09-08): custo de vida = três PLANOS mensais
// (uma nota por classe) + MANUTENÇÃO da posse (da nota do item); nada avulso
// se controla; dinheiro inteiro (régua à dezena, ficha pra cima ao milhar);
// semântica da nota pela CONFIG + Cobrança, nunca por rótulo inventado.
import { describe, expect, it } from 'vitest'
import { aluguelDia, carajas, cesta, cfg, credito, estilos, gasolina, kitnet, onibus, pensao, polar, porNome, uisque } from './fixtures/recursos-fixtures'
import {
  RECURSOS_VAZIO,
  acaoDe,
  comprarItem,
  custoEmOuro,
  custoMensal,
  escolherEstilo,
  nomeNivel,
  pagarAvista,
  precoDeCompra,
  precoNaRegua,
  melhorDoEixo,
  recursosDoFm,
  venderItem,
  abrirMes,
  amortizar,
  consertar,
  manutencaoDoItem,
  naRua,
  pegarEmprestimo,
  tetoDoEmprestimo,
  vagasDe,
} from '../src/recursos/hero-recursos'
import type { EixoDoMes } from '../src/recursos/hero-recursos'
import type { Recurso } from '../src/recursos/types'

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
  it('abrir o mês desconta planos + posse (ou nega)', () => {
    const r = escolherEstilo(escolherEstilo(RECURSOS_VAZIO, 'moradia', estilos.m4).recursos, 'alimentacao', estilos.a2).recursos
    expect(abrirMes(r, porNome, cfg, 7, FATOR, 'Carlos')).toBeNull()
    expect(abrirMes(r, porNome, cfg, 8, FATOR, 'Carlos')!.ouro).toBe(0)
  })
  it('recursosDoFm tolera lixo e round-trips', () => {
    expect(recursosDoFm({})).toEqual(RECURSOS_VAZIO)
    expect(recursosDoFm({ Recursos_do_Mundo: 'x' })).toEqual(RECURSOS_VAZIO)
    const r = comprarItem(escolherEstilo(RECURSOS_VAZIO, 'transporte', estilos.t4).recursos, carajas, { preco: 400000, estado: 'novo' }, 500, FATOR)!.recursos
    expect(recursosDoFm({ Recursos_do_Mundo: JSON.parse(JSON.stringify(r)) })).toEqual(r)
    expect(recursosDoFm({ Recursos_do_Mundo: { tri: 250, estilos: { moradia: 'X' }, itens: [{ nome: '' }] } })).toEqual({ ...RECURSOS_VAZIO, estilos: { ...RECURSOS_VAZIO.estilos, moradia: 'X' } })
  })
})

/* ── v4 (2026-09-08): abrir o mês, dívida, eixo pago por terceiro, manutenção
 *    do usado, vaga de garagem e d6 de pane. Regra em Custo de Vida. ── */

describe('manutenção: usado custa mais, item cedido não custa nada', () => {
  it('usado paga ×1,5 à centena pra cima; novo paga a nota; item de terceiro é de graça', () => {
    expect(manutencaoDoItem(carajas, { nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 400000 })).toBe(3000)
    expect(manutencaoDoItem(carajas, { nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 150000, estado: 'usado' })).toBe(4500)
    // ×1,5 quebrado sobe pra centena: 1.000 → 1.500; 700 → 1.050 → 1.100
    expect(manutencaoDoItem({ ...carajas, manutencao: 700 }, { nome: 'x', aba: 'Transporte', qtd: 1, pago: 0, estado: 'usado' })).toBe(1100)
    expect(manutencaoDoItem(carajas, { nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 0, pagoPor: 'o sindicato' })).toBe(0)
    // qtd multiplica
    expect(manutencaoDoItem(carajas, { nome: carajas.nome, aba: 'Transporte', qtd: 2, pago: 0 })).toBe(6000)
  })
})

describe('eixo pago por terceiro (regalia de classe)', () => {
  const base = { ...RECURSOS_VAZIO, estilos: { transporte: estilos.t4.nome, moradia: estilos.m4.nome, alimentacao: estilos.a2.nome } }
  it('o plano cedido conta pra classe mas não sai do bolso', () => {
    const semRegalia = custoMensal(base, porNome, FATOR, cfg)
    expect(semRegalia.total).toBe(5000 + 6000 + 1500)
    const comRegalia = custoMensal({ ...base, pagoPor: { moradia: 'a firma' } }, porNome, FATOR, cfg)
    const moradia = comRegalia.eixos.find((e) => e.papel === 'moradia')!
    expect(moradia.planoValor).toBe(6000) // aparece na ficha
    expect(moradia.pagoPor).toBe('a firma')
    expect(comRegalia.total).toBe(5000 + 1500) // mas não no total do bolso
    expect(comRegalia.classe).toBe(2) // a classe segue sendo o menor eixo (alimentação 2)
  })
  it('a regalia cobre o PLANO, não a manutenção do que o herói comprou', () => {
    const comCarro = { ...base, pagoPor: { transporte: 'a firma' }, itens: [{ nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 400000 }] }
    const c = custoMensal(comCarro, porNome, FATOR, cfg)
    expect(c.total).toBe(6000 + 1500 + 3000) // plano de transporte cedido; a manutenção do Carajás continua sendo dele
  })
})

describe('vaga de garagem', () => {
  const comMoradia = (plano: string, veiculos: number) => ({
    ...RECURSOS_VAZIO,
    estilos: { transporte: null, moradia: plano, alimentacao: null },
    itens: Array.from({ length: veiculos }, () => ({ nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 400000 })),
  })
  it('as vagas vêm do plano de moradia; o que não cabe fica na rua', () => {
    expect(vagasDe(comMoradia(estilos.m4.nome, 0), porNome, cfg)).toBe(1)
    expect(vagasDe(comMoradia(estilos.m6.nome, 0), porNome, cfg)).toBe(4)
    expect(vagasDe(RECURSOS_VAZIO, porNome, cfg)).toBe(0) // sem plano, nenhuma vaga
    expect(naRua(comMoradia(estilos.m4.nome, 3), porNome, cfg)).toEqual([1, 2]) // o primeiro tem vaga
    expect(naRua(comMoradia(estilos.m6.nome, 3), porNome, cfg)).toEqual([])
  })
})

describe('d6 de pane ao abrir o mês', () => {
  const comCarro = (estado: 'novo' | 'usado', plano: string | null) => ({
    ...RECURSOS_VAZIO,
    estilos: { transporte: null, moradia: plano, alimentacao: null },
    itens: [{ nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 400000, estado }],
  })
  it('novo com vaga nunca pana; usado e sem vaga rolam d6 (1 = pane), determinístico por herói e mês', () => {
    const seguro = comCarro('novo', estilos.m4.nome)
    for (let mes = 0; mes < 24; mes++) {
      expect(abrirMes({ ...seguro, mes }, porNome, cfg, 999, FATOR, 'Carlos')!.recursos.itens[0]!.pane).toBeFalsy()
    }
    // usado: pana em algum mês da janela, e o MESMO mês dá sempre o mesmo resultado
    const usado = comCarro('usado', estilos.m4.nome)
    const panes = Array.from({ length: 24 }, (_, mes) => !!abrirMes({ ...usado, mes }, porNome, cfg, 999, FATOR, 'Carlos')!.recursos.itens[0]!.pane)
    expect(panes.some(Boolean)).toBe(true)
    expect(panes.every(Boolean)).toBe(false)
    const repetido = Array.from({ length: 24 }, (_, mes) => !!abrirMes({ ...usado, mes }, porNome, cfg, 999, FATOR, 'Carlos')!.recursos.itens[0]!.pane)
    expect(repetido).toEqual(panes)
    // herói diferente, sorte diferente (a semente inclui o nome)
    const outro = Array.from({ length: 24 }, (_, mes) => !!abrirMes({ ...usado, mes }, porNome, cfg, 999, FATOR, 'Pind')!.recursos.itens[0]!.pane)
    expect(outro).not.toEqual(panes)
  })
  it('consertar custa a manutenção em dobro e limpa a pane', () => {
    const emPane = { ...RECURSOS_VAZIO, itens: [{ nome: carajas.nome, aba: 'Transporte', qtd: 1, pago: 150000, estado: 'usado' as const, pane: true }] }
    expect(consertar(emPane, 0, porNome, 8, FATOR)).toBeNull() // 4.500 × 2 = 9.000 → 9 na ficha
    const ok = consertar(emPane, 0, porNome, 9, FATOR)!
    expect(ok.ouro).toBe(0)
    expect(ok.recursos.itens[0]!.pane).toBeFalsy()
  })
})

describe('empréstimo: dívida, juros ao mês e amortização', () => {
  const rico = { ...RECURSOS_VAZIO, estilos: { transporte: estilos.t4.nome, moradia: estilos.m4.nome, alimentacao: estilos.a2.nome } }
  it('teto = Teto_Meses × o mês do herói, ou o teto fixo da nota', () => {
    const mes = custoMensal(rico, porNome, FATOR, cfg).total // 12.500
    expect(tetoDoEmprestimo(credito.banrisul, mes)).toBe(12 * mes)
    expect(tetoDoEmprestimo(credito.fiado, mes)).toBe(5000)
    expect(tetoDoEmprestimo(credito.agiota, mes)).toBeNull() // sem teto no sistema: a mesa decide
  })
  it('pegar credita o principal e abre a dívida; acima do teto, nega', () => {
    expect(pegarEmprestimo(rico, credito.fiado, 6000, 0, FATOR, 12500)).toBeNull()
    const r = pegarEmprestimo(rico, credito.agiota, 150000, 2, FATOR, 12500)!
    expect(r.ouro).toBe(152) // 2 + 150
    expect(r.recursos.dividas).toEqual([{ fonte: credito.agiota.nome, principal: 150000, saldo: 150000 }])
  })
  it('a parcela é juros do saldo (ao milhar pra cima) + um décimo do principal — a tabela de Custo de Vida', () => {
    const div = (saldo: number) => ({ ...RECURSOS_VAZIO, dividas: [{ fonte: credito.agiota.nome, principal: 150000, saldo }] })
    const parcela = (saldo: number, fonte = credito.agiota.nome) =>
      custoMensal({ ...div(saldo), dividas: [{ fonte, principal: 150000, saldo }] }, porNome, FATOR, cfg).parcelas[0]!
    expect(parcela(150000)).toMatchObject({ juros: 30000, amortizacao: 15000, total: 45000 })
    expect(parcela(90000)).toMatchObject({ juros: 18000, total: 33000 })
    expect(parcela(15000)).toMatchObject({ juros: 3000, amortizacao: 15000, total: 18000 })
    // juro quebrado sobe ao milhar: Sicredi 6% de 90.000 = 5.400 → 6.000
    expect(parcela(90000, credito.banrisul.nome).juros).toBe(8000) // 8% de 90.000 = 7.200 → 8.000
    // último mês: amortiza só o que falta
    expect(parcela(10000)).toMatchObject({ amortizacao: 10000, total: 12000 })
  })
  it('abrir o mês paga plano + manutenção + parcela, e a dívida diminui', () => {
    const comDivida = { ...rico, dividas: [{ fonte: credito.agiota.nome, principal: 150000, saldo: 150000 }] }
    const c = custoMensal(comDivida, porNome, FATOR, cfg)
    expect(c.total).toBe(12500 + 45000)
    expect(abrirMes(comDivida, porNome, cfg, 57, FATOR, 'Carlos')).toBeNull() // falta 1 (57.500 → 58)
    const r = abrirMes(comDivida, porNome, cfg, 100, FATOR, 'Carlos')!
    expect(r.ouro).toBe(100 - 58)
    expect(r.recursos.dividas[0]!.saldo).toBe(135000)
    expect(r.recursos.mes).toBe(1)
  })
  it('amortizar abate o saldo e quitar remove a dívida', () => {
    const d = { ...RECURSOS_VAZIO, dividas: [{ fonte: credito.agiota.nome, principal: 150000, saldo: 150000 }] }
    expect(amortizar(d, 0, 200000, 200, FATOR)).toBeNull() // não paga mais que o saldo
    const meio = amortizar(d, 0, 50000, 60, FATOR)!
    expect(meio.ouro).toBe(10)
    expect(meio.recursos.dividas[0]!.saldo).toBe(100000)
    const quitado = amortizar(meio.recursos, 0, 100000, 100, FATOR)!
    expect(quitado.recursos.dividas).toEqual([])
  })
})

/* Pedido 2026-09-12: cada eixo mostra no sumário a figura do MAIOR que tem ali
 * dentro — "se tiver um apartamento e também um plano, mostra a imagem do
 * melhor". Maior = degrau mais alto; empate desempata pelo preço de referência. */
describe('melhorDoEixo', () => {
  const rec = (nome: string, nivel: number | undefined, preco: number, compra?: number): Recurso =>
    ({ id: `x/${nome}`, nome, aliases: [], aba: 'Moradia', tipo: 'Estilo de Vida', marca: '', preco, cobranca: 'mês', nivel, compra, onde: [], resumo: '' }) as Recurso
  const eixo = (plano: Recurso | null, posses: (Recurso | undefined)[]): EixoDoMes =>
    ({
      papel: 'moradia',
      plano,
      planoValor: 0,
      posse: posses.map((recurso, indice) => ({ indice, item: { nome: recurso?.nome ?? '?', aba: 'Moradia', qtd: 1, pago: 0 }, recurso, valor: 0, naRua: false })),
      posseValor: 0,
      total: 0,
      doBolso: 0,
      nivel: plano?.nivel ?? 1,
    }) as EixoDoMes

  it('sem plano nem posse não tem figura', () => {
    expect(melhorDoEixo(eixo(null, []))).toBeNull()
  })

  it('só o plano: é ele', () => {
    const kitnet = rec('Kitnet', 4, 6000)
    expect(melhorDoEixo(eixo(kitnet, []))?.nome).toBe('Kitnet')
  })

  it('o imóvel de degrau mais alto ganha do plano', () => {
    const kitnet = rec('Kitnet', 4, 6000)
    const apto = rec('Apartamento em Petrópolis', 5, 15000, 900000)
    expect(melhorDoEixo(eixo(kitnet, [apto]))?.nome).toBe('Apartamento em Petrópolis')
  })

  it('o plano ganha quando a posse é de degrau menor', () => {
    const apartamento = rec('Apartamento', 5, 15000)
    const barraco = rec('Barraco de Sucata', 2, 300)
    expect(melhorDoEixo(eixo(apartamento, [barraco]))?.nome).toBe('Apartamento')
  })

  it('empate de degrau desempata pelo preço de referência (compra, senão preço)', () => {
    const fusca = rec('Volkswagen Fusca', 4, 90000)
    const carajas = rec('Gurgel Carajás', 4, 400000)
    expect(melhorDoEixo(eixo(null, [fusca, carajas]))?.nome).toBe('Gurgel Carajás')
  })

  it('posse sem nota na vault não quebra', () => {
    const kitnet = rec('Kitnet', 4, 6000)
    expect(melhorDoEixo(eixo(kitnet, [undefined]))?.nome).toBe('Kitnet')
  })
})
