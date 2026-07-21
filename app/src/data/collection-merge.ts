// MERGE POR ENTRADA das chaves de COLEÇÃO do espelho por conta (user_state).
// Report do usuário: heróis importados no tablet não apareciam no celular — o
// sync por chave (fill-only-missing nos dois sentidos, remote-persist) trava
// quando a coleção inteira vive num BLOB ÚNICO (pleitost.localEntities etc.):
// a chave presente num lado bloqueia a hidratação/subida do outro, e um flush
// de device desatualizado APAGAVA da conta os itens do outro (clobber).
//
// Política: UNIÃO por id; conflito do MESMO id → o LOCAL vence (nunca perde o
// que está na mão do usuário; edições de ficha vivem à parte em
// pleitost.heroEdits.<id>). Trade-off documentado da v1: DELEÇÃO de um item
// propaga só pelo flush normal — a união do PRÓXIMO login de um device que
// ainda o tenha pode ressuscitá-lo (sem tombstones por ora; nada se perde).
//
// Puro e estrutural (sem imports de stores — evita ciclos): os shapes são
// Record<id, item> (localEntities/groupMembership/compendio.drafts) e
// Array<item> com campo-id (pleitost.sessoes por `codigo`).

export interface CollectionMergeResult {
  /** Blob resultante (serializado) — a UNIÃO. */
  value: string
  /** O merge trouxe entradas que o LOCAL não tinha → gravar local + reload. */
  addedFromRemote: boolean
  /** O merge difere do REMOTO (entradas/valores locais) → subir pra conta. */
  differsFromRemote: boolean
}

export type CollectionMerger = (localRaw: string | null, remoteRaw: string) => CollectionMergeResult

function parseRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Chave especial de TOMBSTONES de deleção dentro dos blobs Record (report:
 *  "não consigo deletar porque eles voltam" — a união ressuscitava deleções).
 *  União dos dois lados; id com tombstone SAI da união (deleção propaga). */
const TOMBSTONES_KEY = '__tombstones__'

function tombstonesOf(rec: Record<string, unknown>): Record<string, string> {
  const t = rec[TOMBSTONES_KEY]
  if (!t || typeof t !== 'object' || Array.isArray(t)) return {}
  const out: Record<string, string> = {}
  for (const [id, iso] of Object.entries(t as Record<string, unknown>)) {
    if (typeof iso === 'string') out[id] = iso
  }
  return out
}

/** Serialização canônica rasa (chaves ordenadas) — comparação estável. */
function canon(rec: Record<string, unknown>): string {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(rec).sort()) out[k] = rec[k]
  return JSON.stringify(out)
}

/** União de blobs `Record<id, item>` — local vence no mesmo id; tombstones
 *  (deleções) unem e REMOVEM o id da união nos dois lados. */
export const mergeRecordBlobs: CollectionMerger = (localRaw, remoteRaw) => {
  const local = parseRecord(localRaw)
  const remote = parseRecord(remoteRaw)
  // Lados ilegíveis degradam pro outro (corrompido nunca apaga o são).
  if (!remote) {
    return { value: localRaw ?? remoteRaw, addedFromRemote: false, differsFromRemote: local !== null }
  }
  if (!local) {
    return { value: remoteRaw, addedFromRemote: localRaw !== remoteRaw, differsFromRemote: false }
  }
  const tombs = { ...tombstonesOf(remote), ...tombstonesOf(local) }
  const merged: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...remote, ...local })) {
    if (k === TOMBSTONES_KEY) continue
    if (k in tombs) continue // deletado em algum device — não ressuscita
    merged[k] = v
  }
  if (Object.keys(tombs).length) merged[TOMBSTONES_KEY] = tombs
  const cMerged = canon(merged)
  return {
    value: cMerged,
    addedFromRemote: cMerged !== canon(local),
    differsFromRemote: cMerged !== canon(remote),
  }
}

function parseArray(raw: string | null): unknown[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/** União de blobs `Array<item>` chaveados por `idField` — ordem: locais
 *  primeiro (posições preservadas), remotos novos ao fim; local vence no id. */
export function mergeArrayBlobsBy(idField: string): CollectionMerger {
  return (localRaw, remoteRaw) => {
    const local = parseArray(localRaw)
    const remote = parseArray(remoteRaw)
    if (!remote) {
      return { value: localRaw ?? remoteRaw, addedFromRemote: false, differsFromRemote: local !== null }
    }
    if (!local) {
      return { value: remoteRaw, addedFromRemote: localRaw !== remoteRaw, differsFromRemote: false }
    }
    const idOf = (it: unknown): string =>
      it && typeof it === 'object' ? String((it as Record<string, unknown>)[idField] ?? '') : ''
    const localIds = new Set(local.map(idOf))
    const novosDoRemoto = remote.filter((it) => {
      const id = idOf(it)
      return id !== '' && !localIds.has(id)
    })
    const merged = [...local, ...novosDoRemoto]
    const remoteById = new Map(remote.map((it) => [idOf(it), it]))
    const differsFromRemote = local.some((it) => {
      const r = remoteById.get(idOf(it))
      return r === undefined || JSON.stringify(r) !== JSON.stringify(it)
    })
    return {
      value: JSON.stringify(merged),
      addedFromRemote: novosDoRemoto.length > 0,
      differsFromRemote,
    }
  }
}
