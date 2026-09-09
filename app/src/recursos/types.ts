// RECURSOS DO MUNDO (2026-09-07): notas `categoria: Recurso` da vault do mundo
// (POA: Contexto/Recursos/<aba>/<Nome>.md) — transporte, moradia e
// alimentação com marca, preço e onde se acha. O FRONTMATTER da nota é a
// fonte única de verdade (as tabelas de Custo de Vida da vault e a aba
// RECURSOS da ficha leem os mesmos campos).
import type { ContextoDef } from '../data/context-def'

/** Config do mundo (contexto.json `recursos`), sempre presente quando a aba existe. */
export type RecursosCfg = NonNullable<ContextoDef['recursos']>

export type Papel = RecursosCfg['abas'][number]['papel']

export interface Recurso {
  id: string
  nome: string
  /** subcategoria da nota = aba da ficha. */
  aba: string
  /** FM `Tipo` (livre; só `cfg.tipos.passagem`/`estilo` têm semântica própria). */
  tipo: string
  /** FM `Marca` — texto com wikilinks (org) ou marca de época sem nota. */
  marca: string
  /** FM `Preço`, inteiro, na unidade de `cfg.precoEm` (POA: Cz$). */
  preco: number
  /** FM `Cobrança`: unidade | viagem | dia | noite | mês | única | litro. */
  cobranca: string
  usado?: number
  compra?: number
  /** Cz$ por mês (veículos) — entra no custo mensal de transporte. */
  manutencao?: number
  /** Nível de estilo de vida 1..6 — nas fontes de crédito, a classe MÍNIMA. */
  nivel?: number
  /** Fonte de crédito: juro ao mês, em % sobre o saldo devedor. */
  juros?: number
  /** Fonte de crédito: teto = este número de meses do custo do herói. */
  tetoMeses?: number
  /** Plano de moradia: veículos que cabem guardados (o resto dorme na rua). */
  vagas?: number
  porKm?: number
  longa?: number
  volume?: number
  /** Alvos dos wikilinks de FM `Onde`. */
  onde: string[]
  resumo: string
  /** Alvo do primeiro embed `![[…png]]` da nota (figura do recurso), se houver. */
  imagem?: string
}
