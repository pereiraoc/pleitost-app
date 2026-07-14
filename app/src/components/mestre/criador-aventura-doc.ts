// CRIAÇÃO DE AVENTURA LOCAL (#248 + #195) — a vault é READ-ONLY, então uma
// aventura nova criada no Modo Mestre vive no store local (local-entities.ts,
// kind 'Aventura'), junto das da vault nas listas. O FM local espelha os campos
// do bloco ```bounty``` (bounty-fm.ts é a fonte de verdade do shape) + a meta
// (rank/subcategoria/disponivel) que o extractor grava no FM de uma aventura
// real. A AventuraView renderiza a MESMA carta de bounty pros dois casos.
//
// Decisão de integração (#195): o "Criador de Aventura" existente
// (CriadorAventura.tsx) é um PLANEJADOR (nível/recompensa esperada/dificuldade
// do roster) — não persiste uma aventura. Este módulo é o caminho de AUTORIA
// pedido AS-IS: cria a nota de aventura e ela aparece na folha do compêndio.
import { createLocalEntity } from '../../data/local-entities'
import { BOUNTY_SUBCAT } from '../../markdown/bounty/bounty-meta'

/** Ranks oferecidos no formulário (ordem canônica do registro de rank). */
export const AVENTURA_RANKS = ['S', 'A', 'B', 'C', 'D'] as const
export type AventuraRank = (typeof AVENTURA_RANKS)[number]

/** Subcategorias (tipos de missão) — LIDAS do registro BOUNTY_SUBCAT (fonte de
 *  verdade portada do pleitost-views); nunca uma lista inventada aqui. Filtra o
 *  alias "Teste Classe" (duplicata de "Teste de Classe"). */
export const AVENTURA_SUBCATS = Object.keys(BOUNTY_SUBCAT).filter((k) => k !== 'Teste Classe')

export interface AventuraReward {
  Marcas?: number | { min: number; max: number }
  Ouro?: number | { min: number; max: number }
  Reconhecimento?: string
  Promoção?: string
  Extra?: string
}

export interface AventuraInput {
  rank: string
  subcategoria: string
  Titulo: string
  Recompensa?: AventuraReward
  Objetivo?: string[]
  Local?: string | string[]
  Contato?: string
  Financiador?: string
  /** Wikilinks dos locais onde a aventura está disponível (FM.disponivel). */
  disponivel?: string[]
}

/** FM de uma aventura local — espelha o FM de uma aventura real da vault
 *  (categoria/subcategoria/rank/disponivel) + os campos do bloco bounty que a
 *  bounty-fm.ts converte pro BountyData que a carta consome. */
export function aventuraFrontmatter(input: AventuraInput): Record<string, unknown> {
  const rec: Record<string, unknown> = {}
  if (input.Recompensa) {
    for (const [k, v] of Object.entries(input.Recompensa)) {
      if (v != null && v !== '') rec[k] = v
    }
  }
  return {
    categoria: 'Aventura',
    subcategoria: input.subcategoria,
    rank: input.rank,
    disponivel: input.disponivel ?? [],
    Titulo: input.Titulo,
    ...(Object.keys(rec).length ? { Recompensa: rec } : {}),
    ...(input.Objetivo?.length ? { Objetivo: input.Objetivo } : {}),
    ...(input.Local != null && input.Local !== '' ? { Local: input.Local } : {}),
    ...(input.Contato ? { Contato: input.Contato } : {}),
    ...(input.Financiador ? { Financiador: input.Financiador } : {}),
  }
}

/** Cria uma aventura local a partir do formulário — retorna o id local. O
 *  basename é o título (o que a listagem/grade mostram). */
export function createLocalAventura(input: AventuraInput): string {
  const basename = input.Titulo.trim() || 'Aventura sem título'
  return createLocalEntity('Aventura', basename, aventuraFrontmatter(input))
}
