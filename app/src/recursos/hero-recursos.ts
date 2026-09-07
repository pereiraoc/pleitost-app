// Estado de RECURSOS do herói + operações PURAS (sem React). O estado vive no
// FM salvo local do herói (`Recursos_do_Mundo`, gravado inteiro via
// model.set/writeHero) e o ouro em `Inventario.Ouro` (PO INTEIRO — a ficha
// conta em milhares: Cz$ 1.000 = 1 de ouro). Toda compra converte a moeda do
// mundo em ouro arredondando PRA CIMA ao milhar; nada fracionário.
//
// v2 (2026-09-07b): o CUSTO DE VIDA são três eixos (transporte, moradia,
// alimentação) escolhidos entre os ESTILOS (notas `Tipo = cfg.tipos.estilo`,
// uma por classe); o que se compra nos estabelecimentos vira ITEM tido
// (veículo, mantimento, garrafa) ou moradia específica. A semântica de cada
// nota vem da CONFIG do mundo + `Cobrança`; nenhum rótulo inventado aqui.
import type { Papel, Recurso, RecursosCfg } from './types'

export const RECURSOS_FM = 'Recursos_do_Mundo'
export const OURO_FM = 'Inventario.Ouro'

export const PAPEIS: Papel[] = ['transporte', 'moradia', 'alimentacao']

export interface ItemTido {
  nome: string
  /** aba (subcategoria) da nota — a ficha lista por aba. */
  aba: string
  qtd: number
  estado?: 'novo' | 'usado'
  /** Quanto pagou por unidade (moeda do mundo) — a venda devolve metade. */
  pago: number
}
export interface MoradiaAtual {
  nome: string
  modo: 'aluguel' | 'hotel' | 'propria'
}
export interface RecursosDoHeroi {
  /** Estilo (nome da nota) escolhido em cada eixo; null = classe 1. */
  estilos: Record<Papel, string | null>
  /** Saldo do cartão TRI na moeda do mundo. */
  tri: number
  itens: ItemTido[]
  /** Moradia específica (imobiliária/hotel/própria) — substitui o eixo moradia. */
  moradia: MoradiaAtual | null
  imoveis: string[]
}

