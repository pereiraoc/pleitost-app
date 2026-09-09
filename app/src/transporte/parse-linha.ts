// LINHA de transporte (2026-09-08) — nota `categoria: Linha` da malha de
// transportes do mundo (POA: Atlas/Porto Alegre/Malha de Transportes). O FM é a fonte
// única: subcategoria = modo (Aeromóvel, Ônibus, Kombi…), `Paradas` em ordem
// (wikilinks pra Localizações com marcador no mapa da cidade), `Acesso` = o
// plano TRI mínimo (wikilink pra nota Estilo de Vida) OU texto livre quando a
// linha não aceita TRI ("dinheiro na mão"), `Tarifa` = a nota da tarifa avulsa.
import type { VaultDoc } from '../data/types'
import { linkTarget } from '../recursos/parse-recurso'

export const LINHA_TYPE = 'Linha'

export function isLinhaDoc(doc: Pick<VaultDoc, 'type'>): boolean {
  return doc.type === LINHA_TYPE
}

export interface Linha {
  id: string
  nome: string
  /** subcategoria da nota = modo (Aeromóvel, Ônibus, Ônibus Anfíbio, Lotação, Kombi, Balsa…). */
  modo: string
  letreiro: string
  operador: string
  /** Texto cru do FM `Acesso` (wikilink do plano ou texto livre). */
  acesso: string
  /** Nome da nota do plano quando `Acesso` é um wikilink; null = fora do TRI. */
  acessoPlano: string | null
  /** Nome da nota da tarifa avulsa (ou null). */
  tarifa: string | null
  /** 1..5 (0 quando a nota não declara). */
  qualidade: number
  horario: string
  circular: boolean
  /** Alvos dos wikilinks, na ordem da nota. */
  paradas: string[]
  aparencia: string
  resumo: string
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}
function lista(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []
  return arr.map((x) => linkTarget(texto(x))).filter(Boolean)
}

export function parseLinha(doc: VaultDoc): Linha | null {
  if (!isLinhaDoc(doc)) return null
  const fm = doc.frontmatter
  const acesso = texto(fm['Acesso'])
  const acessoLink = /^\[\[[^\]]+\]\]$/.test(acesso) ? linkTarget(acesso) : ''
  const tarifa = linkTarget(texto(fm['Tarifa']))
  const q = Number(fm['Qualidade'])
  return {
    id: doc.id,
    nome: doc.basename,
    modo: texto(fm['subcategoria']) || doc.subtype || '',
    letreiro: texto(fm['Letreiro']) || doc.basename,
    operador: texto(fm['Operador']),
    acesso,
    acessoPlano: acessoLink || null,
    tarifa: tarifa || null,
    qualidade: Number.isFinite(q) ? Math.max(0, Math.min(5, Math.round(q))) : 0,
    horario: texto(fm['Horário']),
    circular: fm['Circular'] === true,
    paradas: lista(fm['Paradas']),
    aparencia: texto(fm['Aparência']),
    resumo: texto(fm['Resumo']),
  }
}
