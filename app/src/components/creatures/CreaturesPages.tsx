import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl, groupImageUrl } from '../../data/creature-image'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc, useDocs } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath, heroPath } from '../../paths'
import { tokens } from '../../generated/tokens'
import { GrupoView } from '../../grupo/GrupoView'
import {
  GRUPOS_FOLDER,
  groupMembers,
  rankColors,
  rankLetter,
  tierBarColor,
  tierFromLevel,
} from '../../grupo/party'

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
  // Badge NVL com a cor do tier do herói (issue #17): tierFromLevel (espelho
  // de tier-from-level.ts) + registro partyTierBar (1-3 bronze, 4-6 prata,
  // 7-9 ouro, 10+ cristal). Sem Nível carregado, fica nas cores do design.
  const tierCor = nivel ? tierBarColor(tierFromLevel(doc?.frontmatter['Nível'])) : null

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
      <div className="hero-nvl" style={tierCor ? { borderColor: tierCor } : undefined}>
        <span className="hero-nvl-num" style={tierCor ? { color: tierCor } : undefined}>
          {nivel || '—'}
        </span>
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
  const assets = useAssetIndex()
  // Imagem do grupo (issue #16): Retratos/<basename do grupo> via
  // groupImageUrl; sem retrato mantém o fallback ⚔️.
  const portrait = groupImageUrl(entry.basename, assets)
  // Rank box com as cores do registro partyBountyRank (issue #16) — espelha
  // o rankBadge do plugin (render-party-sheet.ts:215-219) com o glow de
  // .pleitost-party__rank (styles.css:12420: 0 2px 8px var(--party-glow)).
  const rk = rankColors(rank)
  return (
    <button className="hero-card" onClick={onOpen}>
      <span className="hero-card-stripe" aria-hidden />
      {portrait ? (
        <div className="hero-portrait" style={{ backgroundImage: `url("${portrait}")` }} />
      ) : (
        <span className="hero-ini" aria-hidden>
          ⚔️
        </span>
      )}
      <div className="hero-main">
        <div className="hero-nome">{entry.basename ?? entry.id}</div>
        <div className="hero-classe">{memberCount} integrantes</div>
      </div>
      <div
        className="grupo-rank"
        aria-hidden
        style={{
          color: rk.color,
          background: rk.bg,
          borderColor: rk.color,
          boxShadow: `0 2px 8px ${rk.glow}`,
        }}
      >
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

/** Cor do TIER de monstro — espelha tierColorForMonstro (header-monstro.ts:32):
 *  Tier 0 usa o registro tokens.colors.tier.Zero (palette-registry.ts:13,
 *  "Tier 0 do Monstro (sem tier) — usado como --badge-tier-color"); tiers 1+
 *  seguem o registro partyTierBar (issue #19), com teto em Tier4. */
function monsterTierColor(t: number): string {
  if (t <= 0) return tokens.colors.tier.Zero
  return tierBarColor(Math.min(Math.floor(t), 4))
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

  // Badge do losango por subtipo:
  //  - Monstro (issue #19): a divisão é por FM `Tier` (não têm Nível) — o
  //    losango NVL do design vira TIER, rótulo verbatim do badge do plugin
  //    (header-monstro.ts:107) e número = FM Tier, cor via monsterTierColor.
  //  - Companheiro Animal (issue #18): NVL colorido pelo tier do nível,
  //    mesma lógica/registro dos heróis (tierFromLevel + partyTierBar).
  //  - Demais (Pessoas): losango NVL do design, sem cor de tier.
  const subtype = doc?.subtype ?? entry.subtype
  const isMonstro = subtype === 'Monstro'
  const tierFm = doc?.frontmatter['Tier']
  const tierNum =
    isMonstro && tierFm != null && tierFm !== '' && Number.isFinite(Number(tierFm))
      ? Number(tierFm)
      : null
  const badgeLabel = isMonstro ? 'TIER' : 'NVL'
  const badgeNum = isMonstro ? (tierNum != null ? String(tierNum) : '—') : nivel || '—'
  const badgeCor = isMonstro
    ? tierNum != null
      ? monsterTierColor(tierNum)
      : null
    : subtype === 'Companheiro Animal' && nivel
      ? tierBarColor(tierFromLevel(doc?.frontmatter['Nível']))
      : null

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
        <span
          className="npc-nvl-diamond"
          aria-hidden
          style={badgeCor ? { borderColor: badgeCor } : undefined}
        />
        <div className="npc-nvl-inner">
          <span className="npc-nvl-label">{badgeLabel}</span>
          <span className="npc-nvl-num" style={badgeCor ? { color: badgeCor } : undefined}>
            {badgeNum}
          </span>
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
