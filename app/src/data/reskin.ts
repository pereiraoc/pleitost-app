// Reskin de display por mundo (#519 — arquitetura de contextos). Store de
// módulo com o ContextoDef ATIVO (setado pelo CatalogProvider antes dos
// filhos renderizarem; a troca de mundo remonta a subárvore) + transformações
// PURAS aplicadas na borda de apresentação:
//
//  - reskinName(nome):  rename exato por nota (reskin.notas ⊕ notasFuturas);
//                       fora do mapa cai na cascata de termos.
//  - reskinText(texto): cascata de vocabulário — chave mais longa primeiro,
//                       fronteira de palavra unicode (senão "anima" pegaria
//                       "animal"), strings de `excecoes` protegidas.
//  - reskinPericia(d):  display próprio de perícia (Arcana → "Trônicos").
//
// PRINCÍPIO: identidade canônica nunca muda — regras, wikilinks e lookups
// seguem nos basenames de fantasia; só o que o jogador LÊ passa por aqui.
import type { ContextoDef } from './context-def'

interface Compilado {
  notas: Map<string, string>
  regex: RegExp | null
  mapa: Map<string, string>
  /** Ordenadas por tamanho desc — proteger "Corpo em Sintonia" antes de
   *  qualquer exceção que seja substring dela. */
  excecoes: string[]
  pericias: Record<string, string>
}

let ativo: Compilado | null = null

const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** CatalogProvider seta ao trocar/carregar o mundo; null = sem reskin. */
export function setActiveContexto(def: ContextoDef | null): void {
  if (!def) {
    ativo = null
    return
  }
  const notas = new Map<string, string>()
  for (const [k, v] of Object.entries(def.reskin.notas)) notas.set(k, v)
  for (const [k, v] of Object.entries(def.reskin.notasFuturas)) notas.set(k, v)
  // A cascata de texto cobre termos ⊕ nomes de nota — menções em PROSA a uma
  // nota renomeada ("Imune a Poção de Cura…") também exibem o nome do mundo.
  const mapa = new Map<string, string>([...notas, ...Object.entries(def.reskin.termos)])
  const chaves = [...mapa.keys()].sort((a, b) => b.length - a.length)
  ativo = {
    notas,
    // Uma alternância única, chaves longas primeiro (o motor de regex casa a
    // primeira alternativa que der — a ordem implementa o "longest-first").
    regex: chaves.length
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])(?:${chaves.map(escRx).join('|')})(?![\\p{L}\\p{N}])`,
          'gu',
        )
      : null,
    mapa,
    excecoes: [...def.reskin.excecoes].sort((a, b) => b.length - a.length),
    pericias: def.pericias,
  }
}

/** true quando há reskin a aplicar (mundo com contexto carregado). */
export function reskinAtivo(): boolean {
  return ativo !== null && (ativo.notas.size > 0 || ativo.regex !== null)
}

/** Cascata de termos sobre TEXTO exibido (corpo de nota, resumo, rótulo). */
export function reskinText(texto: string): string {
  const a = ativo
  if (!a?.regex || !texto) return texto
  // Protege as exceções com sentinelas fora do alfabeto antes da cascata.
  let s = texto
  const guardadas: string[] = []
  for (const ex of a.excecoes) {
    if (!s.includes(ex)) continue
    s = s.split(ex).join(`\u0000` + guardadas.length + `\u0000`)
    guardadas.push(ex)
  }
  s = s.replace(a.regex, (m) => a.mapa.get(m) ?? m)
  for (let i = guardadas.length - 1; i >= 0; i--) {
    s = s.split(`\u0000` + i + `\u0000`).join(guardadas[i])
  }
  return s
}

/** Nome exibido de uma nota (basename) no mundo ativo. */
export function reskinName(nome: string): string {
  const a = ativo
  if (!a || !nome) return nome
  return a.notas.get(nome) ?? reskinText(nome)
}

/** Display de perícia no mundo ativo (ex.: Arcana → "Trônicos"). */
export function reskinPericia(display: string): string {
  return ativo?.pericias[display] ?? display
}
