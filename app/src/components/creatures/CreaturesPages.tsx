import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl } from '../../data/creature-image'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc, useDocs } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath, heroPath } from '../../paths'
import { GrupoView } from '../../grupo/GrupoView'
import { GRUPOS_FOLDER, groupMembers, rankLetter, tierFromLevel } from '../../grupo/party'

// Telas HERÓIS e NPCS com markup/estilo do design puxado (design/pulled/
// Companion App.dc.html, seções ===== HERÓIS ===== e ===== NPCS =====).
// Aqui SÓ se liga a fonte de dados real (vault-data) — o formato visual
// nunca nasce neste repo, vem do Claude Design.

const HEROIS_FOLDER = 'Sistema/Criaturas/Heróis'

// Abas verbatim do NPC_TABS do design; a pasta da vault é a fonte real de
// cada uma (aba sem pasta correspondente rende o empty state desenhado).
const NPC_TABS = [
  { id: 'pessoas', label: 'PESSOAS', folder: 'Sistema/Criaturas/Pessoas' },
  {
    id: 'companheiros',
    label: 'COMPANHEIROS ANIMAIS',
    folder: 'Sistema/Criaturas/Companheiros Animais',
  },
  { id: 'bestiario', label: 'BESTIÁRIO', folder: 'Sistema/Criaturas/Bestiário' },
]

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** Texto plano de um valor FM que pode ser wikilink ("[[Mago|Mago]]" → "Mago"). */
function plainLabel(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string' || !value) return ''
  const match = WIKI.exec(value)
  return match ? (match[2] ?? match[1]) : value
}

/** Iniciais pro slot sem retrato (h.ini do design: "Carlos Facão…" → "CF"). */
function initials(name: string): string {
  const words = name.split(/[\s,]+/).filter((w) => w.length > 2)
  const two = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (two || name.slice(0, 2)).toUpperCase()
}

