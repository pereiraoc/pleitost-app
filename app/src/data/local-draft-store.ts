// Rascunhos LOCAIS de edição do compêndio (#252, F8). "No modo dev tu vai poder
// publicar as alterações... até publicar fica tudo realmente local." → estas
// edições ficam SÓ neste device (localStorage), aplicadas apenas no Modo
// Desenvolvedor, até um "Publicar" mandá-las pro overlay compartilhado (#47).
//
// Store de módulo reativo (useSyncExternalStore — mesmo padrão de settings/
// theme). Chave por doc id → DocPatch.
import { useSyncExternalStore } from 'react'
import type { DocPatch } from './overlay'

const KEY = 'pleitost.compendio.drafts'
type Drafts = Record<string, DocPatch>

let drafts: Drafts | null = null
let version = 0
const listeners = new Set<() => void>()

function load(): Drafts {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Drafts) : {}
  } catch {
    return {}
  }
}

function get(): Drafts {
  drafts ??= load()
  return drafts
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(get()))
  } catch {
    /* memória continua a fonte da sessão */
  }
}

function emit() {
  version++
  for (const cb of listeners) cb()
}

/** Rascunho local de um doc (undefined = sem rascunho). */
export function localDraftFor(id: string): DocPatch | undefined {
  return get()[id]
}

/** Grava/atualiza o rascunho local de um doc. */
export function setLocalDraft(id: string, patch: DocPatch) {
  drafts = { ...get(), [id]: patch }
  persist()
  emit()
}

/** Descarta o rascunho local de um doc (ex.: após publicar, ou "reverter"). */
export function clearLocalDraft(id: string) {
  if (!(id in get())) return
  const next = { ...get() }
  delete next[id]
  drafts = next
  persist()
  emit()
}

/** Todos os rascunhos locais (pra tela de Publicar / Exportar do #47). */
export function allLocalDrafts(): Drafts {
  return { ...get() }
}

export function hasLocalDrafts(): boolean {
  return Object.keys(get()).length > 0
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Versão reativa (bump a cada mudança) — pros hooks re-projetarem o doc. */
export function useLocalDraftVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}

/** SÓ testes: zera o cache em memória (simula reload). */
export function __resetDraftsForTests() {
  drafts = null
  version = 0
}
