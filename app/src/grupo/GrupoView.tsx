// Página do grupo — markup/estilos VERBATIM da seção ===== GRUPOS ===== do
// design puxado (design/pulled/Companion App.dc.html), sem personagem
// claimed: recebe o doc do grupo e liga os dados reais.
// Abas (GRUPO_TABS) navegam um track deslizante ([data-track data-track-auto]
// do design: translateX(-idx*100%) + altura do painel ativo); trocar de aba
// limpa o tooltip (grupoTabs do design: setState({grupoTab,gtip:null})).
// O build do grupo no renderVals (cauda recuperada do pull) define:
//   - grpCycleSort/grpSort + applySort/headMap → sort.ts;
//   - buildGtip/gtipShow/gtipMove/gtipHide + window.__GTIPS → gtip.tsx/gtips.ts;
//   - roleCols, nameCor/weight, dltCor, chaves tipE ('bal:r<gi>c<n>', ...).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { clip, PanelTrack, TrackPanel } from '../components/ficha/bits'
import { heroPath } from '../paths'
import { useCatalog } from '../data/CatalogContext'
import { migrateGroupState } from '../data/group-store'
import { MESA_GRUPO_ID, mesaApelidos, useLiveSession } from '../data/session-repo/live-session'
import { useSessionRepo } from '../data/session-repo/provider'
import { useSessions } from '../data/session-store'
import { useSettings } from '../settings'
import { useAssetIndex } from '../data/assets'
import { useDoc, useDocs } from '../data/useDoc'
import {
  availableMemberEntries,
  getLocalEntity,
  groupBaseMemberIds,
  isLocalId,
  setGroupMember,
  setLocalEntityBasename,
  useGroupMembers,
  useLocalStoreVersion,
} from '../data/local-entities'
import type { IndexDocEntry } from '../data/types'
import { familiaOfEntry } from '../data/familia'
import { linkLabel } from '../markdown/dataview-value'
import {
  BAL_CAPTION,
  PAPEIS,
  groupTotals,
  papelValues,
  rankColors,
  rankLetter,
  sintoniaEmoji,
  tierBarColor,
  tierFromLevel,
  type Papel,
  type PapelValues,
} from './party'
import { orderAlphabetical } from './order'
import { NameCell, SortHead, papelTdWarnStyle, rowShellStyle, sectionTitleStyle } from './panel-ui'
import { applySort, cycleSort, sortArrow, type GrpSort } from './sort'
import { useGrupoTip, type GrupoTip } from './gtip'
import { useEntityImageUrl } from '../data/images'
import { LocalImageUpload } from '../components/ficha/PerfilTab'
import { resolveGroupImageUrl } from './group-image'
import { useMesaGroupImageUrl } from './use-mesa-group-image'
import { PanelExploracao } from './PanelExploracao'
import { PanelInventario } from './PanelInventario'
import { PanelVida } from './PanelVida'
import { PanelRiqueza } from './PanelRiqueza'
import { PanelDestaques } from './PanelDestaques'
import { PanelAtaques } from './PanelAtaques'

// Verbatim do script do design (GRUPO_TABS / GRUPO.balHeads / roleCols).
// EXPLORAÇÃO (issue #36) é extensão sancionada: nova PRIMEIRA aba, sem
// design dedicado — as demais mantêm a ordem do design.
const GRUPO_TABS = [
  { id: 'exploracao', label: 'EXPLORAÇÃO' },
  // #333: INVENTÁRIO logo depois de EXPLORAÇÃO. As abas mapeiam 1:1 (por índice)
  // com os TrackPanel abaixo — inserir aqui exige o painel na MESMA posição.
  { id: 'inventario', label: 'INVENTÁRIO' },
  { id: 'papeis', label: 'PAPÉIS' },
  { id: 'competencias', label: 'COMPETÊNCIAS' },
  { id: 'riqueza', label: 'RIQUEZA' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'ataques', label: 'ATAQUES' },
]

/** #338: fila de abas com rolagem horizontal — a RODA do mouse rola de lado
 *  (desktop) e uma SETINHA aparece à direita/esquerda quando há abas fora da tela.
 *  As setas são só em telas maiores (≥720px): no toque o swipe já resolve. */
function ScrollTabsRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ov, setOv] = useState({ left: false, right: false })
  const [wide, setWide] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // roda VERTICAL do mouse → rolagem HORIZONTAL das abas.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      if (el.scrollWidth <= el.clientWidth) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      setOv({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', update, { passive: true })
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', update)
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 720px)') : null
    if (!mq) return
    const u = () => setWide(mq.matches)
    u()
    mq.addEventListener?.('change', u)
    return () => mq.removeEventListener?.('change', u)
  }, [])

  const scroll = (dir: 1 | -1) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * Math.max(140, el.clientWidth * 0.6), behavior: 'smooth' })
  }
  const seta = (dir: 1 | -1, show: boolean): ReactNode =>
    wide && show ? (
      <button
        type="button"
        aria-label={dir === 1 ? 'Ver mais abas' : 'Ver abas anteriores'}
        onClick={() => scroll(dir)}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 1,
          ...(dir === 1 ? { right: 0 } : { left: 0 }),
          width: 38,
          display: 'flex',
          alignItems: 'center',
          justifyContent: dir === 1 ? 'flex-end' : 'flex-start',
          padding: dir === 1 ? '0 7px 0 0' : '0 0 0 7px',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--accent)',
          fontSize: 19,
          fontWeight: 700,
          background:
            dir === 1
              ? 'linear-gradient(to right, transparent, var(--bg) 60%)'
              : 'linear-gradient(to left, transparent, var(--bg) 60%)',
        }}
      >
        {dir === 1 ? '›' : '‹'}
      </button>
    ) : null

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} className="tabs-scroll" style={style}>
        {children}
      </div>
      {seta(-1, ov.left)}
      {seta(1, ov.right)}
    </div>
  )
}
const ROLE_COLS = ['#4ade80', '#c084fc', '#f87171', '#60a5fa']
const BAL_HEADS: { ic: string; l: string; cor: string; papel?: (typeof PAPEIS)[number] }[] = [
  { ic: '🎖️', l: 'TIR', cor: 'var(--accent)' },
  { ic: '★', l: 'LID', cor: ROLE_COLS[0]!, papel: 'Lider' },
  { ic: '★', l: 'CON', cor: ROLE_COLS[1]!, papel: 'Controlador' },
  { ic: '★', l: 'ABT', cor: ROLE_COLS[2]!, papel: 'Abatedor' },
  { ic: '★', l: 'VAN', cor: ROLE_COLS[3]!, papel: 'Vanguarda' },
]

const rowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(240px,3fr) minmax(64px,.7fr) repeat(4,minmax(56px,1fr))',
  gap: 6,
  alignItems: 'center',
}

/**
 * Célula de estrelas do design: 1ª estrela, guia tracejada, resto, e "+"
 * (plus do build; cor do "+" = t.cor). O markup lê t.s1.c/t.s1.o e t.rest,
 * mas o build recuperado só fornece slots:[{on}] + cor — o enriquecimento
 * s1/rest não existe em lugar nenhum do pull; a opacidade da estrela vazia
 * (0.18) é a única aproximação restante.
 */
function StarCell({
  value,
  cor,
  warn,
  onTipEnter,
  tip,
}: {
  value: number
  cor: string
  /** Coluna com soma do Grupo <1 estrela → aviso do plugin (papelTdWarnStyle). */
  warn?: boolean
  onTipEnter?: (e: React.MouseEvent) => void
  tip?: GrupoTip
}) {
  const slots = [0, 1, 2].map((k) => k < value)
  const star = (on: boolean, key: number) => (
    <span key={key} style={{ fontSize: 15, lineHeight: 1, color: cor, opacity: on ? 1 : 0.18 }}>
      ★
    </span>
  )
  return (
    <div
      onMouseEnter={onTipEnter}
      onMouseMove={tip?.move}
      onMouseLeave={tip?.hide}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        cursor: 'help',
        ...(warn ? papelTdWarnStyle : null),
      }}
    >
      {star(slots[0]!, 0)}
      <span
        style={{
          width: 0,
          alignSelf: 'stretch',
          borderLeft: '1px dashed color-mix(in srgb,var(--muted) 60%,transparent)',
          margin: '1px -1.5px',
        }}
      />
      {star(slots[1]!, 1)}
      {star(slots[2]!, 2)}
      {value > 3 ? (
        <span style={{ fontSize: 12, color: cor, marginLeft: 2, fontWeight: 700 }}>+</span>
      ) : null}
    </div>
  )
}

interface BalRowData {
  id: string
  label: string
  em: string | null
  tier: number
  values: PapelValues
  grupo: boolean
  /** gi do design: índice na lista original (gidx antes do applySort). */
  gi: number
}