/** Docs de uma pasta (sem a folder note), com os JSONs carregados em lote. */
function useFolderDocs(folder: string) {
  const catalog = useCatalog()
  const node = catalog.folderByPath.get(folder)
  const entries = useMemo(
    () => (node ? node.docs.filter((d) => d.basename !== node.name) : []),
    [node],
  )
  const [docs, setDocs] = useState<Map<string, VaultDoc>>()

  useEffect(() => {
    if (!entries.length) {
      setDocs(undefined)
      return
    }
    let alive = true
    Promise.all(entries.map((entry) => loadDoc(entry.id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [entries])

  return { entries, docs }
}

function HeroCard({ entry, doc }: { entry: IndexDocEntry; doc?: VaultDoc }) {
  const navigate = useNavigate()
  const assets = useAssetIndex()
  const nome = entry.basename ?? entry.id
  const classe = plainLabel(doc?.frontmatter['Classe'])
  const nivel = plainLabel(doc?.frontmatter['Nível'])
  // hierarquia de imagem do plugin (Imagem → Retratos/<nome> → Classes/<classe>)
  const portrait = creatureImageUrl(doc, assets)

  return (
    <button className="hero-card" onClick={() => navigate(heroPath(entry.id))}>
      <span className="hero-card-stripe" aria-hidden />
      {portrait ? (
        <div className="hero-portrait" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="hero-ini">{initials(nome)}</span>
      )}
      <div className="hero-main">
        <div className="hero-nome">{nome}</div>
        <div className="hero-classe">{classe}</div>
      </div>
      <div className="hero-nvl">
        <span className="hero-nvl-num">{nivel || '—'}</span>
        <span className="hero-nvl-label">NVL</span>
      </div>
      <span className="card-dots" aria-hidden>
        ⋮
      </span>
    </button>
  )
}

// Abas da tela de heróis (pedido do usuário 2026-07-04): HERÓIS | GRUPOS,
// no mesmo padrão de abas desenhado do §NPCS.
const HEROIS_TABS = [
  { id: 'herois', label: 'HERÓIS' },
  { id: 'grupos', label: 'GRUPOS' },
]

/** Card de grupo na linguagem do card de herói (lista sem design dedicado ainda). */
function GroupCard({
  entry,
  memberCount,
  rank,
  onOpen,
}: {
  entry: IndexDocEntry
  memberCount: number
  rank: string
  onOpen: () => void
}) {
  return (
    <button className="hero-card" onClick={onOpen}>
      <span className="hero-card-stripe" aria-hidden />
      <span className="hero-ini" aria-hidden>
        ⚔️
      </span>
      <div className="hero-main">
        <div className="hero-nome">{entry.basename ?? entry.id}</div>
        <div className="hero-classe">{memberCount} integrantes</div>
      </div>
      <div className="grupo-rank" aria-hidden>
        {rank}
      </div>
      <span className="card-dots" aria-hidden>
        ⋮
      </span>
    </button>
  )
}

function GruposPanel({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const catalog = useCatalog()
  const groups = useMemo(() => {
    const node = catalog.folderByPath.get(GRUPOS_FOLDER)
    return node ? node.docs.filter((d) => d.basename !== node.name) : []
  }, [catalog])
  const membersByGroup = useMemo(
    () => new Map(groups.map((g) => [g.id, groupMembers(catalog, g.id)])),
    [catalog, groups],
  )
  const allIds = useMemo(
    () => [
      ...groups.map((g) => g.id),
      ...groups.flatMap((g) => membersByGroup.get(g.id)!.map((m) => m.id)),
    ],
    [groups, membersByGroup],
  )
  const docs = useDocs(allIds)

  if (selected) {
    return (
      <div>
        <button className="grupo-voltar" onClick={() => onSelect(null)}>
          ← GRUPOS
        </button>
        <GrupoView groupId={selected} />
      </div>
    )
  }

  return (
    <div className="herois-page">
      {groups.map((group) => {
        const members = membersByGroup.get(group.id)!
        const maxTier = members.length
          ? Math.max(
              ...members.map((m) => tierFromLevel(docs?.get(m.id)?.frontmatter['Nível'])),
            )
          : 1
        const rank = rankLetter(docs?.get(group.id)?.frontmatter ?? {}, maxTier)
        return (
          <GroupCard
            key={group.id}
            entry={group}
            memberCount={members.length}
            rank={rank}
            onOpen={() => onSelect(group.id)}
          />
        )
      })}
    </div>
  )
}

export function HeroisPage() {
  const { entries, docs } = useFolderDocs(HEROIS_FOLDER)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedGroup = searchParams.get('grupo')
  const [tab, setTab] = useState(selectedGroup ? 'grupos' : 'herois')
  const index = Math.max(0, HEROIS_TABS.findIndex((t) => t.id === tab))

  const selectGroup = (id: string | null) => {
    setSearchParams(id ? { grupo: id } : {})
    if (id) setTab('grupos')
  }

  return (
    <div className="npcs-page">
      <div className="npc-tabs">
        {HEROIS_TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'npc-tab on' : 'npc-tab'}
            onClick={() => {
              setTab(t.id)
              if (t.id === 'grupos') selectGroup(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="npc-track-clip">
        <div className="npc-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          <div className="npc-panel">
            <div className="herois-page">
              {entries.map((entry) => (
                <HeroCard key={entry.id} entry={entry} doc={docs?.get(entry.id)} />
              ))}
            </div>
          </div>
          <div className="npc-panel">
            <GruposPanel selected={selectedGroup} onSelect={selectGroup} />
          </div>
        </div>
      </div>
    </div>
  )
}

function NpcCard({ entry, doc }: { entry: IndexDocEntry; doc?: VaultDoc }) {
  const navigate = useNavigate()
  const assets = useAssetIndex()
  const nome = entry.basename ?? entry.id
  // subtítulo accent2 do design (n.tipo): Raça, senão Classe, senão subtipo
  const tipo =
    plainLabel(doc?.frontmatter['Raça']) ||
    plainLabel(doc?.frontmatter['Classe']) ||
    entry.subtype ||
    ''
  const nivel = plainLabel(doc?.frontmatter['Nível'])
  const portrait = creatureImageUrl(doc, assets)

  return (
    <button className="npc-card" onClick={() => navigate(docPath(entry.id))}>
      {portrait ? (
        <span className="npc-ic" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="npc-ic npc-ini">{initials(nome)}</span>
      )}
      <div className="npc-main">
        <div className="npc-nome">{nome}</div>
        <div className="npc-tipo">{tipo}</div>
      </div>
      <div className="npc-nvl">
        <span className="npc-nvl-diamond" aria-hidden />
        <div className="npc-nvl-inner">
          <span className="npc-nvl-label">NVL</span>
          <span className="npc-nvl-num">{nivel || '—'}</span>
        </div>
      </div>
      <span className="card-dots" aria-hidden>
        ⋮
      </span>
    </button>
  )
}

function NpcPanel({ folder }: { folder: string }) {
  const { entries, docs } = useFolderDocs(folder)
  return (
    <div className="npc-panel">
      <div className="npc-panel-inner">
        {entries.map((entry) => (
          <NpcCard key={entry.id} entry={entry} doc={docs?.get(entry.id)} />
        ))}
        {entries.length === 0 ? (
          <div className="npc-empty">// NENHUM REGISTRO NESTA CATEGORIA</div>
        ) : null}
      </div>
    </div>
  )
}

export function NpcsPage() {
  const [tab, setTab] = useState(NPC_TABS[0].id)
  const index = NPC_TABS.findIndex((t) => t.id === tab)

  return (
    <div className="npcs-page">
      <div className="npc-tabs">
        {NPC_TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'npc-tab on' : 'npc-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="npc-track-clip">
        <div className="npc-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {NPC_TABS.map((t) => (
            <NpcPanel key={t.id} folder={t.folder} />
          ))}
        </div>
      </div>
    </div>
  )
}
