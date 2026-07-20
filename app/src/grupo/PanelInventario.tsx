// Painel "INVENTÁRIO DO GRUPO" (#333/#336) — inventário COMPARTILHADO da mesa. O
// Mestre e os jogadores CONFIGURAM um item (arma + propriedade + qualidade /
// equipamento / implemento / ouro), veem a IMAGEM + o VALOR em PO e adicionam ao
// pool (sincronizado no state da sessão, realtime). O jogador PUXA um item pra
// ficha dele — sai do grupo (transferência de loot).
//
// Reusa os catálogos/preços/builders da ficha e do comércio (nada reinventado):
// GRUPO_ARMA_ORDER/grupoArmaEmoji (dropdown de armas agrupado), armaduraBases/
// escudoBases, precoPO, tesouroAplicavelAoItem (filtra imbuição por arma), e o
// núcleo puro grupo/inventario-item. A config é state LOCAL — nada é sincronizado
// até o "Adicionar", então o jogador não vê o que o Mestre está montando (#6).
// Só existe na MESA (sessão com remoteId): sem sessão não há pool compartilhado.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex } from '../data/assets'
import { useDocs } from '../data/useDoc'
import { useLiveSession } from '../data/session-repo/live-session'
import { useSessionRepo, useSessionUser } from '../data/session-repo/provider'
import { useSettings } from '../settings'
import { getLocalDoc, setLocalEntityFm } from '../data/local-entities'
import { heroAtributos } from '../components/ficha/hero-model'
import { GRUPO_ARMA_ORDER, grupoArmaEmoji, ITEM_TIER_BTN } from '../components/ficha/registry'
import { ItemHover, docImageUrl, docTier } from '../components/item-card'
import { tesouroImageUrl } from '../data/equipment-image'
import { clip } from '../components/ficha/bits'
import { armaduraBases, escudoBases } from '../components/ficha/equipment-bases'
import { tesouroAplicavelAoItem } from '../rules/aplicavel-a'
import { precoPO } from './wealth'
import { sectionTitleStyle } from './panel-ui'
import { itemValorPO, pullItemToFm, normalizeGroupItem } from './inventario-item'
import type { GroupInventoryItem } from '../data/session-repo/contract'
import type { VaultDoc } from '../data/types'

const ARMAS_FOLDER = 'Sistema/Equipamento/Armas/'
const IMBUICOES_ARMA_FOLDER = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/Imbuições/'
const EQUIPAMENTOS_FOLDER = 'Sistema/Equipamento/Tesouros/Equipamentos/'
const IMPLEMENTOS_FOLDER = 'Sistema/Equipamento/Tesouros/Implementos/'
const ARTEFATOS_FOLDER = 'Sistema/Equipamento/Tesouros/Artefatos/'
const OBRA_PRIMAS = ['Arma Obra-prima', 'Armadura Obra-prima', 'Broquel Obra-prima', 'Escudo Obra-prima']
// armas naturais/especiais só entram por habilidade/regra — fora do configurador.
const EXCLUDED_ARMA_GRUPOS = new Set(['natural', 'especial'])

// #1: equipamento usa o ícone de tesouro (anel); implemento a varinha.
const KIND_EMOJI: Record<string, string> = {
  arma: '⚔️',
  armadura: '🛡️',
  escudo: '🛡️',
  tesouro: '💍',
  ouro: '🪙',
}
const TIPOS = [
  { id: 'arma', label: '⚔️ Arma' },
  { id: 'equipamento', label: '💍 Equipamento' },
  { id: 'implemento', label: '🪄 Implemento' },
  { id: 'ouro', label: '🪙 Ouro' },
] as const
type Tipo = (typeof TIPOS)[number]['id']

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })
const selStyle = mono({
  flex: 1,
  minWidth: 150,
  padding: '9px 11px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontSize: 12.5,
  clipPath: clip(8),
})

