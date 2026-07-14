// REGISTRO DE VISUALIZADORES DE FOLHA (#245, F1 do épico #243) — análogo ao
// doc-view-registry, mas pra a LISTAGEM de uma pasta-folha do compêndio. O
// FolderView consulta este registro ANTES da DocTable genérica: quando a folha
// é HOMOGÊNEA de um `type` registrado (ex.: Item → grade de cartas), usa o
// visualizador dedicado em vez da tabela de texto.
//
// Cada fase registra a sua entrada no próprio módulo de view (ItemView regista
// 'Item'); o FolderView não conhece nenhum tipo por nome — lê sempre daqui.
import type { ReactElement } from 'react'
import type { IndexDocEntry } from '../../data/types'

export type LeafViewer = (entries: IndexDocEntry[]) => ReactElement | null

interface LeafViewEntry {
  /** `doc.type` da folha homogênea que dispara este visualizador (ex.: 'Item'). */
  type: string
  view: LeafViewer
}

const REGISTRY = new Map<string, LeafViewEntry>()

/** Registra o visualizador de folha de um tipo. Idempotente por `type`. */
export function registerLeafView(entry: LeafViewEntry): void {
  REGISTRY.set(entry.type, entry)
}

/** Visualizador da folha homogênea daquele tipo, ou null (→ DocTable). */
export function resolveLeafView(type: string | undefined): LeafViewer | null {
  return type ? (REGISTRY.get(type)?.view ?? null) : null
}

/** Tipos com visualizador de folha registrado (diagnóstico/teste). */
export function registeredLeafViewTypes(): string[] {
  return [...REGISTRY.keys()]
}
