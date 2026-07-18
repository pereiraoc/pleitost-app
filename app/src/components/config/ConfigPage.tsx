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
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTheme, ACCENT_COLORS, THEMES, CONTEXTS, MODES, type ThemeName } from '../../theme'
import { APP_VERSION } from '../../pwa-update'
import { useSettings } from '../../settings'
import { DevPublishPanel } from './DevPublishPanel'
import { tokens } from '../ficha/registry'
import { useSyncExternalStore } from 'react'
import {
  COMBO_MULT,
  LOCAL_TYPES,
  POCAO_DICE,
  RARIDADE_MULT,
  TESOUROS_BASICOS,
  TIERS,
  TIER_COLUNA,
  TIER_PRICE_MULT,
  VILAREJO_CHANCES,
  type LocalType,
  type Tier,
} from '../../data/commerce'
import { sistemaConfig } from '../../data/system-config'

/** Re-render quando qualquer tabela de sistema muda (#202). */
function useSistemaVersion(): number {
  return useSyncExternalStore(sistemaConfig.subscribe, sistemaConfig.getVersion)
}

/** Botão RESTAURAR PADRÃO (mesmo estilo do da disponibilidade). */
function ResetBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
  )
}

/** Input numérico pequeno (aceita decimais: 0.5, 0.25…). */
function NumCell({ value, label, onChange }: { value: number; label: string; onChange: (v: number) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value.replace(',', '.'))
        if (Number.isFinite(n) && n >= 0) onChange(n)
      }}
      style={{
        width: 58,
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

// Cor de Destaque (SEPARADA do tema): as 6 cores dos temas + PERSONALIZADA.
// Vocabulário visual das pills do CONFIG, com bolinha de amostra da cor.
const ACCENT_OPTS: { id: ThemeName; label: string; swatch: string }[] = THEMES.map((t) => ({
  id: t.id,
  label: ACCENT_COLORS[t.id].label,
  swatch: ACCENT_COLORS[t.id].accent,
}))

/** Base visual das pills de destaque (mesmo padrão --on do OptPill). */
function accentPillStyle(on: boolean): CSSProperties {
  return {
    '--on': on ? 1 : 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 12px',
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

/** Bolinha de amostra da cor de destaque. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 13,
        height: 13,
        flex: 'none',
        borderRadius: '50%',
        border: '1px solid var(--line2)',
        background: color,
      }}
    />
  )
}

/** Linha "Cor de Destaque": presets + cor personalizada (input nativo). */
function AccentRow() {
  const { accent, customAccent, setAccent, setCustomAccent } = useTheme()
  const customColor = customAccent ?? '#8f611b'
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>🖌️</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Cor de Destaque</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ACCENT_OPTS.map((o) => (
          <button key={o.id} title={o.label} onClick={() => setAccent(o.id)} style={accentPillStyle(accent === o.id)}>
            <Swatch color={o.swatch} />
            <span>{o.label}</span>
          </button>
        ))}
        {/* PERSONALIZADA: o <label> abre o seletor de cor nativo; escolher já
            muda para 'custom'. Input visualmente oculto, acionado pelo label. */}
        <label title="Cor personalizada" style={accentPillStyle(accent === 'custom')}>
          <Swatch color={customColor} />
          <span>PERSONALIZADA</span>
          <input
            type="color"
            aria-label="Cor de destaque personalizada"
            value={customColor}
            onChange={(e) => setCustomAccent(e.target.value)}
            style={{ position: 'absolute', width: 0, height: 0, padding: 0, border: 0, opacity: 0 }}
          />
        </label>
      </div>
    </div>
  )
}

// Temas = paletas completas (theme.ts THEMES). O "Modo de Exibição" (claro/escuro)
// foi absorvido pelos temas: cada tema JÁ é claro ou escuro; o atalho da topbar
// pula entre Aço Solar (claro) e Ferro Frio (escuro).
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
  useSistemaVersion()
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>💰</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Multiplicadores de Preço por Tier</span>
        <ResetBtn onClick={() => sistemaConfig.resetMultiplicadores()} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TIERS.map((t: Tier) => (
          <span
            key={t}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
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
              {TIER_COLUNA[t].toUpperCase()} ×
            </span>
            <NumCell
              value={TIER_PRICE_MULT[t]}
              label={`multiplicador ${TIER_COLUNA[t]}`}
              onChange={(v) => sistemaConfig.setTierMult(t, v)}
            />
          </span>
        ))}
      </div>
      <div
        style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.04em', color: 'var(--muted)', opacity: 0.85 }}
      >
        Preço final na loja = preço base do tesouro × multiplicador do tier. Vale pras sessões que
        você criar como mestre.
      </div>
    </div>
  )
}

