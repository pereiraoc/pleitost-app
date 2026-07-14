// REGISTRO DE VISUALIZADORES DE DOC (épico #243, princípio 2) — mapeia um doc
// da vault ao componente que o mostra. O DocView consulta este registro ANTES
// do fallback markdown genérico; cada fase (F1 Items, F3 Organização/História,
// …) registra a sua entrada num arquivo próprio, sem tocar o DocView.
//
// Ordem importa: a PRIMEIRA entrada cujo `match` casa vence. Entradas mais
// específicas (por subtipo) devem ser registradas antes das genéricas.
import type { ReactElement } from 'react'
import type { VaultDoc } from '../../data/types'

export interface DocViewOpts {
  /** Renderizado na sidebar de DETALHES (some a Hexploração etc.). */
  sidebar?: boolean
}

export type DocViewer = (doc: VaultDoc, opts: DocViewOpts) => ReactElement | null

interface DocViewEntry {
  /** Rótulo de diagnóstico (aparece em testes/registro; não exibido). */
  id: string
  match: (doc: VaultDoc) => boolean
  view: DocViewer
}

const REGISTRY: DocViewEntry[] = []

/** Registra um visualizador. Idempotente por id (re-registro substitui). */
export function registerDocView(entry: DocViewEntry): void {
  const i = REGISTRY.findIndex((e) => e.id === entry.id)
  if (i >= 0) REGISTRY.splice(i, 1, entry)
  else REGISTRY.push(entry)
}

/** Visualizador do doc (primeiro match), ou null → fallback markdown. */
export function resolveDocView(doc: VaultDoc): DocViewer | null {
  return REGISTRY.find((e) => e.match(doc))?.view ?? null
}

/** Ids registrados (diagnóstico/teste de cobertura). */
export function registeredDocViewIds(): string[] {
  return REGISTRY.map((e) => e.id)
}
