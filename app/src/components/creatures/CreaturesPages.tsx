import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSettings } from '../../settings'
import { useAssetIndex } from '../../data/assets'
import { creatureImageUrl, groupImageUrl } from '../../data/creature-image'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc, useDocs } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath, heroPath } from '../../paths'
import { tokens } from '../../generated/tokens'
import { GrupoView } from '../../grupo/GrupoView'
import { clip, PanelTrack, TrackPanel } from '../ficha/bits'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  emptyGroupFrontmatter,
  emptyHeroFrontmatter,
  emptyMonstroFrontmatter,
  getLocalDoc,
  isLocalId,
  localEntriesOfKind,
  PESSOA_RELACOES,
  pessoaFrontmatter,
  resolveGroupMembers,
  useLocalStoreVersion,
  type LocalKind,
} from '../../data/local-entities'
import {
  GRUPOS_FOLDER,
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

// ── Agrupamento por tier (issue #31) ──────────────────────────────────────
// HERÓIS, COMPANHEIROS ANIMAIS e BESTIÁRIO agrupados por tier decrescente
// (S → C) e alfabéticos (pt) dentro do grupo. A letra vem do registro
// espelhado em party.ts: rankLetter({}, tier) ≡ fallbackRankLetterFromTier
// do plugin (tiers-display.ts:44); nada de mapa novo aqui.

/** Tier de herói/CA — tierFromLevel do FM Nível (mesma fonte do badge NVL). */
function tierOfNivel(doc?: VaultDoc): number {
  return tierFromLevel(doc?.frontmatter['Nível'])
}

/** Tier de monstro — FM `Tier` direto (mesma fonte do badge TIER do design);
 *  sem Tier vira NaN e cai no C do fallback, como tier fora de faixa. */
function tierOfFmTier(doc?: VaultDoc): number {
  return Number(doc?.frontmatter['Tier'])
}

const TIER_GROUP_LETTERS = ['S', 'A', 'B', 'C'] as const
const ptAlpha = new Intl.Collator('pt')

/** Grupos ordenados S→C, alfabéticos dentro; grupo vazio não aparece. */
function tierGroups(
  entries: IndexDocEntry[],
  docs: Map<string, VaultDoc>,
  tierOf: (doc?: VaultDoc) => number,
): { letter: string; entries: IndexDocEntry[] }[] {
  const byLetter = new Map<string, IndexDocEntry[]>()
  for (const entry of entries) {
    const letter = rankLetter({}, tierOf(docs.get(entry.id)))
    const bucket = byLetter.get(letter)
    if (bucket) bucket.push(entry)
    else byLetter.set(letter, [entry])
  }
  return TIER_GROUP_LETTERS.filter((letter) => byLetter.has(letter)).map((letter) => ({
    letter,
    entries: byLetter
      .get(letter)!
      .sort((a, b) => ptAlpha.compare(a.basename ?? a.id, b.basename ?? b.id)),
  }))
}

/** Cabeçalho do grupo — kicker mono já usado no app (`// ...`), com a letra
 *  na cor do registro partyBountyRank (rankColors). Extensão sancionada pelo
 *  usuário na issue #31; nenhum chrome novo além do kicker existente. */
function TierKicker({ letter }: { letter: string }) {
  return (
    <div className="kicker">
      {'// TIER '}
      <span style={{ color: rankColors(letter).color }}>{letter}</span>
    </div>
  )
}

// Abas verbatim do NPC_TABS do design; a pasta da vault é a fonte real de
// cada uma (aba sem pasta correspondente rende o empty state desenhado).
// `tierOf` liga o agrupamento da issue #31 (PESSOAS fica sem agrupamento).
const NPC_TABS: {
  id: string
  label: string
  folder: string
  tierOf?: (doc?: VaultDoc) => number
  localKind: LocalKind
}[] = [
  { id: 'pessoas', label: 'PESSOAS', folder: 'Sistema/Criaturas/Pessoas', localKind: 'Pessoa' },
  {
    id: 'companheiros',
    label: 'COMPANHEIROS ANIMAIS',
    folder: 'Sistema/Criaturas/Companheiros Animais',
    tierOf: tierOfNivel,
    localKind: 'CompanheiroAnimal',
  },
  {
    id: 'bestiario',
    label: 'BESTIÁRIO',
    folder: 'Sistema/Criaturas/Bestiário',
    tierOf: tierOfFmTier,
    localKind: 'Monstro',
  },
]

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** Texto plano de um valor FM que pode ser wikilink ("[[Mago|Mago]]" → "Mago"). */
function plainLabel(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string' || !value) return ''
  const match = WIKI.exec(value)
  return match ? (match[2] ?? match[1]) : value
}

/** Iniciais pro slot sem retrato (h.ini do design: "Carlos Facão…" → "CF").
 *  Exportada pro avatar da topbar (issue #34) usar o MESMO fallback dos cards. */
export function initials(name: string): string {
  const words = name.split(/[\s,]+/).filter((w) => w.length > 2)
  const two = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (two || name.slice(0, 2)).toUpperCase()
}

/** Docs de uma pasta (sem a folder note), com os JSONs carregados em lote.
 *  `localKind` mescla as entidades LOCAIS da família na lista (issues #42/#45–
 *  #47): entries locais aparecem junto das da vault e seus docs entram no mapa. */
function useFolderDocs(folder: string, localKind?: LocalKind) {
  const catalog = useCatalog()
  const version = useLocalStoreVersion()
  const node = catalog.folderByPath.get(folder)
  const vaultEntries = useMemo(
    () => (node ? node.docs.filter((d) => d.basename !== node.name) : []),
    [node],
  )
  const localEntries = useMemo(
    () => (localKind ? localEntriesOfKind(localKind) : []),
    [localKind, version],
  )
  const entries = useMemo(
    () => [...vaultEntries, ...localEntries],
    [vaultEntries, localEntries],
  )
  const [vaultDocs, setVaultDocs] = useState<Map<string, VaultDoc>>()

  useEffect(() => {
    if (!vaultEntries.length) {
      setVaultDocs(undefined)
      return
    }
    let alive = true
    Promise.all(vaultEntries.map((entry) => loadDoc(entry.id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setVaultDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [vaultEntries])

  const docs = useMemo(() => {
    // Enquanto os docs da vault não chegam, preserva o loading (lista plana);
    // se a pasta é vazia (só locais), monta o mapa na hora.
    if (vaultDocs === undefined && vaultEntries.length > 0) return undefined
    const byId = new Map<string, VaultDoc>(vaultDocs ?? [])
    for (const entry of localEntries) {
      const doc = getLocalDoc(entry.id)
      if (doc) byId.set(entry.id, doc)
    }
    return byId
  }, [vaultDocs, vaultEntries, localEntries])

  return { entries, docs }
}

/** Botão flutuante de criação — MESMO padrão fixed do "+ Adicionar Arma" do
 *  inventário (dc.html:707 right:26 bottom:22 z40; botão accent com clip),
 *  sem o ▾ porque é ação direta (não abre menu). Issue #42 pede explícito
 *  igual Inventário/Armas. */
function CreateFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 26,
        bottom: 22,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '11px 18px',
        background: 'var(--accent)',
        border: '1px solid var(--accent)',
        color: 'var(--ink)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '.02em',
        boxShadow: '0 10px 26px rgba(0,0,0,.42)',
        clipPath: clip(9),
      }}
    >
      {label}
    </button>
  )
}

/* ===================== formulário de Pessoa (issue #45) ===================== */

const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.08em',
  color: 'var(--muted)',
  marginBottom: 6,
  display: 'block',
}
const fieldInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  clipPath: clip(7),
}

