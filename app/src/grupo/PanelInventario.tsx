// Painel "INVENTÁRIO DO GRUPO" (#333/#336) — inventário COMPARTILHADO da mesa. O
// Mestre e os jogadores CONFIGURAM um item (arma + propriedade + qualidade /
// equipamento / implemento / ouro), veem o VALOR em PO e adicionam ao pool
// (sincronizado no state da sessão, realtime). O jogador PUXA um item pra ficha
// dele — sai do grupo (transferência de loot). Artefatos: só o Mestre os coloca.
//
// Reusa os catálogos/preços/builders da ficha e do comércio (nada reinventado):
// armaduraBases/escudoBases, precoPO, e o núcleo puro grupo/inventario-item.
// Só existe na MESA (sessão com remoteId): sem sessão não há pool compartilhado.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex } from '../data/assets'
import { useDocs } from '../data/useDoc'
import { useLiveSession } from '../data/session-repo/live-session'
import { useSessionRepo, useSessionUser } from '../data/session-repo/provider'
import { useSettings } from '../settings'
import { getLocalDoc, setLocalEntityFm } from '../data/local-entities'
import { heroAtributos } from '../components/ficha/hero-model'
import { ItemHover, docImageUrl, docTier } from '../components/item-card'
import { clip } from '../components/ficha/bits'
import { armaduraBases, escudoBases } from '../components/ficha/equipment-bases'
import { precoPO } from './wealth'
import { sectionTitleStyle } from './panel-ui'
import {
  itemValorPO,
  pullItemToFm,
  normalizeGroupItem,
  KIND_LABEL,
} from './inventario-item'
import type { GroupInventoryItem } from '../data/session-repo/contract'
import type { VaultDoc } from '../data/types'

const ARMAS_FOLDER = 'Sistema/Equipamento/Armas/'
const IMBUICOES_ARMA_FOLDER = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/Imbuições/'
const EQUIPAMENTOS_FOLDER = 'Sistema/Equipamento/Tesouros/Equipamentos/'
const IMPLEMENTOS_FOLDER = 'Sistema/Equipamento/Tesouros/Implementos/'
const ARTEFATOS_FOLDER = 'Sistema/Equipamento/Tesouros/Artefatos/'
const OBRA_PRIMAS = ['Arma Obra-prima', 'Armadura Obra-prima', 'Broquel Obra-prima', 'Escudo Obra-prima']