function BalRow({
  row,
  tierUnbalanced,
  warnCols,
  tip,
}: {
  row: BalRowData
  /** Tier divergente entre membros (section-papel.ts:50) — só células de membro. */
  tierUnbalanced: boolean
  /** Papéis com soma do Grupo <1 (section-papel.ts:136/161) — membros E linha Grupo. */
  warnCols: Record<Papel, boolean>
  tip?: GrupoTip
}) {
  const g = row.grupo ? 1 : 0
  const navigate = useNavigate()
  return (
    <div style={{ ...rowGrid, ...rowShellStyle(row.grupo) }}>
      <NameCell
        name={row.label}
        em={row.em}
        weight={row.grupo ? 800 : 600}
        cor={row.grupo ? 'var(--accent)' : 'var(--text)'}
        onTipEnter={row.grupo ? tip?.tipE('bal:r5c0') : undefined}
        onOpen={row.grupo ? undefined : () => navigate(heroPath(row.id))}
        tip={tip}
      />
      <div
        onMouseEnter={tip?.tipE(`bal:r${row.gi}c1`)}
        onClick={tip?.tipE(`bal:r${row.gi}c1`)}
        onMouseMove={tip?.move}
        onMouseLeave={tip?.hide}
        style={{
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'help',
          color: `color-mix(in srgb,var(--accent) ${g * 55}%,var(--text))`,
          // Plugin: célula de tier de MEMBRO recebe o warn quando os tiers
          // divergem (section-papel.ts:127); a linha Grupo não (ts:154-159).
          ...(tierUnbalanced && !row.grupo ? papelTdWarnStyle : null),
        }}
      >
        Tier {row.tier}
      </div>
      {BAL_HEADS.slice(1).map((head, i) => (
        <StarCell
          key={head.l}
          value={row.values[head.papel!]}
          cor={ROLE_COLS[i] || 'var(--accent)'}
          warn={warnCols[head.papel!]}
          onTipEnter={tip?.tipE(`bal:r${row.gi}c${i + 2}`)}
          tip={tip}
        />
      ))}
    </div>
  )
}

/** Painel "BALANCEAMENTO DE PAPÉIS" (aba PAPÉIS) — dados espelham
 *  section-papel.ts; lista original alfabética (orderMembersAlphabetical =
 *  ordem de G.balRows do design); applySort: coluna clicada ou classe pt. */
