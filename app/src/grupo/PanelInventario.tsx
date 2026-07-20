// Painel "INVENTÁRIO DO GRUPO" (#333) — inventário COMPARTILHADO da mesa: o
// Mestre e os jogadores colocam itens num pool comum (sincronizado no state da
// sessão, realtime pra todos), e o jogador PUXA um item pra ficha dele — o item
// SAI do grupo (transferência de loot). Artefatos são especiais: só o Mestre os
// coloca aqui (o jogador não os adiciona sozinho na própria ficha — ver
// InventarioTab.TESOUROS_EXCLUIR).
//
// Só existe na MESA (sessão com remoteId): sem sessão não há pool compartilhado.
import { useMemo, useState, type CSSProperties } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex } from '../data/assets'
import { useDocs } from '../data/useDoc'
import { useLiveSession } from '../data/session-repo/live-session'
import { useSessionRepo, useSessionUser } from '../data/session-repo/provider'
import { useSettings } from '../settings'
import { getLocalDoc, setLocalEntityFm } from '../data/local-entities'
import { fmPath, parseItemAlias, buildTesouroAlias } from '../components/ficha/hero-model'
import { ItemHover, docImageUrl, docTier } from '../components/item-card'
import { clip } from '../components/ficha/bits'
import { sectionTitleStyle } from './panel-ui'
import type { GroupInventoryItem } from '../data/session-repo/contract'

const TESOUROS_FOLDER = 'Sistema/Equipamento/Tesouros/'
const CONSUMIVEIS_FOLDER = 'Sistema/Equipamento/Tesouros/Consumíveis/'
const IMBUICOES_FOLDER = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/'
const ARTEFATOS_FOLDER = 'Sistema/Equipamento/Tesouros/Artefatos/'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