/** Modal "+ Adicionar Pessoa": campos do #45 (Nome, Relação, Organização,
 *  Posição, Detalhes) na linguagem visual existente (pills/selects do design,
 *  strings sóbrias — não há tela desenhada pra este form). */
function PessoaForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (fields: {
    Nome: string
    Relação: string
    Organização: string
    Posição: string
    Detalhes: string
  }) => void
  onClose: () => void
}) {
  const [nome, setNome] = useState('')
  const [relacao, setRelacao] = useState<string>(PESSOA_RELACOES[0])
  const [organizacao, setOrganizacao] = useState('')
  const [posicao, setPosicao] = useState('')
  const [detalhes, setDetalhes] = useState('')

  const submit = () => {
    const Nome = nome.trim()
    if (!Nome) return
    onSubmit({
      Nome,
      Relação: relacao,
      Organização: organizacao.trim(),
      Posição: posicao.trim(),
      Detalhes: detalhes.trim(),
    })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.5)' }} />
      <div
        role="dialog"
        aria-label="Adicionar Pessoa"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 60,
          width: 'min(460px,92vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: 'var(--panel2)',
          border: '1px solid var(--line2)',
          clipPath: clip(14),
          padding: 20,
          boxShadow: '0 18px 46px rgba(0,0,0,.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '.12em',
            color: 'var(--muted)',
          }}
        >
          {'// NOVA PESSOA'}
        </div>
        <label>
          <span style={fieldLabelStyle}>NOME</span>
          <input
            aria-label="Nome"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={fieldInputStyle}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>RELAÇÃO</span>
          <select
            aria-label="Relação"
            value={relacao}
            onChange={(e) => setRelacao(e.target.value)}
            style={{ ...fieldInputStyle, cursor: 'pointer' }}
          >
            {PESSOA_RELACOES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={fieldLabelStyle}>ORGANIZAÇÃO</span>
          <input
            aria-label="Organização"
            value={organizacao}
            onChange={(e) => setOrganizacao(e.target.value)}
            style={fieldInputStyle}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>POSIÇÃO</span>
          <input
            aria-label="Posição"
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            style={fieldInputStyle}
          />
        </label>
        <label>
          <span style={fieldLabelStyle}>DETALHES</span>
          <textarea
            aria-label="Detalhes"
            value={detalhes}
            onChange={(e) => setDetalhes(e.target.value)}
            rows={4}
            style={{ ...fieldInputStyle, resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              border: '1px solid var(--line2)',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              clipPath: clip(7),
            }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!nome.trim()}
            style={{
              padding: '9px 16px',
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              color: 'var(--ink)',
              cursor: nome.trim() ? 'pointer' : 'not-allowed',
              opacity: nome.trim() ? 1 : 0.5,
              fontSize: 13,
              fontWeight: 700,
              clipPath: clip(7),
            }}
          >
            Adicionar
          </button>
        </div>
      </div>
    </>
  )
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
  const version = useLocalStoreVersion()
  const groups = useMemo(() => {
    const node = catalog.folderByPath.get(GRUPOS_FOLDER)
    const vault = node ? node.docs.filter((d) => d.basename !== node.name) : []
    // grupos locais (issue #43) entram na lista de GRUPOS junto dos da vault
    return [...vault, ...localEntriesOfKind('Grupo')]
  }, [catalog, version])
  const membersByGroup = useMemo(
    () => new Map(groups.map((g) => [g.id, resolveGroupMembers(catalog, g.id)])),
    [catalog, groups, version],
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
  const { entries, docs } = useFolderDocs(HEROIS_FOLDER, 'Heroi')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const selectedGroup = searchParams.get('grupo')
  const [tab, setTab] = useState(selectedGroup ? 'grupos' : 'herois')
  const index = Math.max(0, HEROIS_TABS.findIndex((t) => t.id === tab))

  const selectGroup = (id: string | null) => {
    setSearchParams(id ? { grupo: id } : {})
    if (id) setTab('grupos')
  }

  // #42: cria herói local em branco (skeleton válido) e abre a ficha pra
  // montar via rule elements (a cascata fica com outra parte).
  const criarHeroi = () => {
    const id = createLocalEntity('Heroi', 'Novo Herói', emptyHeroFrontmatter())
    navigate(heroPath(id))
  }
  // #43: cria grupo local e o abre (nome + integrantes editáveis no header).
  const criarGrupo = () => {
    const id = createLocalEntity('Grupo', 'Novo Grupo', emptyGroupFrontmatter())
    selectGroup(id)
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
      <PanelTrack index={index}>
        <TrackPanel pad="0">
          <div className="herois-page">
            {docs
              ? // docs carregados: grupos por tier decrescente (issue #31);
                // lista achatada com key estável por card, pros nós do DOM
                // sobreviverem à transição plano → agrupado
                tierGroups(entries, docs, tierOfNivel).flatMap((group) => [
                  <TierKicker key={`tier-${group.letter}`} letter={group.letter} />,
                  ...group.entries.map((entry) => (
                    <HeroCard key={entry.id} entry={entry} doc={docs.get(entry.id)} />
                  )),
                ])
              : // carregando: lista plana de antes (estado de loading intacto)
                entries.map((entry) => <HeroCard key={entry.id} entry={entry} />)}
          </div>
        </TrackPanel>
        <TrackPanel pad="0">
          <GruposPanel selected={selectedGroup} onSelect={selectGroup} />
        </TrackPanel>
      </PanelTrack>
      {tab === 'herois' ? (
        <CreateFab label="+ Criar Herói" onClick={criarHeroi} />
      ) : !selectedGroup ? (
        <CreateFab label="+ Criar Grupo" onClick={criarGrupo} />
      ) : null}
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
  // Local CA/Monstro abrem a ficha formato herói (issues #46/#47); demais
  // (vault e Pessoa local) mantêm a rota de doc do compêndio.
  const abreFicha = isLocalId(entry.id) && (subtype === 'Companheiro Animal' || subtype === 'Monstro')
  const target = abreFicha ? heroPath(entry.id) : docPath(entry.id)
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
    <button className="npc-card" onClick={() => navigate(target)}>
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

function NpcPanel({
  folder,
  tierOf,
  localKind,
}: {
  folder: string
  tierOf?: (doc?: VaultDoc) => number
  localKind: LocalKind
}) {
  const { entries, docs } = useFolderDocs(folder, localKind)
  return (
    <TrackPanel pad="0">
      <div className="npc-panel-inner">
        {docs && tierOf
          ? // docs carregados: grupos por tier decrescente (issue #31);
            // lista achatada com key estável por card (vide HeroisPage)
            tierGroups(entries, docs, tierOf).flatMap((group) => [
              <TierKicker key={`tier-${group.letter}`} letter={group.letter} />,
              ...group.entries.map((entry) => (
                <NpcCard key={entry.id} entry={entry} doc={docs.get(entry.id)} />
              )),
            ])
          : // carregando (ou aba sem agrupamento): lista plana de antes
            entries.map((entry) => (
              <NpcCard key={entry.id} entry={entry} doc={docs?.get(entry.id)} />
            ))}
        {entries.length === 0 ? (
          <div className="npc-empty">// NENHUM REGISTRO NESTA CATEGORIA</div>
        ) : null}
      </div>
    </TrackPanel>
  )
}

export function NpcsPage() {
  const [tab, setTab] = useState(NPC_TABS[0].id)
  const [pessoaOpen, setPessoaOpen] = useState(false)
  const navigate = useNavigate()
  // Modo Mestre (issue #35): com Mestre OFF a aba BESTIÁRIO fica bloqueada
  // pra clique (convenção :disabled existente — opacity/cursor, sem mensagem
  // nova); reativo via useSettings — se o modo desligar com a aba ativa, a
  // seleção recua pra primeira aba.
  const { mestre } = useSettings()
  const activeTab = !mestre && tab === 'bestiario' ? NPC_TABS[0].id : tab
  const index = NPC_TABS.findIndex((t) => t.id === activeTab)

  // #46: Companheiro Animal local → ficha (família CA: Tutor). #47: Monstro
  // local → ficha formato herói (família Monstro: Tier/Raça).
  const criarCompanheiro = () => {
    const id = createLocalEntity(
      'CompanheiroAnimal',
      'Novo Companheiro',
      emptyCompanheiroFrontmatter('Novo Companheiro'),
    )
    navigate(heroPath(id))
  }
  const criarCriatura = () => {
    const id = createLocalEntity('Monstro', 'Nova Criatura', emptyMonstroFrontmatter())
    navigate(heroPath(id))
  }
  // #45: Pessoa local via formulário → entra na lista de PESSOAS.
  const criarPessoa = (fields: {
    Nome: string
    Relação: string
    Organização: string
    Posição: string
    Detalhes: string
  }) => {
    createLocalEntity('Pessoa', fields.Nome, pessoaFrontmatter(fields))
    setPessoaOpen(false)
  }

  return (
    <div className="npcs-page">
      <div className="npc-tabs">
        {NPC_TABS.map((t) => (
          <button
            key={t.id}
            className={activeTab === t.id ? 'npc-tab on' : 'npc-tab'}
            disabled={t.id === 'bestiario' && !mestre}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PanelTrack index={index}>
        {NPC_TABS.map((t) => (
          <NpcPanel key={t.id} folder={t.folder} tierOf={t.tierOf} localKind={t.localKind} />
        ))}
      </PanelTrack>
      {activeTab === 'pessoas' ? (
        <CreateFab label="+ Adicionar Pessoa" onClick={() => setPessoaOpen(true)} />
      ) : activeTab === 'companheiros' ? (
        <CreateFab label="+ Adicionar Companheiro Animal" onClick={criarCompanheiro} />
      ) : activeTab === 'bestiario' && mestre ? (
        // gating do Modo Mestre (issue #35) também vale pra criação
        <CreateFab label="+ Adicionar Criatura" onClick={criarCriatura} />
      ) : null}
      {pessoaOpen ? (
        <PessoaForm onSubmit={criarPessoa} onClose={() => setPessoaOpen(false)} />
      ) : null}
    </div>
  )
}
