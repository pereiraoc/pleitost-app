// Tela CONFIG — markup/estilos VERBATIM do design puxado (design/pulled/
// Companion App.dc.html §CONFIG, template 1428-1466; themeOpts/modeOpts do
// renderVals 2347-2348), ligada ao tema REAL do app (theme.ts):
//   - "Tema da Interface" → aesthetic (cyberpunk/medieval);
//   - "Modo de Exibição"  → mode (dark/light).
// A linha "Modo Mestre" é EXTENSÃO SANCIONADA (issue #35): mesma linha/pill
// da linha de tema, persistida app-level (pleitost.settings.mestre via
// useSettings); emojis do registro (subcategoria.Monstro = o que o modo
// destrava — o BESTIÁRIO; ui.CheckboxOn/Off = estado ligado/desligado).
// As linhas mock do CONFIG do design (Idioma/Animações/Sincronização/
// Notificações, script linha 1860) NÃO são renderizadas: são placeholders
// sem configuração real por trás — nada de settings fake.
import type { CSSProperties, ReactNode } from 'react'
import { useTheme, type Aesthetic, type Mode } from '../../theme'
import { useSettings } from '../../settings'
import { tokens } from '../ficha/registry'
import { LOCAL_TYPES, TIERS, TIER_COLUNA, type LocalType, type Tier } from '../../data/commerce'

/** Linha de configuração desenhada (template 1433/1444). */
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 15,
  padding: '15px 18px',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  clipPath: 'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))',
}

function ConfigRow({ ic, label, children }: { ic: string; label: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={{ fontSize: 19, flex: 'none' }}>{ic}</span>
      <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flex: 'none' }}>{children}</div>
    </div>
  )
}

/** Pill de opção com o padrão --on do design (template 1437/1448): borda/
 *  fundo/cor em color-mix sobre var(--on) 0|1 — fórmulas verbatim. */
function OptPill({
  ic,
  label,
  on,
  onClick,
}: {
  ic: string
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={
        {
          '--on': on ? 1 : 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 13px',
          cursor: 'pointer',
          border: '1px solid color-mix(in srgb,var(--accent) calc(35% + var(--on,0)*65%),var(--line2))',
          background: 'color-mix(in srgb,var(--accent) calc(var(--on,0)*100%),transparent)',
          color: 'color-mix(in srgb,var(--ink) calc(var(--on,0)*100%),var(--text))',
          fontFamily: 'var(--mono)',
          fontSize: 12,
          letterSpacing: '.05em',
          whiteSpace: 'nowrap',
          clipPath: 'polygon(0 0,100% 0,100% 100%,7px 100%,0 calc(100% - 7px))',
        } as CSSProperties
      }
    >
      <span style={{ fontSize: 13 }}>{ic}</span>
      <span>{label}</span>
    </button>
  )
}

// themeOpts/modeOpts VERBATIM do script do design (linhas 2347-2348).
const THEME_OPTS: { id: Aesthetic; label: string; ic: string }[] = [
  { id: 'cyberpunk', label: 'CYBERPUNK RED', ic: '🌃' },
  { id: 'medieval', label: 'MEDIEVAL', ic: '🏰' },
]
const MODE_OPTS: { id: Mode; label: string; ic: string }[] = [
  { id: 'dark', label: 'ESCURO', ic: '🌙' },
  { id: 'light', label: 'CLARO', ic: '☀️' },
]
// Opções do Modo Mestre (extensão sancionada): estados no vocabulário das
// linhas do CONFIG do design ("ATIVADAS"), emojis de estado do registro.
const MESTRE_OPTS: { id: boolean; label: string; ic: string }[] = [
  { id: true, label: 'ATIVADO', ic: tokens.emojis.ui.CheckboxOn },
  { id: false, label: 'DESATIVADO', ic: tokens.emojis.ui.CheckboxOff },
]

/** Célula editável da matriz de disponibilidade: input de % (ou "—" quando
 *  vazio/indisponível), no vocabulário mono das linhas do CONFIG. Vazio = null
 *  (indisponível); número = % daquele (tipo × tier). */
