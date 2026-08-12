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
  /** Blob a gravar LOCAL (o que o device exibe). No empate mantém o LOCAL. */
  value: string
  /** Blob a SUBIR pra conta. Difere do `value` só no EMPATE: aqui preserva o
   *  REMOTO, pra o push NUNCA regredir a conta (um device com versão vazia/velha
   *  não clobbera a cheia do outro — #448). Ausente = usar `value` (mergers sem
   *  distinção pull/push). */
  pushValue?: string
  /** O merge trouxe entradas que o LOCAL não tinha → gravar local + reload. */
  addedFromRemote: boolean
  /** O `pushValue` difere do REMOTO (updates genuínos: novo/mais novo local ou
   *  deleção) → subir pra conta. NÃO liga no empate (não clobbera). */
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

/** Timestamp `updatedAt` de UMA entidade dentro do blob (0 se ausente). */
function entUpdatedAt(v: unknown): number {
  if (!v || typeof v !== 'object') return 0
  const t = (v as Record<string, unknown>)['updatedAt']
  const ms = typeof t === 'string' ? Date.parse(t) : NaN
  return Number.isFinite(ms) ? ms : 0
}

/** Como mergeRecordBlobs (união por id + tombstones), mas o conflito do MESMO
 *  id resolve por `updatedAt` da entidade (NEWER-WINS) em vez de local-sempre-
 *  vence. Report #448: adicionar uma Pessoa nas anotações edita o CONTEÚDO de um
 *  herói já existente; com local-wins a edição nunca propagava (o device
 *  desatualizado vencia o conflito) e o flush ainda regredia a conta. Com o
 *  carimbo por entidade a versão mais nova ganha nos DOIS sentidos (pull e
 *  push). Empate de carimbo (inclui legado SEM updatedAt, ambos 0) → mantém o
 *  LOCAL (não churn, compatível com o comportamento antigo). */
export const mergeRecordBlobsByUpdatedAt: CollectionMerger = (localRaw, remoteRaw) => {
  const local = parseRecord(localRaw)
  const remote = parseRecord(remoteRaw)
  if (!remote) {
    return {
      value: localRaw ?? remoteRaw,
      pushValue: localRaw ?? remoteRaw,
      addedFromRemote: false,
      differsFromRemote: local !== null,
    }
  }
  if (!local) {
    return {
      value: remoteRaw,
      pushValue: remoteRaw,
      addedFromRemote: localRaw !== remoteRaw,
      differsFromRemote: false,
    }
  }
  const tombs = { ...tombstonesOf(remote), ...tombstonesOf(local) }
  // Dois blobs: `mergedLocal` (empate → local, pra exibir) e `mergedPush`
  // (empate → remoto, pra NÃO clobberar a conta). `adopted`/`toPush` são
  // rastreados por-entidade (o empate não conta pra nenhum → não regride nem
  // força reload).
  const mergedLocal: Record<string, unknown> = {}
  const mergedPush: Record<string, unknown> = {}
  let adopted = false
  let toPush = false
  const ids = new Set([...Object.keys(remote), ...Object.keys(local)])
  for (const k of ids) {
    if (k === TOMBSTONES_KEY) continue
    if (k in tombs) {
      // deletado em algum device — sai da união (não ressuscita)
      if (k in local) adopted = true // local ainda tinha vivo → some localmente
      if (k in remote) toPush = true // conta ainda tinha vivo → deleção sobe
      continue
    }
    const l = local[k]
    const r = remote[k]
    if (l === undefined) {
      mergedLocal[k] = r
      mergedPush[k] = r
      adopted = true // só na conta → local adota
    } else if (r === undefined) {
      mergedLocal[k] = l
      mergedPush[k] = l
      toPush = true // só local → sobe (entidade nova)
    } else {
      const la = entUpdatedAt(l)
      const ra = entUpdatedAt(r)
      if (ra > la) {
        mergedLocal[k] = r
        mergedPush[k] = r
        adopted = true // conta mais nova → adota
      } else if (la > ra) {
        mergedLocal[k] = l
        mergedPush[k] = l
        toPush = true // local mais novo → sobe
      } else {
        // EMPATE: local exibe o SEU, push preserva o da CONTA (não clobbera)
        mergedLocal[k] = l
        mergedPush[k] = r
      }
    }
  }
  if (Object.keys(tombs).length) {
    mergedLocal[TOMBSTONES_KEY] = tombs
    mergedPush[TOMBSTONES_KEY] = tombs
  }
  return {
    value: canon(mergedLocal),
    pushValue: canon(mergedPush),
    addedFromRemote: adopted,
    differsFromRemote: toPush,
  }
}

/** Timestamp ISO `updatedAt` de um blob (0 se ausente/ilegível). */
function updatedAtOf(raw: string | null): number {
  if (!raw) return 0
  try {
    const v = JSON.parse(raw) as { updatedAt?: unknown }
    const t = typeof v?.updatedAt === 'string' ? Date.parse(v.updatedAt) : NaN
    return Number.isFinite(t) ? t : 0
  } catch {
    return 0
  }
}

