// Rascunhos LOCAIS de edição do compêndio (#252, F8). "No modo dev tu vai poder
// publicar as alterações... até publicar fica tudo realmente local." → estas
// edições ficam SÓ neste device (localStorage), aplicadas apenas no Modo
// Desenvolvedor, até um "Publicar" mandá-las pro overlay compartilhado (#47).
//
// Store de módulo reativo (useSyncExternalStore — mesmo padrão de settings/
// theme). Chave por doc id → DocPatch.
import { useSyncExternalStore } from 'react'
import type { DocPatch } from './overlay'
import { createStoreChannel } from './store-kit'

const KEY = 'pleitost.compendio.drafts'
type Drafts = Record<string, DocPatch>

let drafts: Drafts | null = null
const channel = createStoreChannel()
const emit = channel.emit

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

/** Rascunho local de um doc (undefined = sem rascunho). */
export function localDraftFor(id: string): DocPatch | undefined {
  return get()[id]
}

/** Funde um patch no rascunho local de um doc (MERGE por campo — assim editar o
 *  corpo não apaga uma edição de elementos de regra do mesmo doc, e vice-versa).
 *  Reverter (clearLocalDraft) é que descarta o rascunho inteiro. */
export function setLocalDraft(id: string, patch: DocPatch) {
  drafts = { ...get(), [id]: { ...get()[id], ...patch } }
  persist()
  emit()
}

/** Descarta o rascunho local INTEIRO de um doc (ex.: após publicar, ou "reverter tudo"). */
export function clearLocalDraft(id: string) {
  if (!(id in get())) return
  const next = { ...get() }
  delete next[id]
  drafts = next
  persist()
  emit()
}

/** Descarta SÓ um campo do rascunho de um doc (ex.: reverter o texto mantendo a
 *  edição dos elementos de regra). Se o rascunho fica vazio, some. */
export function clearLocalDraftField(id: string, field: keyof DocPatch) {
  const cur = get()[id]
  if (!cur || !(field in cur)) return
  const patch = { ...cur }
  delete patch[field]
  const next = { ...get() }
  if (Object.keys(patch).length === 0) delete next[id]
  else next[id] = patch
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

/** Versão reativa (bump a cada mudança) — pros hooks re-projetarem o doc. */
export function useLocalDraftVersion(): number {
  return useSyncExternalStore(channel.subscribe, channel.version)
}

/** SÓ testes: zera o cache em memória (simula reload). */
export function __resetDraftsForTests() {
  drafts = null
  channel.resetForTests()
}
