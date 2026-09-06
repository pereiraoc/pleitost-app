// Nomes de seção/tipos de cena/campos da lista trancada — DECLARADOS no
// Contexto Base (`Contexto.aventura`) e compilados em contexto.json
// (`base.aventura`). O fallback abaixo é IDÊNTICO ao Base de hoje, pra dataset
// antigo sem o bloco; nunca uma segunda fonte de verdade.
import type { ContextoDef } from '../data/context-def'

export interface AventuraConfig {
  secoes: {
    resumo: string
    roteiro: string
    contexto: string
    contexto_aventura: string
    notas_mestre: string
    personagens: string
    locais: string
    mapa: string
    cenas: string
    abertura: string
    cena: string
    desfecho: string
  }
  tiposDeCena: string[]
  camposListaTrancada: string[]
}

export const AVENTURA_CONFIG_DEFAULT: AventuraConfig = {
  secoes: {
    resumo: '1. Resumo',
    roteiro: 'Roteiro em uma página',
    contexto: '2. Contexto',
    contexto_aventura: '2.1 Contexto da Aventura',
    notas_mestre: '2.2 Notas para o Mestre',
    personagens: '2.3 Personagens',
    locais: '2.4 Locais',
    mapa: 'Mapa',
    cenas: '3. Cenas',
    abertura: 'Abertura',
    cena: 'Cena',
    desfecho: 'Desfecho',
  },
  tiposDeCena: ['Social', 'Exploração', 'Investigação', 'Combate', 'Interlúdio', 'Epílogo'],
  camposListaTrancada: ['Chamada', 'rank', 'Formato', 'Duração', 'Jogadores', 'Tom'],
}

/** Config efetiva: a do contexto.json do mundo quando declarada, senão o default. */
export function aventuraConfig(def: ContextoDef | null | undefined): AventuraConfig {
  const a = def?.base?.aventura
  if (!a) return AVENTURA_CONFIG_DEFAULT
  const secoes = { ...AVENTURA_CONFIG_DEFAULT.secoes }
  for (const k of Object.keys(secoes) as (keyof AventuraConfig['secoes'])[]) {
    const v = a.secoes?.[k]
    if (typeof v === 'string' && v.trim()) secoes[k] = v
  }
  return {
    secoes,
    tiposDeCena: a.tiposDeCena?.length ? a.tiposDeCena : AVENTURA_CONFIG_DEFAULT.tiposDeCena,
    camposListaTrancada: a.camposListaTrancada?.length
      ? a.camposListaTrancada
      : AVENTURA_CONFIG_DEFAULT.camposListaTrancada,
  }
}
