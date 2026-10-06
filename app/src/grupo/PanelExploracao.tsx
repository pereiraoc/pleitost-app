// Aba EXPLORAÇÃO do grupo — hexcrawl do grupo (issues #36/#48 base; #68–#71).
// Tela SEM design dedicado; extensão sancionada na LINGUAGEM VISUAL do design
// puxado: painel de canto cortado (clip do bits.tsx), kicker mono
// "// EXPLORAÇÃO" (sectionTitleStyle), pills accent e barras colapsáveis
// sóbrias (mesmo skin do painel/line2).
//
// #68 REGIÃO ATIVA: um seletor no topo escolhe a REGIÃO do grupo dentre as com
// mapa (REGION_MAPS). O asset do mapa (regionMapById) e o mapeamento
// hex→localização (hexmap-store, namespace da região) exibidos passam a ser os
// DAQUELA região; a escolha persiste por grupo (group-store.regiaoAtiva).
//
// #69 BARRA ESQUERDA (caminho): lista as paradas na ORDEM explícita do caminho.
// "＋ parada" acrescenta ao fim; cada parada tem "inserir acima" e é arrastável
// (HTML5 drag) pra reordenar → a trilha traçada no mapa reflete a ordem.
//
// #70 BARRA DIREITA (info do local): abre ao clicar num hex que TENHA
// localização configurada no mapa da região (cellAt → localId → doc do
// catálogo). Mostra Tipo (subcategoria), Descrição e Recursos — mesma fonte de
// verdade da ficha de Localização (frontmatter), nunca inventado.
//
// #71 TOKEN (moeda): um ícone de grupo com borda arredondada indica o hex ATUAL
// (group-store.atualId, default = última parada). Arrastar o token e SOLTAR num
// hex mostra "Adicionar parada" (→ caminho do #69). Clicar na moeda, se o hex
// atual tiver localização, abre a barra direita com a info do local + a IMAGEM
// da região (que ao clicar abre a página da localização, docPath).
//
// Grade hexagonal (issue #48): overlay SVG da malha flat-top CALIBRADA
// (exploracao.ts) em px da fonte, dentro do mesmo transform (zoom/pan) do mapa.
// O hit-test é MATEMÁTICO (pixelToHex) — o SVG é pointer-events:none.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { clip } from '../components/ficha/bits'
import { InlineFieldValue } from '../components/compendium/InlineFieldValue'
import { useCatalog } from '../data/CatalogContext'
import { assetUrl, resolveAsset, useAssetIndex } from '../data/assets'
import { useDoc, useDocs } from '../data/useDoc'
import { TipProvider, TipHover } from '../components/ficha/tooltips'
import { localTipHtml, LOC_TIP_CSS, wikiStrip } from '../components/ficha/local-tip'
import { docPath } from '../paths'
import { useHexMap } from '../data/useHexMap'
import { MAPA_MUNDO_ID } from '../data/seed-hexmaps'
import { useDetail } from '../data/detail-context'
import { areasAt, cellAt, type HexMapCell } from '../data/hexmap-store'
import { activeContextoDef } from '../data/reskin'
import {
  calcularViagem,
  formatarDias,
  hexLine,
  iconeDoMeio,
  custoHexNoTrecho,
  meioDoTrecho,
  terrenoDoHex,
  type TrechoViagem,
  type ViagemCfg,
} from './viagem'
import { gravarTracoTerreno, hexesPath, useTerrenoMundo } from './terreno-mundo'
import { useSrcDoMapa } from '../map/mapa-src'
import { useMapaAssado } from '../map/mapa-assado'
import { useCamadasOverlay } from '../map/camadas-overlay'
import { AvisoPreparandoMapa } from '../components/compendium/AtlasMapaPage'
import { GradeCanvas } from '../map/GradeCanvas'
import { escolherGrade, useMapaDebug } from '../map/mapa-debug'
import { useMapView } from '../map/useMapView'
import { MapControls, fullscreenContainerStyle } from '../map/MapControls'
import { HexInfoBar } from '../map/HexInfoBar'
import { useHexMapMundoSync } from '../map/use-hexmapmundo-sync'
import { useSettings } from '../settings'
import {
  addGroupHex,
  getGroupState,
  hexAt,
  hexAtual,
  insertGroupHex,
  moveGroupHex,
  removeGroupHex,
  setAtualHex,
  setMeioTrecho,
  setRegiaoAtiva,
  subscribeGroup,
  todayISO,
  updateGroupHex,
  type GroupHex,
  type GroupState,
} from '../data/group-store'
import { locaisSelectLines, subcategoriaEmoji } from './exploracao'
import {
  ATLAS_GRID_H,
  ATLAS_GRID_W,
  ATLAS_OVERLAY_ASSET,
  atlasHexCenter,
  atlasHexVertices,
  atlasHexPolygonPoints,
  atlasPixelToHex,
  type AtlasHexCell as HexCell,
} from '../map/atlas-grid'
import {
  MAPA_MUNDO_ASSET,
  MAPA_VISTAS,
  vistaCrop,
  vistaEfetivaId,
  vistaGridCells,
  vistaGridPath,
  vistasPermitidas,
} from '../map/mapa-vistas'
import {
  regioesDesabilitadas,
  setRegioesHabilitadasGrupo,
  useMapaAtlas,
} from '../map/mapa-atlas-store'
import { useMapaAtlasSync } from '../map/use-mapaatlas-sync'
import { sectionTitleStyle } from './panel-ui'

/** Cor do ponto/token ATUAL do grupo — AZUL (destaca de tudo que é accent). */
const ATUAL_BLUE = '#3b82f6'

/** VISTA ativa efetiva: a escolhida pelo GM ou a primeira (Mundo Livre — o
 *  mesmo id do registro antigo de regiões, então escolhas salvas valem). */
export function activeRegionId(state: GroupState): string {
  return state.regiaoAtiva ?? MAPA_VISTAS[0]!.id
}

/** Pill mono do design (skin do badge GRUPO do header, clip 6). */
function pillStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '.16em',
    color: active ? 'var(--panel)' : 'var(--accent)',
    background: active ? 'var(--accent)' : 'color-mix(in srgb,var(--accent) 12%,transparent)',
    border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
    padding: '5px 12px',
    clipPath: clip(6),
    cursor: 'pointer',
  }
}

/** Rótulo mono de campo (padrão NOME/APELIDO do design, dc.html:142). */
const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

/** Skin de input/select escuro usado nos campos editáveis. */
const inputStyle: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 12,
  padding: '6px 8px',
}

/** "[[A/B|C]]"→"C" — rótulo do wikilink, sem o path. */
// localTipHtml / LOC_TIP_CSS / wikiStrip extraídos p/ components/ficha/local-tip
// (reuso na Naturalidade do Perfil, #140).

/** Nome exibível de um hex (localização mapeada na região, ou "hex col,row"). */
function hexLabel(
  hex: GroupHex,
  hexMap: HexMapCell[],
  catalog: ReturnType<typeof useCatalog>,
): string {
  if (hex.label && hex.label.trim()) return hex.label.trim() // #85: rótulo do log
  const cell = cellAt(hexMap, hex.col, hex.row)
  const localId = cell?.localId ?? hex.localId
  if (localId) return catalog.entryById.get(localId)?.basename ?? '—'
  return `Hex ${hex.col},${hex.row}`
}

/** Local ATUAL do grupo (p/ o padrão da sidebar de DETALHES): a localização do
 *  hex atual; se ele não for um lugar nomeado, a última parada nomeada andando
 *  pra trás no caminho; senão a própria região. */
function currentLocalId(
  state: GroupState,
  hexMap: HexMapCell[],
  regionId: string,
): string | undefined {
  const atual = hexAtual(state)
  const hexes = state.hexes
  const start = atual ? hexes.findIndex((h) => h.id === atual.id) : hexes.length - 1
  for (let i = start; i >= 0; i--) {
    const h = hexes[i]!
    const id = cellAt(hexMap, h.col, h.row)?.localId ?? h.localId
    if (id) return id
  }
  // vistas sem doc no Atlas (vista:*) não têm página pra abrir
  return regionId && !regionId.startsWith('vista:') ? regionId : undefined
}

// ─────────────────────────── #70 Barra DIREITA ──────────────────────────────

/** Info real do local (Tipo/Descrição/Recursos) — mesma fonte de verdade da
 *  ficha de Localização (frontmatter), nunca inventada. Opcionalmente com a
 *  IMAGEM da região que ao clicar abre a página da localização (#71). */