/** Quantidade de Poções (consumíveis) — a regra PRÓPRIA de dados por
 *  local × tier (POCAO_DICE, rolada pra cada poção; "0dX−C" = nunca
 *  disponível). Informativo: é a lógica que a loja usa. */
function PocoesSection() {
  useSistemaVersion()
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
        <ResetBtn onClick={() => sistemaConfig.resetPocao()} />
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
                  <input
                    type="text"
                    aria-label={`poções ${lt} ${TIER_COLUNA[t]}`}
                    value={POCAO_DICE[lt][t]}
                    onChange={(e) => sistemaConfig.setPocao(lt, t, e.target.value)}
                    style={{
                      width: 74,
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
/** "Modificadores por Região" — VERBATIM da nota Disponibilidade de Tesouros:
 *  raridade (RARIDADE_MULT) + combos arma×imbuição (comboMult) + a lista de
 *  tesouros BÁSICOS. Informativo: é a regra que a loja aplica. */
function RegiaoSection() {
  useSistemaVersion()
  const linhas: Array<{ caso: string; get: () => number; set: (v: number) => void }> = [
    { caso: 'Tesouro típico', get: () => RARIDADE_MULT['tipico'], set: (v) => sistemaConfig.setRaridade('tipico', v) },
    { caso: 'Tesouro básico típico', get: () => RARIDADE_MULT['basico-tipico'], set: (v) => sistemaConfig.setRaridade('basico-tipico', v) },
    { caso: 'Tesouro básico incomum', get: () => RARIDADE_MULT['basico-incomum'], set: (v) => sistemaConfig.setRaridade('basico-incomum', v) },
    { caso: 'Tesouro incomum', get: () => RARIDADE_MULT['incomum'], set: (v) => sistemaConfig.setRaridade('incomum', v) },
    { caso: 'Arma típica + imbuição típica', get: () => COMBO_MULT.tt, set: (v) => sistemaConfig.setCombo('tt', v) },
    { caso: 'Arma incomum + imbuição típica', get: () => COMBO_MULT.it, set: (v) => sistemaConfig.setCombo('it', v) },
    { caso: 'Arma típica + imbuição incomum', get: () => COMBO_MULT.ti, set: (v) => sistemaConfig.setCombo('ti', v) },
    { caso: 'Arma incomum + imbuição incomum', get: () => COMBO_MULT.ii, set: (v) => sistemaConfig.setCombo('ii', v) },
  ]
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>🗺️</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Modificadores por Região</span>
        <ResetBtn onClick={() => sistemaConfig.resetRegiao()} />
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.caso}>
              <td style={{ fontSize: 12.5, padding: '3px 8px' }}>{l.caso}</td>
              <td style={{ padding: '3px 8px', textAlign: 'center' }}>
                <NumCell value={l.get()} label={`modificador ${l.caso}`} onChange={l.set} />
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
        Aplicado sobre a disponibilidade quando o tesouro não é típico da região (fração: 0.5 = ×1/2).
      </div>
    </div>
  )
}

/** "Taxa de Revenda" (#300): fração do valor de mercado devolvida em Ouro ao
 *  VENDER um item (arma/tesouro) na ficha. Vale para armas E tesouros. */
function RevendaSection() {
  useSistemaVersion()
  return (
    <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 19, flex: 'none' }}>🏷️</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Taxa de Revenda</span>
        <ResetBtn onClick={() => sistemaConfig.resetRevenda()} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span
          style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--muted)' }}
        >
          FRAÇÃO DEVOLVIDA ×
        </span>
        <NumCell
          value={sistemaConfig.getRevenda()}
          label="taxa de revenda"
          onChange={(v) => sistemaConfig.setRevenda(v)}
        />
      </div>
      <div
        style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.04em', color: 'var(--muted)', opacity: 0.85 }}
      >
        Ao VENDER uma arma ou tesouro na ficha, o herói recebe esta fração do valor de mercado do item
        (0.5 = metade). Base = preço do item × multiplicador do tier.
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

