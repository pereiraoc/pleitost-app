// Estado de RECURSOS do herói + operações PURAS (sem React). O estado vive no
// FM salvo local do herói (`Recursos_do_Mundo`, gravado inteiro via
// model.set) e o ouro em `Inventario.Ouro` (PO INTEIRO — a ficha conta em
// milhares: Cz$ 1.000 = 1 de ouro). Toda compra converte a moeda do mundo em
// ouro arredondando PRA CIMA ao milhar; nada fracionário.
//
// A semântica de cada nota vem da CONFIG do mundo (contexto.json `recursos`:
// papel de cada aba, nomes dos Tipos passagem/estilo) + da `Cobrança` da nota
// (mês = assina/aluga · noite = hotel · única = compra · dia = diária · resto
// = à vista, ou miudeza se não fecha um milhar). Nenhum rótulo inventado aqui.
import type { Papel, Recurso, RecursosCfg } from './types'

export const RECURSOS_FM = 'Recursos_do_Mundo'
export const OURO_FM = 'Inventario.Ouro'

export interface VeiculoTido {
  nome: string
  estado: 'novo' | 'usado'
  /** Quanto pagou (moeda do mundo) — a venda devolve metade. */
  pago: number
}
export interface MoradiaAtual {
  nome: string
  modo: 'aluguel' | 'hotel' | 'propria'
}
export interface RecursosDoHeroi {
  /** Saldo do cartão TRI na moeda do mundo (passagens saem daqui). */
  tri: number
  /** Nome da nota de passe mensal assinado (aba transporte, Cobrança mês). */
  passe: string | null
  veiculos: VeiculoTido[]
  moradia: MoradiaAtual | null
  /** Imóveis comprados (nomes das notas). */
  imoveis: string[]
  /** Nome da nota de estilo de alimentação (Tipo = cfg.tipos.estilo). */
  alimentacao: string | null
}

