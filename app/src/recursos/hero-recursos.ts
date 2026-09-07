// Estado de RECURSOS do herói + operações PURAS (sem React). O estado vive no
// FM salvo local do herói (`Recursos_do_Mundo`, gravado inteiro via
// model.set/writeHero) e o saldo em `Inventario.Ouro` (PO INTEIRO — a ficha
// conta em milhares: Cz$ 1.000 = 1). Toda compra converte a moeda do mundo
// em unidades da ficha arredondando PRA CIMA ao milhar; nada fracionário.
//
// v3 (2026-09-08): o CUSTO DE VIDA são três PLANOS mensais pagos adiantado
// (plano TRI de transporte, moradia alugada sem posse, padrão de alimentação)
// — notas `Tipo = cfg.tipos.estilo`, uma por classe — mais a MANUTENÇÃO
// mensal do que se tem de posse (carro, imóvel), definida na nota do item.
// Nada avulso se controla aqui (sem saldo de TRI, sem estoque de comida).
import type { Papel, Recurso, RecursosCfg } from './types'

export const RECURSOS_FM = 'Recursos_do_Mundo'
export const OURO_FM = 'Inventario.Ouro'

export const PAPEIS: Papel[] = ['moradia', 'transporte', 'alimentacao']

export interface ItemTido {
  nome: string
  /** aba (subcategoria) da nota — a ficha lista a posse dentro do eixo. */
  aba: string
  qtd: number
  estado?: 'novo' | 'usado'
  /** Quanto pagou por unidade (moeda do mundo) — a venda devolve metade. */
  pago: number
}
export interface RecursosDoHeroi {
  /** Plano (nome da nota) escolhido em cada eixo; null = classe 1 sem plano. */
  estilos: Record<Papel, string | null>
  /** Posse: veículos, imóveis e afins (Cobrança única). */
  itens: ItemTido[]
}

