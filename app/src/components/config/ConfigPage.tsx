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
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTheme, type Aesthetic, type Mode } from '../../theme'
import { useSettings } from '../../settings'
import { tokens } from '../ficha/registry'
import {
  LOCAL_TYPES,
  POCAO_DICE,
  RARIDADE_MULT,
  TESOUROS_BASICOS,
  TIERS,
  TIER_COLUNA,
  TIER_PRICE_MULT,
  VILAREJO_CHANCES,
  comboMult,
  type LocalType,
  type Tier,
} from '../../data/commerce'
import { TabStrip } from '../ficha/bits'

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

/** Multiplicadores de preço por tier (TIER_PRICE_MULT, espelho de
 *  tierMultFromName do plugin: Adepto ×1, Experiente ×5, Mestre ×25) —
 *  informativo, é a regra que a loja aplica no preço base. */
function MultiplicadoresSection() {
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>💰</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Multiplicadores de Preço por Tier</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TIERS.map((t: Tier) => (
          <span
            key={t}
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 7,
              padding: '7px 13px',
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              clipPath: 'polygon(0 0,100% 0,100% 100%,6px 100%,0 calc(100% - 6px))',
            }}
          >
            <span
              style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--muted)' }}
            >
              {TIER_COLUNA[t].toUpperCase()}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              ×{TIER_PRICE_MULT[t]}
            </span>
          </span>
        ))}
      </div>
      <div
        style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.04em', color: 'var(--muted)', opacity: 0.85 }}
      >
        Preço final na loja = preço base do tesouro × multiplicador do tier.
      </div>
    </div>
  )
}

/** Quantidade de Poções (consumíveis) — a regra PRÓPRIA de dados por
 *  local × tier (POCAO_DICE, rolada pra cada poção; "0dX−C" = nunca
 *  disponível). Informativo: é a lógica que a loja usa. */
function PocoesSection() {
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
        <span style={{ fontSize: 19, flex: 'none' }}>{tokens.emojis.categoria.Consumivel}</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Quantidade de Poções</span>
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
                <td
                  key={t}
                  style={{
                    padding: '4px 8px',
                    textAlign: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--text)',
                  }}
                >
                  {POCAO_DICE[lt][t]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.04em', color: 'var(--muted)', opacity: 0.85 }}
      >
        Dados rolados POR poção (pronta entrega) em cada local × tier; resultado ≤ 0 ou dado 0dX =
        indisponível.
      </div>
    </div>
  )
}


/** ×N legível como na nota (×1/2, ×1/4, ×1/8). */
function multLabel(v: number): string {
  if (v === 0.5) return '×1/2'
  if (v === 0.25) return '×1/4'
  if (v === 0.125) return '×1/8'
  return `×${v}`
}

/** "Modificadores por Região" — VERBATIM da nota Disponibilidade de Tesouros:
 *  raridade (RARIDADE_MULT) + combos arma×imbuição (comboMult) + a lista de
 *  tesouros BÁSICOS. Informativo: é a regra que a loja aplica. */
function RegiaoSection() {
  const linhas: Array<{ caso: string; mult: string }> = [
    { caso: 'Tesouro típico', mult: multLabel(RARIDADE_MULT['tipico']) },
    { caso: 'Tesouro básico típico', mult: multLabel(RARIDADE_MULT['basico-tipico']) },
    { caso: 'Tesouro básico incomum', mult: multLabel(RARIDADE_MULT['basico-incomum']) },
    { caso: 'Tesouro incomum', mult: multLabel(RARIDADE_MULT['incomum']) },
    { caso: 'Arma típica + imbuição típica', mult: multLabel(comboMult(true, true)) },
    { caso: 'Arma incomum + imbuição típica', mult: multLabel(comboMult(false, true)) },
    { caso: 'Arma típica + imbuição incomum', mult: multLabel(comboMult(true, false)) },
    { caso: 'Arma incomum + imbuição incomum', mult: multLabel(comboMult(false, false)) },
  ]
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>🗺️</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Modificadores por Região</span>
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.caso}>
              <td style={{ fontSize: 12.5, padding: '3px 8px' }}>{l.caso}</td>
              <td
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 8px',
                  textAlign: 'center',
                  color: 'var(--text)',
                }}
              >
                {l.mult}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span
          style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.06em', color: 'var(--muted)' }}
        >
          BÁSICOS:
        </span>
        {TESOUROS_BASICOS.map((t) => (
          <span
            key={t}
            style={{
              padding: '3px 9px',
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              fontSize: 11,
              color: 'var(--text)',
              clipPath: 'polygon(0 0,100% 0,100% 100%,4px 100%,0 calc(100% - 4px))',
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div
        style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.04em', color: 'var(--muted)', opacity: 0.85 }}
      >
        Aplicado sobre a disponibilidade quando o tesouro não é típico da região; básicos são mais
        comuns.
      </div>
    </div>
  )
}

/** "Tesouros em Vilarejos" — VERBATIM da nota: chances por Obter Informação,
 *  1×/semana por tesouro específico (vários testes na semana se forem itens
 *  diferentes). */
function VilarejoSection() {
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>🛖</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Tesouros em Vilarejos</span>
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {VILAREJO_CHANCES.map((l) => (
            <tr key={l.caso}>
              <td style={{ fontSize: 12.5, padding: '3px 8px' }}>{l.caso}</td>
              <td
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '3px 8px',
                  textAlign: 'center',
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                }}
              >
                {l.chance}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.04em', color: 'var(--muted)', opacity: 0.85 }}
      >
        Teste de Obter Informação 1×/semana POR tesouro específico; vários testes na mesma semana só
        para itens diferentes.
      </div>
    </div>
  )
}

export function ConfigPage() {
  const { aesthetic, mode, setAesthetic, setMode } = useTheme()
  const { mestre, setMestre } = useSettings()
  // Abas GERAL (interface/modo/mestre) e SISTEMA (configs de tesouro que valem
  // pras sessões criadas pelo usuário como mestre) — pedido do usuário (req 10).
  const [tab, setTab] = useState('geral')

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
      <TabStrip
        tabs={[
          { id: 'geral', label: 'GERAL' },
          { id: 'sistema', label: 'SISTEMA' },
        ]}
        active={tab}
        onSelect={setTab}
        pad="10px 16px"
      />
      {tab === 'geral' ? (
        <>
          <ConfigRow ic="🎨" label="Tema da Interface">
            {THEME_OPTS.map((o) => (
              <OptPill key={o.id} ic={o.ic} label={o.label} on={aesthetic === o.id} onClick={() => setAesthetic(o.id)} />
            ))}
          </ConfigRow>
          <ConfigRow ic="🌓" label="Modo de Exibição">
            {MODE_OPTS.map((o) => (
              <OptPill key={o.id} ic={o.ic} label={o.label} on={mode === o.id} onClick={() => setMode(o.id)} />
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
        </>
      ) : mestre ? (
        <>
          {/* Configs de tesouro — valem pras sessões que o usuário criar como
              mestre. Disponibilidade é editável (RESTAURAR PADRÃO volta aos
              defaults; os padrões em si nunca mudam — DEFAULT_MATRIX). */}
          <DisponibilidadeSection />
          <MultiplicadoresSection />
          <RegiaoSection />
          <PocoesSection />
          <VilarejoSection />
        </>
      ) : (
        <div
          style={{
            ...rowStyle,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '.06em',
            color: 'var(--muted)',
          }}
        >
          Ative o Modo Mestre (aba GERAL) para ver e ajustar as configurações de tesouro do sistema.
        </div>
      )}
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