/** id-único de uma entrada do inventário. */
function novaChave(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const asTierChar = (t: string | undefined): '' | 'A' | 'E' | 'M' => (t === 'A' || t === 'E' || t === 'M' ? t : '')
const TIER_MASC: Record<'A' | 'E' | 'M', string> = { A: 'Adepto', E: 'Experiente', M: 'Mestre' }

/** Emoji do item no pool (implemento = varinha; equipamento/tesouro = anel). */
function itemEmoji(it: GroupInventoryItem): string {
  const n = normalizeGroupItem(it)
  if (n.kind === 'tesouro' && n.docId?.startsWith(IMPLEMENTOS_FOLDER)) return '🪄'
  return KIND_EMOJI[n.kind ?? 'tesouro'] ?? '💍'
}

/** Seletor de qualidade A/E/M (#10: sem BASE — mínimo Adepto). */
function TierSel({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['A', 'E', 'M'] as const).map((t) => {
        const on = value === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            style={mono({
              padding: '7px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              color: on ? 'var(--accent)' : 'var(--muted)',
              background: on ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'var(--card)',
              border: `1px solid ${on ? 'color-mix(in srgb,var(--accent) 45%,var(--line2))' : 'var(--line2)'}`,
              clipPath: clip(6),
            })}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

type ItemView = GroupInventoryItem & { key: string }

export function PanelInventario({ groupId: _groupId }: { groupId: string }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const live = useLiveSession()
  const repo = useSessionRepo()
  const user = useSessionUser()
  const { mestre } = useSettings()

  const [tipo, setTipo] = useState<Tipo | ''>('')
  const [armaSel, setArmaSel] = useState('') // id do doc da arma
  const [propSel, setPropSel] = useState('') // basename da imbuição ('' = obra-prima via tier)
  const [armaTier, setArmaTier] = useState('A')
  const [equipSub, setEquipSub] = useState<'armadura' | 'escudo' | 'tesouro'>('armadura')
  const [gearBase, setGearBase] = useState('') // basename (armadura/escudo)
  const [tesSel, setTesSel] = useState('') // id do equipamento/artefato ("Tesouro")
  const [equipTier, setEquipTier] = useState('A')
  const [impSel, setImpSel] = useState('') // id do implemento
  const [impTier, setImpTier] = useState('A')
  const [ouroQtd, setOuroQtd] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(t)
  }, [status])

  const remoteId = live?.sessionId ?? null
  const semSessao = !repo || !remoteId || !user

  const mapa = useMemo(() => live?.state?.inventarioGrupo ?? {}, [live?.state?.inventarioGrupo])
  const itens = useMemo<ItemView[]>(
    () =>
      Object.entries(mapa)
        .map(([key, v]) => ({ key, ...normalizeGroupItem(v) }))
        .sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0)),
    [mapa],
  )

  const nomePorUser = useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of live?.members ?? []) m.set(mem.userId, mem.displayName)
    return m
  }, [live?.members])

  const idOf = (basename: string): string | null => {
    const r = catalog.resolve(basename)
    return r.kind === 'doc' ? r.id : null
  }

  // ── catálogos ─────────────────────────────────────────────────────────────
  // #4/#7: armas AGRUPADAS por grupo (GRUPO_ARMA_ORDER + emoji), naturais/
  // especiais fora.
  const armaGroups = useMemo(() => {
    const byGrupo = new Map<string, { id: string; nome: string; grupo: string }[]>()
    for (const e of catalog.content) {
      if (!e.id.startsWith(ARMAS_FOLDER) || e.subtype !== 'Arma') continue
      const g = (typeof e.grupo === 'string' ? e.grupo : '').toLowerCase()
      if (EXCLUDED_ARMA_GRUPOS.has(g)) continue
      const list = byGrupo.get(g) ?? []
      list.push({ id: e.id, nome: e.basename ?? e.id, grupo: g })
      byGrupo.set(g, list)
    }
    return GRUPO_ARMA_ORDER.filter((g) => byGrupo.has(g.key)).map((g) => ({
      ...g,
      entries: byGrupo.get(g.key)!.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    }))
  }, [catalog])
  const allArmas = useMemo(() => armaGroups.flatMap((g) => g.entries), [armaGroups])

  const imbuicaoIds = useMemo(
    () => catalog.content.filter((e) => e.id.startsWith(IMBUICOES_ARMA_FOLDER)).map((e) => e.id),
    [catalog],
  )
  const armaduras = useMemo(() => armaduraBases(catalog).filter((n) => !/^Sem\b/.test(n)), [catalog])
  const escudos = useMemo(() => escudoBases(catalog).filter((n) => n !== 'Sem Escudo'), [catalog])
  // #7: "Tesouro" (equipamentos de perícia/ataque/defesa) AGRUPADO por subpasta;
  // Artefatos (só Mestre) num grupo à parte.
  const tesouroGroups = useMemo(() => {
    const byG = new Map<string, { id: string; nome: string; artefato: boolean }[]>()
    for (const e of catalog.content) {
      if (e.subtype !== 'Tesouro') continue
      const art = e.id.startsWith(ARTEFATOS_FOLDER)
      if (!e.id.startsWith(EQUIPAMENTOS_FOLDER) && !(mestre && art)) continue
      const seg = art
        ? '✦ Artefatos'
        : (e.id.split('/Equipamentos/')[1]?.split('/')[0] ?? 'Equipamentos').replace(/^Equipamentos de /, '')
      const list = byG.get(seg) ?? []
      list.push({ id: e.id, nome: e.basename ?? e.id, artefato: art })
      byG.set(seg, list)
    }
    return [...byG.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt'))
      .map(([label, entries]) => ({ label, entries: entries.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')) }))
  }, [catalog, mestre])
  const tesouroById = useMemo(() => {
    const m = new Map<string, { nome: string; artefato: boolean }>()
    for (const g of tesouroGroups) for (const e of g.entries) m.set(e.id, e)
    return m
  }, [tesouroGroups])
  const implementos = useMemo(
    () =>
      catalog.content
        .filter((e) => e.id.startsWith(IMPLEMENTOS_FOLDER) && e.subtype === 'Tesouro')
        .map((e) => ({ id: e.id, nome: e.basename ?? e.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    [catalog],
  )

  // ── docs (preço/imagem/aplicabilidade) ────────────────────────────────────
  const idsToLoad = useMemo(() => {
    const ids = new Set<string>()
    for (const it of itens) {
      const n = normalizeGroupItem(it)
      if (n.kind === 'tesouro' && n.docId) ids.add(n.docId)
      // arma/armadura/escudo do pool: resolve o doc pelo nome (carta/imagem).
      else if ((n.kind === 'arma' || n.kind === 'armadura' || n.kind === 'escudo') && (n as { nome?: string }).nome) {
        const id = idOf((n as { nome: string }).nome)
        if (id) ids.add(id)
      }
    }
    for (const b of OBRA_PRIMAS) {
      const id = idOf(b)
      if (id) ids.add(id)
    }
    if (tipo === 'arma' && armaSel) {
      ids.add(armaSel)
      for (const id of imbuicaoIds) ids.add(id) // filtra as aplicáveis
      if (propSel) {
        const id = idOf(propSel)
        if (id) ids.add(id)
      }
    }
    if (tipo === 'equipamento' && (equipSub === 'armadura' || equipSub === 'escudo') && gearBase) {
      const id = idOf(gearBase)
      if (id) ids.add(id)
    }
    if (tipo === 'equipamento' && equipSub === 'tesouro' && tesSel) ids.add(tesSel)
    if (tipo === 'implemento' && impSel) ids.add(impSel)
    return [...ids]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, tipo, armaSel, propSel, equipSub, gearBase, tesSel, impSel, imbuicaoIds, catalog])
  const docs = useDocs(idsToLoad)

  const priceOf = (basename: string): number => {
    const id = idOf(basename)
    return id ? precoPO(docs?.get(id) as VaultDoc | undefined) : 0
  }

  const armaDoc = armaSel ? docs?.get(armaSel) : undefined
  const propDoc = propSel ? docs?.get(idOf(propSel) ?? '') : undefined
  const gearDoc =
    (equipSub === 'armadura' || equipSub === 'escudo') && gearBase ? docs?.get(idOf(gearBase) ?? '') : undefined
  const tesDoc = tesSel ? docs?.get(tesSel) : undefined
  const impDoc = impSel ? docs?.get(impSel) : undefined

  // #8: imbuições APLICÁVEIS à arma selecionada (AplicavelA) — só depois de
  // escolher a arma; senão a lista fica vazia/desabilitada.
  const imbuicoesAplicaveis = useMemo(() => {
    if (!armaDoc) return []
    const out: string[] = []
    for (const id of imbuicaoIds) {
      const idoc = docs?.get(id)
      if (idoc && tesouroAplicavelAoItem(idoc, armaDoc)) out.push(idoc.basename ?? id)
    }
    return out.sort((a, b) => a.localeCompare(b, 'pt'))
  }, [armaDoc, docs, imbuicaoIds])

  const tesArtefato = tesSel ? (tesouroById.get(tesSel)?.artefato ?? false) : false

  // ── monta o item (draft) ──────────────────────────────────────────────────
  const draft = useMemo<GroupInventoryItem | null>(() => {
    const base = { addedBy: user?.id ?? '', addedAt: '' }
    if (tipo === 'arma') {
      if (!armaSel) return null
      const a = allArmas.find((x) => x.id === armaSel)
      const propriedades = (armaDoc?.frontmatter?.['propriedades'] ??
        (armaDoc?.inlineFields as Record<string, unknown> | undefined)?.['propriedades']) as unknown
      return {
        kind: 'arma',
        nome: a?.nome ?? '',
        grupo: a?.grupo,
        propriedades,
        propriedadeBase: propSel || undefined,
        tier: armaTier || 'A',
        ...base,
      }
    }
    if (tipo === 'equipamento') {
      if (equipSub === 'tesouro') {
        if (!tesSel) return null
        // #3: artefato é sempre Mestre — sem escolha de qualidade.
        return {
          kind: 'tesouro',
          docId: tesSel,
          nome: tesouroById.get(tesSel)?.nome ?? '',
          tier: tesArtefato ? 'M' : equipTier || 'A',
          ...base,
        }
      }
      if (!gearBase) return null
      const dureza =
        equipSub === 'escudo'
          ? Number((gearDoc?.frontmatter as Record<string, unknown> | undefined)?.['dureza']) || 0
          : 0
      return { kind: equipSub, nome: gearBase, tier: equipTier || 'A', dureza, ...base }
    }
    if (tipo === 'implemento') {
      if (!impSel) return null
      const e = implementos.find((x) => x.id === impSel)
      return { kind: 'tesouro', docId: impSel, nome: e?.nome ?? '', tier: impTier || 'A', ...base }
    }
    if (tipo === 'ouro') {
      const q = Math.max(0, Math.floor(Number(ouroQtd) || 0))
      if (q <= 0) return null
      return { kind: 'ouro', qtd: q, ...base }
    }
    return null
  }, [
    tipo, armaSel, propSel, armaTier, equipSub, gearBase, tesSel, tesArtefato, equipTier, impSel,
    impTier, ouroQtd, allArmas, implementos, tesouroById, armaDoc, gearDoc, user?.id,
  ])

  const valorAtual = draft ? itemValorPO(draft, priceOf) : 0

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
    if (!draft || semSessao) return
    const item: GroupInventoryItem = { ...draft, addedBy: user!.id, addedAt: new Date().toISOString(), valorPO: valorAtual }
    await writeMap({ ...mapa, [novaChave()]: item })
    setStatus(`${itemNome(item)} entrou no inventário do grupo.`)
    setArmaSel(''); setPropSel(''); setArmaTier('A'); setGearBase(''); setTesSel('')
    setEquipTier('A'); setImpSel(''); setImpTier('A'); setOuroQtd('')
  }

  // #9: arma ALEATÓRIA (respeita a qualidade escolhida; sai obra-prima via tier).
  const aleatorizarArma = () => {
    if (!allArmas.length) return
    setArmaSel(allArmas[Math.floor(Math.random() * allArmas.length)]!.id)
    setPropSel('')
  }

  const remover = async (key: string) => {
    const next = { ...mapa }
    delete next[key]
    await writeMap(next)
  }

  const puxar = async (it: ItemView) => {
    if (!meuHeroiLocal) return
    const fm = (getLocalDoc(meuHeroiLocal)?.frontmatter ?? {}) as Record<string, unknown>
    const atributos = heroAtributos(fm).values
    for (const w of pullItemToFm(it, fm, atributos)) setLocalEntityFm(meuHeroiLocal, w.path, w.value)
    await remover(it.key)
    setStatus(`${itemNome(it)} foi pra sua ficha.`)
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

  // preview (imagem + tooltip do CARD, com tier) do item + propriedade
  // selecionados (#5) — mesma carta que aparece no inventário do personagem.
  const previewDocs: { doc: VaultDoc; propDoc?: VaultDoc; tier: '' | 'A' | 'E' | 'M'; img: string | null }[] =
    (() => {
      if (tipo === 'arma' && armaDoc) {
        const t = asTierChar(armaTier)
        return [{ doc: armaDoc, propDoc, tier: t, img: docImageUrl(armaDoc, t || docTier(armaDoc), assets) }]
      }
      if (tipo === 'equipamento' && (equipSub === 'armadura' || equipSub === 'escudo') && gearDoc) {
        const t = asTierChar(equipTier)
        return [{ doc: gearDoc, tier: t, img: docImageUrl(gearDoc, t || docTier(gearDoc), assets) }]
      }
      if (tipo === 'equipamento' && equipSub === 'tesouro' && tesDoc) {
        const t = tesArtefato ? 'M' : asTierChar(equipTier)
        return [{ doc: tesDoc, tier: t, img: tesouroImageUrl(tesDoc.basename, t, assets) }]
      }
      if (tipo === 'implemento' && impDoc) {
        const t = asTierChar(impTier)
        return [{ doc: impDoc, tier: t, img: tesouroImageUrl(impDoc.basename, t, assets) }]
      }
      return []
    })()

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...sectionTitleStyle }}>💼 INVENTÁRIO DO GRUPO</div>

      {/* ── ADICIONAR ITEM ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 12,
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(12),
        }}
      >
        <span style={mono({ fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' })}>+ ADICIONAR ITEM</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TIPOS.map((t) => {
            const on = tipo === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(on ? '' : t.id)}
                style={mono({
                  padding: '8px 13px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: on ? 'var(--ink)' : 'var(--text)',
                  background: on ? 'var(--accent)' : 'var(--card)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
                  clipPath: clip(7),
                })}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {tipo === 'arma' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <select aria-label="Arma" value={armaSel} onChange={(e) => { setArmaSel(e.target.value); setPropSel('') }} style={selStyle}>
                <option value="">— arma —</option>
                {armaGroups.map((g) => (
                  <optgroup key={g.key} label={`${grupoArmaEmoji(g.key)} ${g.label}`}>
                    {g.entries.map((a) => (<option key={a.id} value={a.id}>{a.nome}</option>))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={aleatorizarArma}
                title="Arma aleatória (com a qualidade escolhida)"
                style={mono({
                  flex: 'none',
                  padding: '0 12px',
                  fontSize: 15,
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  background: 'color-mix(in srgb,var(--accent) 12%,transparent)',
                  border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                  clipPath: clip(8),
                })}
              >
                🎲
              </button>
            </div>
            {/* #8: propriedade só depois de escolher a arma, e só as APLICÁVEIS. */}
            <select
              aria-label="Propriedade da arma"
              value={propSel}
              disabled={!armaSel}
              onChange={(e) => setPropSel(e.target.value)}
              style={{ ...selStyle, opacity: armaSel ? 1 : 0.5 }}
            >
              <option value="">{armaSel ? '— obra-prima (sem imbuição) —' : '— escolha a arma primeiro —'}</option>
              {imbuicoesAplicaveis.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <QualityRow value={armaTier} onChange={setArmaTier} />
          </div>
        ) : null}

        {tipo === 'equipamento' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['armadura', 'escudo', 'tesouro'] as const).map((s) => {
                const on = equipSub === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setEquipSub(s); setGearBase(''); setTesSel('') }}
                    style={mono({
                      padding: '6px 11px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      color: on ? 'var(--accent)' : 'var(--muted)',
                      background: on ? 'color-mix(in srgb,var(--accent) 12%,transparent)' : 'var(--card)',
                      border: `1px solid ${on ? 'color-mix(in srgb,var(--accent) 45%,var(--line2))' : 'var(--line2)'}`,
                      clipPath: clip(6),
                    })}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
            {equipSub === 'armadura' ? (
              <select aria-label="Armadura" value={gearBase} onChange={(e) => setGearBase(e.target.value)} style={selStyle}>
                <option value="">🛡️ — armadura (leve/pesada) —</option>
                {armaduras.map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            ) : equipSub === 'escudo' ? (
              <select aria-label="Escudo" value={gearBase} onChange={(e) => setGearBase(e.target.value)} style={selStyle}>
                <option value="">🛡️ — escudo (broquel/escudo) —</option>
                {escudos.map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            ) : (
              <select aria-label="Tesouro" value={tesSel} onChange={(e) => setTesSel(e.target.value)} style={selStyle}>
                <option value="">💍 — tesouro (perícia/ataque/defesa) —</option>
                {tesouroGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.entries.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
                  </optgroup>
                ))}
              </select>
            )}
            {/* #3: artefato não tem escolha de qualidade (é sempre Mestre). */}
            {equipSub === 'tesouro' && tesArtefato ? (
              <span style={mono({ fontSize: 10.5, color: 'var(--muted)' })}>✦ Artefato — qualidade Mestre.</span>
            ) : (
              <QualityRow value={equipTier} onChange={setEquipTier} />
            )}
          </div>
        ) : null}

        {tipo === 'implemento' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select aria-label="Implemento" value={impSel} onChange={(e) => setImpSel(e.target.value)} style={selStyle}>
              <option value="">🪄 — implemento —</option>
              {implementos.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
            </select>
            <QualityRow value={impTier} onChange={setImpTier} />
          </div>
        ) : null}

        {tipo === 'ouro' ? (
          <input
            aria-label="Quantidade de ouro"
            type="number"
            min={1}
            placeholder="Quantidade (PO)"
            value={ouroQtd}
            onChange={(e) => setOuroQtd(e.target.value)}
            style={selStyle}
          />
        ) : null}

        {/* preview: imagem + tooltip do item (e da propriedade) selecionados (#5) */}
        {previewDocs.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {previewDocs.map((p, i) => (
              <PreviewChip key={i} doc={p.doc} propDoc={p.propDoc} tier={p.tier} img={p.img} assets={assets} />
            ))}
            {tipo === 'arma' && propDoc ? (
              <PreviewChip
                doc={propDoc}
                tier={asTierChar(armaTier)}
                img={docImageUrl(propDoc, asTierChar(armaTier) || docTier(propDoc), assets)}
                assets={assets}
              />
            ) : null}
          </div>
        ) : null}

        {/* valor + adicionar */}
        {tipo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={mono({ fontSize: 12, color: 'var(--muted)' })}>
              Valor: <b style={{ color: 'var(--accent)' }}>{valorAtual}</b> PO
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => void adicionar()}
              disabled={!draft}
              style={{
                padding: '9px 16px',
                background: draft ? 'var(--accent)' : 'var(--card)',
                color: draft ? 'var(--ink)' : 'var(--muted)',
                border: 'none',
                cursor: draft ? 'pointer' : 'not-allowed',
                fontWeight: 700,
                fontSize: 12.5,
                clipPath: clip(8),
              }}
            >
              + Adicionar
            </button>
          </div>
        ) : null}
      </div>

      {/* ── POOL ── */}
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
          {'// POOL VAZIO — adicione itens que o grupo dividir'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map((it) => {
            // Mesma linguagem visual da lista de equipamentos do inventário do
            // personagem (InventarioTab): borda esquerda pela QUALIDADE, imagem do
            // item (contain), nome azul + sufixo do tier, e o CARD no hover.
            const n = normalizeGroupItem(it)
            const kind = n.kind ?? 'tesouro'
            const nome = itemNome(it)
            const tier = asTierChar((n as { tier?: string }).tier)
            const docId = kind === 'tesouro' ? (n as { docId?: string }).docId : kind === 'ouro' ? null : idOf(nome)
            const doc = docId ? docs?.get(docId) : undefined
            const img =
              kind === 'ouro'
                ? null
                : kind === 'tesouro'
                  ? tesouroImageUrl(nome, tier, assets)
                  : doc
                    ? docImageUrl(doc, tier || docTier(doc), assets)
                    : null
            const tierBd = tier ? ITEM_TIER_BTN[tier].bd : 'var(--line2)'
            const podeRemover = mestre || it.addedBy === user!.id
            const nomeQuem = nomePorUser.get(it.addedBy) ?? '—'
            return (
              <div
                key={it.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  borderLeft: `3px solid ${tierBd}`,
                  clipPath: clip(8),
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <ItemHover doc={doc} tier={tier || undefined}>
                    {img ? (
                      <span
                        aria-hidden
                        style={{
                          flex: 'none',
                          width: 30,
                          height: 30,
                          background: 'var(--panel2)',
                          border: '1px solid var(--line2)',
                          clipPath: clip(6),
                          backgroundImage: `url("${img}")`,
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                        }}
                      />
                    ) : (
                      <span aria-hidden style={{ fontSize: 15, flex: 'none' }}>{itemEmoji(it)}</span>
                    )}
                  </ItemHover>
                  <ItemHover doc={doc} tier={tier || undefined}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--blue)',
                        fontSize: 13.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {nome}
                    </span>
                  </ItemHover>
                  {tier ? (
                    <span style={mono({ fontSize: 11, fontWeight: 700, color: tierBd, flex: 'none' })}>
                      ({TIER_MASC[tier]})
                    </span>
                  ) : null}
                </span>
                <span style={mono({ fontSize: 9.5, color: 'var(--muted)', flex: 'none', textAlign: 'right', whiteSpace: 'nowrap' })}>
                  {it.valorPO ? `${it.valorPO} PO · ` : ''}
                  {nomeQuem}
                </span>
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
                    aria-label={`Remover ${itemNome(it)}`}
                    style={{ flex: 'none', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--muted)' }}
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
        <div role="status" style={mono({ fontSize: 11, color: 'var(--accent)' })}>{status}</div>
      ) : null}
    </div>
  )
}

/** Linha "QUALIDADE" + seletor A/E/M. */
function QualityRow({ value, onChange }: { value: string; onChange: (t: string) => void }): ReactNode {
  return (
    <label style={mono({ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 })}>
      QUALIDADE
      <TierSel value={value} onChange={onChange} />
    </label>
  )
}

/** Chip de preview: imagem + nome do doc, com o CARD (tier) no hover (ItemHover) —
 *  o mesmo tooltip do inventário do personagem. */
function PreviewChip({
  doc,
  propDoc,
  tier,
  img,
  assets: _assets,
}: {
  doc: VaultDoc | undefined
  propDoc?: VaultDoc | undefined
  tier?: '' | 'A' | 'E' | 'M'
  img?: string | null
  assets: ReturnType<typeof useAssetIndex>
}): ReactNode {
  if (!doc) return null
  const tierBd = tier ? ITEM_TIER_BTN[tier].bd : 'var(--line2)'
  return (
    <ItemHover doc={doc} propDoc={propDoc} tier={tier || undefined}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 9px 5px 5px',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderLeft: `3px solid ${tierBd}`,
          clipPath: clip(7),
          cursor: 'default',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(6),
            fontSize: 14,
          }}
        >
          {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '💠'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{doc.basename}</span>
      </span>
    </ItemHover>
  )
}

/** Nome exibível de um item do pool (ouro = "N PO"). */
function itemNome(it: GroupInventoryItem): string {
  const n = normalizeGroupItem(it)
  return n.kind === 'ouro' ? `${n.qtd} PO` : (n as { nome?: string }).nome ?? '—'
}