/** Linha "Database" do rodapé (#190): stamp da extração embutida no build —
 *  vault-data/db-version.json, gravado ao final de todo `npm run extract`
 *  (extractor/extract-vault.mjs). Fetch LAZY ao montar o CONFIG (não pesa nas
 *  outras telas); build sem stamp (extract antigo) → não renderiza nada, não
 *  inventa valor. */
function DatabaseLine() {
  const [stamp, setStamp] = useState<{ extractedAt: string; docCount: number } | null>(null)
  useEffect(() => {
    let alive = true
    // BASE_URL: funciona também com deploy em subcaminho (VITE_BASE, #189).
    fetch(`${import.meta.env.BASE_URL}vault-data/db-version.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { extractedAt?: string; docCount?: number } | null) => {
        if (alive && v && typeof v.extractedAt === 'string' && typeof v.docCount === 'number')
          setStamp({ extractedAt: v.extractedAt, docCount: v.docCount })
      })
      .catch(() => {
        /* stamp ausente/offline: rodapé fica sem a linha */
      })
    return () => {
      alive = false
    }
  }, [])
  if (!stamp) return null
  const quando = new Date(stamp.extractedAt).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return (
    <div>
      DATABASE · {quando} · {stamp.docCount} DOCS
    </div>
  )
}

export function ConfigPage() {
  const { theme, mode, context, setTheme, setMode, setContext } = useTheme()
  const { mestre, setMestre, desenvolvedor, linkIcons, setLinkIcons } = useSettings()
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
          <ConfigRow ic="🌓" label="Modo de Exibição">
            {MODES.map((o) => (
              <OptPill key={o.id} ic={o.ic} label={o.label} on={mode === o.id} onClick={() => setMode(o.id)} />
            ))}
          </ConfigRow>
          <ConfigRow ic="🌐" label="Contexto">
            {CONTEXTS.map((o) => (
              <OptPill key={o.id} ic={o.ic} label={o.label} on={context === o.id} onClick={() => setContext(o.id)} />
            ))}
          </ConfigRow>
          <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 19, flex: 'none' }}>🎨</span>
              <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Tema</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {THEMES.map((o) => (
                <button
                  key={o.id}
                  title={o.label}
                  onClick={() => setTheme(o.id)}
                  style={accentPillStyle(theme === o.id)}
                >
                  <Swatch color={ACCENT_COLORS[o.id].accent} />
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
          <AccentRow />
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
          {/* #303: ícones supercharged nos links (emoji do tipo do doc-alvo). */}
          <ConfigRow ic="🔗" label="Ícones nos Links">
            {MESTRE_OPTS.map((o) => (
              <OptPill
                key={String(o.id)}
                ic={o.ic}
                label={o.label}
                on={linkIcons === o.id}
                onClick={() => setLinkIcons(o.id)}
              />
            ))}
          </ConfigRow>
          {/* Modo Dev (#252): sem toggle de ativação por ora (liga via
              localStorage); quando ligado, expõe Publicar/Exportar. */}
          {desenvolvedor ? <DevPublishPanel /> : null}
        </>
      ) : mestre ? (
        <>
          {/* Configs de tesouro — valem pras sessões que o usuário criar como
              mestre. Disponibilidade é editável (RESTAURAR PADRÃO volta aos
              defaults; os padrões em si nunca mudam — DEFAULT_MATRIX). */}
          <DisponibilidadeSection />
          <MultiplicadoresSection />
          <RevendaSection />
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
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* versão REAL do app (#191): package.json via define do vite.config */}
        <div>PLEITOST COMPANION//OS · v{APP_VERSION}</div>
        <DatabaseLine />
      </div>
    </div>
  )
}