export const RECURSOS_VAZIO: RecursosDoHeroi = {
  estilos: { transporte: null, moradia: null, alimentacao: null },
  tri: 0,
  itens: [],
  moradia: null,
  imoveis: [],
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** Lê o bloco do FM salvo (tolerante a ausência/lixo/versão anterior). */
export function recursosDoFm(fm: Record<string, unknown>): RecursosDoHeroi {
  const raw = fm[RECURSOS_FM]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return RECURSOS_VAZIO
  const r = raw as Record<string, unknown>
  const est = r.estilos && typeof r.estilos === 'object' ? (r.estilos as Record<string, unknown>) : {}
  const itens = Array.isArray(r.itens)
    ? (r.itens as unknown[])
        .map((v) => {
          if (!v || typeof v !== 'object') return null
          const o = v as Record<string, unknown>
          const nome = str(o.nome)
          const aba = str(o.aba)
          if (!nome || !aba) return null
          const it: ItemTido = { nome, aba, qtd: Math.max(0, Math.round(num(o.qtd) || 1)), pago: Math.max(0, Math.round(num(o.pago))) }
          if (o.estado === 'novo' || o.estado === 'usado') it.estado = o.estado
          return it
        })
        .filter((v): v is ItemTido => v !== null && v.qtd > 0)
    : []
  const m = r.moradia && typeof r.moradia === 'object' ? (r.moradia as Record<string, unknown>) : null
  const modo = m?.modo
  const moradia: MoradiaAtual | null =
    m && str(m.nome) && (modo === 'aluguel' || modo === 'hotel' || modo === 'propria') ? { nome: str(m.nome)!, modo } : null
  return {
    estilos: { transporte: str(est.transporte), moradia: str(est.moradia), alimentacao: str(est.alimentacao) },
    tri: Math.max(0, Math.round(num(r.tri))),
    itens,
    moradia,
    imoveis: Array.isArray(r.imoveis) ? (r.imoveis as unknown[]).map(str).filter((s): s is string => s !== null) : [],
  }
}

/* ─────────────────────────── config ─────────────────────────── */

export function papelDaAba(cfg: RecursosCfg, aba: string): Papel | null {
  return cfg.abas.find((a) => a.nome === aba)?.papel ?? null
}
export function abaDoPapel(cfg: RecursosCfg, papel: Papel): string | null {
  return cfg.abas.find((a) => a.papel === papel)?.nome ?? null
}
/** Nome da classe declarado no contexto (índice 0 = Nível 1); sem nome, só o número. */
export function nomeNivel(cfg: RecursosCfg, n: number): string {
  return cfg.niveis[n - 1] ?? `Nível ${n}`
}
export function isEstilo(cfg: RecursosCfg, r: Recurso): boolean {
  return r.tipo === cfg.tipos.estilo
}

/** O que se pode FAZER com uma nota — derivado da config + Cobrança. */
export type Acao =
  | 'tri' // passagem: sai do saldo TRI
  | 'recarga' // crédito no TRI (paga em ouro, em milhares)
  | 'comprar' // veículo e afins (única): vira item tido, novo/usado
  | 'diaria' // aluguel por dia (transporte): paga na hora
  | 'alugar' // moradia por mês (+ compra se a nota tiver `Compra`)
  | 'hospedar' // hotel por noite (mês = 30 noites)
  | 'escolher' // estilo de vida (só na ficha)
  | 'avista' // fecha um milhar: paga e vira item tido (unidade/mês/litro) ou só paga
  | 'miudeza' // abaixo de um milhar: no estilo, ou em lote

export function acaoDe(cfg: RecursosCfg, r: Recurso, fator: number): Acao {
  if (r.tipo === cfg.tipos.estilo) return 'escolher'
  if (r.tipo === cfg.tipos.recarga) return 'recarga'
  const papel = papelDaAba(cfg, r.aba)
  if (papel === 'transporte') {
    if (r.tipo === cfg.tipos.passagem) return 'tri'
    if (r.cobranca === 'única') return 'comprar'
    if (r.cobranca === 'dia') return 'diaria'
    return r.preco >= fator ? 'avista' : 'miudeza'
  }
  if (papel === 'moradia') {
    if (r.cobranca === 'mês') return 'alugar'
    if (r.cobranca === 'noite') return 'hospedar'
    return r.preco >= fator ? 'avista' : 'miudeza'
  }
  if (r.cobranca === 'única') return 'comprar'
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

/** Miudeza se compra em LOTE que fecha um milhar (25 Polar por Cz$ 1.000). */
export function loteDeMiudeza(preco: number, fator: number): number {
  return Math.max(1, Math.floor(Math.max(1, fator) / Math.max(1, preco)))
}

export interface EixoDoMes {
  papel: Papel
  valor: number
  /** De onde vem o valor do eixo. */
  origem: 'estilo' | 'aluguel' | 'hotel' | 'propria' | 'nenhum'
  nome: string | null
  nivel: number
}
export interface CustoMensal {
  eixos: EixoDoMes[]
  total: number
  /** Total em ouro (milhares, pra cima). */
  ouro: number
  /** Classe do herói = menor eixo. */
  classe: number
}

/** Custo do mês = soma dos três eixos. Moradia específica (imobiliária/
 *  hotel/própria) substitui o estilo de moradia. Sem estilo = classe 1 e
 *  Cz$ 0 naquele eixo (viver de nada — o Mestre decide o que isso custa). */
export function custoMensal(r: RecursosDoHeroi, porNome: Map<string, Recurso>, fator: number, cfg: RecursosCfg): CustoMensal {
  const eixos: EixoDoMes[] = []
  for (const papel of PAPEIS) {
    if (papel === 'moradia' && r.moradia) {
      const n = porNome.get(r.moradia.nome)
      const valor = !n ? 0 : r.moradia.modo === 'hotel' ? n.preco * 30 : r.moradia.modo === 'aluguel' ? n.preco : 0
      eixos.push({ papel, valor, origem: r.moradia.modo, nome: r.moradia.nome, nivel: n?.nivel ?? 1 })
      continue
    }
    const nome = r.estilos[papel]
    const n = nome ? porNome.get(nome) : undefined
    if (n && isEstilo(cfg, n)) eixos.push({ papel, valor: n.preco, origem: 'estilo', nome, nivel: n.nivel ?? 1 })
    else eixos.push({ papel, valor: 0, origem: 'nenhum', nome: null, nivel: 1 })
  }
  const total = eixos.reduce((a, e) => a + e.valor, 0)
  return { eixos, total, ouro: custoEmOuro(total, fator), classe: Math.min(...eixos.map((e) => e.nivel)) }
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

export function escolherEstilo(r: RecursosDoHeroi, papel: Papel, rec: Recurso | null): Resultado {
  return { recursos: { ...r, estilos: { ...r.estilos, [papel]: rec ? rec.nome : null } } }
}

/** Compra que vira ITEM tido (veículo novo/usado, mantimento, garrafa, lote de
 *  miudeza). `preco` já com a régua; `qtd` unidades por essa compra. */
export function comprarItem(
  r: RecursosDoHeroi,
  rec: Recurso,
  opts: { preco: number; qtd?: number; estado?: 'novo' | 'usado' },
  ouro: number,
  fator: number,
): Resultado | null {
  const qtd = Math.max(1, Math.round(opts.qtd ?? 1))
  const novoOuro = pagar(ouro, opts.preco, fator)
  if (novoOuro === null) return null
  const pagoUnit = Math.round(opts.preco / qtd)
  const idx = r.itens.findIndex((i) => i.nome === rec.nome && i.estado === opts.estado && rec.cobranca !== 'única')
  const itens =
    idx >= 0
      ? r.itens.map((i, k) => (k === idx ? { ...i, qtd: i.qtd + qtd, pago: pagoUnit } : i))
      : [...r.itens, { nome: rec.nome, aba: rec.aba, qtd, pago: pagoUnit, ...(opts.estado ? { estado: opts.estado } : {}) }]
  return { recursos: { ...r, itens }, ouro: novoOuro }
}

/** Vende UMA unidade pela METADE do que pagou (em ouro, pra baixo). */
export function venderItem(r: RecursosDoHeroi, indice: number, ouro: number, fator: number): Resultado | null {
  const it = r.itens[indice]
  if (!it) return null
  const volta = Math.floor(it.pago / 2 / Math.max(1, fator))
  const itens = it.qtd > 1 ? r.itens.map((i, k) => (k === indice ? { ...i, qtd: i.qtd - 1 } : i)) : r.itens.filter((_, k) => k !== indice)
  return { recursos: { ...r, itens }, ouro: ouro + volta }
}

/** Consome UMA unidade (garrafa aberta, cesta do mês). */
export function consumirItem(r: RecursosDoHeroi, indice: number): Resultado | null {
  const it = r.itens[indice]
  if (!it) return null
  const itens = it.qtd > 1 ? r.itens.map((i, k) => (k === indice ? { ...i, qtd: i.qtd - 1 } : i)) : r.itens.filter((_, k) => k !== indice)
  return { recursos: { ...r, itens } }
}

/** Recarga do TRI em múltiplos do milhar (sai do ouro 1:1 em milhares). */
export function recarregarTri(r: RecursosDoHeroi, valorMoeda: number, ouro: number, fator: number): Resultado | null {
  if (valorMoeda <= 0 || valorMoeda % Math.max(1, fator) !== 0) return null
  const novoOuro = pagar(ouro, valorMoeda, fator)
  if (novoOuro === null) return null
  return { recursos: { ...r, tri: r.tri + valorMoeda }, ouro: novoOuro }
}

/** Passagem: desconta do saldo TRI (preço já com a régua). */
export function usarPassagem(r: RecursosDoHeroi, preco: number): Resultado | null {
  if (r.tri < preco) return null
  return { recursos: { ...r, tri: r.tri - preco } }
}

/** Pagamento à vista em ouro sem item (diária, corrida longa). */
export function pagarAvista(r: RecursosDoHeroi, preco: number, ouro: number, fator: number): Resultado | null {
  const novoOuro = pagar(ouro, preco, fator)
  if (novoOuro === null) return null
  return { recursos: r, ouro: novoOuro }
}

export function alugarMoradia(r: RecursosDoHeroi, rec: Recurso): Resultado {
  return { recursos: { ...r, moradia: { nome: rec.nome, modo: 'aluguel' } } }
}

export function hospedar(r: RecursosDoHeroi, rec: Recurso): Resultado {
  return { recursos: { ...r, moradia: { nome: rec.nome, modo: 'hotel' } } }
}

/** Compra o imóvel (FM `Compra`, já com a régua) e passa a morar nele. */
export function comprarImovel(r: RecursosDoHeroi, rec: Recurso, precoCompra: number, ouro: number, fator: number): Resultado | null {
  const novoOuro = pagar(ouro, precoCompra, fator)
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

export function morarNoProprio(r: RecursosDoHeroi, nome: string): Resultado | null {
  if (!r.imoveis.includes(nome)) return null
  return { recursos: { ...r, moradia: { nome, modo: 'propria' } } }
}

export function sairDaMoradia(r: RecursosDoHeroi): Resultado {
  return { recursos: { ...r, moradia: null } }
}

/** Fecha o mês: desconta o custo mensal (pra cima ao milhar) do ouro. */
export function fecharMes(r: RecursosDoHeroi, porNome: Map<string, Recurso>, cfg: RecursosCfg, ouro: number, fator: number): Resultado | null {
  const custo = custoMensal(r, porNome, fator, cfg)
  if (ouro < custo.ouro) return null
  return { recursos: r, ouro: ouro - custo.ouro }
}
