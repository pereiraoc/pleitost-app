// Painéis dropdown de VIDA e MOEDAS compartilhados — fragmentos verbatim do
// design puxado (design/pulled/Companion App.dc.html). O template repete a
// mesma markup em dois pontos:
//   - vida: painel da topbar (linhas 53-66) ≡ painel da barra do COMBATE
//     (355-368) → miolo compartilhado em <VidaAdjustRows>, wrappers locais
//     (posicionamento difere);
//   - moedas: dropdown da topbar (74-88) ≡ dropdown do INVENTÁRIO (561-575)
//     → <CoinsDropdown> completo (scrim + caixa).
// Vida é estado COMPARTILHADO persistido (useHeroModel): máximos de Vida.*,
// correntes de Interativa.Recursos_Restantes com autosave — topbar e aba
// COMBATE leem/escrevem a mesma fonte (diretriz 2026-07-05).
import type { VaultDoc } from '../../data/types'
import { useHeroModel } from '../../data/useHeroModel'
import { useHeroRules } from '../../rules/useHeroRules'
import { clip } from './bits'
import { tokens } from './registry'
import { fmPath, interativa, num } from './hero-model'

/* ===================== vida ===================== */

export interface VidaAdjRow {
  ic: string
  name: string
  val: string
  cbase: string
  adj: { l: string; inc: number; fn: () => void }[]
}

export interface VidaLocal {
  vit: number
  moral: number
  temp: number
  vitMax: number
  moralMax: number
  rows: VidaAdjRow[]
  applyDmg: (n: number) => void
}

/** Grade de ajustes −10…+10 do template — compartilhada por vida e EM. */
const mkAdj = (setter: (d: number) => void): VidaAdjRow['adj'] =>
  [-10, -5, -1, 1, 5, 10].map((d) => ({
    l: (d < 0 ? '−' : '+') + Math.abs(d),
    inc: d > 0 ? 1 : 0,
    fn: () => setter(d),
  }))

/** Porta fiel do vidaModel() do script do design sobre o modelo salvo:
 *  máximos de Vida.*, correntes da Interativa.Recursos_Restantes — lidas e
 *  gravadas (autosave) no overlay compartilhado por herói. */
export function useVidaLocal(doc: VaultDoc, origem = 'combate'): VidaLocal {
  const model = useHeroModel(doc, origem)
  const fm = model.fm
  // O MÁXIMO da Vida vem do FM DERIVADO: numa ficha nova as regras da classe
  // (`Definir Vida.Vitalidade/Moral`) só existem no calculated → derivedFm, e o
  // FM salvo (skeleton) traz 0 (issue #64). Só a BASE (max) sai do derivedFm —
  // o corrente/volátil continua da Interativa.Recursos_Restantes (buffs
  // interativos NÃO entram aqui; o #49 manteve o volátil fora do derivedFm de
  // propósito). Como o merge só reaplica alvos de regra, o derivedFm não mexe em
  // Recursos_Restantes; heróis materializados têm derivedFm.Vida === FM.Vida
  // (rule-driven), logo o max não regride.
  const rules = useHeroRules(fm)
  const baseFm = rules?.derivedFm ?? fm
  const vitMax = num(fmPath(baseFm, 'Vida', 'Vitalidade'))
  const moralMax = num(fmPath(baseFm, 'Vida', 'Moral'))
  const rest = interativa(fm).restantes
  const vit = rest['Vitalidade'] !== undefined ? num(rest['Vitalidade']) : vitMax
  const moral = rest['Moral'] !== undefined ? num(rest['Moral']) : moralMax
  const temp = num(rest['Moral_Temporaria'])

  const write = (campo: string, valor: number) =>
    model.setVolatile(`Interativa.Recursos_Restantes.${campo}`, valor)
  const clampVit = (x: number) => Math.max(-vitMax, Math.min(vitMax, x))
  const setVit = (d: number) => write('Vitalidade', clampVit(vit + d))
  const setMoral = (d: number) => write('Moral', Math.max(0, Math.min(moralMax, moral + d)))
  const setTemp = (d: number) => write('Moral_Temporaria', Math.max(0, temp + d))
  const applyDmg = (n: number) => {
    let t = temp
    let m = moral
    let rem = n
    const dt = Math.min(t, rem)
    t -= dt
    rem -= dt
    const dm = Math.min(m, rem)
    m -= dm
    rem -= dm
    write('Moral_Temporaria', t)
    write('Moral', m)
    write('Vitalidade', clampVit(vit - rem))
  }
  const rows: VidaAdjRow[] = [
    { ic: '❤️', name: 'VITALIDADE', val: `${vit} / ${vitMax}`, cbase: '#d9534f', adj: mkAdj(setVit) },
    { ic: '💙', name: 'MORAL', val: `${moral} / ${moralMax}`, cbase: '#4f8fd6', adj: mkAdj(setMoral) },
    { ic: '💚', name: 'MORAL TEMPORÁRIA', val: `+${temp}`, cbase: '#43a06a', adj: mkAdj(setTemp) },
  ]

  return { vit, moral, temp, vitMax, moralMax, rows, applyDmg }
}

/** Rows de ajuste (ícone + label + valor + grade −/+) — miolo verbatim do
 *  template de vida (linhas 53-66), compartilhado com o painel de EM (#230). */