function LocalInfo({ localId, withImage }: { localId: string; withImage?: boolean }) {
  const { doc } = useDoc(localId)
  const assets = useAssetIndex()
  if (!doc) return null
  const imgTarget = doc.images.find((i) => i.from === 'body')?.target ?? doc.images[0]?.target
  const imgEntry = imgTarget && assets ? resolveAsset(assets, imgTarget) : null
  const tipo = typeof doc.subtype === 'string' && doc.subtype.trim() ? doc.subtype : ''
  const descricao =
    typeof doc.frontmatter['Descrição'] === 'string' ? (doc.frontmatter['Descrição'] as string) : ''
  const recursos = Array.isArray(doc.frontmatter['Recursos'])
    ? (doc.frontmatter['Recursos'] as unknown[]).filter(
        (r): r is string => typeof r === 'string' && r.trim() !== '',
      )
    : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {withImage && imgEntry ? (
        // #71: a imagem da região abre a página da localização em detalhe.
        <Link to={docPath(localId)} data-local-img="" style={{ display: 'block' }}>
          <img
            src={assetUrl(imgEntry)}
            alt={doc.basename}
            loading="lazy"
            style={{
              width: '100%',
              maxHeight: 200,
              objectFit: 'cover',
              display: 'block',
              clipPath: clip(10),
              border: '1px solid var(--line2)',
              cursor: 'pointer',
            }}
          />
        </Link>
      ) : null}
      {tipo ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={fieldLabelStyle}>TIPO</span>
          <span style={{ fontSize: 13 }}>{tipo}</span>
        </div>
      ) : null}
      {descricao ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={fieldLabelStyle}>DESCRIÇÃO</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, textWrap: 'pretty' }}>
            <InlineFieldValue value={descricao} />
          </span>
        </div>
      ) : null}
      {recursos.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={fieldLabelStyle}>RECURSOS</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recursos.map((r, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  clipPath: clip(5),
                }}
              >
                <InlineFieldValue value={r} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Painel colapsável direito: info do local do hex selecionado (#70). */
function RightBar({
  localId,
  collapsed,
  onToggle,
  onClose,
  withImage,
}: {
  localId: string
  collapsed: boolean
  onToggle: () => void
  onClose: () => void
  withImage?: boolean
}) {
  const catalog = useCatalog()
  const nome = catalog.entryById.get(localId)?.basename ?? '—'
  return (
    <aside
      data-info-bar=""
      data-collapsed={collapsed ? '' : undefined}
      style={{
        flex: 'none',
        width: collapsed ? 40 : 300,
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width .12s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '10px 6px' : '10px 12px',
          borderBottom: collapsed ? 'none' : '1px solid var(--line)',
        }}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir info' : 'Recolher info'}
          style={{
            flex: 'none',
            background: 'none',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            width: 22,
            height: 22,
            lineHeight: 1,
            cursor: 'pointer',
            clipPath: clip(4),
          }}
        >
          {collapsed ? '‹' : '›'}
        </button>
        {collapsed ? null : (
          <>
            <span style={{ ...sectionTitleStyle, flex: 1 }}>{'// LOCAL'}</span>
            <button
              onClick={onClose}
              aria-label="Fechar info"
              style={{
                flex: 'none',
                background: 'none',
                border: '1px solid var(--line2)',
                color: 'var(--muted)',
                width: 22,
                height: 22,
                lineHeight: 1,
                cursor: 'pointer',
                clipPath: clip(4),
              }}
            >
              ×
            </button>
          </>
        )}
      </div>
      {collapsed ? null : (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{nome}</span>
            <span style={{ flex: 1 }} />
            <Link
              to={docPath(localId)}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '.16em',
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              ABRIR DOC
            </Link>
          </div>
          <LocalInfo localId={localId} withImage={withImage} />
        </div>
      )}
    </aside>
  )
}

// ─────────────────────────── #69 Barra ESQUERDA ─────────────────────────────

/** Modo de marcação no mapa (#85): 'parada' (ponto importante/rotulável) ·
 *  'caminho' (rota: vários hexes seguidos) · 'off'. */
type AddMode = 'off' | 'parada' | 'caminho'

/** Um ponto é PARADA (proeminente) por PADRÃO — só é rota colapsável quando foi
 *  criado explicitamente como `kind: 'caminho'`. Assim, hexes LEGADOS (sem
 *  `kind`, de antes do sistema parada/caminho) permanecem visíveis um a um: cada
 *  hex marcado à mão é um ponto do histórico do grupo. Fonte única p/ mapa e lista. */
function hexIsParada(h: GroupHex): boolean {
  return h.kind !== 'caminho'
}

/** Uma parada é PRINCIPAL quando o hex referencia um LUGAR nomeado (no mapa da
 *  região ou no próprio hex); senão é só um HEX (parada intermediária). */
function paradaLocalId(h: GroupHex, hexMap: HexMapCell[]): string | undefined {
  return cellAt(hexMap, h.col, h.row)?.localId ?? h.localId
}

interface PathSeg {
  principal: GroupHex | null
  principalIdx: number
  children: { h: GroupHex; idx: number }[]
}

/** Agrupa o caminho: cada PRINCIPAL abre um segmento; os HEX-only seguintes
 *  ficam como filhos (indentados sob o último principal por onde passou). Uma
 *  corrida de HEX-only antes do 1º principal vira um segmento sem cabeçalho. */
function buildSegments(hexes: GroupHex[], isPrincipal: (h: GroupHex) => boolean): PathSeg[] {
  const segs: PathSeg[] = []
  hexes.forEach((h, idx) => {
    if (isPrincipal(h)) {
      segs.push({ principal: h, principalIdx: idx, children: [] })
    } else {
      if (segs.length === 0) segs.push({ principal: null, principalIdx: -1, children: [] })
      segs[segs.length - 1]!.children.push({ h, idx })
    }
  })
  return segs
}

/** Seletor ÚNICO do meio de um TRECHO (viagem do hexcrawl, 2026-10-06 —
 *  "um meio por trecho"): menu inline sob a linha da parada, SÓ no EDITAR.
 *  "Automático" limpa (`GroupHex.meio` some); um meio grava na parada de
 *  chegada. O meio vale nos hexes onde o terreno deixa; o resto cai no
 *  automático (viagem.ts). */
function MeioTrechoMenu({
  cfg,
  hexId,
  atual,
  previa,
  onEscolher,
}: {
  cfg: ViagemCfg
  hexId: string
  atual: string | undefined
  /** Como o trecho fica com cada escolha (report 2026-10-06: sem terreno
   *  pintado, Carruagem/Navio caíam no automático em silêncio — "não muda").
   *  null = automático. */
  previa: (meio: string | null) => TrechoViagem | undefined
  onEscolher: (meio: string | null) => void
}) {
  const nomeT = (k: string) => cfg.terrenos.find((t) => t.chave === k)?.nome ?? k
  const opcoes: { nome: string; rotulo: string; dica: string }[] = [
    { nome: '', rotulo: 'Automático', dica: 'O mais rápido entre os meios padrão em cada hex' },
    ...cfg.meios.map((m) => ({
      nome: m.nome,
      rotulo: `${m.icone} ${m.nome}`,
      dica: `${m.hexPorDia} hex/dia · ${m.em.map(nomeT).join(', ')}`,
    })),
  ]
  return (
    <div
      data-meio-menu={hexId}
      role="menu"
      aria-label="Meio do trecho"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        margin: '3px 0 2px 30px',
        padding: 4,
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        borderRadius: 4,
      }}
    >
      {opcoes.map((o) => {
        const on = (atual ?? '') === o.nome
        const t = previa(o.nome || null)
        const meioCfg = o.nome ? cfg.meios.find((m) => m.nome === o.nome) : undefined
        // escolhido mas não anda em NENHUM hex do trecho → tudo no automático
        const inutil = !!meioCfg && !!t && !t.meios.includes(o.nome)
        const tempo = t
          ? `${t.bloqueios.length ? '⚠ ' : ''}${t.meios.map((m) => iconeDoMeio(cfg, m)).join('')} ${formatarDias(t.dias)}`
          : ''
        return (
          <button
            key={o.nome || 'auto'}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            data-meio-opcao={o.nome}
            {...(inutil ? { 'data-meio-inutil': '' } : {})}
            title={inutil ? `${o.dica}\nNão anda em nenhum hex deste trecho — fica tudo no automático` : o.dica}
            onClick={() => onEscolher(o.nome || null)}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 6,
              padding: '3px 6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 11,
              color: on ? 'var(--ink)' : 'var(--text)',
              background: on ? 'var(--accent)' : 'transparent',
              border: 'none',
              borderRadius: 3,
              opacity: inutil && !on ? 0.55 : 1,
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ whiteSpace: 'nowrap' }}>{o.rotulo}</span>
              {inutil && meioCfg ? (
                <span style={{ fontSize: 9, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                  {`só em ${meioCfg.em.map(nomeT).join(', ')}`}
                </span>
              ) : null}
            </span>
            {tempo ? (
              <span
                data-meio-previa=""
                style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {tempo}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Painel colapsável esquerdo: caminho HIERÁRQUICO (#82) — principais
 *  proeminentes, HEX-only colapsados sob eles (3 pontinhos → expande no clique),
 *  reorder por ponteiro (toque) e inserir-entre-partes. */
function LeftBar({
  groupId,
  readOnly,
  podeEditar,
  onEditar,
  onConcluir,
  state,
  hexMap,
  collapsed,
  onToggle,
  selectedId,
  onSelect,
  insertAt,
  onInsertAt,
  addMode,
  onSetMode,
  terrenoDe,
}: {
  groupId: string
  readOnly?: boolean
  /** Terreno do mundo por hex (nota `viagem.terreno`, doc efetivo). */
  terrenoDe: (col: number, row: number) => string | undefined
  /** Modo EDITAR ligado (e não readOnly): arrastar, inserir, remover, adicionar. */
  podeEditar: boolean
  onEditar: () => void
  onConcluir: () => void
  state: GroupState
  hexMap: HexMapCell[]
  collapsed: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (id: string) => void
  insertAt: number | null
  onInsertAt: (index: number) => void
  addMode: AddMode
  onSetMode: (m: AddMode) => void
}) {
  const catalog = useCatalog()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const dragIdRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const atual = hexAtual(state)
  // Docs dos locais das paradas pro tooltip de descrição/recursos (#124).
  const localIds = useMemo(
    () => [...new Set(state.hexes.map((h) => paradaLocalId(h, hexMap)).filter((x): x is string => !!x))],
    [state.hexes, hexMap],
  )
  const localDocs = useDocs(localIds)

  const isPrincipal = (h: GroupHex): boolean => hexIsParada(h)
  const segs = buildSegments(state.hexes, isPrincipal)

  // VIAGEM DO HEXCRAWL (2026-10-04; UX 2026-10-05): só com `viagem` no
  // Contexto-Def. Terreno = nota do mundo (`viagem.terreno`) nas MESMAS coords
  // da trilha. A PARADA mostra o trecho que chega nela (desde a parada
  // anterior); o hex de caminho aberto mostra o próprio passo. Só há tempo
  // ENTRE paradas: caminho antes da 1ª / depois da última não conta.
  const viagemCfg = activeContextoDef()?.viagem ?? null
  const viagem = useMemo(
    () =>
      viagemCfg
        ? calcularViagem({
            hexes: state.hexes,
            terrenoDe,
            cfg: viagemCfg,
            ehParada: (h) => hexIsParada(h as GroupHex),
          })
        : null,
    [viagemCfg, state.hexes, terrenoDe],
  )
  // Menu do meio do trecho aberto (id da parada de chegada); fecha com
  // Escape, clique fora ou ao sair do EDITAR.
  // `onde`: aberto pela linha da PARADA de chegada ou pela ROTA (N HEX) que
  // percorre o trecho — o menu aparece sob quem o abriu.
  const [meioMenuAberto, setMeioMenuAberto] = useState<{ id: string; onde: 'parada' | 'rota' } | null>(null)
  const meioMenu = meioMenuAberto?.id ?? null
  const setMeioMenu = (id: string | null) => setMeioMenuAberto(id ? { id, onde: 'parada' } : null)
  const alternarMeioMenu = (id: string, onde: 'parada' | 'rota') =>
    setMeioMenuAberto((m) => (m?.id === id && m.onde === onde ? null : { id, onde }))
  useEffect(() => {
    if (!podeEditar) setMeioMenuAberto(null)
  }, [podeEditar])
  /** Trecho que chega na parada `idx` se ela tivesse o meio `meio` (prévia do
   *  menu; mesma conta da lista). */
  const previaTrecho = (idx: number) => (meio: string | null) => {
    if (!viagemCfg) return undefined
    const hexes = state.hexes.map((h, i) => {
      if (i !== idx) return h
      const { meio: _m, ...resto } = h
      return meio ? { ...resto, meio } : resto
    })
    return calcularViagem({ hexes, terrenoDe, cfg: viagemCfg, ehParada: (h) => hexIsParada(h as GroupHex) }).trechos.get(idx)
  }
  useEffect(() => {
    if (!meioMenu) return
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null
      if (el?.closest?.('[data-meio-menu],[data-meio-trecho],[data-meio-rota]')) return
      setMeioMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMeioMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [meioMenu])
  const nomeTerreno = (k: string) => viagemCfg?.terrenos.find((t) => t.chave === k)?.nome ?? k
  const icones = (meios: string[]) => (viagemCfg ? meios.map((m) => iconeDoMeio(viagemCfg, m)).join('') : '')
  /** Tempo do trecho que CHEGA na parada `idx` (desde a parada anterior; a
   *  1ª parada não tem) + ícones dos meios usados; ⚠ vermelho se bloqueado. */
  const diasTrecho = (h: GroupHex, idx: number) => {
    const t = viagem?.trechos.get(idx)
    if (!t || !viagemCfg) return null
    const bloq = t.bloqueios.length > 0
    const title = bloq
      ? `Sem meio possível em: ${t.bloqueios.map((b) => `hex ${b.col},${b.row} (${nomeTerreno(b.terreno)})`).join(' · ')}`
      : [
          `Desde a parada anterior: ${formatarDias(t.dias)}`,
          ...t.partes.map(
            (p) =>
              `${iconeDoMeio(viagemCfg, p.meio)} ${p.meio}${
                p.terrenos && t.escolhido ? ` (${p.terrenos.map(nomeTerreno).join(', ')}, sem ${t.escolhido})` : ''
              } · ${formatarDias(p.dias)}`,
          ),
        ].join('\n')
    return (
      <span
        data-viagem-trecho={h.id}
        {...(bloq ? { 'data-viagem-trecho-bloqueado': '' } : {})}
        title={title}
        style={{
          flex: 'none',
          fontFamily: 'var(--mono)',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '.04em',
          whiteSpace: 'nowrap',
          color: bloq ? 'var(--red)' : 'var(--accent)',
        }}
      >
        {bloq ? '⚠ ' : ''}
        {`${icones(t.meios)} ${formatarDias(t.dias)}`}
      </span>
    )
  }
  /** Custo pra ENTRAR num hex de caminho (rota aberta): pequeno e apagado,
   *  com o ícone do meio; o tooltip diz o meio e o terreno. */
  const diasPasso = (h: GroupHex, idx: number) => {
    const p = viagem?.passos[idx]
    if (!p) return null
    const terreno = nomeTerreno(p.terreno)
    return (
      <span
        data-viagem-passo={h.id}
        {...(p.bloqueado ? { 'data-viagem-passo-bloqueado': '' } : {})}
        title={
          p.dias === null
            ? `Sem meio possível · ${terreno}`
            : [formatarDias(p.dias), p.meios.join(' + '), terreno].filter(Boolean).join(' · ')
        }
        style={{
          flex: 'none',
          fontFamily: 'var(--mono)',
          fontSize: 9.5,
          letterSpacing: '.04em',
          whiteSpace: 'nowrap',
          color: p.bloqueado ? 'var(--red)' : 'var(--muted)',
        }}
      >
        {p.bloqueado ? '⚠ ' : ''}
        {p.dias === null ? terreno : `${icones(p.meios)} ${formatarDias(p.dias)}`}
      </span>
    )
  }

  /** Botão compacto do meio do trecho que chega em `h` (EDITAR): ícone do
   *  meio escolhido ou AUTO; abre o MeioTrechoMenu sob a linha. */
  const meioBotao = (h: GroupHex, idx: number, onde: 'parada' | 'rota' = 'parada') => {
    const escolhido = viagem?.trechos.get(idx)?.escolhido
    const icone = escolhido && viagemCfg ? iconeDoMeio(viagemCfg, escolhido) : ''
    const aberto = meioMenuAberto?.id === h.id && meioMenuAberto.onde === onde
    return (
      <button
        type="button"
        {...(onde === 'rota' ? { 'data-meio-rota': h.id } : { 'data-meio-trecho': h.id })}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Meio do trecho: ${escolhido ?? 'Automático'}`}
        title={`Meio do trecho: ${escolhido ?? 'Automático'} (clica pra escolher)`}
        onClick={(e) => {
          e.stopPropagation()
          alternarMeioMenu(h.id, onde)
        }}
        style={{
          flex: 'none',
          minWidth: 26,
          padding: '1px 4px',
          cursor: 'pointer',
          fontFamily: icone ? undefined : 'var(--mono)',
          fontSize: icone ? 12 : 8.5,
          letterSpacing: icone ? undefined : '.06em',
          lineHeight: 1.4,
          color: 'var(--muted)',
          background: aberto ? 'color-mix(in srgb,var(--accent) 16%,transparent)' : 'var(--panel)',
          border: '1px solid var(--line2)',
          borderRadius: 3,
        }}
      >
        {icone || 'AUTO'}
      </button>
    )
  }

  /** Menu do meio do trecho que chega em `h` (se aberto pra ela). */
  const meioMenuDe = (h: GroupHex, idx: number) =>
    meioMenu === h.id && podeEditar && viagemCfg ? (
      <MeioTrechoMenu
        cfg={viagemCfg}
        hexId={h.id}
        atual={viagem?.trechos.get(idx)?.escolhido}
        previa={previaTrecho(idx)}
        onEscolher={(m) => {
          setMeioTrecho(groupId, h.id, m)
          setMeioMenu(null)
        }}
      />
    ) : null

  /** ROTA (N HEX) dentro de um trecho (2026-10-06): a rota percorre o trecho
   *  que chega na PRÓXIMA parada — mostra os ÍCONES dos meios usados nele
   *  (distintos, na ordem da viagem; vários quando mistura) e, no EDITAR, o
   *  seletor desse mesmo trecho (o meio continua gravado na parada de
   *  chegada). Rota antes da 1ª parada ou depois da última não tem trecho →
   *  nem ícones nem seletor. */
  const rotaComMeio = (rotaRow: ReactNode, key: string, kids: { h: GroupHex; idx: number }[]) => {
    const chegadaIdx = kids[kids.length - 1]!.idx + 1
    const chegada = state.hexes[chegadaIdx]
    const t = viagem?.trechos.get(chegadaIdx)
    if (!chegada || !viagemCfg || !t) return rotaRow
    const ic = icones(t.meios)
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {rotaRow}
          {ic ? (
            <span
              data-viagem-rota-meios={key}
              title={t.meios.join(' + ')}
              style={{ flex: 'none', fontSize: 11, lineHeight: 1, whiteSpace: 'nowrap' }}
            >
              {ic}
            </span>
          ) : null}
          {podeEditar ? meioBotao(chegada, chegadaIdx, 'rota') : null}
        </div>
        {meioMenuAberto?.onde === 'rota' ? meioMenuDe(chegada, chegadaIdx) : null}
      </>
    )
  }

  /** Emoji da marca (subcategoria do local mapeado); '⠿' (grip) se não houver. */
  const paradaEmoji = (h: GroupHex): string => {
    const localId = paradaLocalId(h, hexMap)
    const emoji = localId ? subcategoriaEmoji(catalog.entryById.get(localId)?.subtype) : ''
    return emoji || '⠿'
  }

  // Reordenação por PONTEIRO (funciona no TOQUE): arrasta pelo handle; o alvo é
  // o ÍNDICE (data-order) do primeiro item visível cujo meio o dedo cruzou.
  const dropIndexAt = (clientY: number): number => {
    const items = listRef.current ? [...listRef.current.querySelectorAll('[data-parada]')] : []
    for (const el of items) {
      const r = el.getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return Number((el as HTMLElement).getAttribute('data-order'))
    }
    return state.hexes.length
  }
  const onHandleDown = (h: GroupHex) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragIdRef.current = h.id
    setDragId(h.id)
    setDropIndex(null)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragIdRef.current) return
    setDropIndex(dropIndexAt(e.clientY))
  }
  const onHandleUp = (e: React.PointerEvent) => {
    const id = dragIdRef.current
    if (!id) return
    const target = dropIndex ?? dropIndexAt(e.clientY)
    const from = state.hexes.findIndex((x) => x.id === id)
    if (from !== -1) moveGroupHex(groupId, id, target > from ? target - 1 : target)
    dragIdRef.current = null
    setDragId(null)
    setDropIndex(null)
  }

  /** Uma linha de parada (principal proeminente OU filho hex-only pequeno). */
  const paradaRow = (h: GroupHex, idx: number, variant: 'principal' | 'child') => {
    const sel = h.id === selectedId
    const isAtual = h.id === atual?.id
    const dragging = dragId === h.id
    const child = variant === 'child'
    return (
      <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 0, marginLeft: child ? 22 : 0 }}>
        <div
          style={{
            height: dragId && dropIndex === idx ? 3 : 0,
            margin: dragId && dropIndex === idx ? '2px 0' : 0,
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'height .08s',
          }}
        />
        <div
          data-parada={h.id}
          data-order={idx}
          {...(sel ? { 'data-sel': '' } : {})}
          onClick={() => onSelect(h.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: child ? '2px 8px' : '4px 9px',
            cursor: 'pointer',
            opacity: dragging ? 0.5 : 1,
            background: sel
              ? 'color-mix(in srgb,var(--accent) 14%,var(--card))'
              : child
                ? 'transparent'
                : 'var(--card)',
            border: `1px solid ${sel ? 'color-mix(in srgb,var(--accent) 55%,var(--line2))' : child ? 'transparent' : 'var(--line2)'}`,
            clipPath: child ? undefined : clip(6),
          }}
        >
          <span
            {...(!podeEditar
              ? {}
              : {
                  'data-drag-handle': h.id,
                  role: 'button',
                  'aria-label': `Reordenar ${hexLabel(h, hexMap, catalog)} (parada ${idx + 1})`,
                  title: `Arraste pra reordenar (parada ${idx + 1})`,
                  onPointerDown: onHandleDown(h),
                  onPointerMove: onHandleMove,
                  onPointerUp: onHandleUp,
                  onPointerCancel: onHandleUp,
                })}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 'none',
              width: child ? 18 : 22,
              height: child ? 18 : 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: child ? 11 : 14,
              color: child ? 'var(--muted)' : undefined,
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
              borderRadius: 4,
              background: isAtual ? 'color-mix(in srgb,var(--accent) 22%,transparent)' : 'transparent',
              border: isAtual ? '1px solid color-mix(in srgb,var(--accent) 45%,transparent)' : '1px solid transparent',
            }}
          >
            {paradaEmoji(h)}
          </span>
          <TipHover
            html={localTipHtml(paradaLocalId(h, hexMap) ? localDocs?.get(paradaLocalId(h, hexMap)!) : undefined)}
            style={{ flex: 1, minWidth: 0 }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: child ? 11 : 12.5,
                fontWeight: child ? 400 : 600,
                color: child ? 'var(--muted)' : 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {hexLabel(h, hexMap, catalog)}
            </span>
          </TipHover>
          {viagem ? (child ? diasPasso(h, idx) : diasTrecho(h, idx)) : null}
          {podeEditar && viagemCfg && !child && viagem?.trechos.has(idx) ? meioBotao(h, idx) : null}
          {!podeEditar ? null : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeGroupHex(groupId, h.id)
            }}
            aria-label="Remover parada"
            style={{
              flex: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: child ? 12 : 14,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
          )}
        </div>
        {meioMenuAberto?.onde === 'parada' ? meioMenuDe(h, idx) : null}
      </div>
    )
  }

  /** Botão fininho de INSERIR parada na posição `index` (#82). Ativo mostra a
   *  dica; some durante um arraste. Só aparece DENTRO de um caminho expandido
   *  (`indent`), pra inserir uma parada num ponto específico da rota. */
  const insertRow = (index: number, indent = false) =>
    !podeEditar ? null : (
    <button
      key={`ins-${index}`}
      data-insert-at={index}
      aria-label={`Inserir parada na posição ${index + 1}`}
      onClick={() => onInsertAt(index)}
      style={{
        alignSelf: 'stretch',
        marginLeft: indent ? 22 : 0,
        display: dragId ? 'none' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: insertAt === index ? 20 : 10,
        padding: 0,
        cursor: 'pointer',
        background: insertAt === index ? 'color-mix(in srgb,var(--accent) 16%,transparent)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        color: insertAt === index ? 'var(--accent)' : 'color-mix(in srgb,var(--muted) 70%,transparent)',
        fontFamily: 'var(--mono)',
        fontSize: insertAt === index ? 10 : 12,
        letterSpacing: '.06em',
      }}
    >
      {insertAt === index ? '+ TOQUE UM HEX' : '+'}
    </button>
  )

  /** Corrida de HEX-only COLAPSADA: 3 pontinhos verticais + contagem; clique
   *  EXPANDE pra mostrar o caminho completo (e só então os "+" de inserir). */
  const collapsedRow = (key: string, children: { h: GroupHex; idx: number }[]) => (
    <button
      key={`col-${key}`}
      data-collapsed-run={key}
      title={`${children.length} hex(es) de caminho — clique pra abrir a rota`}
      onClick={() => setExpanded((s) => new Set(s).add(key))}
      style={{
        marginLeft: 22,
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '2px 9px',
        cursor: 'pointer',
        background: 'transparent',
        border: '1px dashed var(--line2)',
        borderRadius: 6,
        color: 'var(--muted)',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: Math.min(3, children.length) }, (_, k) => (
          <span
            key={k}
            style={{ width: 4, height: 4, borderRadius: '50%', background: 'color-mix(in srgb,var(--accent) 65%,transparent)' }}
          />
        ))}
      </span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em' }}>{children.length} HEX</span>
    </button>
  )

  /** Cabeçalho da rota EXPANDIDA: botão pra RECOLHER de volta (#: pedido do
   *  usuário — expandir tem que ter como fechar). */
  const runCollapseBtn = (key: string, count: number) => (
    <button
      key={`recolher-${key}`}
      data-collapse-run={key}
      title="Recolher a rota"
      onClick={() => setExpanded((s) => {
        const n = new Set(s)
        n.delete(key)
        return n
      })}
      style={{
        marginLeft: 22,
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 9px',
        cursor: 'pointer',
        background: 'color-mix(in srgb,var(--accent) 10%,transparent)',
        border: '1px solid color-mix(in srgb,var(--accent) 30%,transparent)',
        borderRadius: 6,
        color: 'var(--accent)',
      }}
    >
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>▴</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em' }}>{count} HEX · RECOLHER</span>
    </button>
  )

  return (
    <aside
      data-caminho-bar=""
      data-collapsed={collapsed ? '' : undefined}
      style={{
        flex: 'none',
        width: collapsed ? 40 : 240,
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width .12s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: collapsed ? '10px 6px' : '10px 12px',
          borderBottom: collapsed ? 'none' : '1px solid var(--line)',
        }}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir caminho' : 'Recolher caminho'}
          style={{
            flex: 'none',
            background: 'none',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            width: 22,
            height: 22,
            lineHeight: 1,
            cursor: 'pointer',
            clipPath: clip(4),
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
        {collapsed ? null : <span style={{ ...sectionTitleStyle, flex: 1 }}>{'// CAMINHO'}</span>}
        {!collapsed && viagem && viagem.trechos.size > 0 ? (
          <span
            data-viagem-total=""
            {...(viagem.bloqueado ? { 'data-viagem-bloqueado': '' } : {})}
              title={viagem.bloqueado ? 'Algum trecho não tem meio possível (⚠ na parada)' : 'Tempo total da trilha'}
            style={{
              flex: 'none',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.06em',
              color: viagem.bloqueado ? 'var(--red)' : 'var(--accent)',
            }}
          >
            {viagem.bloqueado ? '⚠ ' : ''}
            {formatarDias(viagem.total)}
          </span>
        ) : null}
      </div>
      {collapsed ? null : (
        <div
          ref={listRef}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: 12, overflowY: 'auto' }}
        >
          {state.hexes.length === 0 ? (
            <span style={{ ...fieldLabelStyle, padding: '4px 0' }}>SEM PARADAS</span>
          ) : (
            <>
              {segs.map((seg) => {
                const key = seg.principal?.id ?? 'lead'
                const isExp = expanded.has(key)
                const kids = seg.children
                return (
                  <div key={key} style={{ display: 'contents' }}>
                    {seg.principal ? paradaRow(seg.principal, seg.principalIdx, 'principal') : null}
                    {kids.length
                      ? isExp
                        ? (
                            // Rota ABERTA: botão de recolher + os hexes, com o "+"
                            // de inserir parada SÓ aqui, entre os pontos da rota.
                            <>
                              {rotaComMeio(runCollapseBtn(key, kids.length), key, kids)}
                              {kids.map((c) => (
                                <div key={c.h.id} style={{ display: 'contents' }}>
                                  {insertRow(c.idx, true)}
                                  {paradaRow(c.h, c.idx, 'child')}
                                </div>
                              ))}
                              {insertRow(kids[kids.length - 1]!.idx + 1, true)}
                            </>
                          )
                        : rotaComMeio(collapsedRow(key, kids), key, kids)
                      : null}
                  </div>
                )
              })}
              <div
                style={{
                  height: dragId && dropIndex === state.hexes.length ? 3 : 0,
                  margin: dragId && dropIndex === state.hexes.length ? '2px 0' : 0,
                  background: 'var(--accent)',
                  borderRadius: 2,
                }}
              />
            </>
          )}
        </div>
      )}
      {/* RODAPÉ: os botões de marcação vivem AQUI (dentro da barra) pra ficarem
          acessíveis também em TELA CHEIA, onde o cabeçalho some (#82/#85). */}
      {collapsed ? null : (
        <div
          style={{
            flex: 'none',
            padding: 10,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {readOnly ? (
            /* caminho é editado JOGANDO (mesa conectada) — fora dela, leitura */
            <span style={{ ...fieldLabelStyle, fontSize: 9, textAlign: 'center', padding: '4px 0' }}>
              {'// SOMENTE LEITURA — EDITE PELA MESA'}
            </span>
          ) : !podeEditar ? (
            /* pedido 2026-09-30: fora do modo EDITAR só leitura — um botão só */
            <button
              data-editar-trilha=""
              onClick={onEditar}
              style={{ ...pillStyle(false), width: '100%', justifyContent: 'center', padding: '8px 12px', fontSize: 11 }}
            >
              ✎ Editar
            </button>
          ) : (
          <>
          <button
            data-marcar-hex=""
            data-add-parada=""
            aria-pressed={addMode === 'parada'}
            onClick={() => onSetMode('parada')}
            style={{
              ...pillStyle(addMode === 'parada'),
              width: '100%',
              justifyContent: 'center',
              padding: '8px 12px',
              fontSize: 11,
            }}
          >
            {addMode === 'parada' ? '✓ PARADA — TOQUE UM HEX' : '+ Adicionar Parada'}
          </button>
          <button
            data-add-caminho=""
            aria-pressed={addMode === 'caminho'}
            onClick={() => onSetMode('caminho')}
            style={{
              ...pillStyle(addMode === 'caminho'),
              width: '100%',
              justifyContent: 'center',
              padding: '8px 12px',
              fontSize: 11,
            }}
          >
            {addMode === 'caminho' ? '✓ CAMINHO — TOQUE OS HEXES' : '+ Adicionar Caminho'}
          </button>
          {addMode !== 'off' ? (
            <span style={{ ...fieldLabelStyle, fontSize: 9, textAlign: 'center' }}>
              {addMode === 'parada'
                ? 'toque um hex e rotule a parada no popover · × remove'
                : 'toque os hexes da rota em sequência (pode repetir) · × remove'}
            </span>
          ) : null}
          <button
            data-concluir-edicao=""
            onClick={onConcluir}
            style={{ ...pillStyle(true), width: '100%', justifyContent: 'center', padding: '8px 12px', fontSize: 11 }}
          >
            ✓ Concluir
          </button>
          </>
          )}
        </div>
      )}
    </aside>
  )
}

/** Barra do PINTOR DE TERRENO (Modo Dev): toggle + um pincel por terreno da
 *  config (amostra de cor + nome) + Limpar. Sobreposta ao mapa (vale também
 *  em tela cheia). Grava rascunho LOCAL — publicar/exportar é na Config. */
function PintorTerreno({
  cfg,
  ligado,
  onToggle,
  pincel,
  onPincel,
}: {
  cfg: ViagemCfg
  ligado: boolean
  onToggle: () => void
  pincel: string | null
  onPincel: (k: string | null) => void
}) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 14,
        left: 14,
        zIndex: 4,
        maxWidth: 'calc(100% - 90px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      <button
        data-pintor-terreno-toggle=""
        aria-pressed={ligado}
        onClick={onToggle}
        style={{ ...pillStyle(ligado), padding: '5px 10px', fontSize: 10 }}
      >
        ✎ TERRENO
      </button>
      {ligado ? (
        <div
          data-pintor-terreno=""
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '8px 10px',
            background: 'color-mix(in srgb,var(--panel) 92%,transparent)',
            border: '1px solid var(--line2)',
            clipPath: clip(8),
          }}
        >
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {cfg.terrenos.map((t) => (
              <button
                key={t.chave}
                data-pincel={t.chave}
                aria-pressed={pincel === t.chave}
                aria-label={t.nome}
                title={`Custo de movimento ×${t.custo}`}
                onClick={() => onPincel(t.chave)}
                style={{ ...pillStyle(pincel === t.chave), padding: '3px 8px', fontSize: 9.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <span
                  aria-hidden
                  style={{ width: 9, height: 9, borderRadius: 2, background: t.cor ?? 'var(--muted)', flex: 'none' }}
                />
                {t.nome}
              </button>
            ))}
            <button
              data-pincel-limpar=""
              aria-pressed={pincel === null}
              onClick={() => onPincel(null)}
              style={{ ...pillStyle(pincel === null), padding: '3px 8px', fontSize: 9.5 }}
            >
              ⌫ Limpar
            </button>
          </div>
          <span style={{ ...fieldLabelStyle, fontSize: 9 }}>
            arraste pra pintar · rascunho local — publique em Config › Modo Dev
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** `readOnly` (pedido do usuário, follow-up #379 r2): fora da MESA CONECTADA o
 *  caminho é SOMENTE LEITURA — a trilha é sincronizada com o session state
 *  (remoto = fonte de verdade) e edição offline seria sobrescrita no pull. */
export function PanelExploracao({
  groupId,
  readOnly,
  gatingKey,
}: {
  groupId: string
  readOnly?: boolean
  /** Chave de habilitação de regiões deste grupo/sessão (= o que o jogador
   *  resolve como viewer). Só o MESTRE edita, na ficha do grupo. */
  gatingKey?: string
}) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const state = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeGroup(groupId, cb), [groupId]),
    () => getGroupState(groupId),
  )
  // Trilhas/lugares na grade ÚNICA do MUNDO (mapa:mundo) — a vista só recorta.
  const hexMapState = useHexMap(MAPA_MUNDO_ID)
  const hexMap = hexMapState.cells
  // #430: jogador da mesa adota o mapa-múndi autorado pelo mestre (lugares/
  // áreas) — assim a exploração do grupo mostra o que o mestre marcou.
  const { mestre, desenvolvedor } = useSettings()
  useHexMapMundoSync(mestre)
  // TERRENO DO MUNDO (2026-10-05): nota `viagem.terreno` lida pelo doc efetivo
  // (overlay publicado ⊕ rascunho do Modo Dev).
  const viagemCfg = activeContextoDef()?.viagem ?? null
  const terrenoMundo = useTerrenoMundo(viagemCfg)
  // Report 2026-08-17 r2: a config do atlas é a EFETIVA do viewer (mesmo
  // contrato do /mapa): jogador conectado lê a MESA; mestre/offline o local.
  // Ler só o store local aqui deixava o jogador com blob velho sem
  // `habilitadas` → tudo coberto e dropdown vazio.
  const { cfg: cfgAtlas } = useMapaAtlasSync(mestre)
  // Report 2026-08-17: o gating (#40/#41) vale TAMBÉM na exploração — jogador
  // só escolhe vistas de regiões habilitadas e vê o overlay nas desabilitadas;
  // vista salva não-permitida cai na primeira permitida (clamp de leitura, sem
  // gravar). Mestre segue livre.
  const desabilitadas = useMemo(
    () => (mestre ? [] : regioesDesabilitadas(cfgAtlas, gatingKey ?? null)),
    [mestre, cfgAtlas, gatingKey],
  )
  const permitidas = useMemo(() => vistasPermitidas(desabilitadas), [desabilitadas])
  const regionId = vistaEfetivaId(activeRegionId(state), permitidas)
  const crop = useMemo(() => vistaCrop(regionId, cfgAtlas.regioes), [regionId, cfgAtlas])
  // #89: havendo sidebar de detalhes, a info do local abre NELA (não no bloco
  // lateral do mapa); sem ela (testes) cai no RightBar #70.
  const detail = useDetail()

  // Ao ENTRAR na Exploração, a sidebar de DETALHES mostra por PADRÃO onde o grupo
  // está AGORA (a localização atual). Roda uma vez por montagem; depois o usuário
  // navega livre (clicar em outro hex, ou voltar pra Sessão).
  const didDefaultDetail = useRef(false)
  useEffect(() => {
    if (didDefaultDetail.current || !detail) return
    const id = currentLocalId(state, hexMap, regionId)
    if (id) {
      detail.open({ kind: 'doc', id })
      didDefaultDetail.current = true
    }
  }, [detail, state, hexMap, regionId])

  /** PARADA (proeminente + rótulo na trilha) = criada como parada OU tem lugar
   *  nomeado OU rótulo; senão é ponto de CAMINHO (rota, discreto) — #85. */
  const isParada = (h: GroupHex): boolean => hexIsParada(h)

  // #85: dois modos de marcação — 'parada' (ponto importante, rotulável) e
  // 'caminho' (rota: toca vários hexes seguidos, mesmo sem ponto de interesse).
  const [addMode, setAddMode] = useState<AddMode>('off')
  /** Modo EDITAR da trilha (pedido 2026-09-30): fora dele, o painel é só
   *  leitura mesmo na mesa conectada — nada de adicionar, arrastar, inserir,
   *  remover ou mover o token. CONCLUIR desliga tudo junto. */
  const [editando, setEditando] = useState(false)
  const podeEditar = !readOnly && editando
  /** Posição do caminho onde a próxima parada marcada será INSERIDA (#82); null
   *  = anexa no fim. */
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Hex clicado que tem localização mapeada → barra direita (#70). */
  const [infoLocalId, setInfoLocalId] = useState<string | null>(null)
  /** Hex clicado no MAPA → barra horizontal embaixo (mesmo estilo do /mapa) +
   *  contorno do hex selecionado (pedido: "clicar num lugar mostra embaixo"). */
  const [infoHex, setInfoHex] = useState<HexCell | null>(null)
  /** Barra direita mostra a IMAGEM da região (só via clique no token, #71). */
  const [infoWithImage, setInfoWithImage] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [hoverHex, setHoverHex] = useState<HexCell | null>(null)
  // Tooltip do LOCAL no MAPA (#141): o <svg> tem pointer-events:none, então o
  // hover é rastreado no div-pai; mostramos o mesmo card da parada num overlay
  // portado pro body (fixed, no mouse).
  const [mapTip, setMapTip] = useState<{ html: string; x: number; y: number } | null>(null)
  /** Token sendo arrastado: célula atual sob o cursor (mostra "Adicionar parada"). */
  const [tokenDropCell, setTokenDropCell] = useState<HexCell | null>(null)
  const tokenDragRef = useRef(false)
  const pressedRef = useRef(false)

  // Pan / PINÇA / roda / TELA CHEIA compartilhados (#80).
  const map = useMapView()

  // ── PINTOR DE TERRENO (Modo Dev, 2026-10-05) ──────────────────────────────
  // Arrastar pinta todo hex sob o ponteiro (pan desligado); toque pinta um.
  // O traço acumula num REF e o preview é um <path> atualizado por
  // setAttribute (sem re-render do painel por pointermove); no pointerup vira
  // UM rascunho local do FM da nota de terreno.
  const podePintar = desenvolvedor && !!viagemCfg && !!terrenoMundo.doc
  const [pintando, setPintando] = useState(false)
  const pintor = pintando && podePintar
  const [pincel, setPincel] = useState<string | null>(
    () => viagemCfg?.terrenos.find((t) => t.chave !== viagemCfg.padrao)?.chave ?? null,
  )
  const tracoRef = useRef<{ pointerId: number; cells: Map<string, HexCell>; last: HexCell | null; d: string } | null>(
    null,
  )
  const tracoPathRef = useRef<SVGPathElement | null>(null)
  const corPincel = (pincel && viagemCfg?.terrenos.find((t) => t.chave === pincel)?.cor) || 'var(--muted)'
  const tintas = useMemo(() => {
    if (!pintor || !viagemCfg) return []
    const porChave = new Map<string, { col: number; row: number }[]>()
    for (const [hex, chave] of terrenoMundo.indice) {
      const [col, row] = hex.split(',').map(Number) as [number, number]
      if (!porChave.has(chave)) porChave.set(chave, [])
      porChave.get(chave)!.push({ col, row })
    }
    return viagemCfg.terrenos
      .filter((t) => porChave.has(t.chave))
      .map((t) => ({ chave: t.chave, cor: t.cor ?? 'var(--muted)', d: hexesPath(porChave.get(t.chave)!) }))
  }, [pintor, viagemCfg, terrenoMundo.indice])

  const atual = hexAtual(state)
  const selecionado = selectedId ? (state.hexes.find((h) => h.id === selectedId) ?? null) : null

  // #573: a malha do crop vai pro canvas de tela (GradeCanvas) — as células
  // só mudam na troca de vista; a fonte (crop) idem.
  const gridCells = useMemo(() => vistaGridCells(crop), [crop])
  const gridFonte = useMemo(() => ({ x: crop.x, y: crop.y, w: crop.w, h: crop.h }), [crop])

  // Docs dos locais pro TOOLTIP no mapa (#124) — nativo (<title>) já que os
  // hexes são SVG. Descrição (campo) + recursos, fonte de verdade no frontmatter.
  const mapLocalIds = useMemo(
    () => [...new Set(state.hexes.map((h) => paradaLocalId(h, hexMap)).filter((x): x is string => !!x))],
    [state.hexes, hexMap],
  )
  const mapLocalDocs = useDocs(mapLocalIds)
  const localTitleText = (h: GroupHex): string => {
    const lid = paradaLocalId(h, hexMap)
    if (!lid) return ''
    const doc = mapLocalDocs?.get(lid)
    if (!doc) return catalog.entryById.get(lid)?.basename ?? ''
    const parts = [doc.basename]
    const desc =
      typeof doc.frontmatter['Descrição'] === 'string' ? wikiStrip(doc.frontmatter['Descrição'] as string) : ''
    if (desc) parts.push(desc)
    const rec = Array.isArray(doc.frontmatter['Recursos'])
      ? (doc.frontmatter['Recursos'] as unknown[])
          .filter((r): r is string => typeof r === 'string' && !!r.trim())
          .map(wikiStrip)
      : []
    if (rec.length) parts.push('Recursos: ' + rec.join(', '))
    return parts.join('\n')
  }

  // `resolveAsset` em vez de `byPath.get`: as constantes dizem `.png` e o acervo
  // migrou pra webp — fixar extensão apagava o mapa sem erro nenhum.
  const mapEntry = assets ? resolveAsset(assets, MAPA_MUNDO_ASSET) : null
  const overlayEntry = assets ? resolveAsset(assets, ATLAS_OVERLAY_ASSET) : null
  // #572: o atlas tem 7440×5262 px — no gesto vai a versão MÉDIA (ver mapa-src)
  const imagemMapa = useSrcDoMapa(mapEntry)
  const imagemOverlay = useSrcDoMapa(overlayEntry)
  // #573: mapa + overlay das regiões desabilitadas assados num bitmap só (o
  // <image> clipado no SVG era re-rasterizado a cada quadro no Gecko); até
  // ficar pronto, o overlay em SVG segue cobrindo.
  const aneisDesabilitados = useMemo(
    () => desabilitadas.flatMap((r) => r.aneis ?? [r.pontos]),
    [desabilitadas],
  )
  const mapaDebug = useMapaDebug()
  const gradeEm = escolherGrade(mapaDebug.grade)
  const assado = useMapaAssado({
    srcMapa: mapEntry ? (imagemMapa.src ?? assetUrl(mapEntry)) : null,
    srcOverlay: overlayEntry ? (imagemOverlay.src ?? assetUrl(overlayEntry)) : null,
    fonteW: ATLAS_GRID_W,
    fonteH: ATLAS_GRID_H,
    aneis: aneisDesabilitados,
    ativo: !!overlayEntry && desabilitadas.length > 0 && mapaDebug.assar,
  })
  // Anti-spoiler por construção (camadas-overlay)
  const camadas = useCamadasOverlay({
    precisaOverlay: !!overlayEntry && desabilitadas.length > 0,
    srcBase: mapEntry ? (imagemMapa.src ?? assetUrl(mapEntry)) : null,
    srcOverlay: overlayEntry ? (imagemOverlay.src ?? assetUrl(overlayEntry)) : null,
    srcAssado: assado.src,
    exigirAssado: mapaDebug.assar,
  })
  const preparandoMapa = !!overlayEntry && desabilitadas.length > 0 && !camadas.estado.imgVisivel

  /** Célula da grade sob o cursor (ou null fora da imagem). */
  const hexAtClient = (clientX: number, clientY: number): HexCell | null => {
    const f = map.fracAtClient(clientX, clientY)
    return f ? atlasPixelToHex(crop.x + f.fx * crop.w, crop.y + f.fy * crop.h) : null
  }

  const tracarAte = (cell: HexCell | null) => {
    const t = tracoRef.current
    if (!t || !cell) return
    if (t.last && t.last.col === cell.col && t.last.row === cell.row) return
    // ponteiro rápido pula hexes: liga pela linha hex (sem buracos no traço)
    const linha = t.last ? hexLine(t.last, cell).slice(1) : [cell]
    let novo = ''
    for (const c of linha) {
      const k = `${c.col},${c.row}`
      if (t.cells.has(k)) continue
      t.cells.set(k, { col: c.col, row: c.row })
      novo += hexesPath([c])
    }
    t.last = cell
    if (novo) {
      t.d += novo
      tracoPathRef.current?.setAttribute('d', t.d)
    }
  }
  const fecharTraco = (e: React.PointerEvent) => {
    const t = tracoRef.current
    if (!t || t.pointerId !== e.pointerId) return
    tracarAte(hexAtClient(e.clientX, e.clientY))
    tracoRef.current = null
    tracoPathRef.current?.setAttribute('d', '')
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    if (terrenoMundo.doc && viagemCfg) gravarTracoTerreno(terrenoMundo.doc, [...t.cells.values()], pincel, viagemCfg)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (pintor) {
      if (tracoRef.current) return // 2º dedo durante o traço: ignora
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      tracoRef.current = { pointerId: e.pointerId, cells: new Map(), last: null, d: '' }
      tracarAte(hexAtClient(e.clientX, e.clientY))
      return
    }
    pressedRef.current = true
    if (hoverHex) setHoverHex(null)
    setMapTip(null)
    map.onPointerDown(e)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (tracoRef.current) {
      if (e.pointerId === tracoRef.current.pointerId) tracarAte(hexAtClient(e.clientX, e.clientY))
      return
    }
    // Arrasto do token (#71): não faz pan/pinça, marca a célula-alvo.
    if (tokenDragRef.current) {
      const cell = hexAtClient(e.clientX, e.clientY)
      setTokenDropCell((prev) =>
        (prev && cell && prev.col === cell.col && prev.row === cell.row) || (!prev && !cell)
          ? prev
          : cell,
      )
      return
    }
    map.onPointerMove(e)
    // Hover só quando NÃO está pressionado (mouse pairando no desktop).
    if (!pressedRef.current) {
      const h = hexAtClient(e.clientX, e.clientY)
      setHoverHex((prev) =>
        (prev && h && prev.col === h.col && prev.row === h.row) || (!prev && !h) ? prev : h,
      )
      // Tooltip do lugar sob o cursor (mesmo card da parada), no mouse.
      const lid = h ? (cellAt(hexMap, h.col, h.row)?.localId ?? undefined) : undefined
      const html = lid ? localTipHtml(mapLocalDocs?.get(lid)) : null
      setMapTip(html ? { html, x: e.clientX, y: e.clientY } : null)
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (tracoRef.current) {
      fecharTraco(e)
      return
    }
    pressedRef.current = false
    map.onPointerUp(e)
  }
  const onPointerLeave = () => {
    if (hoverHex) setHoverHex(null)
    setMapTip(null)
  }

  /** Info do local do hex mapeado: na sidebar DIREITA global (#89) quando há
   *  DetailContext; senão cai na barra lateral do mapa (#70, fallback). */
  const openInfoForCell = (col: number, row: number, withImage: boolean): boolean => {
    const cell = cellAt(hexMap, col, row)
    if (!cell?.localId) return false
    if (detail) {
      // Abre DIRETO o doc completo do local (nome + imagem + abas), sem o passo
      // intermediário do LocalDetail. A sidebar esconde a aba Hexploração.
      detail.open({ kind: 'doc', id: cell.localId })
    } else {
      setInfoLocalId(cell.localId)
      setInfoWithImage(withImage)
      setRightCollapsed(false)
    }
    return true
  }

  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pintor) return // o toque já pintou no pointerdown/up
    if (map.consumeMoved()) return
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) {
      if (addMode === 'off') {
        setSelectedId(null)
        setInfoHex(null)
      }
      return
    }
    const existente = hexAt(state.hexes, cell.col, cell.row)
    if (addMode !== 'off' && podeEditar) {
      // #82/#85: SEMPRE adiciona (revisitar é permitido — allowDup). Remover é
      // pelo × na lista. Com posição de inserção escolhida, insere lá. O `kind`
      // vem do MODO (parada = marco; caminho = rota).
      const nova = { col: cell.col, row: cell.row, data: todayISO(), kind: addMode }
      const criado =
        insertAt !== null
          ? insertGroupHex(groupId, nova, insertAt, true)
          : addGroupHex(groupId, nova, true)
      setInsertAt(null)
      // 'parada': seleciona pra abrir o popover e ROTULAR; 'caminho': segue
      // tocando os hexes da rota sem abrir nada.
      setSelectedId(addMode === 'parada' ? criado.id : null)
    } else {
      // fora do modo marcar: parada abre o popover; qualquer hex com conteúdo
      // (lugar OU área) abre a barra horizontal embaixo (mesmo estilo do /mapa)
      // e marca o hex; a barra direita/detalhes (#70/#89) segue pelo chip.
      setSelectedId(existente ? existente.id : null)
      const cel = cellAt(hexMap, cell.col, cell.row)
      const temConteudo = !!cel?.localId || areasAt(hexMap, cell.col, cell.row).length > 0
      setInfoHex(temConteudo ? cell : null)
      if (!openInfoForCell(cell.col, cell.row, false) && !existente) setInfoLocalId(null)
    }
  }

  // ── Token / moeda (#71) — arrastar e soltar ────────────────────────────────
  const onTokenPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!podeEditar) return
    tokenDragRef.current = true
    setTokenDropCell(atual ? { col: atual.col, row: atual.row } : null)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onTokenPointerUp = (e: React.PointerEvent) => {
    if (!tokenDragRef.current) return
    e.stopPropagation()
    tokenDragRef.current = false
    // Mantém tokenDropCell (o botão "Adicionar parada" aparece até confirmar
    // ou clicar fora). Só limpa se soltou fora da imagem.
    const cell = hexAtClient(e.clientX, e.clientY)
    if (!cell) setTokenDropCell(null)
    else setTokenDropCell(cell)
  }
  const onTokenClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Clique (sem arraste real) na moeda: abre a info do local ATUAL + imagem.
    if (atual && cellAt(hexMap, atual.col, atual.row)) {
      openInfoForCell(atual.col, atual.row, true)
      setSelectedId(atual.id)
    }
  }
  const confirmarParada = () => {
    if (!podeEditar || !tokenDropCell) return
    const nova = { col: tokenDropCell.col, row: tokenDropCell.row, data: todayISO(), kind: 'parada' as const }
    // allowDup: revisitar o mesmo lugar é permitido (#82).
    const criado =
      insertAt !== null
        ? insertGroupHex(groupId, nova, insertAt, true)
        : addGroupHex(groupId, nova, true)
    setInsertAt(null)
    setAtualHex(groupId, criado.id)
    setSelectedId(criado.id)
    setTokenDropCell(null)
  }

  // hover realça QUALQUER hex (todos podem virar parada, inclusive revisita #82).
  const hoverLivre = hoverHex
  const tokenCell = tokenDropCell ?? (atual ? { col: atual.col, row: atual.row } : null)
  const tokenCenter = tokenCell ? atlasHexCenter(tokenCell.col, tokenCell.row) : null
  // "Adicionar parada" aparece quando o token foi arrastado pra uma célula
  // DIFERENTE do hex atual (#82: pode ser um lugar já visitado = revisita).
  const podeAdicionar =
    !!tokenDropCell &&
    (!atual || tokenDropCell.col !== atual.col || tokenDropCell.row !== atual.row)

  return (
    <TipProvider>
      <style>{LOC_TIP_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={sectionTitleStyle}>{'// EXPLORAÇÃO'}</div>
        {/* #68: seletor de REGIÃO — vistas do mapa-múndi (mapa-vistas.ts). */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={fieldLabelStyle}>REGIÃO</span>
          {/* Pedido r4: só o MESTRE muda a região ativa do grupo (o valor é
              COMPARTILHADO via estado da sessão — a troca de um jogador
              mudava a vista de todo mundo). Jogador vê, não troca. */}
          <select
            aria-label="Região do grupo"
            value={regionId}
            disabled={!mestre}
            onChange={(e) => setRegiaoAtiva(groupId, e.target.value)}
            style={{ ...inputStyle, ...(mestre ? {} : { opacity: 0.7, cursor: 'default' }) }}
          >
            {permitidas.map((v) => (
              <option key={v.id} value={v.id}>
                {catalog.entryById.get(v.id)?.basename ?? v.nome}
              </option>
            ))}
          </select>
        </label>
        {/* O botão de adicionar parada vive no RODAPÉ da barra de CAMINHO
            (visível em tela cheia) — não mais aqui no cabeçalho (#82). */}
      </div>

      {/* #40/#41 — GATING por grupo (mestre-only): quais regiões os JOGADORES
          deste grupo/sessão podem ver no Atlas. Padrão = só Mundo Livre
          (anti-spoiler); o mestre libera Magna Pátria/Pátria Aurora aqui. */}
      {mestre && gatingKey ? <GatingRegioes grupoKey={gatingKey} /> : null}

      {/* Layout: barra esquerda (caminho) · mapa · barra direita (info).
          Em tela cheia (#80) a LINHA inteira vira overlay — as barras vão
          junto (a de caminhos fica acessível na tela cheia). */}
      <div
        ref={map.containerRef}
        style={fullscreenContainerStyle(
          // Em tela normal a LINHA tem a MESMA altura do mapa (min(68vh,620px)):
          // assim a barra de caminho não estica além do mapa — a lista rola por
          // dentro e o rodapé (Adicionar parada/caminho) fica fixo embaixo. Em
          // tela cheia, fullscreenContainerStyle sobrescreve com 100dvh.
          { display: 'flex', gap: 10, alignItems: 'stretch', height: 'min(68vh, 620px)' },
          map.fullscreen,
        )}
      >
        <LeftBar
          groupId={groupId}
          readOnly={readOnly}
          podeEditar={podeEditar}
          onEditar={() => setEditando(true)}
          onConcluir={() => {
            setEditando(false)
            setAddMode('off')
            setInsertAt(null)
            setTokenDropCell(null)
          }}
          state={state}
          hexMap={hexMap}
          collapsed={leftCollapsed}
          onToggle={() => setLeftCollapsed((c) => !c)}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            const h = state.hexes.find((x) => x.id === id)
            if (h) openInfoForCell(h.col, h.row, false)
          }}
          insertAt={insertAt}
          onInsertAt={(i) => {
            // escolhe a posição e liga o modo PARADA: o próximo hex tocado no
            // mapa entra AÍ (#82).
            setInsertAt((cur) => (cur === i ? null : i))
            setAddMode('parada')
          }}
          terrenoDe={terrenoMundo.terrenoDe}
          addMode={addMode}
          onSetMode={(m) =>
            setAddMode((cur) => {
              const next = cur === m ? 'off' : m // toca de novo no mesmo botão desliga
              if (next === 'off') setInsertAt(null)
              return next
            })
          }
        />

        {/* Painel do mapa (canto cortado do design) */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: map.fullscreen ? 'none' : clip(14),
            overflow: 'hidden',
          }}
        >
          {mapEntry ? (
            <div
              ref={map.viewportRef}
              data-mapa-viewport=""
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
              onClick={onMapClick}
              style={{
                height: map.fullscreen ? '100%' : 'min(68vh, 620px)',
                // #573: o canvas da grade é absoluto dentro da viewport
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                overflow: 'hidden',
                touchAction: 'none',
                cursor: pintor || addMode !== 'off' ? 'crosshair' : map.dragging ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
            >
              <div
                ref={map.mapRef}
                data-mapa=""
                style={{
                  position: 'relative',
                  height: '100%',
                  // A caixa É o recorte da vista: proporção do crop + overflow
                  // hidden clipam a imagem-múndi ao trecho visível da vista.
                  aspectRatio: `${crop.w} / ${crop.h}`,
                  overflow: 'hidden',
                  flex: 'none',
                  transform: map.transform,
                  transformOrigin: '0 0',
                }}
              >
                <img
                  src={camadas.estado.imgSrc ?? assetUrl(mapEntry)}
                  onError={assado.src ? undefined : imagemMapa.onError}
                  onLoad={(e) => camadas.onImgLoad(e.currentTarget.currentSrc || e.currentTarget.src)}
                  data-mapa-assado={!camadas.estado.mostrarOverlaySvg && assado.src ? '' : undefined}
                  alt={mapEntry.basename}
                  draggable={false}
                  data-mapa-img=""
                  style={{
                    // Mapa inteiro posicionado pra janela mostrar SÓ o crop:
                    // altura = mundo/crop; offsets em % da janela.
                    position: 'absolute',
                    height: `${(ATLAS_GRID_H / crop.h) * 100}%`,
                    left: `${(-crop.x / crop.w) * 100}%`,
                    top: `${(-crop.y / crop.h) * 100}%`,
                    width: 'auto',
                    maxWidth: 'none',
                    display: 'block',
                    visibility: camadas.estado.imgVisivel ? 'visible' : 'hidden',
                  }}
                />
                {/* Overlay em px da FONTE (viewBox = crop; escala com o mapa) */}
                <svg
                  viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`}
                  preserveAspectRatio="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  {overlayEntry && camadas.estado.mostrarOverlaySvg ? (
                    <>
                      <defs>
                        <clipPath id="explo-regioes-off">
                          {desabilitadas.flatMap((r) =>
                            (r.aneis ?? [r.pontos]).map((anel, i) => (
                              <polygon
                                key={`${r.id}:${i}`}
                                points={anel.map((p) => `${p.x},${p.y}`).join(' ')}
                              />
                            )),
                          )}
                        </clipPath>
                      </defs>
                      <image
                        data-overlay-desabilitado=""
                        href={imagemOverlay.src ?? assetUrl(overlayEntry)}
                        onError={imagemOverlay.onError}
                        onLoad={camadas.onOverlayLoad}
                        x={0}
                        y={0}
                        width={ATLAS_GRID_W}
                        height={ATLAS_GRID_H}
                        clipPath="url(#explo-regioes-off)"
                        style={{ pointerEvents: 'none' }}
                      />
                    </>
                  ) : null}
                  {/* #573: a malha vive no GradeCanvas (espaço de tela); o path
                      no SVG fica só como A/B do modo debug (grade = svg) */}
                  {gradeEm === 'svg' ? (
                    <path
                      data-hexgrid=""
                      d={vistaGridPath(crop)}
                      fill="none"
                      stroke={
                        addMode !== 'off'
                          ? 'color-mix(in srgb,var(--accent) 34%,transparent)'
                          : 'color-mix(in srgb,var(--accent) 15%,transparent)'
                      }
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* TERRENO do mundo (pintor do Modo Dev ligado): uma tinta
                      por terreno (um path só cada, DOM enxuto no gesto) +
                      o preview do traço em andamento (d via ref). */}
                  {tintas.map((tp) => (
                    <path
                      key={`terreno:${tp.chave}`}
                      data-terreno-tinta={tp.chave}
                      d={tp.d}
                      fill={tp.cor}
                      fillOpacity={0.32}
                      stroke={tp.cor}
                      strokeOpacity={0.6}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {pintor ? (
                    <path
                      ref={tracoPathRef}
                      data-terreno-traco=""
                      d=""
                      fill={pincel ? corPincel : 'transparent'}
                      fillOpacity={0.5}
                      stroke={pincel ? corPincel : 'var(--text)'}
                      strokeDasharray={pincel ? undefined : '4 3'}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* Hexes com LUGAR pontual (#70): realce sutil pra sinalizar
                      info clicável. Só o LUGAR — não as células de ÁREA de
                      região (senão o mapa inteiro parece marcado; pedido do
                      mestre). */}
                  {hexMap
                    .filter((c) => c.localId)
                    .map((c) => (
                      <polygon
                        key={`loc-${c.col},${c.row}`}
                        data-hex-local={`${c.col},${c.row}`}
                        points={atlasHexPolygonPoints(c.col, c.row)}
                        fill="color-mix(in srgb,var(--accent) 10%,transparent)"
                        stroke="color-mix(in srgb,var(--accent) 32%,transparent)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  {/* Hex SELECIONADO (clique na barra de info) — contorno como
                      no /mapa ("fica o lugar selecionado marcado"). */}
                  {infoHex ? (
                    <polygon
                      data-hex-selecionado=""
                      points={atlasHexPolygonPoints(infoHex.col, infoHex.row)}
                      fill="color-mix(in srgb,var(--accent) 20%,transparent)"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null}
                  {hoverLivre ? (
                    <polygon
                      data-hex-hover=""
                      points={atlasHexPolygonPoints(hoverHex!.col, hoverHex!.row)}
                      fill="color-mix(in srgb,var(--accent) 12%,transparent)"
                      stroke="color-mix(in srgb,var(--accent) 55%,transparent)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* Trilha ligando os centros das paradas na ORDEM do caminho (#69) */}
                  {state.hexes.length >= 2 ? (
                    <polyline
                      data-trilha=""
                      points={state.hexes
                        .map((h) => {
                          const c = atlasHexCenter(h.col, h.row)
                          return `${c.x},${c.y}`
                        })
                        .join(' ')}
                      fill="none"
                      stroke="var(--accent)"
                      strokeOpacity={0.55}
                      strokeWidth={1.6}
                      strokeDasharray="6 5"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* PARADA e CAMINHO são BOLINHAS (pedido do mestre: sem hex
                      destacado). PARADA = bolinha média (o tamanho da antiga de
                      caminho); CAMINHO = bolinha menor ainda; ATUAL em AZUL com
                      glow. SEM rótulo — o nome já está na arte do mapa (#85). */}
                  {state.hexes.map((h) => {
                    const isAtual = h.id === atual?.id
                    const isSel = h.id === selectedId
                    const parada = isParada(h)
                    const center = atlasHexCenter(h.col, h.row)
                    const glow = isAtual
                      ? { filter: `drop-shadow(0 0 8px color-mix(in srgb,${ATUAL_BLUE} 80%,transparent))` }
                      : undefined
                    const titleText = localTitleText(h)
                    // raio: ATUAL > PARADA (bolinha média) > CAMINHO (menor)
                    const r = isAtual ? 12 : parada ? 8 : 5
                    return (
                      <circle
                        key={h.id}
                        data-hex={h.id}
                        data-col={h.col}
                        data-row={h.row}
                        {...(isAtual ? { 'data-atual': '' } : {})}
                        {...(isSel ? { 'data-sel': '' } : {})}
                        {...(parada ? { 'data-parada-mapa': '' } : {})}
                        cx={center.x}
                        cy={center.y}
                        r={r}
                        fill={
                          isAtual
                            ? ATUAL_BLUE
                            : parada
                              ? 'color-mix(in srgb,var(--accent) 60%,transparent)'
                              : 'color-mix(in srgb,var(--accent) 40%,transparent)'
                        }
                        stroke={isAtual ? ATUAL_BLUE : isSel ? 'var(--text)' : 'var(--accent)'}
                        strokeWidth={isAtual || isSel ? 2.5 : 1.5}
                        vectorEffect="non-scaling-stroke"
                        style={glow}
                      >
                        {titleText ? <title>{titleText}</title> : null}
                      </circle>
                    )
                  })}
                  {/* Célula-alvo do token durante o arraste (#71) */}
                  {tokenDropCell ? (
                    <polygon
                      data-token-alvo=""
                      points={atlasHexPolygonPoints(tokenDropCell.col, tokenDropCell.row)}
                      fill="color-mix(in srgb,var(--accent) 22%,transparent)"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {/* #71 Token do grupo (moeda) no hex ATUAL/alvo do arraste */}
                  {tokenCenter ? (
                    <g
                      data-token=""
                      transform={`translate(${tokenCenter.x},${tokenCenter.y})`}
                      style={{ pointerEvents: 'auto', cursor: 'grab' }}
                      onPointerDown={onTokenPointerDown}
                      onPointerUp={onTokenPointerUp}
                      onClick={onTokenClick}
                    >
                      <circle
                        r={22}
                        fill={ATUAL_BLUE}
                        stroke="var(--panel)"
                        strokeWidth={4}
                        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' }}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={22}
                        style={{ userSelect: 'none' }}
                      >
                        ⚔️
                      </text>
                    </g>
                  ) : null}
                </svg>
              </div>
              {/* #573: malha do hexcrawl em canvas de tela, fora do div
                  transformado (no Gecko o path de 11k segmentos era o blob mais
                  caro a re-rasterizar por quadro do gesto). */}
              {gradeEm === 'canvas' ? (
                <GradeCanvas
                  map={map}
                  fonte={gridFonte}
                  cells={gridCells}
                  vertices={atlasHexVertices}
                  alpha={addMode !== 'off' ? 0.34 : 0.15}
                />
              ) : null}
            </div>
          ) : assets ? (
            <div style={{ ...sectionTitleStyle, padding: '16px 18px' }}>MAPA INDISPONÍVEL</div>
          ) : null}

          {/* #80 Controles de tela cheia + zoom sobrepostos */}
          {mapEntry ? <MapControls map={map} /> : null}
          {mapEntry && podePintar && viagemCfg ? (
            <PintorTerreno
              cfg={viagemCfg}
              ligado={pintor}
              onToggle={() => setPintando((p) => !p)}
              pincel={pincel}
              onPincel={setPincel}
            />
          ) : null}
          {mapEntry && preparandoMapa ? <AvisoPreparandoMapa /> : null}

          {/* #71 Botão "Adicionar parada" (após soltar o token numa célula nova) */}
          {podeAdicionar ? (
            <button
              data-add-parada=""
              onClick={confirmarParada}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 14,
                transform: 'translateX(-50%)',
                zIndex: 4,
                ...pillStyle(true),
                padding: '8px 16px',
                fontSize: 11,
              }}
            >
              + ADICIONAR PARADA
            </button>
          ) : null}

          {/* Barra horizontal de INFO do hex clicado (mesma do /mapa) — o
              LUGAR do hex em destaque + regiões que o englobam; clicar no chip
              abre o doc (detalhes/RightBar). */}
          {mapEntry && infoHex ? (
            <HexInfoBar
              cells={hexMap}
              col={infoHex.col}
              row={infoHex.row}
              onOpenDoc={(id) => {
                if (detail) detail.open({ kind: 'doc', id })
                else {
                  setInfoLocalId(id)
                  setRightCollapsed(false)
                }
              }}
              onClose={() => setInfoHex(null)}
            />
          ) : null}
        </div>

        {infoLocalId ? (
          <RightBar
            key={infoLocalId}
            localId={infoLocalId}
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((c) => !c)}
            onClose={() => setInfoLocalId(null)}
            withImage={infoWithImage}
          />
        ) : null}
      </div>

      {/* Popover da parada selecionada (edição de data/local) */}
      {selecionado ? (
        <HexInfo
          key={selecionado.id}
          groupId={groupId}
          readOnly={!podeEditar}
          hex={selecionado}
          hexMap={hexMap}
          meioTrecho={meioDoTrecho(state.hexes, state.hexes.indexOf(selecionado), hexIsParada)}
          terrenoDe={terrenoMundo.terrenoDe}
          atual={selecionado.id === atual?.id}
          onRemove={() => {
            removeGroupHex(groupId, selecionado.id)
            setSelectedId(null)
          }}
        />
      ) : null}
      </div>
      {mapTip
        ? createPortal(
            <div
              className="dv-breakdown-tip floating"
              style={{ left: mapTip.x + 16, top: mapTip.y + 18, maxWidth: 300, position: 'fixed', zIndex: 80 }}
              dangerouslySetInnerHTML={{ __html: mapTip.html }}
            />,
            document.body,
          )
        : null}
    </TipProvider>
  )
}

/** Controle de VISIBILIDADE das regiões do Atlas pros jogadores deste grupo
 *  (#41). Opera sobre o set EFETIVO (herdado do DEFAULT_VIEWER quando o grupo
 *  não tem config), pra habilitar Magna Pátria não derrubar o Mundo Livre.
 *  "Mundo Completo" = todas as regiões de uma vez. */
function GatingRegioes({ grupoKey }: { grupoKey: string }) {
  const cfg = useMapaAtlas()
  if (cfg.regioes.length === 0) return null
  // set efetivo: config própria do grupo OU o baseline herdado (Mundo Livre)
  const desabilitadas = new Set(regioesDesabilitadas(cfg, grupoKey).map((r) => r.id))
  const habilitada = (id: string) => !desabilitadas.has(id)
  const todas = cfg.regioes.every((r) => habilitada(r.id))
  const setTudo = (on: boolean) =>
    setRegioesHabilitadasGrupo(grupoKey, on ? cfg.regioes.map((r) => r.id) : [])
  const toggle = (id: string) => {
    const next = new Set(cfg.regioes.filter((r) => habilitada(r.id)).map((r) => r.id))
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRegioesHabilitadasGrupo(grupoKey, [...next])
  }
  const chkStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13 }
  return (
    <section
      data-gating-grupo=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(10),
      }}
    >
      <div style={sectionTitleStyle}>{'// MAPAS VISÍVEIS PRO GRUPO'}</div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.06em', color: 'var(--muted)' }}>
        os jogadores deste grupo só veem no Atlas as regiões marcadas aqui (padrão: só Mundo Livre)
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        <label style={{ ...chkStyle, fontWeight: 700 }}>
          <input
            type="checkbox"
            aria-label="Todas as regiões"
            checked={todas}
            onChange={(e) => setTudo(e.target.checked)}
          />
          Todas as regiões
        </label>
        <span aria-hidden style={{ borderLeft: '1px solid var(--line2)', alignSelf: 'stretch' }} />
        {cfg.regioes.map((r) => (
          <label key={r.id} style={chkStyle}>
            <input
              type="checkbox"
              aria-label={`Habilitar ${r.nome}`}
              checked={habilitada(r.id)}
                onChange={() => toggle(r.id)}
            />
            {r.nome}
          </label>
        ))}
      </div>
    </section>
  )
}

/** Popover da parada selecionada: nome + data + local + link pro doc.
 *  Edição da associação de Localização (dropdown do Atlas). */
function HexInfo({
  groupId,
  readOnly,
  hex,
  hexMap,
  meioTrecho,
  terrenoDe,
  atual,
  onRemove,
}: {
  groupId: string
  readOnly?: boolean
  hex: GroupHex
  hexMap: HexMapCell[]
  /** Terreno do mundo por hex (nota `viagem.terreno`). */
  terrenoDe: (col: number, row: number) => string | undefined
  /** Meio escolhido do trecho deste hex (meioDoTrecho) — pro tempo de cruzá-lo. */
  meioTrecho?: string
  atual: boolean
  onRemove: () => void
}) {
  const catalog = useCatalog()
  const lines = useMemo(() => locaisSelectLines(catalog), [catalog])
  // #214: MESMA resolução da lista (hexLabel) — a célula mapeada do mapa
  // (Safira etc.) dá o nome mesmo quando o GroupHex não carimbou localId.
  const nome = hexLabel(hex, hexMap, catalog)
  // #37 (report 695a288f): o LUGAR já pode estar DEFINIDO NO MAPA (o mestre
  // pintou a célula em mapa:mundo). Nesse caso o lugar do hex já é conhecido —
  // pedir pra selecionar de novo "não faz sentido". O dropdown LOCAL só faz
  // sentido pra hex SEM lugar mapeado (associação manual, legado).
  const lugarNoMapa = cellAt(hexMap, hex.col, hex.row)?.localId ?? null
  const lugarResolvido = lugarNoMapa ?? hex.localId ?? null
  // VIAGEM (2026-10-04): terreno do hex (nota do mundo ou o padrão da
  // config) + dias pra cruzá-lo com o meio do trecho (ou o automático).
  const viagemCfg = activeContextoDef()?.viagem ?? null
  const chaveTerreno = terrenoDe(hex.col, hex.row)
  const terreno = viagemCfg ? terrenoDoHex(chaveTerreno, viagemCfg) : null
  const travessia = viagemCfg ? custoHexNoTrecho(chaveTerreno, viagemCfg, meioTrecho) : null
  return (
    <div
      data-hex-info=""
      data-popover=""
      style={{
        padding: '14px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(12),
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 800 }}>{nome}</span>
        {atual ? (
          <span style={{ ...pillStyle(false), cursor: 'default', padding: '3px 9px' }}>ATUAL</span>
        ) : null}
        <span style={{ flex: 1 }} />
        {lugarResolvido ? (
          <Link
            to={docPath(lugarResolvido)}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.16em',
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            ABRIR DOC
          </Link>
        ) : null}
        {readOnly ? null : (
        <button
          onClick={onRemove}
          aria-label="Remover hex"
          style={{
            background: 'none',
            border: '1px solid var(--line2)',
            color: 'var(--muted)',
            width: 24,
            height: 24,
            lineHeight: 1,
            cursor: 'pointer',
            clipPath: clip(5),
          }}
        >
          ×
        </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {terreno && travessia ? (
          <div data-hex-terreno={terreno.chave} style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 100%' }}>
            <span style={fieldLabelStyle}>TERRENO</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>
              {terreno.nome}
              {' · '}
              {travessia.dias === null ? (
                <span data-hex-terreno-bloqueado="" style={{ color: 'var(--red)' }}>
                  nenhum meio do grupo cruza este hex
                </span>
              ) : (
                `${formatarDias(travessia.dias)} com ${travessia.meio}`
              )}
            </span>
          </div>
        ) : null}
        {/* #85: rótulo livre da parada pro LOG do grupo (o que fizeram ali). */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 100%', minWidth: 220 }}>
          <span style={fieldLabelStyle}>RÓTULO (LOG DO GRUPO)</span>
          <input
            data-hex-label=""
            type="text"
            placeholder="ex.: acampamos aqui · emboscada · encontramos o mercador"
            value={hex.label ?? ''}
            disabled={readOnly}
            onChange={(e) => updateGroupHex(groupId, hex.id, { label: e.target.value || undefined })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={fieldLabelStyle}>DATA</span>
          <input
            type="date"
            value={hex.data ?? ''}
            disabled={readOnly}
            onChange={(e) => updateGroupHex(groupId, hex.id, { data: e.target.value || undefined })}
            style={inputStyle}
          />
        </label>
        {/* #37: só oferece o dropdown quando o hex NÃO tem lugar definido no
            mapa. Com lugar mapeado, mostra-o como referência (sem pedir
            seleção redundante). */}
        {lugarNoMapa ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 220 }}>
            <span style={fieldLabelStyle}>LOCAL (DEFINIDO NO MAPA)</span>
            <span
              style={{
                ...inputStyle,
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--text)',
                background: 'color-mix(in srgb,var(--accent) 8%,var(--card))',
              }}
            >
              {catalog.entryById.get(lugarNoMapa)?.basename ?? lugarNoMapa.split('/').pop()}
            </span>
          </label>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 220 }}>
            <span style={fieldLabelStyle}>LOCAL</span>
            <select
              value={hex.localId ?? ''}
              disabled={readOnly}
              onChange={(e) => updateGroupHex(groupId, hex.id, { localId: e.target.value || undefined })}
              style={inputStyle}
            >
              {lines.map((line, i) => (
                <option key={i} value={line.value ?? ''} disabled={line.disabled}>
                  {line.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}
