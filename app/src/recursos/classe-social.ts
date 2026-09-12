// CLASSE SOCIAL (2026-09-12) — o retrato do mês. Antes a classe era o NOME do
// plano ("Moradia Classe Média"); agora o plano se chama pelo que vende
// ("Kitnet") e a classe é o conjunto: como se vive (os três planos), o que se
// comprou (posse), o que se carrega (equipamento não-consumível) e o que
// sobrou no bolso. Por cima vem a TENDÊNCIA da profissão — piso e teto por
// tier —, que é o que faz o Executivo entrar na cidade já de terno e o
// Ressonante começar embaixo de todo mundo e terminar acima dele.
//
// Nada aqui é número do código: letras, pesos, faixas e tendências são o
// bloco `recursos.classe_social` do Contexto-Def do mundo.
import type { RecursosCfg } from './types'

export type ClasseSocialCfg = NonNullable<RecursosCfg['classeSocial']>
export type ComponenteSocial = 'padrao' | 'patrimonio' | 'equipamento' | 'dinheiro'
/** Os que se somam no ajuste (o `padrao` é a base, não entra na média). */
export type ComponenteTido = Exclude<ComponenteSocial, 'padrao'>

export interface RetratoSocial {
  /** Degrau final 1..6, já com o piso/teto da profissão. */
  degrau: number
  /** Degrau antes da tendência — o que o dinheiro do herói compraria sozinho. */
  bruto: number
  letra: string
  rotulo: string
  degraus: Record<ComponenteSocial, number>
  valores: { patrimonio: number; equipamento: number; dinheiro: number }
  /** Presente quando a profissão mexeu no resultado. */
  tendencia?: { limite: 'piso' | 'teto'; classe: string; nota?: string }
}

export interface EntradaSocial {
  /** Nível (1..6) do plano de cada eixo do mês; eixo sem plano = 1. */
  niveis: number[]
  /** Posse comprada (veículo, imóvel), na moeda do mundo. */
  patrimonio: number
  /** Arma, armadura, escudo, módulo, válvula — nunca consumível. */
  equipamento: number
  /** Dinheiro em mãos neste mês. */
  dinheiro: number
  /** Classe CANÔNICA do herói (o wikilink), pra tendência da profissão. */
  classe?: string
  /** Tier 1..3 (o 4 do nível 10 usa a linha do 3). */
  tier?: number
}

/** Degrau de um valor numa escada de mínimos (`faixas[i]` = piso do degrau i+1). */
export function degrauPorFaixa(valor: number, faixas: readonly number[]): number {
  let degrau = 1
  for (let i = 0; i < faixas.length; i++) {
    if (valor >= (faixas[i] ?? Number.POSITIVE_INFINITY)) degrau = i + 1
  }
  return degrau
}

const limita = (n: number) => Math.min(6, Math.max(1, n))

/** Quanto o que o herói TEM mexe no degrau do padrão de vida. */
function ajusteDe(cs: ClasseSocialCfg, distancia: number): number {
  const max = cs.ajuste?.max ?? 1
  const divisor = cs.ajuste?.divisor || 1
  return Math.min(max, Math.max(-max, Math.round(distancia / divisor)))
}

export function retratoSocial(cs: ClasseSocialCfg, e: EntradaSocial): RetratoSocial {
  const niveis = e.niveis.length ? e.niveis : [1]
  const degraus: Record<ComponenteSocial, number> = {
    padrao: limita(Math.round(niveis.reduce((a, b) => a + b, 0) / niveis.length)),
    patrimonio: degrauPorFaixa(e.patrimonio, cs.faixas.patrimonio),
    equipamento: degrauPorFaixa(e.equipamento, cs.faixas.equipamento),
    dinheiro: degrauPorFaixa(e.dinheiro, cs.faixas.dinheiro),
  }
  // O PADRÃO DE VIDA define o degrau; o que o herói TEM ajusta em até
  // `ajuste.max` pra cima ou pra baixo (carro, arsenal e dinheiro mudam como a
  // cidade te trata, mas quem mora em pensão não vira Classe Alta por ter uma
  // arma cara no armário).
  let somaPeso = 0
  let soma = 0
  for (const k of ['patrimonio', 'equipamento', 'dinheiro'] as const) {
    const peso = cs.pesos[k] ?? 0
    somaPeso += peso
    soma += peso * degraus[k]
  }
  const tem = somaPeso > 0 ? soma / somaPeso : degraus.padrao
  const bruto = limita(degraus.padrao + ajusteDe(cs, tem - degraus.padrao))

  // Tendência da profissão: o tier 4 (nível 10) segue na linha do tier 3.
  let degrau = bruto
  let tendencia: RetratoSocial['tendencia']
  const t = e.classe ? cs.tendencias[e.classe] : undefined
  if (t && e.tier) {
    const i = Math.min(3, Math.max(1, e.tier)) - 1
    const teto = t.teto?.[i]
    const piso = t.piso?.[i]
    if (teto !== undefined && degrau > teto) {
      degrau = teto
      tendencia = { limite: 'teto', classe: e.classe!, ...(t.nota ? { nota: t.nota } : {}) }
    }
    if (piso !== undefined && degrau < piso) {
      degrau = piso
      tendencia = { limite: 'piso', classe: e.classe!, ...(t.nota ? { nota: t.nota } : {}) }
    }
  }
  const letra = cs.letras[degrau - 1] ?? '?'
  return {
    degrau,
    bruto,
    letra,
    rotulo: cs.rotulos[letra] ?? '',
    degraus,
    valores: { patrimonio: e.patrimonio, equipamento: e.equipamento, dinheiro: e.dinheiro },
    ...(tendencia ? { tendencia } : {}),
  }
}