/** id-único de uma entrada do inventário (sem depender de crypto). */
function novaChave(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface ItemView extends GroupInventoryItem {
  key: string
}

export function PanelInventario({ groupId: _groupId }: { groupId: string }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const live = useLiveSession()
  const repo = useSessionRepo()
  const user = useSessionUser()
  const { mestre } = useSettings()
  const [sel, setSel] = useState('')
  const [status, setStatus] = useState('')

  const remoteId = live?.sessionId ?? null
  const semSessao = !repo || !remoteId || !user

  const mapa = live?.state?.inventarioGrupo ?? {}
  const itens = useMemo<ItemView[]>(
    () =>
      Object.entries(mapa)
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0)),
    [mapa],
  )
  const docs = useDocs(useMemo(() => [...new Set(itens.map((i) => i.docId))], [itens]))

  // Nome exibível de quem adicionou (userId → displayName do membro da mesa).
  const nomePorUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of live?.members ?? []) m.set(mem.userId, mem.displayName)
    return m
  }, [live?.members])

  // Catálogo de itens adicionáveis: tesouros (menos consumíveis/imbuições);
  // Artefatos SÓ pro Mestre (fonte de verdade = subpasta, igual item-taxonomy).
  const opcoes = useMemo(() => {
    const base = catalog.content.filter(
      (e) =>
        e.id.startsWith(TESOUROS_FOLDER) &&
        e.subtype === 'Tesouro' &&
        !e.id.startsWith(CONSUMIVEIS_FOLDER) &&
        !e.id.startsWith(IMBUICOES_FOLDER) &&
        (mestre || !e.id.startsWith(ARTEFATOS_FOLDER)),
    )
    return base
      .map((e) => ({
        id: e.id,
        nome: e.basename ?? e.id,
        artefato: e.id.startsWith(ARTEFATOS_FOLDER),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
  }, [catalog, mestre])

  // Meu herói LOCAL na mesa (só local é gravável — a vault é read-only): destino
  // do "puxar pra ficha".
  const meuHeroiLocal = useMemo(() => {
    const c = (live?.characters ?? []).find((x) => x.memberId === user?.id && x.kind === 'heroi')
    const path = c?.characterPath ?? ''
    return path.startsWith('local:') ? path : null
  }, [live?.characters, user?.id])

  const writeMap = async (next: Record<string, GroupInventoryItem>) => {
    if (!repo || !remoteId) return
    await repo.updateSessionState(remoteId, { inventarioGrupo: next })
  }

  const adicionar = async () => {
    if (!sel || semSessao) return
    const opt = opcoes.find((o) => o.id === sel)
    if (!opt) return
    const item: GroupInventoryItem = {
      docId: opt.id,
      nome: opt.nome,
      tier: 'A',
      addedBy: user!.id,
      addedAt: new Date().toISOString(),
    }
    await writeMap({ ...mapa, [novaChave()]: item })
    setStatus(`${opt.nome} entrou no inventário do grupo.`)
    setSel('')
  }

  const remover = async (key: string) => {
    const next = { ...mapa }
    delete next[key]
    await writeMap(next)
  }

  const puxar = async (it: ItemView) => {
    if (!meuHeroiLocal) return
    // Adiciona ao herói local (mesma regra do addTesouro da ficha: dedup por nome)
    // e SÓ ENTÃO remove do grupo — transferência de loot.
    const doc = getLocalDoc(meuHeroiLocal)
    const atual = (fmPath(doc?.frontmatter ?? {}, 'Inventario', 'Tesouros') ?? []) as unknown[]
    const tier: 'A' | 'E' | 'M' = it.tier === 'E' || it.tier === 'M' ? it.tier : 'A'
    if (!atual.some((raw) => parseItemAlias(raw).nome === it.nome)) {
      setLocalEntityFm(meuHeroiLocal, 'Inventario.Tesouros', [...atual, buildTesouroAlias(it.nome, tier)])
    }
    await remover(it.key)
    setStatus(`${it.nome} foi pra sua ficha.`)
  }

  if (semSessao) {
    return (
      <div style={{ padding: 22 }}>
        <div style={{ ...sectionTitleStyle }}>💼 INVENTÁRIO DO GRUPO</div>
        <div
          style={{
            marginTop: 14,
            padding: 30,
            textAlign: 'center',
            background: 'var(--panel)',
            border: '1px dashed var(--line2)',
            clipPath: clip(14),
            ...mono({ fontSize: 12, letterSpacing: '.08em', color: 'var(--muted)' }),
          }}
        >
          O inventário compartilhado fica disponível na MESA de uma sessão.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...sectionTitleStyle }}>💼 INVENTÁRIO DO GRUPO</div>

      {/* Adicionar item (Mestre + jogadores). O Mestre vê também os Artefatos. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <select
          aria-label="Item pra adicionar ao grupo"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          style={mono({
            flex: 1,
            minWidth: 200,
            padding: '10px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontSize: 12.5,
            clipPath: clip(8),
          })}
        >
          <option value="">— escolher item —</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.artefato ? '✦ ' : ''}
              {o.nome}
            </option>
          ))}
        </select>
        <button
          onClick={() => void adicionar()}
          disabled={!sel}
          style={{
            padding: '10px 16px',
            background: sel ? 'var(--accent)' : 'var(--card)',
            color: sel ? 'var(--ink)' : 'var(--muted)',
            border: 'none',
            cursor: sel ? 'pointer' : 'not-allowed',
            fontWeight: 700,
            fontSize: 12.5,
            clipPath: clip(8),
          }}
        >
          ＋ Adicionar
        </button>
      </div>

      {/* Lista do pool */}
      {itens.length === 0 ? (
        <div
          style={{
            padding: 26,
            textAlign: 'center',
            background: 'var(--panel)',
            border: '1px dashed var(--line2)',
            clipPath: clip(14),
            ...mono({ fontSize: 12, letterSpacing: '.08em', color: 'var(--muted)' }),
          }}
        >
          // POOL VAZIO — adicione itens que o grupo dividir
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map((it) => {
            const doc = docs?.get(it.docId)
            const img = doc ? docImageUrl(doc, docTier(doc), assets) : null
            const podeRemover = mestre || it.addedBy === user!.id
            const nomeQuem = nomePorUser.get(it.addedBy) ?? '—'
            const nomeEl = (
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{it.nome}</span>
            )
            return (
              <div
                key={it.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 12px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  clipPath: clip(9),
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    background: 'var(--panel)',
                    border: '1px solid var(--line2)',
                    clipPath: clip(8),
                    fontSize: 18,
                  }}
                >
                  {img ? (
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    '💍'
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {doc ? <ItemHover doc={doc}>{nomeEl}</ItemHover> : nomeEl}
                  <span style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
                    por {nomeQuem}
                  </span>
                </div>
                {meuHeroiLocal ? (
                  <button
                    onClick={() => void puxar(it)}
                    title="Puxar pra minha ficha (sai do grupo)"
                    style={mono({
                      flex: 'none',
                      padding: '7px 12px',
                      background: 'color-mix(in srgb,var(--accent) 12%,transparent)',
                      border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      clipPath: clip(6),
                    })}
                  >
                    🎒 Puxar
                  </button>
                ) : null}
                {podeRemover ? (
                  <button
                    onClick={() => void remover(it.key)}
                    title="Remover do inventário do grupo"
                    aria-label={`Remover ${it.nome}`}
                    style={{
                      flex: 'none',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: 'var(--muted)',
                    }}
                  >
                    🗑
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {status ? (
        <div role="status" style={mono({ fontSize: 11, color: 'var(--accent)' })}>
          {status}
        </div>
      ) : null}
    </div>
  )
}