export function AdjustRows({ rows }: { rows: VidaAdjRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((row) => (
        <div key={row.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 13 }}>{row.ic}</span>
            <span
              style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--muted)' }}
            >
              {row.name}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {row.val}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5 }}>
            {row.adj.map((b) => (
              <button
                key={b.l}
                onClick={b.fn}
                style={{
                  padding: '8px 0',
                  background: `color-mix(in srgb,${row.cbase} ${15 + b.inc * 85}%,var(--card))`,
                  border: `1px solid color-mix(in srgb,${row.cbase} ${32 + b.inc * 68}%,var(--line2))`,
                  color: `color-mix(in srgb,#fff ${b.inc * 100}%,color-mix(in srgb,${row.cbase} 80%,var(--text)))`,
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 3,
                }}
              >
                {b.l}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Miolo do painel de ajuste de vida (rows + botões de dano) — verbatim do
 *  template (linhas 53-66 ≡ 355-368). */
export function VidaAdjustRows({ vida }: { vida: VidaLocal }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AdjustRows rows={vida.rows} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 2 }}>
        {[1, 5, 10].map((n) => (
          <button
            key={n}
            onClick={() => vida.applyDmg(n)}
            style={{
              padding: '6px 0',
              background: 'color-mix(in srgb,#000 44%,var(--red))',
              border: '1px solid color-mix(in srgb,#000 22%,var(--red))',
              color: '#ffe9e4',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '.03em',
              cursor: 'pointer',
              borderRadius: 3,
            }}
          >
            🩸 -{n}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ===================== energia mágica (#230) ===================== */

export interface EmLocal {
  em: number
  emMax: number
  rows: VidaAdjRow[]
}

/** Estado local de EM pro chip da topbar — mesmo padrão do useVidaLocal:
 *  máximos do FM DERIVADO (Magias.EM vem da CLASSE via rule element — igual
 *  ao MagiasPanel do Combate), correntes do volátil
 *  Interativa.Recursos_Restantes.EM/EM_Secundaria (ausente → cheio), writes
 *  com clamp [0, max]. Row de EM Secundária só quando o herói tem
 *  (Magias.Secundaria.EM > 0 — labels do MagiaInfoBar). */
export function useEmLocal(doc: VaultDoc, origem = 'topbar'): EmLocal {
  const model = useHeroModel(doc, origem)
  const rules = useHeroRules(model.fm)
  const baseFm = rules?.derivedFm ?? model.fm
  const emMax = num(fmPath(baseFm, 'Magias', 'EM'))
  const emSecMax = num(fmPath(baseFm, 'Magias', 'Secundaria', 'EM'))
  const rest = interativa(model.fm).restantes
  const em = rest['EM'] !== undefined ? num(rest['EM']) : emMax
  const emSec = rest['EM_Secundaria'] !== undefined ? num(rest['EM_Secundaria']) : emSecMax

  const write = (campo: string, valor: number) =>
    model.setVolatile(`Interativa.Recursos_Restantes.${campo}`, valor)
  const setEm = (d: number) => write('EM', Math.max(0, Math.min(emMax, em + d)))
  const setEmSec = (d: number) => write('EM_Secundaria', Math.max(0, Math.min(emSecMax, emSec + d)))
  // Cor dos losangos de EM do Combate (MagiaInfoBar); ícones do registro.
  const rows: VidaAdjRow[] = [
    {
      ic: tokens.emojis.subcategoria.EnergiaMagica,
      name: 'ENERGIA MÁGICA',
      val: `${em} / ${emMax}`,
      cbase: '#3b82d6',
      adj: mkAdj(setEm),
    },
    ...(emSecMax > 0
      ? [
          {
            ic: tokens.emojis.subcategoria.EnergiaMagicaSecundaria,
            name: 'ENERGIA MÁGICA SECUNDÁRIA',
            val: `${emSec} / ${emSecMax}`,
            cbase: '#3b82d6',
            adj: mkAdj(setEmSec),
          },
        ]
      : []),
  ]

  return { em, emMax, rows }
}

/* ===================== moedas ===================== */

/** Dropdown de moedas completo (scrim + caixa 290px) — verbatim do template
 *  (topbar 74-88 ≡ inventário 561-575). */
export function CoinsDropdown({
  coins,
  onChange,
  onClose,
}: {
  coins: number
  onChange: (n: number) => void
  onClose: () => void
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55 }} />
      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 9px)',
          right: 0,
          zIndex: 60,
          width: 290,
          background: 'var(--panel2)',
          border: '1px solid var(--line2)',
          clipPath: clip(12),
          padding: 15,
          boxShadow: '0 14px 44px rgba(0,0,0,.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.12em',
            color: 'var(--muted)',
            marginBottom: 13,
          }}
        >
          <span style={{ fontSize: 14 }}>{tokens.emojis.inv.Moeda}</span>MOEDAS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 13 }}>
          <span style={{ fontSize: 24, flex: 'none' }}>{tokens.emojis.inv.Moeda}</span>
          <div
            style={{
              flex: 1,
              background: 'var(--card)',
              border: '1px solid var(--line2)',
              padding: '9px 14px',
              fontFamily: 'var(--mono)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--accent)',
              textAlign: 'center',
              clipPath: 'polygon(0 0,100% 0,100% 100%,5px 100%,0 calc(100% - 5px))',
            }}
          >
            {coins}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 7 }}>
          {[1, 5, 10, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => onChange(coins + n)}
              style={{
                padding: '9px 0',
                background: 'rgba(31,138,91,.92)',
                border: '1px solid rgba(43,160,108,1)',
                color: '#eafff2',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                clipPath: 'polygon(0 0,100% 0,100% 100%,4px 100%,0 calc(100% - 4px))',
              }}
            >
              +{n}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
          {[1, 5, 10, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => onChange(Math.max(0, coins - n))}
              style={{
                padding: '9px 0',
                background: 'rgba(150,42,42,.88)',
                border: '1px solid rgba(175,55,55,1)',
                color: '#ffe9e9',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                clipPath: 'polygon(0 0,100% 0,100% 100%,4px 100%,0 calc(100% - 4px))',
              }}
            >
              -{n}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
