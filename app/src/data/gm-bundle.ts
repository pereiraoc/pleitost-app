// ESPELHO DO MESTRE (2026-08-31): o extract corta segredos do dataset
// público (extractor/gm-split.mjs — whitelist do Contexto Base, callouts
// [!gm], seções Contexto Oculto, notas GM:true) e escreve gm.json com a
// versão COMPLETA dos docs afetados. Este módulo carrega o espelho SÓ em
// Modo Mestre; com ele carregado, loadDoc devolve a versão do mestre e o
// catálogo ganha as notas só-mestre. Desligar o modo limpa tudo.
import type { IndexDocEntry, VaultDoc } from './types'
import { WORLD_DATA_DIR, type WorldId } from './world'
import { withBase } from './base-url'

export interface GmBundle {
  notas: IndexDocEntry[]
  docs: Record<string, VaultDoc>
}

let ativo: GmBundle | null = null
let mundoAtivo: WorldId | null = null

/** Carrega (ou devolve do cache) o espelho do mundo. null = sem gm.json
 *  (dataset antigo) — app segue só com o público. */
export async function loadGmBundle(world: WorldId): Promise<GmBundle | null> {
  if (ativo && mundoAtivo === world) return ativo
  try {
    const res = await fetch(withBase(`${WORLD_DATA_DIR[world]}/gm.json`))
    if (!res.ok) return null
    const bundle = (await res.json()) as GmBundle
    ativo = { notas: bundle.notas ?? [], docs: bundle.docs ?? {} }
    mundoAtivo = world
    return ativo
  } catch {
    return null
  }
}

export function clearGmBundle(): void {
  ativo = null
  mundoAtivo = null
}

/** Versão COMPLETA (mestre) de um doc, se o espelho estiver carregado. */
export function gmDoc(id: string): VaultDoc | null {
  return ativo?.docs[id] ?? null
}

/** Índice das notas só-mestre (GM:true) do espelho carregado. */
export function gmNotas(): IndexDocEntry[] {
  return ativo?.notas ?? []
}

/** SÓ testes. */
export function __setGmBundleForTests(b: GmBundle | null): void {
  ativo = b
  mundoAtivo = b ? ('fantasia' as WorldId) : null
}