const KIND_EMOJI: Record<string, string> = {
  arma: '⚔️',
  armadura: '🛡️',
  escudo: '🛡️',
  tesouro: '💍',
  ouro: '🪙',
}
const TIPOS = [
  { id: 'arma', label: '⚔️ Arma' },
  { id: 'equipamento', label: '🛡️ Equipamento' },
  { id: 'implemento', label: '🔮 Implemento' },
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

/** id-único de uma entrada do inventário (sem depender de crypto). */
function novaChave(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Seletor de qualidade A/E/M (com "Base" opcional). */
function TierSel({
  value,
  onChange,
  allowBase,
}: {
  value: string
  onChange: (t: string) => void
  allowBase?: boolean
}) {
  const opts = allowBase ? ['', 'A', 'E', 'M'] : ['A', 'E', 'M']
  const label: Record<string, string> = { '': 'Base', A: 'A', E: 'E', M: 'M' }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map((t) => {
        const on = value === t
        return (
          <button
            key={t || 'base'}
            type="button"
            onClick={() => onChange(t)}
            style={mono({
              padding: '7px 11px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              color: on ? 'var(--accent)' : 'var(--muted)',
              background: on ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'var(--card)',
              border: `1px solid ${on ? 'color-mix(in srgb,var(--accent) 45%,var(--line2))' : 'var(--line2)'}`,
              clipPath: clip(6),
            })}
          >
            {label[t]}
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

  // config do "Adicionar item"
  const [tipo, setTipo] = useState<Tipo | ''>('')
  const [armaSel, setArmaSel] = useState('') // id do doc da arma
  const [propSel, setPropSel] = useState('') // basename da imbuição ('' = nenhuma)
  const [armaTier, setArmaTier] = useState('')
  const [equipSub, setEquipSub] = useState<'armadura' | 'escudo' | 'outro'>('armadura')
  const [gearBase, setGearBase] = useState('') // basename (armadura/escudo)
  const [equipOutro, setEquipOutro] = useState('') // id (equipamento "outro")
  const [equipTier, setEquipTier] = useState('')
  const [impSel, setImpSel] = useState('') // id do implemento
  const [impTier, setImpTier] = useState('A')
  const [ouroQtd, setOuroQtd] = useState('')
  const [status, setStatus] = useState('')

  // #335: o log de confirmação some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 4000)
    return () => clearTimeout(t)
  }, [status])

  const remoteId = live?.sessionId ?? null
  const semSessao = !repo || !remoteId || !user

  const mapa = live?.state?.inventarioGrupo ?? {}
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

  // basename → id do doc (resolve pelo catálogo). null se não resolve.
  const idOf = (basename: string): string | null => {
    const r = catalog.resolve(basename)
    return r.kind === 'doc' ? r.id : null
  }

  // ── catálogos dos seletores ──────────────────────────────────────────────
  const armas = useMemo(
    () =>
      catalog.content
        .filter((e) => e.id.startsWith(ARMAS_FOLDER) && e.subtype === 'Arma')
        .map((e) => ({ id: e.id, nome: e.basename ?? e.id, grupo: typeof e.grupo === 'string' ? e.grupo : '' }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    [catalog],
  )
  const imbuicoes = useMemo(
    () =>
      catalog.content
        .filter((e) => e.id.startsWith(IMBUICOES_ARMA_FOLDER))
        .map((e) => e.basename ?? e.id)
        .sort((a, b) => a.localeCompare(b, 'pt')),
    [catalog],
  )
  const armaduras = useMemo(() => armaduraBases(catalog), [catalog])
  const escudos = useMemo(() => escudoBases(catalog), [catalog])
  // "Outro equipamento": equipamentos de perícia/ataque/defesa + (só Mestre) os
  // ARTEFATOS — #E: o jogador não os adiciona sozinho, o Mestre coloca aqui.
  const equipamentos = useMemo(
    () =>
      catalog.content
        .filter(
          (e) =>
            e.subtype === 'Tesouro' &&
            (e.id.startsWith(EQUIPAMENTOS_FOLDER) || (mestre && e.id.startsWith(ARTEFATOS_FOLDER))),
        )
        .map((e) => ({ id: e.id, nome: e.basename ?? e.id, artefato: e.id.startsWith(ARTEFATOS_FOLDER) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    [catalog, mestre],
  )
  const implementos = useMemo(
    () =>
      catalog.content
        .filter((e) => e.id.startsWith(IMPLEMENTOS_FOLDER) && e.subtype === 'Tesouro')
        .map((e) => ({ id: e.id, nome: e.basename ?? e.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    [catalog],
  )

  // ── docs necessários (preço + imagem) ────────────────────────────────────
  const idsToLoad = useMemo(() => {
    const ids = new Set<string>()
    for (const it of itens) {
      const n = normalizeGroupItem(it)
      if (n.kind === 'tesouro' && n.docId) ids.add(n.docId)
    }
    for (const b of OBRA_PRIMAS) {
      const id = idOf(b)
      if (id) ids.add(id)
    }
    if (armaSel) ids.add(armaSel)
    if (propSel) {
      const id = idOf(propSel)
      if (id) ids.add(id)
    }
    if (tipo === 'equipamento' && equipSub === 'escudo' && gearBase) {
      const id = idOf(gearBase)
      if (id) ids.add(id)
    }
    if (tipo === 'equipamento' && equipSub === 'outro' && equipOutro) ids.add(equipOutro)
    if (tipo === 'implemento' && impSel) ids.add(impSel)
    return [...ids]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, armaSel, propSel, tipo, equipSub, gearBase, equipOutro, impSel, catalog])
  const docs = useDocs(idsToLoad)

  const priceOf = (basename: string): number => {
    const id = idOf(basename)
    return id ? precoPO(docs?.get(id) as VaultDoc | undefined) : 0
  }

  const armaDoc = armaSel ? docs?.get(armaSel) : undefined
  const escudoDoc = equipSub === 'escudo' && gearBase ? docs?.get(idOf(gearBase) ?? '') : undefined

  // ── monta o item (draft) a partir da config atual — null se incompleto ────
  const draft = useMemo<GroupInventoryItem | null>(() => {
    const base = { addedBy: user?.id ?? '', addedAt: '' }
    if (tipo === 'arma') {
      if (!armaSel) return null
      const a = armas.find((x) => x.id === armaSel)
      const propriedades = (armaDoc?.frontmatter?.['propriedades'] ??
        (armaDoc?.inlineFields as Record<string, unknown> | undefined)?.['propriedades']) as unknown
      return {
        kind: 'arma',
        nome: a?.nome ?? '',
        grupo: a?.grupo,
        propriedades,
        propriedadeBase: propSel || undefined,
        tier: armaTier || undefined,
        ...base,
      }
    }
    if (tipo === 'equipamento') {
      if (equipSub === 'outro') {
        if (!equipOutro) return null
        const e = equipamentos.find((x) => x.id === equipOutro)
        return { kind: 'tesouro', docId: equipOutro, nome: e?.nome ?? '', tier: equipTier || 'A', ...base }
      }
      if (!gearBase || /^Sem\b/.test(gearBase)) return null
      const dureza =
        equipSub === 'escudo' ? Number((escudoDoc?.frontmatter as Record<string, unknown> | undefined)?.['dureza']) || 0 : 0
      return { kind: equipSub, nome: gearBase, tier: equipTier || undefined, dureza, ...base }
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
    tipo, armaSel, propSel, armaTier, equipSub, gearBase, equipOutro, equipTier, impSel, impTier,
    ouroQtd, armas, equipamentos, implementos, armaDoc, escudoDoc, user?.id,
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
    // reset da config
    setArmaSel(''); setPropSel(''); setArmaTier(''); setGearBase(''); setEquipOutro('')
    setEquipTier(''); setImpSel(''); setImpTier('A'); setOuroQtd('')
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

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...sectionTitleStyle }}>💼 INVENTÁRIO DO GRUPO</div>

      {/* ── ADICIONAR ITEM: tipo → sub-config → valor → adicionar ── */}
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
        <span style={mono({ fontSize: 10, letterSpacing: '.12em', color: 'var(--muted)' })}>
          + ADICIONAR ITEM
        </span>
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

        {/* sub-config por tipo */}
        {tipo === 'arma' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select aria-label="Arma" value={armaSel} onChange={(e) => setArmaSel(e.target.value)} style={selStyle}>
              <option value="">— arma —</option>
              {armas.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
            <select aria-label="Propriedade da arma" value={propSel} onChange={(e) => setPropSel(e.target.value)} style={selStyle}>
              <option value="">— sem propriedade —</option>
              {imbuicoes.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <label style={mono({ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 })}>
              QUALIDADE
              <TierSel value={armaTier} onChange={setArmaTier} allowBase />
            </label>
          </div>
        ) : null}

        {tipo === 'equipamento' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['armadura', 'escudo', 'outro'] as const).map((s) => {
                const on = equipSub === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setEquipSub(s); setGearBase(''); setEquipOutro('') }}
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
                    {s === 'outro' ? 'Outro' : s}
                  </button>
                )
              })}
            </div>
            {equipSub === 'armadura' ? (
              <select aria-label="Armadura" value={gearBase} onChange={(e) => setGearBase(e.target.value)} style={selStyle}>
                <option value="">— armadura (leve/pesada) —</option>
                {armaduras.filter((n) => !/^Sem\b/.test(n)).map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            ) : equipSub === 'escudo' ? (
              <select aria-label="Escudo" value={gearBase} onChange={(e) => setGearBase(e.target.value)} style={selStyle}>
                <option value="">— escudo (broquel/escudo) —</option>
                {escudos.filter((n) => n !== 'Sem Escudo').map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            ) : (
              <select aria-label="Equipamento" value={equipOutro} onChange={(e) => setEquipOutro(e.target.value)} style={selStyle}>
                <option value="">— equipamento (perícia/ataque/defesa) —</option>
                {equipamentos.map((e) => (
                  <option key={e.id} value={e.id}>{e.artefato ? '✦ ' : ''}{e.nome}</option>
                ))}
              </select>
            )}
            <label style={mono({ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 })}>
              QUALIDADE
              <TierSel value={equipTier} onChange={setEquipTier} allowBase />
            </label>
          </div>
        ) : null}

        {tipo === 'implemento' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select aria-label="Implemento" value={impSel} onChange={(e) => setImpSel(e.target.value)} style={selStyle}>
              <option value="">— implemento —</option>
              {implementos.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
            </select>
            <label style={mono({ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 })}>
              QUALIDADE
              <TierSel value={impTier} onChange={setImpTier} />
            </label>
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
            const kind = it.kind ?? 'tesouro'
            const docId = kind === 'tesouro' ? (it as { docId?: string }).docId : undefined
            const doc = docId ? docs?.get(docId) : undefined
            const img = doc ? docImageUrl(doc, docTier(doc), assets) : null
            const podeRemover = mestre || it.addedBy === user!.id
            const nomeQuem = nomePorUser.get(it.addedBy) ?? '—'
            const tier = (it as { tier?: string }).tier
            const nomeEl = <span style={{ fontSize: 13.5, fontWeight: 700 }}>{itemNome(it)}</span>
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
                    KIND_EMOJI[kind] ?? '💍'
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {doc ? <ItemHover doc={doc}>{nomeEl}</ItemHover> : nomeEl}
                  <span style={mono({ fontSize: 9.5, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap' })}>
                    <span>{KIND_LABEL[kind] ?? 'Tesouro'}</span>
                    {tier ? <span>· {tier}</span> : null}
                    {it.valorPO ? <span>· {it.valorPO} PO</span> : null}
                    <span>· por {nomeQuem}</span>
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
                    aria-label={`Remover ${itemNome(it)}`}
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

/** Nome exibível de um item do pool (ouro = "N PO"). */
function itemNome(it: GroupInventoryItem): string {
  const n = normalizeGroupItem(it)
  return n.kind === 'ouro' ? `${n.qtd} PO` : (n as { nome?: string }).nome ?? '—'
}
