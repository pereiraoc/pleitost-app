// SESSÃO (#101) — tela cheia da rota /sessao, markup/estilos VERBATIM do
// design puxado (Companion App.dc.html §SESSÃO):
//   - fora de sessão: LISTA DE SESSÕES (entrar/lixeira), entrar por código,
//     criar nova sessão;
//   - em sessão: abas INICIATIVA (ficha do grupo + ORDEM DE INICIATIVA com
//     vida real das fichas, toggle DEFESAS, Turno) e DETALHES DA SESSÃO
//     (nome/código, MESTRE, membros claimed, ferramentas de mestre em breve).
// Lógica de turno/ordem espelha o combat-tracker do plugin: ordem init DESC
// (nome desempata), "Turno ${max(1,round)}" (action-bar.ts:144). Vida vem do
// volátil das FICHAS (useVidaLocal) — a sessão nunca inventa valores (#101).
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { VaultDoc } from '../../data/types'
import { useCatalog } from '../../data/CatalogContext'
import { useAssetIndex } from '../../data/assets'
import { useDocs } from '../../data/useDoc'
import { useGroupMembers } from '../../data/local-entities'
import { creatureImageUrl } from '../../data/creature-image'
import { linkLabel } from '../../markdown/dataview-value'
import { heroPath } from '../../paths'
import { clip, PanelTrack } from '../ficha/bits'
import { useVidaLocal } from '../ficha/pop-panels'
import { fmPath, num, str } from '../ficha/hero-model'
import { fmtPlain, fmtSigned, memberStats } from '../../grupo/stats'
import {
  createSession,
  deleteSession,
  joinSessionByCode,
  setActiveSessionCode,
  updateSession,
  useSessions,
  type SessionRec,
} from '../../data/session-store'
import {
  connectSessionSync,
  logoutServer,
  pushSessionPatch,
  serverCreateSession,
  serverJoinSession,
  startDeviceLogin,
  useServerAuth,
} from '../../data/session-sync'

// SESS_TABS / SESS_SEL_TABS — verbatim do script do design.
const SESS_TABS = [
  { id: 'iniciativa', label: 'INICIATIVA' },
  { id: 'detalhes', label: 'DETALHES DA SESSÃO' },
]
const SESS_SEL_TABS = [{ id: 'lista', label: 'LISTA DE SESSÕES' }]

