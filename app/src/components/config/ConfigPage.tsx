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
