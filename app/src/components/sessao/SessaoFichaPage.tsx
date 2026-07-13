// Ficha COMPLETA readonly de um jogador da sessão (#188) — o GM clica num
// personagem publicado e vê a ficha como o jogador vê (todas as abas:
// biografia, anotações, grupo, competências, inventário, combate), montada do
// fmBlob + state (doc sintético `sessao:<charId>`). A escrita é bloqueada no
// choke point (useHeroModel → readonlyModel), então as abas ficam intactas.
import { useMemo, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { synthDocFromCharacter, useLiveSession } from '../../data/session-repo/live-session'
import { useHeroRefs } from '../ficha/useHeroRefs'
import { PerfilTab } from '../ficha/PerfilTab'
import { AnotacoesTab } from '../ficha/AnotacoesTab'
import { HabilidadesTab } from '../ficha/HabilidadesTab'
import { InventarioTab } from '../ficha/InventarioTab'
import { CombateTab } from '../ficha/CombateTab'
import { CHAR_TABS } from '../layout/design-nav'

const mono = (extra: CSSProperties = {}): CSSProperties => ({ fontFamily: 'var(--mono)', ...extra })

export function SessaoFichaPage() {
  const params = useParams()
  const charId = params['charId'] ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'perfil'
  const live = useLiveSession()
  const char = live?.characters.find((c) => c.id === charId) ?? null
  const doc = useMemo(() => (char ? synthDocFromCharacter(char) : null), [char])
  const refs = useHeroRefs(doc ?? undefined, doc?.frontmatter as Record<string, unknown> | undefined)

  if (!doc || !char) {
    return (
      <p className="detail-empty" role="alert">
        Personagem fora da sala — entre na sessão pra ver a ficha.
      </p>
    )
  }

  return (
    <div key={doc.id}>
      {/* Banner de leitura + abas da ficha (mesmos ids das CHAR_TABS; GRUPO
          fica de fora — grupo da sessão vive nos DETALHES DA SESSÃO). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '10px 26px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span
          style={mono({
            fontSize: 10,
            letterSpacing: '.14em',
            color: 'var(--accent2)',
            border: '1px solid color-mix(in srgb,var(--accent2) 42%,transparent)',
            padding: '3px 9px',
          })}
        >
          👁️ FICHA DE JOGADOR — SOMENTE LEITURA
        </span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{char.summary.nome}</span>
        <span style={{ flex: 1 }} />
        {CHAR_TABS.filter((t) => t.id !== 'grupos').map((t) => (
          <button
            key={t.id}
            onClick={() => setSearchParams({ tab: t.id })}
            style={mono({
              padding: '6px 12px',
              background: tab === t.id ? 'color-mix(in srgb,var(--accent) 14%,transparent)' : 'transparent',
              border: `1px solid color-mix(in srgb,var(--accent) ${tab === t.id ? 60 : 20}%,var(--line2))`,
              color: tab === t.id ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: '.08em',
            })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'perfil' ? <PerfilTab doc={doc} /> : null}
      {tab === 'anotacoes' ? <AnotacoesTab doc={doc} /> : null}
      {tab === 'habilidades' ? <HabilidadesTab doc={doc} refs={refs} /> : null}
      {tab === 'inventario' ? <InventarioTab doc={doc} refs={refs} /> : null}
      {tab === 'combate' ? <CombateTab doc={doc} refs={refs} /> : null}
    </div>
  )
}