/** Blobs versionados por `updatedAt` (hexMap.<região>, groupState.<grupo>): NÃO
 *  são coleções de itens, são um documento por chave que carrega o carimbo da
 *  última edição. A união por-item não se aplica (sem id por célula/parada);
 *  a política é NEWER-WINS — a última atualização (maior updatedAt) vale, os dois
 *  sentidos. Corrige o report "marquei num device e sumiu no outro": a
 *  hidratação era fill-only-missing (device com a chave nunca recebia a versão
 *  mais nova). Empate de carimbo com conteúdo diferente → LOCAL vence (não
 *  regride o que está na mão) e sobe. */
export const mergeByUpdatedAt: CollectionMerger = (localRaw, remoteRaw) => {
  if (localRaw === null) {
    return { value: remoteRaw, pushValue: remoteRaw, addedFromRemote: true, differsFromRemote: false }
  }
  if (localRaw === remoteRaw) {
    return { value: localRaw, pushValue: remoteRaw, addedFromRemote: false, differsFromRemote: false }
  }
  const localAt = updatedAtOf(localRaw)
  const remoteAt = updatedAtOf(remoteRaw)
  if (remoteAt > localAt) {
    // conta tem a versão ESTRITAMENTE mais nova → adota (grava local + reload)
    return { value: remoteRaw, pushValue: remoteRaw, addedFromRemote: true, differsFromRemote: false }
  }
  if (localAt > remoteAt) {
    // local ESTRITAMENTE mais novo → vence e SOBE
    return { value: localRaw, pushValue: localRaw, addedFromRemote: false, differsFromRemote: true }
  }
  // EMPATE de carimbo (inclui blobs SEM updatedAt, ambos = 0) com conteúdo
  // distinto: NÃO dá pra saber quem é mais novo. O LOCAL segue exibindo o seu,
  // mas o PUSH preserva o REMOTO — ninguém clobbera a conta. Antes o "local
  // vence + push" deixava um device com versão vazia/velha sobrescrever a cheia
  // do outro (data-loss real: Pessoas viravam null). A 1ª edição (que carimba
  // updatedAt) desempata e propaga.
  return { value: localRaw, pushValue: remoteRaw, addedFromRemote: false, differsFromRemote: false }
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
 *  primeiro (posições preservadas), remotos novos ao fim; local vence no id.
 *  TOMBSTONES (#449): um item `{[idField], __deleted__: ISO}` marca DELEÇÃO — o
 *  id sai da união nos dois lados (a deleção propaga e não ressuscita) e o
 *  marcador segue no blob (o mais recente por id) até ser podado na origem. */
export function mergeArrayBlobsBy(idField: string): CollectionMerger {
  const TOMB = '__deleted__'
  const isTomb = (it: unknown): boolean =>
    !!it && typeof it === 'object' && typeof (it as Record<string, unknown>)[TOMB] === 'string'
  const idOf = (it: unknown): string =>
    it && typeof it === 'object' ? String((it as Record<string, unknown>)[idField] ?? '') : ''
  return (localRaw, remoteRaw) => {
    const local = parseArray(localRaw)
    const remote = parseArray(remoteRaw)
    if (!remote) {
      return { value: localRaw ?? remoteRaw, pushValue: localRaw ?? remoteRaw, addedFromRemote: false, differsFromRemote: local !== null }
    }
    if (!local) {
      return { value: remoteRaw, pushValue: remoteRaw, addedFromRemote: localRaw !== remoteRaw, differsFromRemote: false }
    }
    // Tombstones (mais recente por id) dos dois lados.
    const tombs = new Map<string, string>()
    for (const it of [...remote, ...local]) {
      if (!isTomb(it)) continue
      const id = idOf(it)
      const iso = String((it as Record<string, unknown>)[TOMB])
      const prev = tombs.get(id)
      if (id && (!prev || iso > prev)) tombs.set(id, iso)
    }
    const liveLocal = local.filter((it) => !isTomb(it) && !tombs.has(idOf(it)))
    const liveRemote = remote.filter((it) => !isTomb(it) && !tombs.has(idOf(it)))
    const localIds = new Set(liveLocal.map(idOf))
    const novosDoRemoto = liveRemote.filter((it) => {
      const id = idOf(it)
      return id !== '' && !localIds.has(id)
    })
    const tombItems = [...tombs].map(([id, iso]) => ({ [idField]: id, [TOMB]: iso }))
    const merged = [...liveLocal, ...novosDoRemoto, ...tombItems]
    // Conjuntos de VIVOS crus (pré-tombstone) pra decidir added/differs.
    const localLiveRaw = local.filter((it) => !isTomb(it))
    const remoteLiveRaw = remote.filter((it) => !isTomb(it))
    const remoteById = new Map(remoteLiveRaw.map((it) => [idOf(it), it]))
    const remoteLiveIds = new Set(remoteLiveRaw.map(idOf))
    // added: local ganha item novo da conta OU perde um vivo por tombstone.
    const addedFromRemote =
      novosDoRemoto.length > 0 || localLiveRaw.some((it) => tombs.has(idOf(it)))
    // differs: local tem vivo/conteúdo que a conta não tem, OU um tombstone
    // remove um vivo da conta (deleção sobe).
    const differsFromRemote =
      liveLocal.some((it) => {
        const r = remoteById.get(idOf(it))
        return r === undefined || JSON.stringify(r) !== JSON.stringify(it)
      }) || [...remoteLiveIds].some((id) => tombs.has(id))
    const value = JSON.stringify(merged)
    return { value, pushValue: value, addedFromRemote, differsFromRemote }
  }
}