function PanelBalanceamento({
  rows,
  tierUnbalanced,
  warnCols,
  tip,
}: {
  rows: BalRowData[]
  tierUnbalanced: boolean
  warnCols: Record<Papel, boolean>
  tip?: GrupoTip
}) {
  const [sort, setSort] = useState<GrpSort | null>(null)
  const sorted = applySort(
    rows,
    sort,
    (r, c) => (c === 0 ? r.tier : r.values[PAPEIS[c - 1]!] || 0),
    (r) => r.label,
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>{'// BALANCEAMENTO DE PAPÉIS'}</div>
      <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
        <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...rowGrid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
            <div />
            {BAL_HEADS.map((head, i) => (
              <SortHead
                key={head.l}
                ic={head.ic}
                label={head.l}
                fontSize={9}
                letterSpacing=".06em"
                icColor={head.cor}
                active={sort?.col === i}
                arr={sortArrow(sort, i)}
                warn={i === 0 && tierUnbalanced}
                onClick={() => setSort((s) => cycleSort(s, i))}
                onTipEnter={tip?.tipE(`bal:h${i + 1}`)}
                tip={tip}
              />
            ))}
          </div>
          {sorted.map((row) => (
            <BalRow
              key={row.id}
              row={row}
              tierUnbalanced={tierUnbalanced}
              warnCols={warnCols}
              tip={tip}
            />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
        {BAL_CAPTION}
      </div>
    </div>
  )
}

/** Modal "Editar Integrantes" (issue #44): adiciona/remove membros do grupo a
 *  partir das criaturas disponíveis (catálogo + locais). A edição vive no store
 *  local (membershipOverride) sem tocar a vault; balanceamento/agregados
 *  recomputam na hora porque o GrupoView observa a versão do store. Linguagem
 *  visual existente (painel panel2/line2 com clip, rótulos mono sóbrios). */
function EditMembersModal({
  groupId,
  memberIds,
  onClose,
}: {
  groupId: string
  memberIds: Set<string>
  onClose: () => void
}) {
  const catalog = useCatalog()
  const version = useLocalStoreVersion()
  const [q, setQ] = useState('')
  const baseIds = useMemo(() => groupBaseMemberIds(catalog, groupId), [catalog, groupId])
  const disponiveis = useMemo(() => {
    const list = availableMemberEntries(catalog)
    return list.sort((a, b) =>
      (a.basename ?? a.id).localeCompare(b.basename ?? b.id, 'pt'),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, version])
  const termo = q.trim().toLowerCase()
  const filtrados = termo
    ? disponiveis.filter((e) => (e.basename ?? e.id).toLowerCase().includes(termo))
    : disponiveis

  const toggle = (entry: IndexDocEntry) => {
    setGroupMember(groupId, entry.id, !memberIds.has(entry.id), baseIds)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,.5)' }} />
      <div
        role="dialog"
        aria-label="Editar Integrantes"
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 60,
          width: 'min(460px,92vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'var(--panel2)',
          border: '1px solid var(--line2)',
          clipPath: clip(14),
          padding: 18,
          boxShadow: '0 18px 46px rgba(0,0,0,.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.12em',
              color: 'var(--muted)',
            }}
          >
            {'// EDITAR INTEGRANTES'}
          </span>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--muted)',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <input
          aria-label="Buscar criatura"
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 13,
            outline: 'none',
            clipPath: clip(7),
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
            maxHeight: '52vh',
          }}
        >
          {filtrados.map((entry) => {
            const on = memberIds.has(entry.id)
            const nome = entry.basename ?? entry.id
            return (
              <button
                key={entry.id}
                onClick={() => toggle(entry)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: on ? 'color-mix(in srgb,var(--accent) 12%,var(--card))' : 'var(--card)',
                  border: `1px solid ${on ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : 'var(--line2)'}`,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  textAlign: 'left',
                  clipPath: clip(6),
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flex: 'none',
                    width: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
                    background: on ? 'var(--accent)' : 'transparent',
                    color: 'var(--ink)',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {on ? '✓' : ''}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nome}
                </span>
                <span
                  style={{
                    flex: 'none',
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    letterSpacing: '.06em',
                    color: 'var(--muted)',
                  }}
                >
                  {entry.subtype ?? ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

/** Comprime a imagem pro state da sessão (#235): ~384px JPEG — o state é
 *  jsonb, não storage; sem canvas (jsdom) vai o data-url original. */
async function comprimirImagem(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })
    const escala = Math.min(1, 384 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * escala))
    canvas.height = Math.max(1, Math.round(img.height * escala))
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return dataUrl
  }
}

export function GrupoView({ groupId }: { groupId: string }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const { doc: groupDoc } = useDoc(groupId)
  const [tab, setTab] = useState('exploracao')
  const [editMembers, setEditMembers] = useState(false)
  const tabIdx = Math.max(0, GRUPO_TABS.findIndex((t) => t.id === tab))
  const tip = useGrupoTip()

  // Integrantes reativos ao override local (issue #44); grupo local (issue #43)
  // resolve os membros do próprio registro.
  const members = useGroupMembers(catalog, groupId)
  const memberDocs = useDocs(useMemo(() => members.map((m) => m.id), [members]))
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  const isLocalGroup = isLocalId(groupId)
  const isMesa = groupId === MESA_GRUPO_ID
  const { active: sessaoAtiva } = useSessions()
  const live = useLiveSession()
  // A mesa usa MESA_GRUPO_ID (constante) em TODA sessão, mas o group-store do
  // mapa (caminho percorrido) é local e keyed por groupId — então a trilha
  // VAZAVA entre sessões. Escopa o store da exploração da mesa por sessão.
  const exploId = isMesa && live?.sessionId ? `${MESA_GRUPO_ID}:${live.sessionId}` : groupId
  // Porta a exploração ANTIGA (keyed pela constante MESA_GRUPO_ID, órfã ao
  // escopar por sessão) pro escopo desta sessão — uma vez, ao abrir a mesa. Só
  // migra se o escopo novo está vazio; depois limpa a antiga (não revaza).
  useEffect(() => {
    if (isMesa && live?.sessionId) migrateGroupState(MESA_GRUPO_ID, exploId)
  }, [isMesa, live?.sessionId, exploId])
  const repo = useSessionRepo()
  const localGroup = isLocalGroup ? getLocalEntity(groupId) : undefined
  const entry = catalog.entryById.get(groupId)
  // #235: nome da mesa = APELIDOS dos heróis em ordem alfabética, ", " —
  // mesma convenção dos grupos da vault ("Baitaca, Carlos, Drauzio").
  const apelidosMesa = mesaApelidos(live?.characters ?? [])
  const names = isMesa
    ? (apelidosMesa.length ? apelidosMesa.join(', ') : (sessaoAtiva?.nome ?? 'Grupo da Sessão'))
    : (localGroup?.basename ?? entry?.basename ?? groupId)
  const subcategoria =
    typeof groupDoc?.frontmatter['subcategoria'] === 'string'
      ? (groupDoc.frontmatter['subcategoria'] as string)
      : ''
  // Retrato local-first (issue #197): imagem subida pro grupo LOCAL tem
  // precedência; senão a hierarquia da vault (resolveGroupImageUrl). Só grupos
  // locais têm upload, então pra grupo da vault o hook resolve null e nada muda.
  const localImage = useEntityImageUrl(groupId)
  // #74 (feedback do mestre): a MESA herda a imagem do grupo persistente dos
  // heróis (ex.: "Aventureiros") quando não tem imagem própria — mesma fonte que
  // o botão FICHA DO GRUPO da sidebar usa, pra não divergirem.
  const mesaImage = useMesaGroupImageUrl()
  // #291: só quem está com MODO MESTRE ativado troca a imagem da mesa (a RLS da
  // sessão só deixa o GM escrever; sem o gate, um jogador comum tentava e falhava
  // em silêncio). Decisão do usuário: gate pelo Modo Mestre, não pelo gmUserId.
  const { mestre } = useSettings()
  const imageUrl = isMesa
    ? mesaImage
    : (localImage ?? resolveGroupImageUrl(groupDoc, entry?.basename, assets))
  // #235/#291: quem está com MODO MESTRE troca a imagem da mesa (afordância
  // gated acima) — vai pro state da sessão (sincroniza pra todos via realtime).
  const trocarImagemMesa = async (file: File) => {
    const remoteId = sessaoAtiva?.remoteId
    if (!repo || !remoteId) return
    const dataUrl = await comprimirImagem(file)
    await repo.updateSessionState(remoteId, { grupoImagem: dataUrl })
  }

  // Lista original alfabética (espelha orderMembersAlphabetical / G.balRows).
  // #236: Companheiro Animal fora do balanceamento de papéis — a família
  // decide no registro central (familiaOfEntry ← data/familia.ts).
  const balMembers = members.filter((m) => familiaOfEntry(m) !== 'CompanheiroAnimal')
  const balRows: BalRowData[] = orderAlphabetical(balMembers).map((member, i) => {
    const doc = memberDocs?.get(member.id)
    return {
      id: member.id,
      label: linkLabel(doc?.frontmatter['Classe']) || member.basename || member.id,
      em: sintoniaEmoji(doc),
      tier: tierFromLevel(doc?.frontmatter['Nível']),
      values: papelValues(doc),
      grupo: false,
      gi: i,
    }
  })
  const maxTier = balRows.length ? Math.max(...balRows.map((r) => r.tier)) : 1
  const totals = groupTotals(balRows.map((r) => r.values))
  const rank = rankLetter(groupDoc?.frontmatter ?? {}, maxTier)
  // Cores do rank/barrinha via registro (tiers-display.ts espelhado em party.ts).
  const rk = rankColors(rank)
  const barColor = tierBarColor(maxTier)
  // Avisos do plugin (section-papel.ts): tiers de MEMBRO divergentes (ts:50)
  // e papéis com soma do Grupo <1 estrela (ts:136/161).
  const tierUnbalanced = new Set(balRows.map((r) => r.tier)).size > 1
  const warnCols = Object.fromEntries(PAPEIS.map((p) => [p, totals[p] < 1])) as Record<
    Papel,
    boolean
  >
  const balAll: BalRowData[] = [
    ...balRows,
    { id: '::grupo', label: 'Grupo', em: null, tier: maxTier, values: totals, grupo: true, gi: balRows.length },
  ]

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* HEADER (verbatim do design) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.16em',
              color: 'var(--accent)',
              background: 'color-mix(in srgb,var(--accent) 12%,transparent)',
              border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
              padding: '5px 12px',
              clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))',
            }}
          >
            GRUPO{subcategoria ? ` · ${subcategoria.toUpperCase()}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          {/* Rank box do design com as cores do registro partyBountyRank —
              espelha o rankBadge do plugin (render-party-sheet.ts:215-219:
              color/bg/border = rk.*) e o glow via --party-glow (styles.css:12420). */}
          <span
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--display)',
              fontSize: 22,
              fontWeight: 800,
              color: rk.color,
              background: rk.bg,
              border: `1.5px solid ${rk.color}`,
              clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
              boxShadow: `0 0 18px ${rk.glow}`,
            }}
          >
            {rank}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Slot 60×60: imagem do grupo (espelha resolveGroupImage do plugin);
              fallback ⚔️ verbatim do design. */}
          <span
            style={{
              width: 60,
              height: 60,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              overflow: 'hidden',
              position: 'relative',
              background:
                'linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,var(--card)),var(--panel2))',
              border: '1px solid color-mix(in srgb,var(--accent) 35%,var(--line2))',
              clipPath: 'polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,11px 100%,0 calc(100% - 11px))',
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              '⚔️'
            )}
            {isMesa && repo && sessaoAtiva?.remoteId && mestre ? (
              <label
                title="Trocar imagem do grupo"
                style={{
                  position: 'absolute',
                  right: 4,
                  bottom: 4,
                  padding: '3px 7px',
                  background: 'rgba(0,0,0,.55)',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                📷
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Trocar imagem do grupo"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void trocarImagemMesa(f)
                    e.target.value = ''
                  }}
                />
              </label>
            ) : null}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLocalGroup ? (
              // #43: nome do grupo local é editável no header (persiste no store)
              <input
                aria-label="Nome do grupo"
                value={names}
                onChange={(e) => setLocalEntityBasename(groupId, e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: 'var(--display)',
                  lineHeight: 1.1,
                  color: 'var(--text)',
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderBottom: '1px solid var(--line2)',
                  outline: 'none',
                  padding: '2px 0',
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: 'var(--display)',
                  lineHeight: 1.1,
                  color: 'var(--text)',
                }}
              >
                {names}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '.1em',
                color: 'var(--muted)',
                marginTop: 4,
              }}
            >
              <span>{members.length} integrantes</span>
              {/* #44: editar integrantes (add/remove) — override local.
                  #231: a MESA não edita — os integrantes vêm da sessão. */}
              {isMesa ? null : (
              <button
                onClick={() => setEditMembers(true)}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  color: 'var(--accent)',
                  background: 'transparent',
                  border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                  padding: '3px 9px',
                  cursor: 'pointer',
                  clipPath: clip(6),
                }}
              >
                ✎ Editar
              </button>
              )}
              {/* #197: retrato do grupo LOCAL — subir/remover imagem no slot
                  60×60 do header (mesmo controle do Perfil). */}
              {isLocalGroup ? <LocalImageUpload id={groupId} /> : null}
            </div>
          </div>
        </div>
        {/* Barrinha lateral = tier máximo do grupo — gradiente verbatim do
            plugin (render-party-sheet.ts:208) com a cor do registro partyTierBar. */}
        <div
          style={{
            position: 'absolute',
            left: -24,
            top: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(180deg,${barColor},color-mix(in srgb,${barColor} 60%,black))`,
            opacity: 0.7,
          }}
        />
      </div>

      {/* TABS (navegação real — grupoTabs do design limpa o gtip ao trocar).
          #334: usa o .tabs-scroll compartilhado (rolagem horizontal arrastável no
          toque, -webkit-overflow-scrolling) — igual às abas de ficha/inventário;
          antes era um overflow inline sem o touch scroll e não rolava de lado. */}
      <ScrollTabsRow style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginTop: 2, minWidth: 0 }}>
        {GRUPO_TABS.map((t) => {
          const on = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                tip.clear()
              }}
              style={{
                flex: 'none',
                padding: '11px 16px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.1em',
                color: on ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </ScrollTabsRow>

      {/* TRACK deslizante (data-track data-track-auto do design) */}
      <PanelTrack index={tabIdx}>
        <TrackPanel pad="0">
          <PanelExploracao key={exploId} groupId={exploId} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelInventario groupId={groupId} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelBalanceamento
            rows={balAll}
            tierUnbalanced={tierUnbalanced}
            warnCols={warnCols}
            tip={tip}
          />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelVida members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelRiqueza members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelDestaques members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelAtaques members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
      </PanelTrack>

      {/* Tooltip flutuante (sc-if grupo.gtip do design) */}
      {tip.overlay}

      {/* Editar Integrantes (issue #44) */}
      {editMembers ? (
        <EditMembersModal
          groupId={groupId}
          memberIds={memberIds}
          onClose={() => setEditMembers(false)}
        />
      ) : null}
    </div>
  )
}
