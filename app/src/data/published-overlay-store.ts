// Overlay PUBLICADO do compêndio (#252/#243, F8) — a camada COMPARTILHADA: o
// que o Modo Dev "Publicou" no Supabase (tabela doc_overlays), lido por TODOS os
// jogadores (doc efetivo = base ⊕ publicado ⊕ rascunho local do dev). Carrega
// uma vez + realtime (estratégia sync-first). Tudo GRACEFUL: sem Supabase
// configurado ou sem a tabela ainda, o mapa fica vazio e o app mostra a base.
import { useSyncExternalStore } from 'react'
import type { DocPatch } from './overlay'
import { supabaseClient } from './session-repo/supabase'

let published = new Map<string, DocPatch>()
let version = 0
let started = false
const listeners = new Set<() => void>()

function emit() {
  version++
  for (const cb of listeners) cb()
}

interface OverlayRow {
  id: string
  patch: DocPatch
}

/** Inicia o carregamento + realtime dos overlays publicados. Idempotente —
 *  chamar no boot do app. No-op sem Supabase (ex.: build sem env). */
export function startPublishedOverlays(): void {
  if (started) return
  const sb = supabaseClient()
  if (!sb) return
  started = true

  sb.from('doc_overlays')
    .select('id, patch')
    .then(({ data, error }) => {
      if (error || !data) return // tabela ainda não aplicada / sem acesso → base
      published = new Map(data.map((r) => [(r as OverlayRow).id, (r as OverlayRow).patch]))
      emit()
    })

  sb.channel('doc-overlays')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'doc_overlays' },
      (payload) => {
        const row = (payload.new ?? payload.old) as Partial<OverlayRow> | null
        if (!row?.id) return
        const next = new Map(published)
        if (payload.eventType === 'DELETE') next.delete(row.id)
        else if (row.patch) next.set(row.id, row.patch)
        published = next
        emit()
      },
    )
    .subscribe()
}

/** Patch publicado de um doc (undefined = nenhum). */
export function publishedOverlayFor(id: string): DocPatch | undefined {
  return published.get(id)
}

/** Todos os overlays publicados (pra exportar/reconstruir .md). */
export function allPublishedOverlays(): Record<string, DocPatch> {
  return Object.fromEntries(published)
}

/** PUBLICA (upsert) uma lista de patches na tabela compartilhada. Exige login
 *  (RLS: escrita só autenticado). Atualiza o cache local otimista + emit. */
export async function publishOverlays(
  entries: { id: string; patch: DocPatch }[],
  updatedBy: string | null,
): Promise<void> {
  const sb = supabaseClient()
  if (!sb) throw new Error('Supabase não configurado neste build.')
  if (entries.length === 0) return
  const stamp = new Date().toISOString()
  const rows = entries.map((e) => ({
    id: e.id,
    patch: e.patch as unknown,
    updated_by: updatedBy,
    updated_at: stamp,
  }))
  const { error } = await sb.from('doc_overlays').upsert(rows)
  if (error) throw new Error(error.message)
  const next = new Map(published)
  for (const e of entries) next.set(e.id, e.patch)
  published = next
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Versão reativa (bump a cada mudança publicada) — pros hooks re-projetarem. */
export function usePublishedOverlayVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}

/** SÓ testes: injeta overlays publicados sem tocar a rede. */
export function __setPublishedForTests(map: Record<string, DocPatch>) {
  published = new Map(Object.entries(map))
  started = true
  emit()
}
export function __resetPublishedForTests() {
  published = new Map()
  version = 0
  started = false
}
