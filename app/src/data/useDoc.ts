import { useEffect, useMemo, useState } from 'react'
import { gmDoc } from './gm-bundle'
import { localEntityWorld } from './local-entities'
import { activeWorld } from './world'
import type { VaultDoc } from './types'
import { getLocalDoc, isLocalId, useLocalStoreVersion } from './local-entities'
import { liveCharacter, synthDocFromCharacter, useLiveSession } from './session-repo/live-session'
import { vaultUrl } from './base-url'
import { effectiveDoc } from './effective-doc'
import { useLocalDraftVersion } from './local-draft-store'
import { usePublishedOverlayVersion } from './published-overlay-store'
import { useSettings } from '../settings'

/** Doc SINTÉTICO de personagem remoto (#231): ids `sessao:<charId>` resolvem
 *  da sala viva — mesmo canal do resumo/#188, agora disponível pra QUALQUER
 *  consumidor de docs (GrupoView da mesa etc.). */
function isSessaoId(id: string): boolean {
  return id.startsWith('sessao:')
}
function getSessaoDoc(id: string): VaultDoc | undefined {
  const c = liveCharacter(id.slice('sessao:'.length))
  return c ? synthDocFromCharacter(c) : undefined
}

/** URL do JSON de um doc; ids têm espaços/acentos, escapa por segmento. */
export function docJsonUrl(id: string): string {
  return vaultUrl(id.split('/').map(encodeURIComponent).join('/') + '.json')
}

const cache = new Map<string, Promise<VaultDoc>>()

export function loadDoc(id: string): Promise<VaultDoc> {
  // Entidade local (issues #42–#47): sem fetch — vem do store local.
  if (isLocalId(id)) {
    // Entidade de OUTRO mundo = ausente (report: reload em /heroi/<id> da
    // fantasia estando no cyberpunk renderizava a ficha — a FichaPage trata o
    // erro de local ausente devolvendo pra /herois do mundo ativo).
    if (localEntityWorld(id) !== null && localEntityWorld(id) !== activeWorld()) {
      return Promise.reject(new Error(`entidade local "${id}" é de outro mundo`))
    }
    const doc = getLocalDoc(id)
    return doc ? Promise.resolve(doc) : Promise.reject(new Error(`entidade local "${id}" ausente`))
  }
  if (isSessaoId(id)) {
    const doc = getSessaoDoc(id)
    return doc ? Promise.resolve(doc) : Promise.reject(new Error(`personagem da sala "${id}" ausente`))
  }
  // Espelho do MESTRE (gm-bundle): quando carregado, a versão completa do
  // doc vence a pública — sem tocar o cache público (desligar o modo volta
  // ao dataset limpo na hora).
  const secreto = gmDoc(id)
  if (secreto) return Promise.resolve(secreto)
  let promise = cache.get(id)
  if (!promise) {
    promise = fetch(docJsonUrl(id)).then((res) => {
      if (!res.ok) throw new Error(`doc "${id}": HTTP ${res.status}`)
      return res.json() as Promise<VaultDoc>
    })
    cache.set(id, promise)
    promise.catch(() => cache.delete(id))
  }
  return promise
}

export interface DocState {
  doc?: VaultDoc
  error?: Error
}

/** Carrega um lote de docs (cache compartilhado); undefined enquanto carrega.
 *  Ids locais resolvem SÍNCRONO do store (reativo via versão); os da vault
 *  seguem o fetch cacheado. */
export function useDocs(ids: string[]): Map<string, VaultDoc> | undefined {
  const localVersion = useLocalStoreVersion()
  const live = useLiveSession() // reatividade dos docs sessao: (#231)
  const draftVersion = useLocalDraftVersion() // reatividade do overlay/edição (#252)
  const publishedVersion = usePublishedOverlayVersion() // overlay publicado (#47)
  const { desenvolvedor } = useSettings() // toggle do Modo Dev re-projeta
  const [vaultDocs, setVaultDocs] = useState<Map<string, VaultDoc>>()
  const allKey = ids.join('\n')
  const vaultKey = ids.filter((id) => !isLocalId(id) && !isSessaoId(id)).join('\n')

  useEffect(() => {
    let alive = true
    const wanted = vaultKey ? vaultKey.split('\n') : []
    Promise.all(wanted.map((id) => loadDoc(id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setVaultDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [vaultKey])

  return useMemo(() => {
    // Enquanto os docs da vault não chegam, preserva o estado de loading
    // (undefined) — a menos que só haja ids locais, que já estão prontos.
    if (vaultDocs === undefined && vaultKey) return undefined
    // Docs da vault passam pela projeção de overlay (#252); locais/sessao têm
    // seus próprios stores de edição e não são tocados pelo overlay do compêndio.
    const byId = new Map<string, VaultDoc>()
    for (const [id, doc] of vaultDocs ?? []) byId.set(id, effectiveDoc(doc))
    for (const id of ids) {
      // Mesmo gate de mundo do loadDoc: entidade local de OUTRO mundo é
      // ausente também no fast-path síncrono.
      const doc = isLocalId(id)
        ? localEntityWorld(id) === activeWorld()
          ? getLocalDoc(id)
          : undefined
        : isSessaoId(id)
          ? getSessaoDoc(id)
          : undefined
      if (doc) byId.set(id, doc)
    }
    return byId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultDocs, vaultKey, allKey, localVersion, live, draftVersion, publishedVersion, desenvolvedor])
}

export function useDoc(id: string): DocState {
  const localVersion = useLocalStoreVersion()
  const live = useLiveSession()
  const draftVersion = useLocalDraftVersion() // reatividade do overlay/edição (#252)
  const publishedVersion = usePublishedOverlayVersion() // overlay publicado (#47)
  const { desenvolvedor } = useSettings()
  const local = isLocalId(id)
  const sessao = isSessaoId(id)
  const [state, setState] = useState<DocState>({})

  useEffect(() => {
    // id vazio = "sem doc" (ex.: AppShell sem personagem selecionado) — não
    // dispara fetch de /vault-data/.json à toa.
    if (local || sessao || !id) return
    let alive = true
    setState({})
    loadDoc(id).then(
      (doc) => alive && setState({ doc }),
      (error: Error) => alive && setState({ error }),
    )
    return () => {
      alive = false
    }
  }, [id, local, sessao])

  if (!id) return {}
  if (sessao) {
    void live
    const doc = getSessaoDoc(id)
    return doc ? { doc } : { error: new Error(`personagem da sala "${id}" não está na sessão ativa`) }
  }
  if (local) {
    void localVersion // re-render quando a entidade local muda
    // Gate de mundo (report: reload em /heroi/<id> da fantasia estando no
    // cyberpunk renderizava a ficha): entidade de outro mundo = não
    // encontrada — a FichaPage devolve pra /herois do mundo ativo.
    const doc = localEntityWorld(id) === activeWorld() ? getLocalDoc(id) : undefined
    return doc ? { doc } : { error: new Error(`entidade local "${id}" não encontrada`) }
  }
  // Doc da vault: projeta base ⊕ overlay (#252/#47). draftVersion/publishedVersion/
  // desenvolvedor nas deps do hook garantem re-render quando algo muda.
  void draftVersion
  void publishedVersion
  void desenvolvedor
  return state.doc ? { doc: effectiveDoc(state.doc) } : state
}