export const RECURSOS_VAZIO: RecursosDoHeroi = {
  tri: 0,
  passe: null,
  veiculos: [],
  moradia: null,
  imoveis: [],
  alimentacao: null,
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** Lê o bloco do FM salvo (tolerante a ausência/lixo). */
export function recursosDoFm(fm: Record<string, unknown>): RecursosDoHeroi {
  const raw = fm[RECURSOS_FM]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return RECURSOS_VAZIO
  const r = raw as Record<string, unknown>
  const veiculos = Array.isArray(r.veiculos)
    ? (r.veiculos as unknown[])
        .map((v) => {
          if (!v || typeof v !== 'object') return null
          const o = v as Record<string, unknown>
          const nome = str(o.nome)
          if (!nome) return null
          return { nome, estado: o.estado === 'novo' ? 'novo' : 'usado', pago: Math.max(0, Math.round(num(o.pago))) } as VeiculoTido
        })
        .filter((v): v is VeiculoTido => v !== null)
    : []
  const m = r.moradia && typeof r.moradia === 'object' ? (r.moradia as Record<string, unknown>) : null
  const modo = m?.modo
  const moradia: MoradiaAtual | null =
    m && str(m.nome) && (modo === 'aluguel' || modo === 'hotel' || modo === 'propria') ? { nome: str(m.nome)!, modo } : null
  return {
    tri: Math.max(0, Math.round(num(r.tri))),
    passe: str(r.passe),
    veiculos,
    moradia,
    imoveis: Array.isArray(r.imoveis) ? (r.imoveis as unknown[]).map(str).filter((s): s is string => s !== null) : [],
    alimentacao: str(r.alimentacao),
  }
}

/* ─────────────────────────── config ─────────────────────────── */

export function papelDaAba(cfg: RecursosCfg, aba: string): Papel | null {
  return cfg.abas.find((a) => a.nome === aba)?.papel ?? null
}
export function abaDoPapel(cfg: RecursosCfg, papel: Papel): string | null {
  return cfg.abas.find((a) => a.papel === papel)?.nome ?? null
}
/** Nome do nível declarado no contexto (índice 0 = Nível 1); sem nome, só o número. */
export function nomeNivel(cfg: RecursosCfg, n: number): string {
  return cfg.niveis[n - 1] ?? `Nível ${n}`
}

/** O que a ficha pode FAZER com uma nota — derivado da config + Cobrança. */
export type Acao =
  | 'tri' // passagem: sai do saldo TRI
  | 'assinar' // passe mensal (transporte)
  | 'comprar' // veículo (novo/usado)
  | 'diaria' // aluguel por dia (transporte)
  | 'alugar' // moradia por mês (+ compra se a nota tiver `Compra`)
  | 'hospedar' // hotel por noite (mês = 30 noites)
  | 'escolher' // estilo de alimentação
  | 'avista' // paga em ouro na hora (fecha um milhar)
  | 'miudeza' // abaixo de um milhar: vive no estilo de vida, só se mostra

export function acaoDe(cfg: RecursosCfg, r: Recurso, fator: number): Acao {
  const papel = papelDaAba(cfg, r.aba)
  if (papel === 'transporte') {
    if (r.tipo === cfg.tipos.passagem) return 'tri'
    if (r.cobranca === 'mês') return 'assinar'
    if (r.cobranca === 'única') return 'comprar'
    if (r.cobranca === 'dia') return 'diaria'
    return r.preco >= fator ? 'avista' : 'miudeza'
  }
  if (papel === 'moradia') {
    if (r.cobranca === 'mês') return 'alugar'
    if (r.cobranca === 'noite') return 'hospedar'
    return r.preco >= fator ? 'avista' : 'miudeza'
  }
  if (papel === 'alimentacao') {
    if (r.tipo === cfg.tipos.estilo) return 'escolher'
    return r.preco >= fator ? 'avista' : 'miudeza'
  }
  return r.preco >= fator ? 'avista' : 'miudeza'
}

/* ─────────────────────────── dinheiro ─────────────────────────── */

/** Régua do bairro sobre um preço: arredonda pra dezena, nunca abaixo de 10. */
export function precoNaRegua(preco: number, mult: number): number {
  if (preco <= 0) return 0
  return Math.max(10, Math.round((preco * mult) / 10) * 10)
}

/** Moeda do mundo → ouro da ficha, PRA CIMA ao milhar (nada fracionário). */
export function custoEmOuro(valorMoeda: number, fator: number): number {
  if (valorMoeda <= 0) return 0
  return Math.ceil(valorMoeda / Math.max(1, fator))
}

export interface CustoMensal {
  moradia: number
  alimentacao: number
  transporte: number
  total: number
  /** Total em ouro (milhares, pra cima). */
  ouro: number
}

/** Custo do mês = moradia (aluguel; hotel ×30; própria 0) + estilo de
 *  alimentação + transporte (passe + manutenção dos veículos). Preço da NOTA
 *  (sem régua — a moradia já é do bairro dela). */
export function custoMensal(r: RecursosDoHeroi, porNome: Map<string, Recurso>, fator: number): CustoMensal {
  let moradia = 0
  if (r.moradia) {
    const n = porNome.get(r.moradia.nome)
    if (n) moradia = r.moradia.modo === 'hotel' ? n.preco * 30 : r.moradia.modo === 'aluguel' ? n.preco : 0
  }
  const alimentacao = r.alimentacao ? (porNome.get(r.alimentacao)?.preco ?? 0) : 0
  let transporte = r.passe ? (porNome.get(r.passe)?.preco ?? 0) : 0
  for (const v of r.veiculos) transporte += porNome.get(v.nome)?.manutencao ?? 0
  const total = moradia + alimentacao + transporte
  return { moradia, alimentacao, transporte, total, ouro: custoEmOuro(total, fator) }
}

export interface NivelDoHeroi {
  moradia: number
  alimentacao: number
  /** O menor dos eixos — quem mora em cobertura e come ração vive como ração. */
  nivel: number
}

/** Sem moradia/estilo = Nível 1 (na rua / come o que sobra). Imóvel próprio
 *  usa o nível da nota comprada. */
export function nivelDoHeroi(r: RecursosDoHeroi, porNome: Map<string, Recurso>): NivelDoHeroi {
  const moradia = r.moradia ? (porNome.get(r.moradia.nome)?.nivel ?? 1) : 1
  const alimentacao = r.alimentacao ? (porNome.get(r.alimentacao)?.nivel ?? 1) : 1
  return { moradia, alimentacao, nivel: Math.min(moradia, alimentacao) }
}

/* ─────────────────────────── operações ───────────────────────────
 * Cada op devolve o novo estado (+ ouro quando mexe no ouro) ou null quando
 * não dá (saldo insuficiente). Nunca muta o estado recebido. */

export interface Resultado {
  recursos: RecursosDoHeroi
  ouro?: number
}

function pagar(ouro: number, valorMoeda: number, fator: number): number | null {
  const custo = custoEmOuro(valorMoeda, fator)
  return ouro >= custo ? ouro - custo : null
}

export function comprarVeiculo(
  r: RecursosDoHeroi,
  rec: Recurso,
  estado: 'novo' | 'usado',
  ouro: number,
  fator: number,
  mult = 1,
): Resultado | null {
  const base = estado === 'usado' ? (rec.usado ?? rec.preco) : rec.preco
  const valor = precoNaRegua(base, mult)
  const novoOuro = pagar(ouro, valor, fator)
  if (novoOuro === null) return null
  return {
    recursos: { ...r, veiculos: [...r.veiculos, { nome: rec.nome, estado, pago: valor }] },
    ouro: novoOuro,
  }
}

/** Vende pela METADE do que pagou (em ouro, pra baixo — o ferro-velho não dá troco). */
export function venderVeiculo(r: RecursosDoHeroi, indice: number, ouro: number, fator: number): Resultado | null {
  const v = r.veiculos[indice]
  if (!v) return null
  const volta = Math.floor(v.pago / 2 / Math.max(1, fator))
  return {
    recursos: { ...r, veiculos: r.veiculos.filter((_, i) => i !== indice) },
    ouro: ouro + volta,
  }
}

/** Recarga do TRI em múltiplos do milhar (sai do ouro 1:1 em milhares). */
export function recarregarTri(r: RecursosDoHeroi, valorMoeda: number, ouro: number, fator: number): Resultado | null {
  if (valorMoeda <= 0 || valorMoeda % Math.max(1, fator) !== 0) return null
  const novoOuro = pagar(ouro, valorMoeda, fator)
  if (novoOuro === null) return null
  return { recursos: { ...r, tri: r.tri + valorMoeda }, ouro: novoOuro }
}

/** Passagem: desconta do saldo TRI (com a régua do bairro). */
export function usarPassagem(r: RecursosDoHeroi, rec: Recurso, mult = 1): Resultado | null {
  const valor = precoNaRegua(rec.preco, mult)
  if (r.tri < valor) return null
  return { recursos: { ...r, tri: r.tri - valor } }
}

/** Pagamento à vista em ouro (corrida longa, diária, item que fecha um milhar). */
export function pagarAvista(r: RecursosDoHeroi, valorMoeda: number, ouro: number, fator: number, mult = 1): Resultado | null {
  const novoOuro = pagar(ouro, precoNaRegua(valorMoeda, mult), fator)
  if (novoOuro === null) return null
  return { recursos: r, ouro: novoOuro }
}

export function assinarPasse(r: RecursosDoHeroi, rec: Recurso | null): Resultado {
  return { recursos: { ...r, passe: rec ? rec.nome : null } }
}

export function alugarMoradia(r: RecursosDoHeroi, rec: Recurso): Resultado {
  return { recursos: { ...r, moradia: { nome: rec.nome, modo: 'aluguel' } } }
}

export function hospedar(r: RecursosDoHeroi, rec: Recurso): Resultado {
  return { recursos: { ...r, moradia: { nome: rec.nome, modo: 'hotel' } } }
}

/** Compra o imóvel (FM `Compra`) e passa a morar nele sem aluguel. */
export function comprarImovel(r: RecursosDoHeroi, rec: Recurso, ouro: number, fator: number, mult = 1): Resultado | null {
  if (rec.compra === undefined) return null
  const novoOuro = pagar(ouro, precoNaRegua(rec.compra, mult), fator)
  if (novoOuro === null) return null
  return {
    recursos: {
      ...r,
      imoveis: r.imoveis.includes(rec.nome) ? r.imoveis : [...r.imoveis, rec.nome],
      moradia: { nome: rec.nome, modo: 'propria' },
    },
    ouro: novoOuro,
  }
}

/** Volta a morar num imóvel que já é seu. */
export function morarNoProprio(r: RecursosDoHeroi, nome: string): Resultado | null {
  if (!r.imoveis.includes(nome)) return null
  return { recursos: { ...r, moradia: { nome, modo: 'propria' } } }
}

export function sairDaMoradia(r: RecursosDoHeroi): Resultado {
  return { recursos: { ...r, moradia: null } }
}

export function escolherAlimentacao(r: RecursosDoHeroi, rec: Recurso | null): Resultado {
  return { recursos: { ...r, alimentacao: rec ? rec.nome : null } }
}

/** Fecha o mês: desconta o custo mensal (pra cima ao milhar) do ouro. */
export function fecharMes(r: RecursosDoHeroi, porNome: Map<string, Recurso>, ouro: number, fator: number): Resultado | null {
  const custo = custoMensal(r, porNome, fator)
  if (ouro < custo.ouro) return null
  return { recursos: r, ouro: ouro - custo.ouro }
}