export const RECURSOS_VAZIO: RecursosDoHeroi = {
  estilos: { transporte: null, moradia: null, alimentacao: null },
  itens: [],
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** Lê o bloco do FM salvo (tolerante a ausência/lixo/versões anteriores). */
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
  return {
    estilos: { transporte: str(est.transporte), moradia: str(est.moradia), alimentacao: str(est.alimentacao) },
    itens,
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
  | 'escolher' // plano do mês (só na ficha)
  | 'info' // tarifa avulsa / aluguel de referência: só informa, não se vende
  | 'comprar' // vira POSSE (Cobrança única, ou imóvel com `Compra`)
  | 'diaria' // por dia/noite: paga na hora
  | 'avista' // consumo que fecha um milhar: paga na hora, sem registro
  | 'miudeza' // abaixo de um milhar: sai do bolso, sem registro

export function acaoDe(cfg: RecursosCfg, r: Recurso, fator: number): Acao {
  if (r.tipo === cfg.tipos.estilo) return 'escolher'
  if (r.tipo === cfg.tipos.passagem) return 'info'
  if (r.cobranca === 'única') return 'comprar'
  if (r.cobranca === 'dia' || r.cobranca === 'noite') return 'diaria'
  const papel = papelDaAba(cfg, r.aba)
  if (papel === 'moradia' && r.cobranca === 'mês') return r.compra !== undefined ? 'comprar' : 'info'
  return r.preco >= fator ? 'avista' : 'miudeza'
}

/** Preço de compra de uma nota (posse): imóvel = `Compra`; usado = `Usado`. */
export function precoDeCompra(r: Recurso, estado?: 'novo' | 'usado'): number {
  if (r.compra !== undefined && r.cobranca !== 'única') return r.compra
  return estado === 'usado' ? (r.usado ?? r.preco) : r.preco
}

/* ─────────────────────────── dinheiro ─────────────────────────── */

/** Régua do bairro sobre um preço: arredonda pra dezena, nunca abaixo de 10. */
export function precoNaRegua(preco: number, mult: number): number {
  if (preco <= 0) return 0
  return Math.max(10, Math.round((preco * mult) / 10) * 10)
}

/** Moeda do mundo → unidades da ficha, PRA CIMA ao milhar (nada fracionário). */
export function custoEmOuro(valorMoeda: number, fator: number): number {
  if (valorMoeda <= 0) return 0
  return Math.ceil(valorMoeda / Math.max(1, fator))
}

export interface PosseDoMes {
  indice: number
  item: ItemTido
  recurso: Recurso | undefined
  /** Manutenção mensal (nota × qtd). */
  valor: number
}
export interface EixoDoMes {
  papel: Papel
  /** Plano escolhido (nota) ou null. */
  plano: Recurso | null
  planoValor: number
  posse: PosseDoMes[]
  posseValor: number
  total: number
  nivel: number
}
export interface CustoMensal {
  eixos: EixoDoMes[]
  total: number
  /** Total em unidades da ficha (milhares, pra cima). */
  ouro: number
  /** Classe do herói = menor eixo. */
  classe: number
}

/** Custo do mês por eixo = plano + manutenção da posse daquela aba. */
export function custoMensal(r: RecursosDoHeroi, porNome: Map<string, Recurso>, fator: number, cfg: RecursosCfg): CustoMensal {
  const eixos: EixoDoMes[] = []
  for (const papel of PAPEIS) {
    const aba = abaDoPapel(cfg, papel)
    const nome = r.estilos[papel]
    const n = nome ? porNome.get(nome) : undefined
    const plano = n && isEstilo(cfg, n) ? n : null
    const posse: PosseDoMes[] = []
    r.itens.forEach((item, indice) => {
      if (item.aba !== aba) return
      const rec = porNome.get(item.nome)
      posse.push({ indice, item, recurso: rec, valor: (rec?.manutencao ?? 0) * item.qtd })
    })
    const planoValor = plano?.preco ?? 0
    const posseValor = posse.reduce((a, p) => a + p.valor, 0)
    eixos.push({ papel, plano, planoValor, posse, posseValor, total: planoValor + posseValor, nivel: plano?.nivel ?? 1 })
  }
  const total = eixos.reduce((a, e) => a + e.total, 0)
  return { eixos, total, ouro: custoEmOuro(total, fator), classe: Math.min(...eixos.map((e) => e.nivel)) }
}

/* ─────────────────────────── operações ───────────────────────────
 * Cada op devolve o novo estado (+ saldo quando mexe nele) ou null quando
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

/** Compra que vira POSSE (veículo novo/usado, imóvel). `preco` já com a régua. */
export function comprarItem(
  r: RecursosDoHeroi,
  rec: Recurso,
  opts: { preco: number; estado?: 'novo' | 'usado' },
  ouro: number,
  fator: number,
): Resultado | null {
  const novoOuro = pagar(ouro, opts.preco, fator)
  if (novoOuro === null) return null
  const item: ItemTido = { nome: rec.nome, aba: rec.aba, qtd: 1, pago: opts.preco, ...(opts.estado ? { estado: opts.estado } : {}) }
  return { recursos: { ...r, itens: [...r.itens, item] }, ouro: novoOuro }
}

/** Vende UMA unidade pela METADE do que pagou (na ficha, pra baixo). */
export function venderItem(r: RecursosDoHeroi, indice: number, ouro: number, fator: number): Resultado | null {
  const it = r.itens[indice]
  if (!it) return null
  const volta = Math.floor(it.pago / 2 / Math.max(1, fator))
  const itens = it.qtd > 1 ? r.itens.map((i, k) => (k === indice ? { ...i, qtd: i.qtd - 1 } : i)) : r.itens.filter((_, k) => k !== indice)
  return { recursos: { ...r, itens }, ouro: ouro + volta }
}

/** Pagamento à vista sem registro (diária, corrida, janta fora do plano). */
export function pagarAvista(r: RecursosDoHeroi, preco: number, ouro: number, fator: number): Resultado | null {
  const novoOuro = pagar(ouro, preco, fator)
  if (novoOuro === null) return null
  return { recursos: r, ouro: novoOuro }
}

/** Fecha o mês: desconta planos + manutenção da posse (pra cima ao milhar). */
export function fecharMes(r: RecursosDoHeroi, porNome: Map<string, Recurso>, cfg: RecursosCfg, ouro: number, fator: number): Resultado | null {
  const custo = custoMensal(r, porNome, fator, cfg)
  if (ouro < custo.ouro) return null
  return { recursos: r, ouro: ouro - custo.ouro }
}