// Chips de defesas do combatente — ícones/rótulos verbatim do SESSAO.combate
// do design (defs: DEF/ÍMP/VIG/REF/PER/ITU/MOV); valores de memberStats
// (mesma fonte da tabela de vida do GRUPO — modelo salvo, plugin aggregates).
const DEF_CHIPS: Array<{ ic: string; n: string; v: (s: ReturnType<typeof memberStats>) => string }> = [
  { ic: '🛡️', n: 'DEF', v: (s) => (s.defs['Defesa'] != null ? fmtPlain(s.defs['Defesa']) : '—') },
  { ic: '🔥', n: 'ÍMP', v: (s) => (s.defs['Ímpeto'] != null ? fmtPlain(s.defs['Ímpeto']) : '—') },
  { ic: '❤️', n: 'VIG', v: (s) => (s.defs['Vigor'] != null ? fmtPlain(s.defs['Vigor']) : '—') },
  { ic: '⚡', n: 'REF', v: (s) => (s.defs['Reflexo'] != null ? fmtPlain(s.defs['Reflexo']) : '—') },
  { ic: '👁️', n: 'PER', v: (s) => (s.sns['Percepção'] != null ? fmtSigned(s.sns['Percepção']) : '—') },
  { ic: '💡', n: 'ITU', v: (s) => (s.sns['Intuição'] != null ? fmtSigned(s.sns['Intuição']) : '—') },
  { ic: '👟', n: 'MOV', v: (s) => (s.sp != null ? `${fmtPlain(s.sp)}m` : '—') },
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

/* ═══════════════ linha da ordem de iniciativa ═══════════════ */

function CombatRow({
  doc,
  init,
  ativo,
  defsOn,
  onInit,
}: {
  doc: VaultDoc
  init: number
  ativo: boolean
  defsOn: boolean
  onInit: (v: number) => void
}) {
  const assets = useAssetIndex()
  const vida = useVidaLocal(doc, 'sessao')
  const stats = memberStats(doc.frontmatter)
  const portrait = creatureImageUrl(doc, assets)
  const nome = doc.basename

  // vidaModel do design (Companion App.dc.html): larguras em % de
  // T = vitMax + moralMax; negativa listrada em 2 faixas.
  const T = Math.max(1, vida.vitMax + vida.moralMax)
  const pct = (v: number) => `${((v / T) * 100).toFixed(3)}%`
  const negTot = vida.vit < 0 ? Math.min(-vida.vit, vida.vitMax) : 0
  const neg1 = Math.min(negTot, vida.vitMax / 2)
  const neg2 = Math.max(0, negTot - vida.vitMax / 2)
  const vitPos = Math.max(0, vida.vit)

  // tags do design = condições ativas da ficha (Interativa.Condicoes_Ativas).
  const cond = fmPath(doc.frontmatter as Record<string, unknown>, 'Interativa', 'Condicoes_Ativas')
  const tags = cond && typeof cond === 'object' ? Object.keys(cond as Record<string, unknown>) : []

  const on = ativo ? 1 : 0
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 13px',
        background: `color-mix(in srgb,var(--accent) ${on * 7}%,var(--card))`,
        border: `1px solid color-mix(in srgb,var(--accent) ${on * 55}%,var(--line))`,
        clipPath: clip(12),
      }}
    >
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 30 }}>
        <span style={mono({ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--muted)' })}>INIT</span>
        <input
          aria-label={`Iniciativa de ${nome}`}
          value={String(init)}
          onChange={(e) => onInit(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          style={mono({
            width: 34,
            fontSize: 16,
            fontWeight: 800,
            color: ativo ? 'var(--accent)' : 'var(--text)',
            background: 'transparent',
            border: 'none',
            textAlign: 'center',
            padding: 0,
          })}
        />
      </div>
      {portrait ? (
        <div
          style={{
            width: 42,
            height: 42,
            flex: 'none',
            backgroundImage: `url("${portrait}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            clipPath: clip(9),
            border: '1px solid var(--line2)',
          }}
        />
      ) : (
        <span
          style={mono({
            width: 42,
            height: 42,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: clip(9),
            fontSize: 15,
            color: 'var(--muted)',
          })}
        >
          {sigOf(nome)}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nome}
          </span>
          {vida.vit <= 0 ? (
            <span title="Vitalidade zerada — marcar morto" style={{ fontSize: 14, flex: 'none', cursor: 'pointer' }}>
              💀
            </span>
          ) : null}
          <span style={{ flex: 1 }} />
          <span style={mono({ fontSize: 10.5, color: 'var(--muted)', flex: 'none' })}>
            {`❤️ ${vida.vit}/${vida.vitMax} · 💙 ${vida.moral}/${vida.moralMax}${vida.temp > 0 ? ` · 💚 +${vida.temp}` : ''}`}
          </span>
        </div>
        <div style={{ position: 'relative', height: 10, background: 'var(--card)', border: '1px solid var(--line2)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: pct(vitPos), background: 'linear-gradient(90deg,#c0392b,#ff5547)', transition: 'width .35s ease' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: pct(neg1), background: 'repeating-linear-gradient(45deg,#d63a2a,#d63a2a 5px,#b93122 5px,#b93122 10px)', transition: 'width .35s ease' }} />
          <div style={{ position: 'absolute', top: 0, left: pct(vida.vitMax / 2), height: '100%', width: pct(neg2), background: 'repeating-linear-gradient(45deg,#6e3a24,#6e3a24 5px,#512a1a 5px,#512a1a 10px)', transition: 'width .35s ease' }} />
          <div style={{ position: 'absolute', top: 0, left: pct(vitPos), height: '100%', width: pct(vida.moral), background: 'linear-gradient(90deg,#2f6fd0,#4f9bff)', transition: 'width .35s ease,left .35s ease' }} />
          <div style={{ position: 'absolute', top: 0, left: pct(vitPos + vida.moral), height: '100%', width: pct(vida.temp), background: 'linear-gradient(90deg,#2e9e58,#43c974)', transition: 'width .35s ease,left .35s ease' }} />
          <div style={{ position: 'absolute', top: 0, left: pct(vida.vitMax), bottom: 0, width: 0, borderLeft: '1px dashed color-mix(in srgb,var(--muted) 55%,transparent)' }} />
        </div>
        {tags.length > 0 ? (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  padding: '3px 9px',
                  background: 'color-mix(in srgb,var(--accent) 13%,transparent)',
                  border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
                  fontSize: 11,
                  color: 'var(--accent)',
                  clipPath: clip(4),
                }}
              >
                {t}
              </span>
            ))}
          </span>
        ) : null}
        {defsOn ? (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {DEF_CHIPS.map((d) => (
              <span
                key={d.n}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 9px',
                  background: 'var(--panel)',
                  border: '1px solid var(--line2)',
                  clipPath: clip(4),
                }}
              >
                <span style={{ fontSize: 10 }}>{d.ic}</span>
                <span style={mono({ fontSize: 9, letterSpacing: '.06em', color: 'var(--muted)' })}>{d.n}</span>
                <span style={mono({ fontSize: 11, fontWeight: 700, color: 'var(--text)' })}>{d.v(stats)}</span>
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* ═══════════════ painel INICIATIVA ═══════════════ */

function IniciativaPanel({ sess }: { sess: SessionRec }) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [defsOn, setDefsOn] = useState(false)
  const members = useGroupMembers(catalog, sess.grupoId ?? '')
  const docs = useDocs(useMemo(() => members.map((m) => m.id), [members]))

  // Ordem do plugin: init DESC, nome ASC desempata (tracker-actions:63-73).
  const ordered = useMemo(
    () =>
      [...members].sort((a, b) => {
        const ia = sess.init[a.id] ?? 0
        const ib = sess.init[b.id] ?? 0
        if (ib !== ia) return ib - ia
        return (a.basename ?? '').localeCompare(b.basename ?? '', 'pt')
      }),
    [members, sess.init],
  )
  const vez = ordered.length ? Math.min(sess.vezIdx, ordered.length - 1) : 0
  const grupoNomes = members.map((m) => (m.basename ?? '').split(/\s+/)[0]).join(', ')

  // Próximo do tracker: avança a vez; deu a volta → round+1. Patch local +
  // sala (pushSessionPatch é no-op sem servidor conectado).
  const patch = (p: Partial<SessionRec>) => {
    updateSession(sess.codigo, p)
    pushSessionPatch(p)
  }
  const proximo = () => {
    if (!ordered.length) return
    const next = vez + 1
    if (next >= ordered.length) patch({ vezIdx: 0, round: sess.round + 1 })
    else patch({ vezIdx: next })
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        onClick={() => members[0] && navigate(heroPath(members[0].id, 'grupos'))}
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
            gap: 12,
            padding: '12px 18px',
            borderBottom: '1px solid color-mix(in srgb,var(--red) 30%,var(--line))',
          }}
        >
          <span style={mono({ fontSize: 12, letterSpacing: '.14em', color: 'var(--red)', fontWeight: 700 })}>
            ⚔ ORDEM DE INICIATIVA
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setDefsOn((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: `color-mix(in srgb,var(--accent) ${defsOn ? 14 : 0}%,transparent)`,
              border: `1px solid color-mix(in srgb,var(--accent) ${defsOn ? 80 : 20}%,var(--line2))`,
              color: defsOn ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.1em',
              clipPath: clip(5),
            }}
          >
            🛡 DEFESAS
          </button>
          {/* Avanço de turno — semântica do tracker do plugin (moveCurrent);
              chip no mesmo estilo do toggle DEFESAS. */}
          <button
            onClick={proximo}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid color-mix(in srgb,var(--accent) 20%,var(--line2))',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.1em',
              clipPath: clip(5),
            }}
          >
            ▶ PRÓXIMO
          </button>
          <span style={mono({ fontSize: 12, color: 'var(--muted)' })}>Turno {Math.max(1, sess.round)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
          {ordered.map((m, i) => {
            const doc = docs?.get(m.id)
            if (!doc) return null
            return (
              <CombatRow
                key={m.id}
                doc={doc}
                init={sess.init[m.id] ?? 0}
                ativo={i === vez}
                defsOn={defsOn}
                onInit={(v) => patch({ init: { ...sess.init, [m.id]: v } })}
              />
            )
          })}
          {ordered.length === 0 ? (
            <div style={mono({ fontSize: 11, color: 'var(--muted)', padding: 8 })}>
              Sessão sem grupo vinculado — crie a sessão a partir de um grupo.
            </div>
          ) : null}
        </div>
      </div>
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
  const portrait = doc ? creatureImageUrl(doc, assets) : null
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
            backgroundImage: `url("${portrait}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '1px solid var(--line2)',
            clipPath: clip(8),
          }}
        />
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

function DetalhesPanel({ sess }: { sess: SessionRec }) {
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
      {sess.mestre ? (
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
      <div style={mono({ fontSize: 11, letterSpacing: '.16em', color: 'var(--muted)', marginTop: 4 })}>
        {`// MEMBROS NA SESSÃO · ${membros.length}`}
      </div>
      {membros.map(([jogador, heroIds]) => (
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
    </div>
  )
}

/* ═══════════════ servidor (login GitHub + status) ═══════════════ */

function ServerBox() {
  const { url, auth } = useServerAuth()
  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(null)
  const [erro, setErro] = useState('')
  if (!url) return null
  const login = async () => {
    setErro('')
    try {
      const d = await startDeviceLogin()
      setDevice({ userCode: d.userCode, verificationUri: d.verificationUri })
      await d.finish
      setDevice(null)
    } catch (e) {
      setDevice(null)
      setErro(String((e as Error).message ?? e))
    }
  }
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
      <span style={mono({ fontSize: 11, color: 'var(--muted)' })}>{url}</span>
      <span style={{ flex: 1 }} />
      {auth ? (
        <>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{auth.user.name || auth.user.login}</span>
          <button
            onClick={logoutServer}
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
      ) : device ? (
        <span style={mono({ fontSize: 11.5, color: 'var(--text)' })}>
          Autorize em{' '}
          <a href={device.verificationUri} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            {device.verificationUri}
          </a>{' '}
          com o código <b style={{ letterSpacing: '.14em' }}>{device.userCode}</b>
        </span>
      ) : (
        <button
          onClick={login}
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
  const catalog = useCatalog()
  const { auth } = useServerAuth()
  const [joinCode, setJoinCode] = useState('')
  const [novoGrupo, setNovoGrupo] = useState('')
  // Grupos da vault (categoria Grupo) pro vínculo da nova sessão — o roster
  // da mesa vem do grupo (integrantes), fonte de verdade real.
  const grupos = useMemo(() => catalog.docsByType.get('Grupo') ?? [], [catalog])

  // Com login no servidor, criar/entrar passam pelo servidor (o código vem de
  // lá; o registro local vira o espelho da sala). Sem servidor, local puro.
  const join = async () => {
    const code = joinCode.trim()
    if (!code) return
    if (auth) {
      try {
        const sess = await serverJoinSession(code)
        const local = joinSessionByCode(sess.codigo)
        updateSession(local.codigo, {
          nome: sess.nome,
          grupoId: sess.grupoId,
          mestre: sess.mestre,
          init: sess.init,
          round: sess.round,
          vezIdx: sess.vezIdx,
          claims: sess.claims,
        })
        setActiveSessionCode(sess.codigo)
        setJoinCode('')
        return
      } catch {
        // sessão não existe no servidor — cai no fluxo local
      }
    }
    const rec = joinSessionByCode(code)
    setActiveSessionCode(rec.codigo)
    setJoinCode('')
  }
  const criar = async () => {
    const grupoId = novoGrupo || (grupos[0]?.id ?? null)
    const nome = grupoId ? (catalog.entryById.get(grupoId)?.basename ?? 'Nova Sessão') : 'Nova Sessão'
    if (auth) {
      try {
        const sess = await serverCreateSession(nome, grupoId)
        const local = joinSessionByCode(sess.codigo)
        updateSession(local.codigo, { nome: sess.nome, grupoId: sess.grupoId, mestre: sess.mestre })
        setActiveSessionCode(sess.codigo)
        return
      } catch {
        // servidor fora — cai no fluxo local
      }
    }
    const rec = createSession(nome, grupoId, auth?.user.name || 'Você')
    setActiveSessionCode(rec.codigo)
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={mono({ fontSize: 12, letterSpacing: '.16em', color: 'var(--accent)', fontWeight: 700 })}>
        {'// LISTA DE SESSÕES'}
      </div>
      <ServerBox />
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
        {/* Vínculo do roster: nova sessão nasce de um GRUPO da vault. */}
        <select
          aria-label="Grupo da nova sessão"
          value={novoGrupo}
          onChange={(e) => setNovoGrupo(e.target.value)}
          style={mono({
            padding: '10px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontSize: 12,
          })}
        >
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.basename}
            </option>
          ))}
        </select>
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

const panelScroll: CSSProperties = {
  flex: '0 0 100%',
  minWidth: 0,
  height: '100%',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '22px 26px',
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
  const { auth } = useServerAuth()
  const [tab, setTab] = useState('iniciativa')
  const tabs = active ? SESS_TABS : SESS_SEL_TABS
  const tabIdx = active ? Math.max(0, SESS_TABS.findIndex((t) => t.id === tab)) : 0

  // Sala viva (#101b): com servidor + login, a sessão ativa conecta no WS —
  // patches da sessão e vida volátil dos heróis fluem nas duas direções.
  const activeCodigo = active?.codigo ?? null
  useEffect(() => {
    if (!activeCodigo || !auth) return
    return connectSessionSync(activeCodigo)
  }, [activeCodigo, auth])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 'none', padding: '22px 26px', paddingBottom: 0 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--line)' }}>
          {tabs.map((t) => (
            <TabBtn key={t.id} on={active ? tab === t.id : true} label={t.label} onClick={() => setTab(t.id)} />
          ))}
          <span style={{ flex: 1 }} />
          {active ? (
            <button
              onClick={() => setActiveSessionCode(null)}
              title="Sair da sessão"
              style={mono({
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 13px',
                marginBottom: 6,
                background: 'color-mix(in srgb,var(--red) 10%,var(--card))',
                border: '1px solid color-mix(in srgb,var(--red) 38%,var(--line2))',
                color: '#d8695c',
                cursor: 'pointer',
                fontSize: 10.5,
                letterSpacing: '.08em',
                clipPath: clip(6),
              })}
            >
              ⏏ SAIR
            </button>
          ) : null}
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
