// SESSÃO (#101) — tela cheia da rota /sessao, markup/estilos VERBATIM do
// design puxado (Companion App.dc.html §SESSÃO):
//   - fora de sessão: LISTA DE SESSÕES (entrar/lixeira), entrar por código,
//     criar nova sessão;
//   - em sessão: abas INICIATIVA (ficha do grupo + HERÓIS NA SESSÃO + bloco
//     COMBATE, #238) e DETALHES DA SESSÃO (nome/código, MESTRE, membros
//     claimed, ferramentas de mestre em breve).
// #238: o combate é o ENCOUNTER remoto da sala (#196), no formato do
// session-panel do pleitost-sync — GM tem INICIAR/PARAR (ícone muda com o
// estado) e PRÓXIMO/ANTERIOR só com combate ativo; o jogador só vê o bloco
// durante combate ativo, e aí a lista da mesa some (todo mundo está na lista
// do combate), como no plugin (gm-view.ts:85-91, player-view.ts:56-77/128-134).
import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { useAssetIndex } from '../../data/assets'
import { useEntityImageUrl } from '../../data/images'
import { useDocs } from '../../data/useDoc'
import { useGroupMembers } from '../../data/local-entities'
import { creatureImageUrl } from '../../data/creature-image'
import { linkLabel } from '../../markdown/dataview-value'
import { clip, PanelTrack } from '../ficha/bits'
import { num, str } from '../ficha/hero-model'
import {
  createSession,
  deleteSession,
  joinSessionByCode,
  setActiveSessionCode,
  updateSession,
  useSessions,
  type SessionRec,
} from '../../data/session-store'
import { useSessionRepo, useSessionUser } from '../../data/session-repo/provider'
import { loginGitHub, logoutSessao } from '../../data/session-repo/auth-state'
import { generateSessionCode } from '../../data/session-repo/contract'
import type { SessionCharacter, SessionRepo, SessionRealtime } from '../../data/session-repo/contract'
import {
  buildCharacterState,
  buildCharacterSummary,
  effectiveFmForPublish,
  extractFmBlob,
} from '../../data/session-repo/publish'
import type { Catalog } from '../../data/catalog'
import { startEncounterFromRoster, toggleRevealDisguisedNpc } from '../../data/session-repo/encounter-actions'
import { overlayDisguiseSecrets } from '../../data/session-repo/disguise-secrets'
import { abandonSession, disconnectSession, endSessionAsGm, isSessionCreator } from '../../data/session-repo/session-actions'
import { MESA_GRUPO_ID, setLiveSession, synthDocFromCharacter, useLiveSession } from '../../data/session-repo/live-session'
import { setConnectedUserIds, useConnectedUserIds } from '../../data/session-repo/session-presence'
import { useHeroRefs } from '../ficha/useHeroRefs'
import { useInterativaCtx } from '../../interativa/useInterativaCtx'
import {
  invocacoesAtivas,
  resolveActiveInvocacoes,
  isEvKey,
  invocStatEmoji,
  formatStatValue,
  type ActiveInvocacao,
} from '../../interativa/invocacao'
import { advanceTurn } from '../../data/session-repo/turn'
import {
  blockSortOrder,
  ladoDe,
  SPEED_EMOJI,
  SPEED_LABEL,
  SPEED_ORDER,
  blocoLabel,
  type Lado,
  type SpeedTier,
} from '../../data/initiative-blocks'
import { composeGroupName } from '../../data/session-repo/group-name'
import { useMesaGroupImageUrl } from '../../grupo/use-mesa-group-image'
import { maskedNames, vitaStatusOf, VITA_TONE_COLOR } from '../../data/session-repo/combatente'
import { getLocalDoc, localEntriesOfKind, useLocalStoreVersion } from '../../data/local-entities'
import { onHeroWrite } from '../../data/hero-store'
import { useDetail } from '../../data/detail-context'
import { Lightbox } from '../Lightbox'

// SESS_TABS / SESS_SEL_TABS — verbatim do script do design.
const SESS_TABS = [
  { id: 'iniciativa', label: 'INICIATIVA' },
  { id: 'detalhes', label: 'DETALHES DA SESSÃO' },
]

/** Iniciais do nome (sig do design: 'CF' pra Carlos Facão…). */
function sigOf(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

// #287: retrato do combatente/personagem via <img object-fit:cover> (não mais
// background-image). O `background-size:cover` estava sendo ignorado em runtime e
// a imagem aparecia ancorada no canto superior esquerdo em tamanho natural; um
// <img> com object-fit não pode ser resetado por shorthand e é o mesmo padrão do
// VaultImage que já funciona no resto do app. Container clipa/dimensiona; o img
// preenche 100% e centra.
const imgCover: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  display: 'block',
}

/** Retrato/imagem da sidebar que amplia no clique (feedback do mestre: "clicar
 *  na imagem abre ela maior, mobile ou pc"). Reusa o <Lightbox> do compêndio.
 *  stopPropagation: os retratos vivem dentro de linhas/botões clicáveis, então
 *  o zoom não pode disparar o clique do pai (navegar/selecionar). */