function MatrixCell({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="disponibilidade"
      value={value == null ? '' : String(value)}
      placeholder="—"
      onChange={(e) => {
        const t = e.target.value.trim().replace('%', '')
        if (t === '') return onChange(null)
        const n = Number(t)
        if (Number.isFinite(n) && n >= 0) onChange(n)
      }}
      style={{
        width: 52,
        textAlign: 'center',
        padding: '5px 4px',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        color: 'var(--text)',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
      }}
    />
  )
}

/** Área "Disponibilidade de Tesouros" (extensão do Modo Mestre, issue #72):
 *  a matriz Local×tier de % que a rolagem da loja usa. Só aparece com o Modo
 *  Mestre ATIVADO (é config de GM). Default = a tabela da nota real. */
function DisponibilidadeSection() {
  const { disponibilidade, setDisponibilidadeCell, resetDisponibilidade } = useSettings()
  const th: CSSProperties = {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '.06em',
    color: 'var(--muted)',
    fontWeight: 700,
    padding: '4px 8px',
    textTransform: 'uppercase',
  }
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>{tokens.emojis.subcategoria.Tesouro}</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Disponibilidade de Tesouros</span>
        <button
          onClick={resetDisponibilidade}
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '.1em',
            color: 'var(--muted)',
            background: 'transparent',
            border: '1px solid var(--line2)',
            padding: '6px 11px',
            cursor: 'pointer',
            clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
          }}
        >
          RESTAURAR PADRÃO
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Local</th>
            {TIERS.map((t: Tier) => (
              <th key={t} style={{ ...th, textAlign: 'center' }}>
                {TIER_COLUNA[t]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LOCAL_TYPES.map((lt: LocalType) => (
            <tr key={lt}>
              <td style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                {lt}
              </td>
              {TIERS.map((t: Tier) => (
                <td key={t} style={{ padding: '3px 4px', textAlign: 'center' }}>
                  <MatrixCell
                    value={disponibilidade[lt][t]}
                    onChange={(v) => setDisponibilidadeCell(lt, t, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '.04em',
          color: 'var(--muted)',
          opacity: 0.85,
        }}
      >
        % de chance de cada tesouro (por tier) estar pronto para compra; vazio = indisponível.
        {' '}Valores acima de 100% garantem 1 e rolam o excedente.
      </div>
    </div>
  )
}

export function ConfigPage() {
  const { aesthetic, mode, setAesthetic, setMode } = useTheme()
  const { mestre, setMestre } = useSettings()

  return (
    <div
      style={{
        maxWidth: 760,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '.18em',
          color: 'var(--muted)',
          marginBottom: 6,
        }}
      >
        {'// CONFIGURAÇÕES DO SISTEMA'}
      </div>
      <ConfigRow ic="🎨" label="Tema da Interface">
        {THEME_OPTS.map((o) => (
          <OptPill
            key={o.id}
            ic={o.ic}
            label={o.label}
            on={aesthetic === o.id}
            onClick={() => setAesthetic(o.id)}
          />
        ))}
      </ConfigRow>
      <ConfigRow ic="🌓" label="Modo de Exibição">
        {MODE_OPTS.map((o) => (
          <OptPill
            key={o.id}
            ic={o.ic}
            label={o.label}
            on={mode === o.id}
            onClick={() => setMode(o.id)}
          />
        ))}
      </ConfigRow>
      <ConfigRow ic={tokens.emojis.subcategoria.Monstro} label="Modo Mestre">
        {MESTRE_OPTS.map((o) => (
          <OptPill
            key={String(o.id)}
            ic={o.ic}
            label={o.label}
            on={mestre === o.id}
            onClick={() => setMestre(o.id)}
          />
        ))}
      </ConfigRow>
      {/* Config de GM (issue #72): a matriz de disponibilidade da loja só é
          editável com o Modo Mestre ligado. */}
      {mestre ? <DisponibilidadeSection /> : null}
      <div
        style={{
          marginTop: 12,
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '.16em',
          color: 'var(--muted)',
          textAlign: 'center',
        }}
      >
        PLEITOST COMPANION//OS · v0.1
      </div>
    </div>
  )
}
