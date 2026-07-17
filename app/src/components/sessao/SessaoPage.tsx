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
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
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
  extractFmBlob,
} from '../../data/session-repo/publish'
import { startEncounterFromRoster } from '../../data/session-repo/encounter-actions'
import { MESA_GRUPO_ID, setLiveSession, synthDocFromCharacter, useLiveSession } from '../../data/session-repo/live-session'
import { advanceTurn } from '../../data/session-repo/turn'
import { composeGroupName } from '../../data/session-repo/group-name'
import { maskedNames, vitaStatusOf, VITA_TONE_COLOR } from '../../data/session-repo/combatente'
import { getLocalDoc, localEntriesOfKind, useLocalStoreVersion } from '../../data/local-entities'
import { onHeroWrite } from '../../data/hero-store'
import { useDetail } from '../../data/detail-context'

// SESS_TABS / SESS_SEL_TABS — verbatim do script do design.
const SESS_TABS = [
  { id: 'iniciativa', label: 'INICIATIVA' },
  { id: 'detalhes', label: 'DETALHES DA SESSÃO' },
]
const SESS_SEL_TABS = [{ id: 'lista', label: 'LISTA DE SESSÕES' }]

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
    return () => {
      alive = false
      off()
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
) {
  const version = useLocalStoreVersion()
  const charId = meuChar?.id ?? null
  const heroId = meuChar?.characterPath ?? null
  useEffect(() => {
    if (!repo || !sessionId || !charId || !heroId) return
    const doc = getLocalDoc(heroId)
    if (doc) void repo.updateCharacterState(charId, buildCharacterState(doc)).catch(() => {})
  }, [version, repo, sessionId, charId, heroId])
  useEffect(() => {
    if (!repo || !sessionId || !charId || !heroId) return
    return onHeroWrite((id, path, _value, origem) => {
      if (id !== heroId || origem === 'sync' || !path.startsWith('Interativa.')) return
      const doc = getLocalDoc(heroId)
      if (doc) void repo.updateCharacterState(charId, buildCharacterState(doc)).catch(() => {})
    })
  }, [repo, sessionId, charId, heroId])
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
        {portrait ? <img src={portrait} alt="" style={imgCover} /> : sigOf(c.summary.nome)}
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
  const [heroiSel, setHeroiSel] = useState('')
  const meusHerois = localEntriesOfKind('Heroi')

  const chars = live?.characters ?? []
  const members = live?.members ?? []
  const meuChar = user ? (chars.find((c) => c.memberId === user.id && c.kind === 'heroi') ?? null) : null
  usePublicacao(repo, sess.remoteId ?? null, meuChar)

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
    const heroi = await repo.insertCharacter({
      sessionId: sess.remoteId,
      memberId: user.id,
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: doc.id,
      visibility: 'visible',
      summary: buildCharacterSummary(doc),
      state: buildCharacterState(doc),
      fmBlob: extractFmBlob(doc.frontmatter as Record<string, unknown>),
    })
    for (const ca of localEntriesOfKind('CompanheiroAnimal')) {
      const caDoc = getLocalDoc(ca.id)
      if (!caDoc) continue
      const tutor = str(caDoc.frontmatter['Tutor'])
      if (!tutor || !tutor.includes(doc.basename)) continue
      await repo.insertCharacter({
        sessionId: sess.remoteId,
        memberId: user.id,
        kind: 'companheiro',
        tutorCharacterId: heroi.id,
        characterPath: caDoc.id,
        visibility: 'visible',
        summary: buildCharacterSummary(caDoc),
        state: buildCharacterState(caDoc),
        fmBlob: extractFmBlob(caDoc.frontmatter as Record<string, unknown>),
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
function CombateDaSala({ sess }: { sess: SessionRec }) {
  const repo = useSessionRepo()
  const user = useSessionUser()
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const live = useLiveSession()
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

  const nomes = ativo
    ? maskedNames(
        live.characters.filter((c) => c.encounterId === ativo.id && c.kind === 'npc'),
        ativo.revealedCharacterIds,
      )
    : new Map<string, string>()
  const noCombate = ativo
    ? (ativo.turnState?.order ?? [])
        .map((id) => live.characters.find((c) => c.id === id))
        .filter((c): c is SessionCharacter => Boolean(c))
    : []

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
          ? noCombate.map((c, i) => {
              const vezAtual = ativo.turnState?.currentIndex === i
              const npc = c.kind === 'npc'
              const revelado = ativo.revealedCharacterIds.includes(c.id)
              const status = vitaStatusOf(c)
              const rr = c.state.recursosRestantes
              // #263: retrato do combatente na iniciativa (faltava). NPC não
              // revelado, pra jogador, NÃO mostra o retrato real (revelaria a
              // identidade) — cai nas iniciais do nome mascarado, igual ao nome.
              const mostraReal = !npc || isGm || revelado
              const nomeExib = mostraReal ? c.summary.nome : (nomes.get(c.id) ?? c.summary.nome)
              const portrait = mostraReal
                ? creatureImageUrl(synthDocFromCharacter(c), assets, true)
                : null
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    background: `color-mix(in srgb,var(--accent) ${vezAtual ? 7 : 0}%,var(--card))`,
                    border: `1px solid color-mix(in srgb,var(--accent) ${vezAtual ? 55 : 0}%,var(--line))`,
                    clipPath: clip(9),
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
                      clipPath: clip(7),
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      color: 'var(--muted)',
                    }}
                  >
                    {portrait ? <img src={portrait} alt="" style={imgCover} /> : sigOf(nomeExib)}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                    {npc && !isGm ? (nomes.get(c.id) ?? c.summary.nome) : c.summary.nome}
                  </span>
                  {npc ? (
                    // NPC: jogador vê a FAIXA (estimativa); GM vê os números
                    <span style={mono({ fontSize: 10, color: VITA_TONE_COLOR[status.tone], fontWeight: 700 })}>
                      {isGm
                        ? `❤️ ${rr?.vitalidade ?? 0}/${c.summary.vitalidadeMax} · ${status.label}`
                        : status.label}
                    </span>
                  ) : (
                    <span style={mono({ fontSize: 10, color: 'var(--muted)' })}>
                      {`❤️ ${rr?.vitalidade ?? 0}/${c.summary.vitalidadeMax}`}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {isGm && npc ? (
                    <button
                      onClick={() => void repo.toggleRevealCharacter(ativo.id, c.id)}
                      title={revelado ? 'Esconder identidade dos players' : 'Revelar identidade aos players'}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
                    >
                      {revelado ? '❗' : '❓'}
                    </button>
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
          <img src={portrait} alt="" style={imgCover} />
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

/** MEMBROS da sessão, colapsável (#225): mestre + cada personagem com o
 *  usuário do jogador entre parênteses; membro sem personagem também lista. */
function MembrosColapsavel({ live }: { live: NonNullable<ReturnType<typeof useLiveSession>> }) {
  const [aberto, setAberto] = useState(true)
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={mono({ fontSize: 9.5, letterSpacing: '.12em', color: 'var(--accent)' })}>👁️ MESTRE</span>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{gm?.displayName ?? '—'}</span>
          </div>
          {jogadores.map((j) => {
            const ps = chars.filter((c) => c.memberId === j.userId).map((c) => c.summary.nome)
            return ps.length ? (
              ps.map((p) => (
                <div key={`${j.userId}:${p}`} style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: 'var(--blue)' }}>{p}</span>{' '}
                  <span style={mono({ fontSize: 10.5, color: 'var(--muted)' })}>({j.displayName})</span>
                </div>
              ))
            ) : (
              <div key={j.userId} style={{ fontSize: 13, color: 'var(--muted)' }}>
                sem personagem <span style={mono({ fontSize: 10.5 })}>({j.displayName})</span>
              </div>
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
  const membros = Object.entries(sess.claims)
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
      <div
        style={mono({
          fontSize: 10,
          letterSpacing: '.12em',
          color: 'var(--muted)',
          textAlign: 'center',
          padding: 12,
          border: '1px dashed var(--line2)',
          marginTop: 4,
          clipPath: clip(10),
        })}
      >
        ⚙ FERRAMENTAS DE MESTRE — EM BREVE
      </div>
      {/* #234: SAIR mora nos DETALHES da sessão, não na iniciativa */}
      <button
        onClick={() => setActiveSessionCode(null)}
        title="Sair da sessão"
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
        ⏏ SAIR DA SESSÃO
      </button>
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
  const [joinCode, setJoinCode] = useState('')

  // Com login no servidor, criar/entrar passam pelo servidor (o código vem de
  // lá; o registro local vira o espelho da sala). Sem servidor, local puro.
  // Com login (Supabase), criar/entrar passam pelo SessionRepo (#186): o
  // registro LOCAL vira espelho da sala (remoteId liga o modo vivo). Sem
  // servidor/login, fluxo local puro como antes.
  const join = async () => {
    const code = joinCode.trim()
    if (!code) return
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
      } catch {
        // servidor indisponível — cai no fluxo local
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
      {sessions.map((s) => (
        <div
          key={s.codigo}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '16px 18px',
            background: 'linear-gradient(135deg,var(--panel2),var(--panel))',
            border: '1px solid var(--line2)',
            clipPath: clip(15),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{s.nome}</span>
            <span
              style={mono({
                fontSize: 11,
                color: 'var(--muted)',
                background: 'var(--card)',
                border: '1px solid var(--line2)',
                padding: '3px 9px',
                clipPath: clip(5),
              })}
            >
              {s.codigo}
            </span>
            <span style={{ flex: 1 }} />
            <span style={mono({ fontSize: 11, color: 'var(--muted)' })}>
              {new Date(s.criadaEm).toLocaleDateString('pt-BR')}
            </span>
          </div>
          {s.mestre ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>Mestre:</span> {s.mestre}
            </div>
          ) : null}
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>Jogadores:</span>{' '}
            {Object.keys(s.claims).join(', ') || '—'}
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 2, alignItems: 'center' }}>
            <button
              onClick={() => setActiveSessionCode(s.codigo)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 16px',
                background: 'color-mix(in srgb,var(--accent) 16%,var(--card))',
                border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12.5,
                clipPath: clip(7),
              }}
            >
              ▶ Entrar
            </button>
            <span style={{ flex: 1 }} />
            <button
              aria-label={`Excluir sessão ${s.nome}`}
              onClick={() => deleteSession(s.codigo)}
              style={{
                width: 34,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb,var(--red) 10%,var(--card))',
                border: '1px solid color-mix(in srgb,var(--red) 38%,var(--line2))',
                color: '#d8695c',
                cursor: 'pointer',
                clipPath: clip(6),
              }}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 13,
          padding: 18,
          background: 'var(--panel)',
          border: '1px dashed var(--line2)',
          clipPath: clip(15),
          marginTop: 6,
        }}
      >
        <div style={mono({ fontSize: 10.5, letterSpacing: '.14em', color: 'var(--muted)' })}>ENTRAR EM UMA SESSÃO</div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Código da sessão"
            style={mono({
              flex: 1,
              minWidth: 180,
              padding: '11px 14px',
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
              padding: '11px 20px',
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
        </div>
        <div style={{ height: 1, background: 'var(--line)', margin: '1px 0' }} />
        <button
          onClick={criar}
          style={{
            padding: 12,
            background: 'transparent',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontWeight: 700,
            letterSpacing: '.05em',
            fontSize: 13,
            clipPath: clip(10),
          }}
        >
          + Criar nova sessão
        </button>
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
  const tabs = active ? SESS_TABS : SESS_SEL_TABS
  const tabIdx = active ? Math.max(0, SESS_TABS.findIndex((t) => t.id === tab)) : 0


  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: '8px 2px 0' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--line)' }}>
          {tabs.map((t) => (
            <TabBtn key={t.id} on={active ? tab === t.id : true} label={t.label} onClick={() => setTab(t.id)} />
          ))}
          <span style={{ flex: 1 }} />
        </div>
      </div>
      {active ? (
        <PanelTrack index={tabIdx}>
          <div style={panelScroll}>
            <IniciativaPanel sess={active} />
          </div>
          <div style={panelScroll}>
            <DetalhesPanel sess={active} />
          </div>
        </PanelTrack>
      ) : (
        <div style={panelScroll}>
          <ListaPanel sessions={sessions} />
        </div>
      )}
    </div>
  )
}