function ZoomImg({ src, alt, style }: { src: string; alt?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <img
        src={src}
        alt={alt ?? ''}
        style={{ ...imgCover, cursor: 'zoom-in', ...style }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      />
      {open ? <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

/** Ponte HEADLESS da sala viva (#186): mantém fetch+realtime da sessão ativa
 *  alimentando o live-session INDEPENDENTE de qual face da sidebar está
 *  visível — a SessaoPage desmonta quando o usuário vai pra DETALHES (resumo),
 *  e a sala não pode morrer junto. Montada no RightSidebar. */
export function LiveSessionBridge() {
  const repo = useSessionRepo()
  const user = useSessionUser()
  const { active } = useSessions()
  const remoteId = active?.remoteId ?? null
  // #226: sessões do usuário em QUALQUER dispositivo — logado, busca no
  // servidor as sessões em que é membro e registra as desconhecidas na lista
  // local (por código; não mexe na sessão ATIVA deste dispositivo).
  useEffect(() => {
    if (!repo || !user) return
    let alive = true
    repo
      .findSessionsByUser(user.id)
      .then((remotas) => {
        if (!alive) return
        for (const r of remotas) {
          const local = joinSessionByCode(r.code)
          updateSession(local.codigo, { nome: r.name, remoteId: r.id })
        }
      })
      .catch(() => {
        /* servidor fora — a lista local segue valendo */
      })
    return () => {
      alive = false
    }
  }, [repo, user])
  useEffect(() => {
    if (!remoteId || !repo || !user) return
    let alive = true
    const refetch = async () => {
      try {
        const [characters, members, sess, encounters] = await Promise.all([
          repo.findCharactersBySession(remoteId),
          repo.listMembers(remoteId),
          repo.findSessionById(remoteId),
          repo.listEncountersBySession(remoteId),
        ])
        if (alive)
          setLiveSession({
            sessionId: remoteId,
            gmUserId: sess?.gmUserId ?? null,
            state: sess?.state ?? null,
            characters,
            members,
            encounters,
          })
      } catch {
        // servidor fora — mantém o último snapshot
      }
    }
    void refetch()
    const off = repo.subscribe(remoteId, () => void refetch())
    // #294: presença ao vivo — marca a minha presença e assina quem está
    // conectado agora (transporte local não tem presença → optional chaining).
    const offPresence = repo.subscribePresence?.(
      remoteId,
      { userId: user.id, name: user.nome },
      setConnectedUserIds,
    )
    return () => {
      alive = false
      off()
      offPresence?.()
      setConnectedUserIds([])
      setLiveSession(null)
    }
  }, [remoteId, repo, user])
  return null
}

/* ═══════════════ sala remota (#186): jogadores + publicação ═══════════════ */

/** Barra de vida segmentada do design a partir de NÚMEROS (personagem remoto —
 *  mesmo vidaModel do CombatRow, sem hook local). */
function VidaBarRemota({ vit, vitMax, moral, moralMax, temp }: { vit: number; vitMax: number; moral: number; moralMax: number; temp: number }) {
  const T = Math.max(1, vitMax + moralMax)
  const pct = (v: number) => `${((v / T) * 100).toFixed(3)}%`
  const negTot = vit < 0 ? Math.min(-vit, vitMax) : 0
  const neg1 = Math.min(negTot, vitMax / 2)
  const neg2 = Math.max(0, negTot - vitMax / 2)
  const vitPos = Math.max(0, vit)
  return (
    <div style={{ position: 'relative', height: 10, background: 'var(--card)', border: '1px solid var(--line2)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: pct(vitPos), background: 'linear-gradient(90deg,#c0392b,#ff5547)', transition: 'width .35s ease' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: pct(neg1), background: 'repeating-linear-gradient(45deg,#d63a2a,#d63a2a 5px,#b93122 5px,#b93122 10px)' }} />
      <div style={{ position: 'absolute', top: 0, left: pct(vitMax / 2), height: '100%', width: pct(neg2), background: 'repeating-linear-gradient(45deg,#6e3a24,#6e3a24 5px,#512a1a 5px,#512a1a 10px)' }} />
      <div style={{ position: 'absolute', top: 0, left: pct(vitPos), height: '100%', width: pct(moral), background: 'linear-gradient(90deg,#2f6fd0,#4f9bff)', transition: 'width .35s ease,left .35s ease' }} />
      <div style={{ position: 'absolute', top: 0, left: pct(vitPos + moral), height: '100%', width: pct(temp), background: 'linear-gradient(90deg,#2e9e58,#43c974)' }} />
      <div style={{ position: 'absolute', top: 0, left: pct(vitMax), bottom: 0, width: 0, borderLeft: '1px dashed color-mix(in srgb,var(--muted) 55%,transparent)' }} />
    </div>
  )
}

/** Publica/re-publica o MEU herói local na sala e mantém a vida fluindo.
 *  Dois caminhos de escrita alimentam o mesmo updateCharacterState:
 *  - herói LOCAL grava via setLocalEntityFm → observamos useLocalStoreVersion
 *    e re-publicamos o state (barato; merge per top-level no servidor);
 *  - overlay do hero-store (writeHeroEdit) → onHeroWrite com guarda de
 *    origem 'sync'. O teste de 2 clientes pegou o primeiro caminho faltando. */
function usePublicacao(
  repo: (SessionRepo & SessionRealtime) | null,
  sessionId: string | null,
  meuChar: SessionCharacter | null,
  catalog: Catalog,
) {
  const version = useLocalStoreVersion()
  const charId = meuChar?.id ?? null
  const heroId = meuChar?.characterPath ?? null
  // #323/#326: publica o STATE com o FM DERIVADO — o corrente de vida/moral cai no
  // MÁX quando ausente (ficha nova), e o máx vem das regras da classe, não do 0
  // do FM cru. Deriva (async, cacheado) antes de mandar.
  const pushState = (cId: string, hId: string) => {
    const doc = getLocalDoc(hId)
    if (!doc) return
    void effectiveFmForPublish(doc, catalog).then((efm) => {
      repo?.updateCharacterState(cId, buildCharacterState(doc, efm)).catch(() => {})
      // #323/#326: RE-PUBLICA o SUMMARY (vida/defesas MÁX derivados). Heróis que
      // entraram na sessão ANTES do fix ficaram com o summary salvo no servidor
      // com máx 0 (→ "24/0", "0/0"); só o JOIN publicava summary. Ao dono abrir a
      // sessão, isto auto-corrige o registro no servidor.
      repo?.updateCharacterSummary(cId, buildCharacterSummary(doc, efm)).catch(() => {})
    })
  }
  useEffect(() => {
    if (!repo || !sessionId || !charId || !heroId) return
    pushState(charId, heroId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, repo, sessionId, charId, heroId])
  useEffect(() => {
    if (!repo || !sessionId || !charId || !heroId) return
    return onHeroWrite((id, path, _value, origem) => {
      if (id !== heroId || origem === 'sync' || !path.startsWith('Interativa.')) return
      pushState(charId, heroId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, sessionId, charId, heroId])
}

/** #327: CURA summaries velhos (vitalidadeMax 0 publicado ANTES do fix) sem
 *  depender do dono reabrir: o GM deriva a vida/defesas do fmBlob (que já viaja no
 *  personagem) e re-publica. Só toca em quem está com máx 0 e tem fmBlob — depois
 *  de curado (máx > 0) o filtro pula, sem laço. Best-effort: se o RLS barrar a
 *  escrita do GM num personagem de jogador, o .catch engole e o heal do dono
 *  (usePublicacao) segue como caminho. */
function useHealStaleSummaries(
  repo: (SessionRepo & SessionRealtime) | null,
  chars: readonly SessionCharacter[],
  catalog: Catalog,
  enabled: boolean,
) {
  useEffect(() => {
    if (!repo || !enabled) return
    let alive = true
    for (const c of chars) {
      if (c.summary.vitalidadeMax > 0) continue
      if (!c.fmBlob || Object.keys(c.fmBlob).length === 0) continue
      const doc = synthDocFromCharacter(c)
      void effectiveFmForPublish(doc, catalog).then((efm) => {
        if (!alive) return
        const s = buildCharacterSummary(doc, efm)
        if (s.vitalidadeMax > 0) void repo.updateCharacterSummary(c.id, s).catch(() => {})
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, chars, catalog, enabled])
}

/** Ordena a mesa (#231): cada herói seguido dos SEUS companheiros (CA
 *  identado); companheiro órfão (tutor fora da sala) fecha a lista. */
function ordenarMesa(chars: SessionCharacter[]): Array<{ c: SessionCharacter; ca: boolean }> {
  const vivos = chars.filter((c) => c.kind !== 'npc')
  const herois = vivos.filter((c) => c.kind !== 'companheiro')
  const cas = vivos.filter((c) => c.kind === 'companheiro')
  const out: Array<{ c: SessionCharacter; ca: boolean }> = []
  const usados = new Set<string>()
  for (const h of herois) {
    out.push({ c: h, ca: false })
    for (const ca of cas) {
      if (ca.tutorCharacterId === h.id) {
        out.push({ c: ca, ca: true })
        usados.add(ca.id)
      }
    }
  }
  for (const ca of cas) if (!usados.has(ca.id)) out.push({ c: ca, ca: true })
  return out
}


/** Linha de personagem da sala (#233) — retrato local-first (upload do
 *  aparelho > hierarquia da vault > iniciais), SEM nome de jogador (mora no
 *  MEMBROS dos detalhes) e toggle vida ↔ defesas espelhado do pleitost-sync
 *  (character-cards.ts: botão mostra o que VAI abrir — 🛡️ pra stats, ❤️ pra
 *  voltar; pills Defesa/Vigor/Evasão/Ímpeto/Movimento/Percepção/Intuição). */
function LinhaPersonagem({
  c,
  ca,
  isGm,
  onResumo,
  onFicha,
}: {
  c: SessionCharacter
  ca: boolean
  isGm: boolean
  onResumo: () => void
  onFicha: () => void
}) {
  const assets = useAssetIndex()
  const localImg = useEntityImageUrl(c.characterPath)
  const [view, setView] = useState<'vida' | 'stats'>('vida')
  const rr = c.state.recursosRestantes ?? {
    vitalidade: c.summary.vitalidadeMax,
    moral: c.summary.moralMax ?? 0,
    em: 0,
    moralTemp: 0,
  }
  // #280: avatar de combatente (pequeno) → thumb; imagem local é blob cru.
  const portrait = localImg ?? creatureImageUrl(synthDocFromCharacter(c), assets, true)
  const av = ca ? 32 : 42
  const st = c.summary.stats
  const pills: Array<[string, string, unknown]> = [
    ['🛡️', 'DEF', st?.defesa],
    ['❤️', 'VIG', st?.vigor],
    ['⚡', 'REF', st?.evasao],
    ['🔥', 'IMP', st?.impeto],
    ['👣', 'MOV', st?.movimento],
    ['👁️', 'PER', st?.percepcao],
    ['💡', 'ITU', st?.intuicao],
  ]
  return (
    <div
      data-ca-row={ca ? '' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: ca ? '8px 11px' : '11px 13px',
        marginLeft: ca ? 26 : 0,
        background: 'var(--card)',
        border: '1px solid var(--line)',
        clipPath: clip(12),
      }}
    >
      <span
        style={mono({
          width: av,
          height: av,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          clipPath: clip(9),
          fontSize: ca ? 12 : 15,
          color: 'var(--muted)',
        })}
      >
        {portrait ? <ZoomImg src={portrait} alt={c.summary.nome} /> : sigOf(c.summary.nome)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onResumo}
            title="Ver ficha resumo nos detalhes"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: ca ? 12.5 : 14.5,
              fontWeight: 700,
              color: 'var(--blue)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: '1 1 auto',
              minWidth: 0,
              textAlign: 'left',
            }}
          >
            {c.summary.nome}
          </button>
          <button
            onClick={() => setView((v) => (v === 'vida' ? 'stats' : 'vida'))}
            title={view === 'vida' ? 'Ver defesas/stats' : 'Ver vida (recursos)'}
            style={mono({
              padding: '3px 8px',
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              cursor: 'pointer',
              fontSize: 11,
              flex: 'none',
            })}
          >
            {view === 'vida' ? '🛡️' : '❤️'}
          </button>
          {isGm ? (
            <button
              onClick={onFicha}
              title="Abrir ficha completa (somente leitura)"
              style={mono({
                padding: '3px 8px',
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: 9.5,
                letterSpacing: '.06em',
                flex: 'none',
              })}
            >
              📄 FICHA
            </button>
          ) : null}
        </div>
        {view === 'vida' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 0 7px' }}>
              <span style={{ flex: 1 }} />
              <span style={mono({ fontSize: 10.5, color: 'var(--muted)', flex: 'none' })}>
                {`❤️ ${rr.vitalidade}/${c.summary.vitalidadeMax} · 💙 ${rr.moral}/${c.summary.moralMax ?? 0}${rr.moralTemp > 0 ? ` · 💚 +${rr.moralTemp}` : ''}`}
              </span>
            </div>
            <VidaBarRemota
              vit={rr.vitalidade}
              vitMax={c.summary.vitalidadeMax}
              moral={rr.moral}
              moralMax={c.summary.moralMax ?? 0}
              temp={rr.moralTemp}
            />
          </>
        ) : (
          <div data-stats-row="" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {pills.map(([ic, label, val]) => (
              <span
                key={label}
                style={mono({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  background: 'var(--panel)',
                  border: '1px solid var(--line2)',
                  fontSize: 10,
                  color: 'var(--text)',
                })}
              >
                {ic} {label} {String(val ?? '—')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SalaRemota({ sess }: { sess: SessionRec }) {
  const repo = useSessionRepo()
  const user = useSessionUser()
  const navigate = useNavigate()
  const detail = useDetail()
  const live = useLiveSession()
  const catalog = useCatalog()
  const [heroiSel, setHeroiSel] = useState('')
  const meusHerois = localEntriesOfKind('Heroi')

  const chars = live?.characters ?? []
  const members = live?.members ?? []
  const meuChar = user ? (chars.find((c) => c.memberId === user.id && c.kind === 'heroi') ?? null) : null
  usePublicacao(repo, sess.remoteId ?? null, meuChar, catalog)

  if (!repo || !user || !sess.remoteId) return null
  // #238 (sync gm-view.ts:85-91 / player-view.ts:128-134): a mesa some
  // durante combate ativo — todos os heróis estão na LISTA DO COMBATE. O
  // componente segue MONTADO (só o render é nulo; hooks acima continuam):
  // a publicação da vida (usePublicacao) precisa fluir justamente em combate.
  if ((live?.encounters ?? []).some((e) => e.status === 'active')) return null

  const publicar = async () => {
    const doc = heroiSel ? getLocalDoc(heroiSel) : null
    if (!doc || !sess.remoteId) return
    // req 8 (#187): publica o herói e o COMPANHEIRO ANIMAL dele junto (Tutor)
    // #323/#326: FM derivado (vida/defesas máx das regras da classe) pra summary/
    // state/blob — senão a mesa mostra vida/vigor 0/0 numa ficha nova.
    const efm = await effectiveFmForPublish(doc, catalog)
    const heroi = await repo.insertCharacter({
      sessionId: sess.remoteId,
      memberId: user.id,
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: doc.id,
      visibility: 'visible',
      summary: buildCharacterSummary(doc, efm),
      state: buildCharacterState(doc, efm),
      fmBlob: extractFmBlob(efm),
    })
    for (const ca of localEntriesOfKind('CompanheiroAnimal')) {
      const caDoc = getLocalDoc(ca.id)
      if (!caDoc) continue
      const tutor = str(caDoc.frontmatter['Tutor'])
      if (!tutor || !tutor.includes(doc.basename)) continue
      const caEfm = await effectiveFmForPublish(caDoc, catalog)
      await repo.insertCharacter({
        sessionId: sess.remoteId,
        memberId: user.id,
        kind: 'companheiro',
        tutorCharacterId: heroi.id,
        characterPath: caDoc.id,
        visibility: 'visible',
        summary: buildCharacterSummary(caDoc, caEfm),
        state: buildCharacterState(caDoc, caEfm),
        fmBlob: extractFmBlob(caEfm),
      })
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--line2)',
        background: 'var(--panel)',
        clipPath: clip(15),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
        <span style={mono({ fontSize: 12, letterSpacing: '.14em', color: 'var(--accent)', fontWeight: 700 })}>
          🌐 HERÓIS NA SESSÃO
        </span>
        <span style={{ flex: 1 }} />
        <span style={mono({ fontSize: 11, color: 'var(--muted)' })}>{members.length} na mesa</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
        {ordenarMesa(chars).map(({ c, ca }) => (
          <LinhaPersonagem
            key={c.id}
            c={c}
            ca={ca}
            isGm={Boolean(live?.gmUserId && user.id === live.gmUserId)}
            onResumo={() => detail?.open({ kind: 'resumo-sessao', id: c.id })}
            onFicha={() => navigate(`/sessao-ficha/${c.id}`)}
          />
        ))}
        {!meuChar ? (
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
            <select
              aria-label="Selecionar meu personagem"
              value={heroiSel}
              onChange={(e) => setHeroiSel(e.target.value)}
              style={mono({
                flex: 1,
                minWidth: 180,
                padding: '9px 11px',
                background: 'var(--card)',
                border: '1px solid var(--line2)',
                color: 'var(--text)',
                fontSize: 12,
              })}
            >
              <option value="">— selecionar meu personagem —</option>
              {meusHerois.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.basename}
                </option>
              ))}
            </select>
            <button
              disabled={!heroiSel}
              onClick={() => void publicar()}
              style={{
                padding: '9px 16px',
                background: heroiSel ? 'var(--accent)' : 'var(--card)',
                color: heroiSel ? 'var(--ink)' : 'var(--muted)',
                border: 'none',
                cursor: heroiSel ? 'pointer' : 'not-allowed',
                fontWeight: 700,
                fontSize: 12.5,
                clipPath: clip(8),
              }}
            >
              Entrar na mesa →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/* ═══════════════ combate da sala (#196/#238): encounters ═══════════════ */

/** Bloco COMBATE da sessão (#238) — port do session-panel do pleitost-sync
 *  sobre os encounters do SessionRepo:
 *  - GM sempre vê o bloco: INICIAR/PARAR trocam de ícone com o estado
 *    (▶ ↔ ■); INICIAR move heróis/companheiros pro combate (sync gm-view.ts
 *    "Iniciar Combate", :364) e PARAR arquiva — heróis voltam pra Mesa
 *    (sync gm-view.ts:242-252, 🛑 "Encerrar Combate");
 *  - PRÓXIMO/ANTERIOR só com combate ativo (sync gm-view.ts:217-240) —
 *    mudam o turno (wrap → round±1);
 *  - JOGADOR só vê o bloco com combate ATIVO (sync player-view.ts:56-77:
 *    a seção do encounter nem existe sem ele) e sem controles; NPC
 *    não-revelado aparece MASCARADO (maskedNames) com ESTIMATIVA de saúde
 *    por faixa (classifyVita) em vez de números; o GM vê tudo + toggles
 *    ❓/❗ (toggleRevealCharacter). */
/** #66: card READ-ONLY de uma invocação ativa no roster de combate — nome,
 *  vida (X/máx + moral temporária), defesas/stats e ataques resolvidos. */
export function InvocacaoRosterCard({ inv }: { inv: ActiveInvocacao }) {
  const { label, inst, resolved, evMax } = inv
  const stats = resolved ? Object.entries(resolved.stats).filter(([k]) => !isEvKey(k)) : []
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '7px 10px',
        background: 'color-mix(in srgb,var(--accent2) 7%,var(--card))',
        border: '1px solid color-mix(in srgb,var(--accent2) 32%,var(--line))',
        clipPath: clip(7),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span aria-hidden style={{ color: 'var(--accent2)', fontSize: 12 }}>↳</span>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>🔮 {label}</span>
        <span style={{ flex: 1 }} />
        <span style={mono({ fontSize: 10.5, color: '#d8695c', fontWeight: 700 })}>
          ❤️ {inst.vitalidade}/{evMax}
          {inst.moralTemporaria ? ` +${inst.moralTemporaria}` : ''}
        </span>
      </div>
      {stats.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
          {stats.map(([k, v]) => (
            <span key={k} style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
              {invocStatEmoji(k)} {formatStatValue(k, v)}
            </span>
          ))}
        </div>
      ) : null}
      {resolved?.ataques.map((at, i) => (
        <div key={i} style={mono({ fontSize: 9.5, color: 'var(--muted)' })}>
          ⚔️ {at.nome}
          {at.bonus != null
            ? ` ${typeof at.bonus === 'number' ? (at.bonus >= 0 ? '+' : '') + at.bonus : at.bonus}`
            : ''}
          {at.dano != null ? ` · ${at.dano}` : ''}
        </div>
      ))}
    </div>
  )
}

/** #66: invocações ativas de um combatente (Amálgama etc.) — resolve o stat
 *  block pelas regras do invocador (synthDoc + interativa) e renderiza aninhado
 *  embaixo dele, como o companheiro animal. Só monta quando há invocação ativa
 *  (o call-site gateia) — os hooks pesados não rodam pra combatente comum. */
function CombatenteInvocacoes({ char }: { char: SessionCharacter }) {
  const doc = useMemo(() => synthDocFromCharacter(char), [char])
  const refs = useHeroRefs(doc)
  const inter = useInterativaCtx(doc, refs)
  const resolvidas = useMemo(() => {
    const ativas = invocacoesAtivas({ Interativa: { Invocacoes_Ativas: char.state.invocacoesAtivas } })
    return resolveActiveInvocacoes(inter.descriptors, doc.frontmatter, ativas)
  }, [inter.descriptors, doc, char.state.invocacoesAtivas])
  if (resolvidas.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 22 }}>
      {resolvidas.map((a) => (
        <InvocacaoRosterCard key={a.inst.id} inv={a} />
      ))}
    </div>
  )
}

function CombateDaSala({ sess }: { sess: SessionRec }) {
  const repo = useSessionRepo()
  const user = useSessionUser()
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const live = useLiveSession()
  // #324: modo EDITAR INICIATIVA (só do GM) — habilita as alças de arrastar; fora
  // dele o combate fica como antes (vida + botão de defesas). O drag-and-drop é
  // pointer-based (funciona no touch mobile).
  const [editIniciativa, setEditIniciativa] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  // #324: bloco sob o dedo durante o arraste (alvo de drop = define a velocidade).
  const [overBlock, setOverBlock] = useState<{ tier: SpeedTier; lado: Lado } | null>(null)
  // Combatentes mostrando defesas/stats em vez de vida (toggle por linha, espelho
  // do card de MEMBRO). Set de ids.
  const [statsView, setStatsView] = useState<ReadonlySet<string>>(new Set())
  const toggleStats = (id: string) =>
    setStatsView((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  // #327: GM cura summaries com vitalidadeMax 0 (deriva do fmBlob) — não depende
  // do dono reabrir.
  useHealStaleSummaries(
    repo,
    live?.characters ?? [],
    catalog,
    !!(repo && live && user && live.gmUserId === user.id),
  )
  if (!repo || !user || !sess.remoteId || !live) return null
  const isGm = live.gmUserId === user.id
  const ativo = live.encounters.find((e) => e.status === 'active') ?? null
  const preparados = live.encounters.filter((e) => e.status === 'prepared')
  const sessionId = sess.remoteId

  const iniciar = async (encounterId: string) => {
    // NPCs do roster + turnState inicial: código compartilhado com o caminho
    // direto do bestiário (#229) — encounter-actions.startEncounterFromRoster.
    const enc = live.encounters.find((e) => e.id === encounterId)
    if (!enc) return
    await startEncounterFromRoster(repo, catalog, enc, user.id)
  }

  const iniciarAdHoc = async () => {
    // #238: INICIAR sem combate preparado — combate ad-hoc: só os heróis e
    // companheiros da mesa entram (semântica do repo.startEncounter); NPCs
    // chegam depois pelo bestiário (#229, addMonsterToInitiative). Nome vem
    // da sessão (não há nota de combate de origem).
    const enc = await repo.insertEncounter({
      sessionId,
      sourceNotePath: '',
      name: sess.nome,
      roster: { entries: [] },
      difficulty: null,
    })
    await startEncounterFromRoster(repo, catalog, enc, user.id)
  }

  const mover = async (delta: number) => {
    if (!ativo?.turnState) return
    const ts = ativo.turnState
    // #291: contador monotônico → PRÓXIMO/ANTERIOR são inversos exatos e a virada
    // de rodada não desincroniza (advanceTurn puro, testado).
    const { currentIndex, round } = advanceTurn(ts, delta)
    await repo.updateEncounterTurnState(ativo.id, { ...ts, currentIndex, round })
  }

  // #324: velocidade por combatente → forma os 6 blocos com o LADO (da família).
  // PADRÃO = lento (não existe "sem velocidade"). Guardada em turnState.speeds; ao
  // mudar, a ORDEM é reordenada pelos blocos (blockSortOrder) pro turno andar em
  // ordem de bloco e o display agrupar contíguo.
  const speeds = (ativo?.turnState?.speeds ?? {}) as Record<string, SpeedTier>
  const speedOf = (id: string): SpeedTier => speeds[id] ?? 'lento'
  const ladoOf = (id: string) =>
    ladoDe(live.characters.find((c) => c.id === id)?.summary.family ?? '')
  const assignSpeed = async (id: string, tier: SpeedTier) => {
    if (!ativo?.turnState) return
    const ts = ativo.turnState
    const sp = { ...(ts.speeds ?? {}), [id]: tier }
    const currentId = ts.order[ts.currentIndex] ?? ts.order[0]
    const order = blockSortOrder(ts.order, sp, ladoOf)
    const currentIndex = currentId ? Math.max(0, order.indexOf(currentId)) : ts.currentIndex
    await repo.updateEncounterTurnState(ativo.id, { ...ts, order, speeds: sp, currentIndex })
  }
  // ciclo entre as 3 velocidades (super → rápido → lento → super) — sem "nenhuma".
  const cycleSpeed = (id: string) => {
    const cur = speedOf(id)
    void assignSpeed(id, cur === 'super' ? 'rapido' : cur === 'rapido' ? 'lento' : 'super')
  }
  // #324: DRAG-AND-DROP pra dentro dos blocos. Ao mover, o bloco sob o dedo vira
  // alvo; ao soltar, define a velocidade (só se o LADO bater — não dá pra pôr
  // jogador em bloco de inimigo e vice-versa).
  const onDragMove = (e: { clientX: number; clientY: number }) => {
    if (!dragId) return
    const bl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-block-tier]') as
      | HTMLElement
      | null
    if (!bl) {
      setOverBlock(null)
      return
    }
    setOverBlock({ tier: bl.dataset.blockTier as SpeedTier, lado: bl.dataset.blockLado as Lado })
  }
  const onDragEnd = async () => {
    const from = dragId
    const target = overBlock
    setDragId(null)
    setOverBlock(null)
    // só atribui se o combatente é do MESMO lado do bloco alvo
    if (from && target && ladoOf(from) === target.lado) await assignSpeed(from, target.tier)
  }

  // #324: ESCONDER combatente — persiste em turnState.hidden (mesmo jsonb, sem
  // coluna nova). Jogadores não veem os escondidos; o GM vê com 🙈.
  const hidden = new Set(ativo?.turnState?.hidden ?? [])
  const toggleHidden = async (id: string) => {
    if (!ativo?.turnState) return
    const cur = ativo.turnState.hidden ?? []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    await repo.updateEncounterTurnState(ativo.id, { ...ativo.turnState, hidden: next })
  }

  // #291: pro GM, sobrepõe o real (do segredo) sobre os NPCs disfarçados — o
  // mestre vê a identidade/stats enquanto o jogador só recebe a linha mascarada.
  const chars = isGm ? overlayDisguiseSecrets(live.characters, live.sessionId) : live.characters
  const nomes = ativo
    ? maskedNames(
        chars.filter((c) => c.encounterId === ativo.id && c.kind === 'npc'),
        ativo.revealedCharacterIds,
      )
    : new Map<string, string>()
  const noCombate = ativo
    ? (ativo.turnState?.order ?? [])
        .map((id) => chars.find((c) => c.id === id))
        .filter((c): c is SessionCharacter => Boolean(c))
    : []
  // #324: os 6 blocos na ordem canônica (Super/Rápido/Lento × Jogador/Inimigo).
  const ALL_BLOCKS: { tier: SpeedTier; lado: Lado }[] = SPEED_ORDER.flatMap((tier) =>
    (['jogador', 'inimigo'] as Lado[]).map((lado) => ({ tier, lado })),
  )
  const orderIndexOf = (c: SessionCharacter) => (ativo?.turnState?.order ?? []).indexOf(c.id)
  const blocoHeaderEl = (tier: SpeedTier, lado: Lado) => (
    <div
      style={mono({
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        letterSpacing: '.12em',
        color: lado === 'jogador' ? 'var(--blue)' : 'var(--red)',
        fontWeight: 700,
      })}
    >
      <span style={{ fontSize: 13 }}>{SPEED_EMOJI[tier]}</span>
      {blocoLabel(tier, lado).toUpperCase()}
    </div>
  )
  // Linha de UM combatente (reusada dentro de cada bloco).
  const renderCombatente = (c: SessionCharacter) => {
    const i = orderIndexOf(c)
    const escondido = hidden.has(c.id)
    const vezAtual = ativo?.turnState?.currentIndex === i
    const npc = c.kind === 'npc'
    const revelado = ativo?.revealedCharacterIds.includes(c.id) ?? false
    const status = vitaStatusOf(c)
    const rr = c.state.recursosRestantes
    const mostraReal = !npc || isGm || revelado
    const temInvoc = mostraReal && Object.keys(c.state.invocacoesAtivas ?? {}).length > 0
    const nomeExib = mostraReal ? c.summary.nome : (nomes.get(c.id) ?? c.summary.nome)
    const portrait = mostraReal ? creatureImageUrl(synthDocFromCharacter(c), assets, true) : null
    return (
      <Fragment key={c.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 12px',
            background: `color-mix(in srgb,var(--accent) ${vezAtual ? 7 : 0}%,var(--card))`,
            border: `1px solid color-mix(in srgb,var(--accent) ${vezAtual ? 55 : 0}%,var(--line))`,
            opacity: dragId === c.id ? 0.4 : escondido ? 0.5 : 1,
            clipPath: clip(9),
          }}
        >
          {isGm && editIniciativa ? (
            <span
              onPointerDown={(e) => {
                setDragId(c.id)
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={onDragMove}
              onPointerUp={() => void onDragEnd()}
              onPointerCancel={() => {
                setDragId(null)
                setOverBlock(null)
              }}
              title="Arraste pra um bloco de velocidade"
              style={{ flex: 'none', cursor: 'grab', touchAction: 'none', fontSize: 15, lineHeight: 1, color: 'var(--muted)', padding: '0 2px' }}
            >
              ☰
            </span>
          ) : null}
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
              clipPath: clip(7),
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            {portrait ? <ZoomImg src={portrait} alt={nomeExib} /> : sigOf(nomeExib)}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>
            {npc && !isGm ? (nomes.get(c.id) ?? c.summary.nome) : c.summary.nome}
          </span>
          <div style={{ flex: 1, minWidth: 64, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {statsView.has(c.id) && (isGm || !npc) ? (
              <span style={mono({ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 7, flexWrap: 'wrap' })}>
                <span>🛡️{c.summary.stats?.defesa ?? 0}</span>
                <span>❤️{c.summary.stats?.vigor ?? 0}</span>
                <span>⚡{c.summary.stats?.evasao ?? 0}</span>
                <span>🔥{c.summary.stats?.impeto ?? 0}</span>
                <span>👣{c.summary.stats?.movimento ?? 0}</span>
                <span>👁️{c.summary.stats?.percepcao ?? 0}</span>
                <span>💡{c.summary.stats?.intuicao ?? 0}</span>
              </span>
            ) : npc && !isGm ? (
              // NPC pro JOGADOR: só a TAG de estimativa — borda + fundo tonal (mesmo
              // visual do pleitost-autosheet), SEM barra nem números.
              <span
                style={mono({
                  fontSize: 10,
                  fontWeight: 700,
                  color: VITA_TONE_COLOR[status.tone],
                  background: `color-mix(in srgb,${VITA_TONE_COLOR[status.tone]} 14%,transparent)`,
                  border: `1px solid color-mix(in srgb,${VITA_TONE_COLOR[status.tone]} 34%,transparent)`,
                  padding: '2px 8px',
                  clipPath: clip(5),
                  alignSelf: 'flex-start',
                })}
              >
                {status.label}
              </span>
            ) : (
              // Herói (pra todo mundo) e NPC pro GM: texto + BARRA DE VIDA com TODOS
              // os fatores (vida negativa hachurada, moral, moral temporária, marca
              // do máx). Reusa VidaBarRemota — mesmo componente da FICHA DO GRUPO. A
              // barra só entra com máx VÁLIDO (> 0); com máx 0 (summary velho não
              // curado) ela renderizava toda azul (segmento de moral estourando).
              <>
                {/* Texto compacto = só VITALIDADE (a moral/temp azul e verde ficam
                    na BARRA, sem virar um "X/X azul" confuso ao lado). */}
                <span style={mono({ fontSize: 9.5, color: npc ? VITA_TONE_COLOR[status.tone] : 'var(--muted)' })}>
                  {`❤️ ${rr?.vitalidade ?? c.summary.vitalidadeMax}/${c.summary.vitalidadeMax}${
                    npc ? ` · ${status.label}` : ''
                  }`}
                </span>
                {c.summary.vitalidadeMax > 0 ? (
                  <VidaBarRemota
                    vit={rr?.vitalidade ?? c.summary.vitalidadeMax}
                    vitMax={c.summary.vitalidadeMax}
                    moral={rr?.moral ?? (c.summary.moralMax ?? 0)}
                    moralMax={c.summary.moralMax ?? 0}
                    temp={rr?.moralTemp ?? 0}
                  />
                ) : null}
              </>
            )}
          </div>
          {isGm || !npc ? (
            <button
              onClick={() => toggleStats(c.id)}
              title={statsView.has(c.id) ? 'Ver vida' : 'Ver defesas/stats'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}
            >
              {statsView.has(c.id) ? '❤️' : '🛡️'}
            </button>
          ) : null}
          {isGm && editIniciativa ? (
            <button
              onClick={() => cycleSpeed(c.id)}
              title={`Velocidade: ${SPEED_LABEL[speedOf(c.id)]} (clica pra trocar)`}
              style={mono({ background: 'var(--panel)', border: '1px solid var(--line2)', cursor: 'pointer', fontSize: 13, padding: '1px 6px', flex: 'none' })}
            >
              {SPEED_EMOJI[speedOf(c.id)]}
            </button>
          ) : null}
          {isGm && editIniciativa ? (
            <button
              onClick={() => void toggleHidden(c.id)}
              title={escondido ? 'Mostrar aos jogadores' : 'Esconder dos jogadores'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
            >
              {escondido ? '🙈' : '👁️'}
            </button>
          ) : null}
          {isGm && npc && editIniciativa ? (
            <button
              onClick={() => void toggleRevealDisguisedNpc(repo, live.sessionId, ativo!.id, c.id)}
              title={revelado ? 'Esconder identidade dos players' : 'Revelar identidade aos players'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
            >
              {revelado ? '❗' : '❓'}
            </button>
          ) : null}
        </div>
        {temInvoc ? <CombatenteInvocacoes char={c} /> : null}
      </Fragment>
    )
  }

  const chip = (label: string, title: string, onClick: () => void, tone: 'accent' | 'red' = 'accent') => (
    <button
      onClick={onClick}
      title={title}
      style={mono({
        padding: '6px 12px',
        background: `color-mix(in srgb,var(--${tone}) 12%,transparent)`,
        border: `1px solid color-mix(in srgb,var(--${tone}) 45%,var(--line2))`,
        color: `var(--${tone})`,
        cursor: 'pointer',
        fontSize: 10,
        letterSpacing: '.1em',
        clipPath: clip(5),
      })}
    >
      {label}
    </button>
  )

  // #238: jogador sem combate ativo NÃO vê o bloco (sync player-view.ts:56-60
  // — a seção do encounter só existe quando há um ativo). GM sempre vê: é o
  // painel de controle dele (INICIAR mora aqui).
  if (!ativo && !isGm) return null

  return (
    <div
      style={{
        border: '1px solid color-mix(in srgb,var(--red) 40%,var(--line2))',
        background: 'color-mix(in srgb,var(--red) 5%,var(--panel))',
        clipPath: clip(15),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          borderBottom: '1px solid color-mix(in srgb,var(--red) 30%,var(--line))',
          flexWrap: 'wrap',
        }}
      >
        <span style={mono({ fontSize: 12, letterSpacing: '.14em', color: 'var(--red)', fontWeight: 700 })}>
          ⚔ COMBATE
        </span>
        <span style={{ flex: 1 }} />
        {ativo?.turnState ? (
          <span style={mono({ fontSize: 12, color: 'var(--muted)' })}>Turno {Math.max(1, ativo.turnState.round)}</span>
        ) : null}
        {isGm && ativo ? chip('◀ ANTERIOR', 'Turno anterior', () => void mover(-1)) : null}
        {isGm && ativo ? chip('PRÓXIMO ▶', 'Próximo turno', () => void mover(1)) : null}
        {/* #324: liga o modo de reordenar a iniciativa (só então aparecem as alças
            de arrastar); fora dele o combate fica como antes. */}
        {isGm && ativo
          ? chip(
              editIniciativa ? '✓ PRONTO' : '✎ EDITAR INICIATIVA',
              editIniciativa ? 'Concluir edição da iniciativa' : 'Reordenar a iniciativa (arrastar)',
              () => setEditIniciativa((v) => !v),
              editIniciativa ? 'red' : 'accent',
            )
          : null}
        {/* Iniciar/Parar — MESMO lugar, ícone muda com o estado (#238). Com
            combates PREPARADOS o iniciar é o de cada card (como no sync). */}
        {isGm && ativo ? chip('■ PARAR', 'Encerrar Combate', () => void repo.endEncounter(ativo.id), 'red') : null}
        {isGm && !ativo && preparados.length === 0
          ? chip('▶ INICIAR', 'Iniciar Combate', () => void iniciarAdHoc())
          : null}
      </div>
      {ativo || (isGm && preparados.length > 0) ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px' }}>
        {!ativo && isGm
          ? preparados.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</span>
                <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>
                  {e.roster.entries.map((r) => `${r.qty}× ${r.label}`).join(' · ')}
                </span>
                <span style={{ flex: 1 }} />
                {chip('▶ INICIAR', 'Iniciar Combate', () => void iniciar(e.id))}
              </div>
            ))
          : null}
        {ativo
          ? ALL_BLOCKS.map(({ tier, lado }) => {
              const itens = noCombate.filter(
                (c) => speedOf(c.id) === tier && ladoDe(c.summary.family) === lado,
              )
              const visiveis = itens.filter((c) => isGm || !hidden.has(c.id))
              // fora do modo EDITAR (ou pro jogador): só blocos com combatente visível.
              if (visiveis.length === 0 && !(editIniciativa && isGm)) return null
              const alvoValido =
                dragId != null &&
                overBlock?.tier === tier &&
                overBlock?.lado === lado &&
                ladoOf(dragId) === lado
              const cor = lado === 'jogador' ? 'blue' : 'red'
              return (
                <div
                  key={`${tier}:${lado}`}
                  data-block-tier={tier}
                  data-block-lado={lado}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 8,
                    border: alvoValido
                      ? '2px dashed var(--accent)'
                      : `1px dashed color-mix(in srgb,var(--${cor}) 40%,var(--line2))`,
                    background: alvoValido ? 'color-mix(in srgb,var(--accent) 8%,transparent)' : 'transparent',
                    clipPath: clip(11),
                  }}
                >
                  {blocoHeaderEl(tier, lado)}
                  {visiveis.map(renderCombatente)}
                  {editIniciativa && visiveis.length === 0 ? (
                    <span style={mono({ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', padding: '4px 2px' })}>
                      arraste um combatente pra cá
                    </span>
                  ) : null}
                </div>
              )
            })
          : null}
      </div>
      ) : null}
    </div>
  )
}

/* ═══════════════ painel INICIATIVA ═══════════════ */

function IniciativaPanel({ sess }: { sess: SessionRec }) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const live = useLiveSession()
  const mesaGroupImage = useMesaGroupImageUrl()
  const members = useGroupMembers(catalog, sess.grupoId ?? '')
  // Nome do grupo = apelidos dos HERÓIS (não o nome da sessão nem os companheiros
  // animais). Prefere os heróis da mesa VIVA (live.characters); sem sessão viva,
  // os membros do grupo local. `family`/subtype filtram companheiro/monstro no
  // composeGroupName (só 'Heroi' entra).
  const heroChars = (live?.characters ?? []).filter((c) => c.kind !== 'npc')
  const grupoNomes = heroChars.length
    ? composeGroupName(
        heroChars.map((c) => ({ nome: c.summary.nome, family: c.summary.family, fmBlob: c.fmBlob })),
      )
    : composeGroupName(
        members.map((m) => ({
          nome: m.basename ?? '',
          family: m.subtype === 'Companheiro Animal' ? 'CompanheiroAnimal' : 'Heroi',
        })),
      )

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* #225: ordem pedida — FICHA DO GRUPO em cima (leva pra mesa com
          todos pré-registrados), depois HERÓIS com vida, depois o COMBATE. */}
      <button
        onClick={() => navigate(`/herois?grupo=${encodeURIComponent(MESA_GRUPO_ID)}`)}
        title="Abrir ficha do grupo"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 15,
          padding: '15px 18px',
          background: 'var(--panel)',
          border: '1px solid var(--line2)',
          cursor: 'pointer',
          textAlign: 'left',
          clipPath: clip(15),
        }}
      >
        {/* Feedback do mestre: imagem REAL do grupo — subida (state, sincronizada)
            OU herdada do grupo persistente dos heróis (#74, mesma fonte da ficha
            de grupo cheia), com fallback pro emoji 👥. Clique amplia (ZoomImg). */}
        {mesaGroupImage ? (
          <div
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              overflow: 'hidden',
              clipPath: clip(9),
              border: '1px solid var(--line2)',
            }}
          >
            <ZoomImg src={mesaGroupImage} alt={grupoNomes || sess.nome} />
          </div>
        ) : (
          <span
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              background: 'var(--blue)',
              clipPath: clip(9),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            👥
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={mono({ fontSize: 10, letterSpacing: '.16em', color: 'var(--muted)', marginBottom: 4 })}>
            FICHA DO GRUPO ↗
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{grupoNomes || sess.nome}</div>
        </div>
        <span style={{ flex: 'none', color: 'var(--muted)', fontSize: 18 }}>→</span>
      </button>
      {/* Sala remota (#186): HERÓIS da mesa com a vida ao vivo — some
          enquanto há combate ativo (#238, todo mundo tá na lista dele). */}
      <SalaRemota sess={sess} />
      {/* COMBATE (#196/#238): encounters da sala no formato do pleitost-sync
          (iniciar/parar, próximo/anterior, máscara de NPC). O bloco local
          "ORDEM DE INICIATIVA" (init/defesas por herói) saiu no #238 — a
          ordem de turno é a do encounter remoto. */}
      <CombateDaSala sess={sess} />
    </div>
  )
}

/** Ficha do GRUPO da sala (#187): montada AUTOMATICAMENTE dos personagens
 *  publicados (summaries) — cresce conforme jogadores entram e nunca perde o
 *  estado (vive em session_characters, edição incremental). Colunas da tabela
 *  de VIDA do GRUPO (PanelVida / plugin aggregates). */
export function GrupoDaSala({ roster = true }: { roster?: boolean } = {}) {
  const live = useLiveSession()
  const chars = (live?.characters ?? []).filter((c) => c.kind !== 'npc')
  // #222/#223: a ficha do grupo NUNCA fica em branco — sem conexão viva
  // orienta; conectada mostra o roster (Mestre/jogadores/personagens) mesmo
  // antes de alguém publicar personagem.
  if (!live) {
    return (
      <div style={{ border: '1px dashed var(--line2)', background: 'var(--panel)', clipPath: clip(14), padding: '16px 18px' }}>
        <div style={mono({ fontSize: 11, letterSpacing: '.16em', color: 'var(--muted)', marginBottom: 8 })}>
          {'// FICHA DO GRUPO DA SESSÃO'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Sem conexão com a mesa — abre a aba SESSÃO (painel direito), entra com GitHub e a ficha
          do grupo monta aqui ao vivo.
        </div>
      </div>
    )
  }
  const gm = live.members.find((m) => m.role === 'gm' || m.userId === live.gmUserId) ?? null
  const jogadores = live.members.filter((m) => m !== gm)
  const personagensDe = (userId: string) =>
    chars.filter((c) => c.memberId === userId).map((c) => c.summary.nome)
  const th: CSSProperties = mono({
    fontSize: 9,
    letterSpacing: '.08em',
    color: 'var(--muted)',
    fontWeight: 700,
    padding: '4px 8px',
    textTransform: 'uppercase',
  })
  const td: CSSProperties = mono({ fontSize: 11.5, padding: '4px 8px', textAlign: 'center', color: 'var(--text)' })
  const COLS: Array<{ h: string; v: (c: SessionCharacter) => string }> = [
    { h: '❤️ VIT', v: (c) => `${c.state.recursosRestantes?.vitalidade ?? c.summary.vitalidadeMax}/${c.summary.vitalidadeMax}` },
    { h: '💙 MOR', v: (c) => `${c.state.recursosRestantes?.moral ?? c.summary.moralMax ?? 0}/${c.summary.moralMax ?? 0}` },
    { h: '🛡️ DEF', v: (c) => String(c.summary.stats?.defesa ?? '—') },
    { h: '❤️ VIG', v: (c) => String(c.summary.stats?.vigor ?? '—') },
    { h: '🔥 IMP', v: (c) => String(c.summary.stats?.impeto ?? '—') },
    { h: '⚡ REF', v: (c) => String(c.summary.stats?.evasao ?? '—') },
    { h: '👁️ PER', v: (c) => String(c.summary.stats?.percepcao ?? '—') },
    { h: '💡 ITU', v: (c) => String(c.summary.stats?.intuicao ?? '—') },
    { h: '👣 MOV', v: (c) => String(c.summary.stats?.movimento ?? '—') },
  ]
  return (
    <div style={{ border: '1px solid var(--line2)', background: 'var(--panel)', clipPath: clip(14), padding: '14px 16px' }}>
      <div style={mono({ fontSize: 11, letterSpacing: '.16em', color: 'var(--muted)', marginBottom: 8 })}>
        {'// FICHA DO GRUPO DA SESSÃO'}
      </div>
      {/* #223: "Deveria mostrar quem é o Mestre, quem são os jogadores e os
          personagens" — roster da mesa, GM primeiro, personagens por jogador */}
      {roster ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--accent)' })}>👁️ MESTRE</span>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{gm?.displayName ?? '—'}</span>
        </div>
        <div style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--muted)' })}>
          {`PERSONAGENS · ${chars.length} · JOGADORES · ${jogadores.length}`}
        </div>
        {/* #224: numa ficha de grupo o PERSONAGEM é o protagonista — nome do
            personagem em destaque, jogador como anotação ao lado. */}
        {jogadores.map((j) => {
          const ps = personagensDe(j.userId)
          return ps.length ? (
            ps.map((p) => (
              <div key={`${j.userId}:${p}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--blue)' }}>{p}</span>
                <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>{j.displayName}</span>
              </div>
            ))
          ) : (
            <div key={j.userId} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{j.displayName}</span>
              <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>sem personagem na mesa</span>
            </div>
          )
        })}
      </div>
      ) : null}
      {chars.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Nenhum personagem publicado ainda — cada jogador entra na mesa pela aba SESSÃO
          (selecionar personagem → Entrar na mesa).
        </div>
      ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Nome</th>
              {COLS.map((c) => (
                <th key={c.h} style={th}>
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chars.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 8px', whiteSpace: 'nowrap', color: 'var(--blue)' }}>
                  {c.summary.nome}
                </td>
                {COLS.map((col) => (
                  <td key={col.h} style={td}>
                    {col.v(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}

/* ═══════════════ painel DETALHES DA SESSÃO ═══════════════ */

function PcRow({ heroId }: { heroId: string }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const docs = useDocs(useMemo(() => [heroId], [heroId]))
  const doc = docs?.get(heroId)
  const nome = doc?.basename ?? catalog.entryById.get(heroId)?.basename ?? heroId
  // #280: retrato de PC no painel de detalhes (pequeno) → thumb.
  const portrait = doc ? creatureImageUrl(doc, assets, true) : null
  const classe = doc ? linkLabel(str(doc.frontmatter['Classe'])) : ''
  const nivel = doc ? num(doc.frontmatter['Nível']) : 0
  const sub = classe ? `${classe}${nivel ? ` · Nível ${nivel}` : ''}` : ''
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 12px',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        clipPath: clip(9),
      }}
    >
      {portrait ? (
        <div
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            overflow: 'hidden',
            border: '1px solid var(--line2)',
            clipPath: clip(8),
          }}
        >
          <ZoomImg src={portrait} alt={nome} />
        </div>
      ) : (
        <span
          style={mono({
            width: 38,
            height: 38,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(8),
            fontSize: 12,
            color: 'var(--muted)',
          })}
        >
          {sigOf(nome)}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nome}
        </div>
        {sub ? (
          <div style={mono({ fontSize: 10, letterSpacing: '.06em', color: 'var(--muted)', marginTop: 2 })}>{sub}</div>
        ) : null}
      </div>
    </div>
  )
}

/** Feedback do mestre: nos DETALHES o HERÓI é o protagonista — nome do herói em
 *  destaque e, logo abaixo, identado com uma seta ↳, o usuário do jogador. Fica
 *  homogêneo pros dois casos (com e sem personagem na mesa). */
/** Bolinha "conectado agora" (#294): pulso verde discreto; título acessível. */
function PresencaDot() {
  return (
    <span
      title="Conectado agora"
      aria-label="Conectado agora"
      style={{
        flex: 'none',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#16a34a',
        boxShadow: '0 0 0 3px color-mix(in srgb,#16a34a 25%,transparent)',
      }}
    />
  )
}

function HeroUserRow({
  heroi,
  usuario,
  conectado,
}: {
  heroi: string | null
  usuario: string
  conectado?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: heroi ? 'var(--blue)' : 'var(--muted)' }}>
        {heroi ?? 'Sem personagem'}
      </span>
      <span
        style={mono({
          fontSize: 10.5,
          color: 'var(--muted)',
          paddingLeft: 15,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        })}
      >
        <span>↳ {usuario}</span>
        {conectado ? <PresencaDot /> : null}
      </span>
    </div>
  )
}

/** MEMBROS da sessão, colapsável (#225): mestre + cada personagem com o
 *  usuário do jogador abaixo (HeroUserRow); membro sem personagem também lista. */
export function MembrosColapsavel({ live }: { live: NonNullable<ReturnType<typeof useLiveSession>> }) {
  const [aberto, setAberto] = useState(true)
  const conectados = useConnectedUserIds()
  const gm = live.members.find((m) => m.role === 'gm' || m.userId === live.gmUserId) ?? null
  const jogadores = live.members.filter((m) => m !== gm)
  const chars = live.characters.filter((c) => c.kind !== 'npc')
  return (
    <div style={{ border: '1px solid var(--line2)', background: 'var(--panel)', clipPath: clip(14) }}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
          fontFamily: 'inherit',
        }}
      >
        <span style={mono({ fontSize: 11, letterSpacing: '.16em', color: 'var(--muted)' })}>
          {`// MEMBROS · ${live.members.length}`}
        </span>
        <span style={{ flex: 1 }} />
        <span aria-hidden style={{ color: 'var(--muted)', fontSize: 12 }}>
          {aberto ? '▾' : '▸'}
        </span>
      </button>
      {aberto ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '0 16px 14px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--accent)' })}>👁️ MESTRE</span>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{gm?.displayName ?? '—'}</span>
            {gm && conectados.has(gm.userId) ? <PresencaDot /> : null}
          </div>
          {jogadores.map((j) => {
            const online = conectados.has(j.userId)
            const ps = chars.filter((c) => c.memberId === j.userId).map((c) => c.summary.nome)
            return ps.length ? (
              ps.map((p) => (
                <HeroUserRow key={`${j.userId}:${p}`} heroi={p} usuario={j.displayName} conectado={online} />
              ))
            ) : (
              <HeroUserRow key={j.userId} heroi={null} usuario={j.displayName} conectado={online} />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function DetalhesPanel({ sess }: { sess: SessionRec }) {
  // #223: conectado, a fonte é a SALA (membros com papel + personagens
  // publicados) — o modelo local (claims de heróis) é só o fallback offline.
  const live = useLiveSession()
  const repo = useSessionRepo()
  const user = useSessionUser()
  const membros = Object.entries(sess.claims)
  // Feedback do mestre: o botão de saída precisa separar DESCONECTAR (volta à
  // lista, membership intacta) de ABANDONAR/ENCERRAR. Só o CRIADOR (papel gm da
  // sessão, não o toggle Modo Mestre) encerra a mesa pra todos.
  const ehCriador = isSessionCreator(live, user, sess)
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg,color-mix(in srgb,var(--accent) 5%,var(--panel2)),var(--panel))',
          border: '1px solid var(--line2)',
          clipPath: clip(15),
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 3, background: 'var(--accent)' }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 21, fontWeight: 700, color: 'var(--accent)' }}>{sess.nome}</span>
          <span style={mono({ fontSize: 12, color: 'var(--muted)' })}>
            CÓDIGO: <span style={{ color: 'var(--text)' }}>{sess.codigo}</span>
          </span>
        </div>
      </div>
      {/* #231: a ficha do grupo NÃO mora nos detalhes — ela abre pelo link
          FICHA DO GRUPO da iniciativa (GrupoView com as abas). Aqui fica só
          o MEMBROS colapsável. */}
      {live ? <MembrosColapsavel live={live} /> : null}
      {!live && sess.mestre ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            background: 'color-mix(in srgb,var(--accent) 6%,var(--panel))',
            border: '1px solid color-mix(in srgb,var(--accent) 30%,var(--line2))',
            clipPath: clip(12),
          }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb,var(--accent) 16%,var(--card))',
              border: '1px solid color-mix(in srgb,var(--accent) 40%,var(--line2))',
              clipPath: clip(8),
              fontSize: 19,
            }}
          >
            👁️
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={mono({ fontSize: 9.5, letterSpacing: '.14em', color: 'var(--accent)', marginBottom: 3 })}>
              MESTRE
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{sess.mestre}</div>
          </div>
        </div>
      ) : null}
      {live ? null : (
        <div style={mono({ fontSize: 11, letterSpacing: '.16em', color: 'var(--muted)', marginTop: 4 })}>
          {`// MEMBROS NA SESSÃO · ${membros.length}`}
        </div>
      )}
      {(live ? [] : membros).map(([jogador, heroIds]) => (
        <div
          key={jogador}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            padding: '15px 17px',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(14),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={mono({
                fontSize: 9.5,
                letterSpacing: '.1em',
                color: 'var(--accent2)',
                background: 'color-mix(in srgb,var(--accent2) 15%,transparent)',
                border: '1px solid color-mix(in srgb,var(--accent2) 42%,transparent)',
                padding: '3px 8px',
                clipPath: clip(5),
              })}
            >
              ◆ CLAIMED
            </span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{jogador}</span>
            <span style={{ flex: 1 }} />
            <span style={mono({ fontSize: 10.5, color: 'var(--muted)' })}>
              {heroIds.length === 1 ? '1 personagem' : `${heroIds.length} personagens`}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {heroIds.map((id) => (
              <PcRow key={id} heroId={id} />
            ))}
          </div>
        </div>
      ))}
      {/* #234 → feedback do mestre: DESCONECTAR (fica no histórico p/ rejoin) +
          ABANDONAR (jogador) OU ENCERRAR (criador, some pra todos). Espelha o
          pleitost-sync (view.ts). */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        <button
          onClick={() => disconnectSession()}
          title="Desconectar — a sessão fica no histórico; rejoine quando quiser"
          style={mono({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '11px 16px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: '.1em',
            clipPath: clip(8),
          })}
        >
          ↩ DESCONECTAR
        </button>
        {ehCriador ? (
          <button
            onClick={() => {
              if (window.confirm(`Encerrar "${sess.nome}" pra todos os jogadores? A mesa deixa de existir.`))
                void endSessionAsGm(repo, sess.remoteId, sess.codigo)
            }}
            title="Encerrar sessão (pra todos os jogadores)"
            style={mono({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 16px',
              background: 'color-mix(in srgb,var(--red) 10%,var(--card))',
              border: '1px solid color-mix(in srgb,var(--red) 38%,var(--line2))',
              color: '#d8695c',
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: '.1em',
              clipPath: clip(8),
            })}
          >
            ⛔ ENCERRAR SESSÃO
          </button>
        ) : (
          <button
            onClick={() => {
              if (window.confirm(`Abandonar "${sess.nome}"? Pra voltar você precisa do código.`))
                void abandonSession(repo, sess.remoteId, user?.id, sess.codigo)
            }}
            title="Abandonar — sai da sessão no server; pra voltar precisa do código"
            style={mono({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 16px',
              background: 'color-mix(in srgb,var(--red) 10%,var(--card))',
              border: '1px solid color-mix(in srgb,var(--red) 38%,var(--line2))',
              color: '#d8695c',
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: '.1em',
              clipPath: clip(8),
            })}
          >
            🚪 ABANDONAR SESSÃO
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ servidor (login GitHub + status) ═══════════════ */

function AuthBox() {
  const repo = useSessionRepo()
  const user = useSessionUser()
  const [erro, setErro] = useState('')
  if (!repo) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '12px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(10),
      }}
    >
      <span style={mono({ fontSize: 10, letterSpacing: '.14em', color: 'var(--muted)' })}>🌐 SERVIDOR</span>
      <span style={{ flex: 1 }} />
      {user ? (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{user.nome}</span>
          <button
            onClick={() => void logoutSessao()}
            style={mono({
              padding: '5px 10px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 10,
              clipPath: clip(5),
            })}
          >
            SAIR
          </button>
        </>
      ) : (
        // #204: auth EXCLUSIVAMENTE GitHub — sem entrada anônima/convidado
        // (decisão do usuário: anonymous sign-in desabilitado no Supabase).
        <button
          onClick={() => void loginGitHub().catch((e) => setErro(String(e?.message ?? e)))}
          style={{
            padding: '7px 14px',
            background: 'color-mix(in srgb,var(--accent) 16%,var(--card))',
            border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
            clipPath: clip(7),
          }}
        >
           Entrar com GitHub
        </button>
      )}
      {erro ? <span style={mono({ fontSize: 10.5, color: 'var(--red)' })}>{erro}</span> : null}
    </div>
  )
}

/* ═══════════════ LISTA DE SESSÕES (fora de sessão) ═══════════════ */

function ListaPanel({ sessions }: { sessions: SessionRec[] }) {
  const repo = useSessionRepo()
  const user = useSessionUser()
  const catalog = useCatalog()
  const [joinCode, setJoinCode] = useState('')
  const [erro, setErro] = useState('')
  // Nome do herói pra lista: vault (catálogo) ou entidade local; id cru como
  // último recurso (nunca inventa).
  const heroNome = (id: string) =>
    catalog.entryById.get(id)?.basename ?? getLocalDoc(id)?.basename ?? id

  // Com login no servidor, criar/entrar passam pelo servidor (o código vem de
  // lá; o registro local vira o espelho da sala). Sem servidor, local puro.
  // Com login (Supabase), criar/entrar passam pelo SessionRepo (#186): o
  // registro LOCAL vira espelho da sala (remoteId liga o modo vivo). Sem
  // servidor/login, fluxo local puro como antes.
  const join = async () => {
    const code = joinCode.trim()
    if (!code) return
    setErro('')
    if (repo && user) {
      try {
        const remote = await repo.findSessionByCode(code)
        if (remote) {
          const existing = await repo.findMember(remote.id, user.id)
          if (!existing) {
            await repo.insertMember({
              sessionId: remote.id,
              userId: user.id,
              role: remote.gmUserId === user.id ? 'gm' : 'player',
              displayName: user.nome,
            })
          }
          const local = joinSessionByCode(remote.code)
          updateSession(local.codigo, { nome: remote.name, remoteId: remote.id })
          setActiveSessionCode(remote.code)
          setJoinCode('')
          return
        }
        // #295: o servidor respondeu e NÃO há sessão com esse código — erro claro
        // em vez de cair no fluxo local, que criava um placeholder fantasma e
        // "entrava" numa sessão inexistente.
        setErro('Sessão não encontrada. Confira o código com o mestre.')
        return
      } catch {
        // servidor indisponível (erro de rede) — degrada pro fluxo local abaixo.
      }
    }
    const rec = joinSessionByCode(code)
    setActiveSessionCode(rec.codigo)
    setJoinCode('')
  }
  const criar = async () => {
    // #203: sessão NUNCA seleciona grupo — a ficha de grupo existe só a
    // partir das sessões reais, montada pelos jogadores que entram (req 8).
    const grupoId = null
    const nome = 'Nova Sessão'
    if (repo && user) {
      try {
        const sess = await repo.createSession({ name: nome, gmUserId: user.id, code: generateSessionCode() })
        await repo.insertMember({ sessionId: sess.id, userId: user.id, role: 'gm', displayName: user.nome })
        const local = joinSessionByCode(sess.code)
        updateSession(local.codigo, { nome: sess.name, grupoId, mestre: user.nome, remoteId: sess.id })
        setActiveSessionCode(sess.code)
        return
      } catch {
        // servidor indisponível — cai no fluxo local
      }
    }
    const rec = createSession(nome, grupoId, user?.nome || 'Você')
    setActiveSessionCode(rec.codigo)
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={mono({ fontSize: 12, letterSpacing: '.16em', color: 'var(--accent)', fontWeight: 700 })}>
        {'// LISTA DE SESSÕES'}
      </div>
      <AuthBox />
      {sessions.map((s) => {
        const membros = Object.entries(s.claims)
        return (
        <div
          key={s.codigo}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '13px 16px',
            background: 'linear-gradient(135deg,var(--panel2),var(--panel))',
            border: '1px solid var(--line2)',
            clipPath: clip(14),
          }}
        >
          {/* Feedback do mestre: botão Entrar MENOR, no cabeçalho do card. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15.5, fontWeight: 700 }}>{s.nome}</span>
            <span
              style={mono({
                fontSize: 10.5,
                color: 'var(--muted)',
                background: 'var(--card)',
                border: '1px solid var(--line2)',
                padding: '2px 8px',
                clipPath: clip(5),
              })}
            >
              {s.codigo}
            </span>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setActiveSessionCode(s.codigo)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                background: 'color-mix(in srgb,var(--accent) 16%,var(--card))',
                border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 11.5,
                clipPath: clip(6),
              }}
            >
              ▶ Entrar
            </button>
            <button
              aria-label={`Excluir sessão ${s.nome}`}
              onClick={() => deleteSession(s.codigo)}
              style={{
                width: 28,
                height: 26,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb,var(--red) 10%,var(--card))',
                border: '1px solid color-mix(in srgb,var(--red) 38%,var(--line2))',
                color: '#d8695c',
                cursor: 'pointer',
                fontSize: 12,
                clipPath: clip(5),
              }}
            >
              🗑️
            </button>
          </div>
          {s.mestre ? (
            <div style={mono({ fontSize: 10, letterSpacing: '.08em', color: 'var(--muted)' })}>
              👁️ MESTRE · <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.mestre}</span>
            </div>
          ) : null}
          {/* Feedback do mestre: usuários e seus heróis (mesmo inativos), resumidos. */}
          {membros.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {membros.map(([jogador, heroIds]) => (
                <div key={jogador} style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--blue)' }}>{jogador}</span>
                  {heroIds.length ? (
                    heroIds.map((hid) => (
                      <span
                        key={hid}
                        style={mono({
                          fontSize: 10,
                          color: 'var(--muted)',
                          background: 'var(--card)',
                          border: '1px solid var(--line)',
                          padding: '1px 7px',
                          clipPath: clip(4),
                        })}
                      >
                        {heroNome(hid)}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>sem herói</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem jogadores ainda</div>
          )}
          <div style={mono({ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--muted)' })}>
            {s.ultimaConexao
              ? `Última Conexão: ${new Date(s.ultimaConexao).toLocaleString('pt-BR')}`
              : `Criada em ${new Date(s.criadaEm).toLocaleDateString('pt-BR')}`}
          </div>
        </div>
        )
      })}
      {/* Feedback do mestre: "+ Criar" ao LADO do "Entrar", autocontido. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 16,
          background: 'var(--panel)',
          border: '1px dashed var(--line2)',
          clipPath: clip(14),
          marginTop: 6,
        }}
      >
        <div style={mono({ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--muted)' })}>ENTRAR EM UMA SESSÃO</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Código da sessão"
            style={mono({
              flex: 1,
              minWidth: 150,
              padding: '10px 13px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              color: 'var(--text)',
              fontSize: 13,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              clipPath: clip(8),
            })}
          />
          <button
            onClick={join}
            style={{
              padding: '10px 18px',
              background: 'var(--accent)',
              color: 'var(--ink)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              letterSpacing: '.05em',
              fontSize: 13,
              clipPath: clip(9),
            }}
          >
            Entrar →
          </button>
          <button
            onClick={criar}
            title="Criar nova sessão"
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 700,
              letterSpacing: '.05em',
              fontSize: 13,
              clipPath: clip(9),
            }}
          >
            + Criar
          </button>
        </div>
        {erro ? (
          <div style={mono({ fontSize: 11, color: 'var(--red)', letterSpacing: '.04em' })}>{erro}</div>
        ) : null}
      </div>
    </div>
  )
}

/* ═══════════════ página ═══════════════ */

/** Painel da face SESSÃO (#232): SEM scroll próprio — quem rola é o corpo da
 *  sidebar direita. height:100% + overflow aqui criava dimensionamento
 *  circular com o PanelTrack (que mede offsetHeight do filho): a "janela"
 *  congelava pequena e pedia scroll cedo demais. Padding horizontal mínimo —
 *  o corpo da sidebar já tem o dele (14px). */
const panelScroll: CSSProperties = {
  flex: '0 0 100%',
  minWidth: 0,
  padding: '12px 2px 20px',
}

function TabBtn({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  const v = on ? 1 : 0
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 18px',
        background: `color-mix(in srgb,var(--accent) ${v * 7}%,transparent)`,
        border: 'none',
        borderBottom: `2px solid color-mix(in srgb,var(--accent) ${v * 100}%,transparent)`,
        color: v ? 'var(--accent)' : 'var(--muted)',
        cursor: 'pointer',
        fontWeight: 600,
        letterSpacing: '.07em',
        fontSize: 12,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

export function SessaoPage(): ReactNode {
  const { sessions, active } = useSessions()
  const [tab, setTab] = useState('iniciativa')
  const tabIdx = active ? Math.max(0, SESS_TABS.findIndex((t) => t.id === tab)) : 0

  // Feedback do mestre: FORA de sessão não tem barra de abas — o header
  // "// LISTA DE SESSÕES" já vive no ListaPanel; a aba única só duplicava.
  if (!active) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={panelScroll}>
          <ListaPanel sessions={sessions} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: '8px 2px 0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--line)' }}>
          {SESS_TABS.map((t) => (
            <TabBtn key={t.id} on={tab === t.id} label={t.label} onClick={() => setTab(t.id)} />
          ))}
          <span style={{ flex: 1 }} />
        </div>
      </div>
      <PanelTrack index={tabIdx}>
        <div style={panelScroll}>
          <IniciativaPanel sess={active} />
        </div>
        <div style={panelScroll}>
          <DetalhesPanel sess={active} />
        </div>
      </PanelTrack>
    </div>
  )
}
