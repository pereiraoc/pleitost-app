// Contexto-Def do mundo (#519 — arquitetura de mundos, Opção 1): carrega o
// `contexto.json` COMPILADO pelo extract (extractor/compile-contexto.mjs) a
// partir da nota de Contexto-Def da vault do mundo ("Contexto Fantasia.md" /
// "Contexto POA 1987.md"). O artefato define moeda, atlas, reskin de
// APRESENTAÇÃO (identidade canônica das notas nunca muda — as regras seguem
// operando nos basenames de fantasia) e disponibilidade de itens, com as
// garantias do Contexto Base (`sempreDisponiveis`) embutidas.
//
// Este módulo é o ponto único de consumo — as superfícies (display de nomes,
// catálogo, moeda) leem daqui quando a camada de mundo for ligada.
import { WORLD_DATA_DIR, type WorldId } from './world'
import { withBase } from './base-url'

export interface ContextoDef {
  id: string
  nome: string
  /** relPath da nota-fonte na vault do mundo (rastreabilidade). */
  fonte: string
  moeda: { simbolo: string; nome: string }
  atlas: { raiz: string; mapa: string | null }
  /** Display próprio de perícias no mundo (ex.: Arcana → "Trônicos"). */
  pericias: Record<string, string>
  reskin: {
    /** basename da nota (fantasia) → nome exibido no mundo. */
    notas: Record<string, string>
    /** Idem, pra notas que ainda não existem na vault (não validadas). */
    notasFuturas: Record<string, string>
    /** Substituição de vocabulário em textos exibidos — aplicar por chave
     *  mais longa primeiro, com fronteira de palavra e case-preserving. */
    termos: Record<string, string>
    /** Strings onde a cascata de termos NÃO se aplica. */
    excecoes: string[]
  }
  disponibilidade: {
    padrao: 'disponivel' | 'indisponivel'
    /** Fora do catálogo deste mundo (ex.: Garras do Rei-Mago no POA 1987). */
    indisponiveis: string[]
    /** basename → onde/como se obtém (fornecedor, tarja, região). */
    restritos: Record<string, string>
  }
  /** Garantias do Contexto Base — itens que nenhum mundo pode excluir. */
  base: { sempreDisponiveis: string[] }
}

const cache = new Map<WorldId, Promise<ContextoDef | null>>()

/** Contexto-Def do mundo (cacheado). null = mundo sem contexto.json (dataset
 *  antigo/ausente) — chamadores tratam como "sem reskin, tudo disponível". */
export function loadContextoDef(world: WorldId): Promise<ContextoDef | null> {
  let p = cache.get(world)
  if (!p) {
    p = fetch(withBase(`${WORLD_DATA_DIR[world]}/contexto.json`))
      .then((r) => (r.ok ? (r.json() as Promise<ContextoDef>) : null))
      .catch(() => null)
    cache.set(world, p)
  }
  return p
}

/** SÓ testes. */
export function __resetContextoDefForTests(): void {
  cache.clear()
}
