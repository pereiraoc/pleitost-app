// Aba INVENTÁRIO da ficha — markup/estilos verbatim do design puxado
// (design/pulled/Companion App.dc.html §INVENTÁRIO, linhas 550-719; semântica
// dos slots do invData() do script). Dados do modelo salvo LOCAL (useHeroModel
// = FM extraído + overlay); toda interação (moedas, qualidade, remover,
// consumíveis) grava o overlay NA HORA nos paths de Inventario.*; adições
// sem linha de FM (painéis ADICIONADAS) persistem em extras.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { linkLabel } from '../../markdown/dataview-value'
import { useCatalog } from '../../data/CatalogContext'
import { resolveAsset, assetUrl, useAssetIndex } from '../../data/assets'
import { useHeroModel } from '../../data/useHeroModel'
import { clip, GoldDots, TabStrip } from './bits'
import { CoinsDropdown } from './pop-panels'
import type { HeroRefs } from './useHeroRefs'
import {
  ARMADURA_BASES,
  ATTR_EMOJI,
  ESCUDO_BASES,
  ITEM_TIER_BTN,
  grupoArmaEmoji,
  imbuicaoEmoji,
  tokens,
} from './registry'
import {
  bonusPorTier,
  buildItemAlias,
  fmPath,
  num,
  parseItemAlias,
  str,
  tierCategoriaFm,
  tierLetter,
} from './hero-model'

const INV_TABS = [
  { id: 'armas', label: 'ARMAS' },
  { id: 'equipamentos', label: 'EQUIPAMENTOS' },
  { id: 'consumiveis', label: 'CONSUMÍVEIS' },
]

const ARMAS_FOLDER = 'Sistema/Equipamento/Armas/'
const TESOUROS_FOLDER = 'Sistema/Equipamento/Tesouros/'
const CONSUMIVEIS_FOLDER = 'Sistema/Equipamento/Tesouros/Consumíveis/'
const TESOUROS_EXCLUIR = [
  CONSUMIVEIS_FOLDER,
  'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/',
]

const mono9: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 8.5,
  letterSpacing: '.06em',
  color: 'var(--muted)',
}

function panelStyle(): CSSProperties {
  return {
    padding: '16px 18px',
    background: 'var(--panel)',
    border: '1px solid var(--line2)',
    clipPath: clip(14),
  }
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.1em',
        color: 'var(--muted)',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

/** Botõezinhos A/E/M de qualidade (aem do invData; sel vazio = nenhum). */
function TierBtns({
  sel,
  size = 26,
  onSelect,
}: {
  sel: '' | 'A' | 'E' | 'M'
  size?: number
  onSelect?: (next: '' | 'A' | 'E' | 'M') => void
}) {
  return (
    <>
      {(['A', 'E', 'M'] as const).map((letter) => {
        const on = letter === sel
        return (
          <span
            key={letter}
            onClick={onSelect ? () => onSelect(on ? '' : letter) : undefined}
            style={{
              background: on ? ITEM_TIER_BTN[letter].bg : 'transparent',
              color: on ? '#f4f6f8' : 'var(--muted)',
              border: `1px solid ${on ? ITEM_TIER_BTN[letter].bd : 'var(--line2)'}`,
              width: size,
              height: size - 2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--mono)',
              fontSize: size > 23 ? 12 : 10.5,
              fontWeight: 700,
              cursor: onSelect ? 'pointer' : 'default',
            }}
          >
            {letter}
          </span>
        )
      })}
    </>
  )
}

function TrashBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        padding: 4,
        color: 'var(--muted)',
        fontSize: 16,
        cursor: 'pointer',
        flex: 'none',
        alignSelf: 'center',
      }}
    >
      🗑️
    </button>
  )
}

/* ===================== moedas ===================== */

function CoinsButton({ coins, onChange }: { coins: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Moedas"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 15px',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          cursor: 'pointer',
          clipPath: 'polygon(0 0,100% 0,100% 100%,7px 100%,0 calc(100% - 7px))',
          fontFamily: 'var(--mono)',
          fontSize: 14,
        }}
      >
        <span style={{ fontSize: 15 }}>{tokens.emojis.inv.Moeda}</span>
        <span style={{ color: 'var(--accent)' }}>{coins}</span>
      </button>
      {open ? <CoinsDropdown coins={coins} onChange={onChange} onClose={() => setOpen(false)} /> : null}
    </span>
  )
}

/* ===================== armas ===================== */

interface ArmaRow {
  nome: string
  nomeRaw: unknown
  atributo: string
  bonusItem: number
  bonusEspecial: number
  tier: '' | 'A' | 'E' | 'M'
  propriedadeRaw: unknown
}

function armaRowsFromFm(fm: Record<string, unknown>): ArmaRow[] {
  const lista = (fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  return (Array.isArray(lista) ? lista : []).map((arma) => ({
    nome: linkLabel(str(arma['Nome'])),
    nomeRaw: arma['Nome'],
    atributo: str(arma['Atributo']),
    bonusItem: num(arma['Bonus_Item']),
    bonusEspecial: num(arma['Bonus_Especial']),
    tier: tierLetter(arma['Categoria']) ?? '',
    propriedadeRaw: arma['Propriedade'],
  }))
}

function ArmasPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const assets = useAssetIndex()
  const model = useHeroModel(doc, 'inventario')
  const lista = (fmPath(model.fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  const rows = useMemo(() => armaRowsFromFm(model.fm), [model.fm])
  // Overlay grava a LISTA inteira (write-through de container, como o plugin).
  const setTier = (i: number, tier: '' | 'A' | 'E' | 'M') =>
    model.set(
      'Inventario.Armas.Lista',
      lista.map((arma, j) => (j === i ? { ...arma, Categoria: tierCategoriaFm(tier) } : arma)),
    )
  const removeArma = (i: number) =>
    model.set(
      'Inventario.Armas.Lista',
      lista.filter((_, j) => j !== i),
    )

  return (
    <div style={{ ...panelStyle(), display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <PanelLabel>ARMAS</PanelLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 3 }}>
          {rows.map((arma, i) => {
            const armaDoc = refs.refDoc(arma.nomeRaw)
            const propDoc = refs.refDoc(arma.propriedadeRaw)
            const ench = linkLabel(str(arma.propriedadeRaw))
            const enchIc = imbuicaoEmoji((propDoc?.inlineFields ?? {})['propriedades'])
            const imgTarget = armaDoc?.images?.[0]?.target
            const img =
              imgTarget && assets ? resolveAsset(assets, imgTarget.split('/').pop() ?? imgTarget) : null
            return (
              <div
                key={`${arma.nome}-${i}`}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: 13,
                  background: 'var(--card)',
                  border: '1px solid var(--line2)',
                  clipPath: clip(12),
                }}
              >
                <span
                  style={{
                    width: 96,
                    height: 96,
                    flex: 'none',
                    background: 'var(--panel2)',
                    border: '1px solid var(--line2)',
                    clipPath: clip(9),
                    backgroundImage: img ? `url("${assetUrl(img)}")` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        flex: '1 1 160px',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '6px 9px',
                            background: 'var(--panel2)',
                            border: '1px solid var(--line2)',
                            fontFamily: 'var(--mono)',
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--muted)',
                            flex: 'none',
                          }}
                        >
                          <span style={{ fontSize: 12 }}>{ATTR_EMOJI[arma.atributo] ?? ''}</span>
                          <span>{arma.atributo}</span>
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 10px',
                            background: 'var(--panel2)',
                            border: '1px solid var(--line2)',
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--muted)',
                            flex: 'none',
                          }}
                        >
                          <span style={{ color: 'var(--accent)' }}>★</span>
                          {arma.bonusEspecial}
                        </span>
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '9px 13px',
                          minWidth: 0,
                          background: 'var(--panel2)',
                          border: '1px solid var(--line2)',
                          cursor: 'pointer',
                          clipPath: clip(7),
                        }}
                      >
                        <span style={{ fontSize: 15, flex: 'none' }}>🗡️</span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontWeight: 700,
                            color: 'var(--blue)',
                            fontSize: 15,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {arma.nome}
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: 11, flex: 'none' }}>▾</span>
                      </span>
                    </span>
                    <span
                      style={{
                        flex: '1 1 260px',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
                        <span
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                        >
                          <span style={mono9}>QUALIDADE</span>
                          <span style={{ display: 'flex', gap: 5 }}>
                            <TierBtns sel={arma.tier} onSelect={(next) => setTier(i, next)} />
                          </span>
                        </span>
                        <span
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                        >
                          <span style={mono9}>ITEM BÔNUS</span>
                          <span style={{ display: 'flex', gap: 5, height: 24, alignItems: 'center' }}>
                            <GoldDots on={arma.bonusItem} />
                          </span>
                        </span>
                        <span style={{ flex: 1, minWidth: 4 }} />
                        <TrashBtn onClick={() => removeArma(i)} />
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '9px 13px',
                          minWidth: 0,
                          background: 'var(--panel2)',
                          border: '1px solid var(--line2)',
                          cursor: 'pointer',
                          clipPath: clip(7),
                        }}
                      >
                        <span style={{ fontSize: 14, flex: 'none' }}>{enchIc}</span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontWeight: 500,
                            color: 'var(--blue)',
                            fontSize: 13.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ench}
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: 11, flex: 'none' }}>▾</span>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ===================== armadura / escudo / tesouros ===================== */

function GearCard({
  titulo,
  badge,
  bases,
  gear,
  onBase,
  onTier,
}: {
  titulo: string
  badge: string
  bases: string[]
  gear: Record<string, unknown>
  onBase: (base: string) => void
  onTier: (tier: '' | 'A' | 'E' | 'M') => void
}) {
  const base = linkLabel(str(gear['Nome'])) || bases[0]
  const tier = tierLetter(gear['Categoria']) ?? ''
  const setTier = onTier
  const noGear = /^Sem\b/.test(base)
  const ench = linkLabel(str(gear['Propriedade']))
  const rankOn = tier === 'A' || tier === 'E' || tier === 'M'

  return (
    <div style={{ ...panelStyle(), padding: 18, display: 'flex', flexDirection: 'column', gap: 15 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 23,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.12em',
            color: 'var(--muted)',
          }}
        >
          {titulo}
        </span>
        {!noGear ? (
          <span style={{ display: 'flex', gap: 4 }}>
            <TierBtns sel={tier} size={24} onSelect={setTier} />
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            flex: 'none',
            width: 60,
            height: 60,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            clipPath: clip(10),
          }}
        >
          {badge}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'var(--card)',
            border: '1px solid var(--line2)',
            clipPath: clip(7),
          }}
        >
          <select
            value={base}
            onChange={(e) => onBase(e.target.value)}
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              background: 'transparent',
              border: 'none',
              color: 'var(--blue)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {(bases.includes(base) ? bases : [base, ...bases]).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {rankOn && ench ? (
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--gold)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flex: 'none',
              }}
            >
              {ench} ({tier})
            </span>
          ) : null}
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--muted)', fontSize: 10 }}>▾</span>
        </span>
      </div>
    </div>
  )
}

interface TesouroRow {
  nome: string
  tier: '' | 'A' | 'E' | 'M'
  bonus: number
  grupo: string
  index: number
}

function EquipamentosPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'inventario')
  const fm = model.fm
  const armadura = (fmPath(fm, 'Inventario', 'Armadura') ?? {}) as Record<string, unknown>
  const escudo = (fmPath(fm, 'Inventario', 'Escudo') ?? {}) as Record<string, unknown>

  // Base escolhida vira o Nome do container: wikilink quando o doc existe na
  // vault (formato do FM salvo), senão o rótulo plano do design.
  const nomeFm = (base: string) => {
    const res = catalog.resolve(base)
    return res.kind === 'doc' ? `[[${base}]]` : base
  }
  const writeGear = (path: string, gear: Record<string, unknown>, patch: Record<string, unknown>) =>
    model.set(path, { ...gear, ...patch })
  const gearHandlers = (path: string, gear: Record<string, unknown>) => ({
    onBase: (base: string) =>
      writeGear(path, gear, {
        Nome: nomeFm(base),
        ...(/^Sem\b/.test(base) ? { Categoria: '' } : {}),
      }),
    onTier: (tier: '' | 'A' | 'E' | 'M') => writeGear(path, gear, { Categoria: tierCategoriaFm(tier) }),
  })

  const tesourosRaw = (fmPath(fm, 'Inventario', 'Tesouros') ?? []) as unknown[]
  const rows: TesouroRow[] = useMemo(
    () =>
      tesourosRaw.map((raw, index) => {
        const { nome, tier } = parseItemAlias(raw)
        const tDoc = refs.refDoc(raw)
        // Grupo = pasta do doc do tesouro na vault (fonte real da organização).
        const parts = (tDoc?.id ?? '').split('/')
        const grupo = parts.length > 1 ? parts[parts.length - 2] : ''
        return {
          nome,
          tier: tier ?? '',
          bonus: tier ? bonusPorTier(tDoc, tier) : 0,
          grupo: grupo.toUpperCase(),
          index,
        }
      }),
    [tesourosRaw, refs],
  )
  const removeTesouro = (index: number) =>
    model.set(
      'Inventario.Tesouros',
      tesourosRaw.filter((_, j) => j !== index),
    )

  const groups = useMemo(() => {
    const byGroup = new Map<string, TesouroRow[]>()
    for (const row of rows) {
      const list = byGroup.get(row.grupo) ?? []
      list.push(row)
      byGroup.set(row.grupo, list)
    }
    return [...byGroup.entries()].map(([title, groupRows]) => ({
      title,
      dois: groupRows.some((r) => r.bonus > 0) ? 1 : 0,
      rows: groupRows,
    }))
  }, [rows])

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 16 }}>
        <GearCard
          titulo="ARMADURA"
          badge={tokens.emojis.equipProf.Armadura}
          bases={ARMADURA_BASES}
          gear={armadura}
          {...gearHandlers('Inventario.Armadura', armadura)}
        />
        <GearCard
          titulo="ESCUDO"
          badge={tokens.emojis.equipProf.Escudo}
          bases={ESCUDO_BASES}
          gear={escudo}
          {...gearHandlers('Inventario.Escudo', escudo)}
        />
      </div>

      <div style={panelStyle()}>
        <PanelLabel>TESOUROS</PanelLabel>
        {groups.map((g) => (
          <div key={g.title} style={{ marginBottom: 6 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr 40px',
                alignItems: 'center',
                gap: 8,
                padding: '9px 2px 7px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.06em',
                  color: '#7d8593',
                }}
              >
                {g.title}
              </span>
              <span style={{ textAlign: 'center', ...mono9, letterSpacing: '.04em' }}>QUALIDADE</span>
              <span style={{ textAlign: 'center', ...mono9, letterSpacing: '.04em', opacity: g.dois }}>
                ITEM BÔNUS
              </span>
              <span />
            </div>
            {g.rows.map((r) => (
              <div
                key={r.nome + r.tier}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 40px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 2px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 14, flex: 'none' }}>{tokens.emojis.bonusType.Item}</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--blue)',
                      fontSize: 13.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.nome}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                  <TierBtns sel={r.tier} size={22} />
                </span>
                <span style={{ display: 'flex', gap: 5, justifyContent: 'center', opacity: g.dois }}>
                  <GoldDots on={r.bonus} />
                </span>
                <span
                  onClick={() => removeTesouro(r.index)}
                  style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }}
                >
                  🗑️
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

/* ===================== consumíveis ===================== */

interface ConsRow {
  nome: string
  counts: { A: number; E: number; M: number }
  used: boolean
}

/** CATÁLOGO de consumíveis da vault (docs em Tesouros/Consumíveis) com os
 *  contadores do FM por cima: a tela do design é o catálogo onde se define
 *  o quanto se tem — consumível ausente do FM aparece com A/E/M zerados
 *  (Inventario.Consumiveis só lista o que tem quantidade). */
function consRows(fm: Record<string, unknown>, catalogo: IndexDocEntry[]): ConsRow[] {
  const byNome = new Map<string, ConsRow>()
  for (const entry of catalogo) {
    if (!entry.id.startsWith(CONSUMIVEIS_FOLDER)) continue
    const nome = entry.basename ?? entry.id
    byNome.set(nome, { nome, counts: { A: 0, E: 0, M: 0 }, used: false })
  }
  for (const raw of (fmPath(fm, 'Inventario', 'Consumiveis') ?? []) as unknown[]) {
    const { nome, tier, qtd } = parseItemAlias(raw)
    const row = byNome.get(nome) ?? { nome, counts: { A: 0, E: 0, M: 0 }, used: false }
    if (tier) row.counts[tier] += qtd
    byNome.set(nome, row)
  }
  return [...byNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
}

function ConsumiveisPanel({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'inventario')
  const rawList = (fmPath(model.fm, 'Inventario', 'Consumiveis') ?? []) as unknown[]
  const usedKey = (nome: string) => `inventario.consumivelUsado.${nome}`
  const rows = useMemo(
    () => consRows(model.fm, catalog.content),
    [model.fm, catalog.content],
  ).map((r) => ({ ...r, used: model.session(usedKey(r.nome)) === true }))

  // Contador grava a LISTA de aliases inteira no overlay (formato do FM
  // salvo, round-trip de parseItemAlias); entradas intactas preservam o raw.
  const setCount = (nome: string, tier: 'A' | 'E' | 'M', qtd: number) => {
    const next: unknown[] = []
    let feito = false
    for (const raw of rawList) {
      const p = parseItemAlias(raw)
      if (p.nome === nome && p.tier === tier) {
        if (!feito && qtd > 0) next.push(qtd === p.qtd ? raw : buildItemAlias(nome, tier, qtd))
        feito = true
      } else next.push(raw)
    }
    if (!feito && qtd > 0) next.push(buildItemAlias(nome, tier, qtd))
    model.set('Inventario.Consumiveis', next)
  }
  const toggleUsed = (nome: string, used: boolean) =>
    model.setSession(usedKey(nome), !used, 'imediato')

  const counter = (nome: string, tier: 'A' | 'E' | 'M', value: number) => {
    const zero = value === 0
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span
          onClick={zero ? undefined : () => setCount(nome, tier, Math.max(0, value - 1))}
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--card)',
            border: '1px solid color-mix(in srgb,var(--red) 45%,var(--line2))',
            color: '#e06a5c',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: zero ? 0.38 : 1,
            pointerEvents: zero ? 'none' : 'auto',
          }}
        >
          −
        </span>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12.5,
            minWidth: 24,
            textAlign: 'center',
            opacity: zero ? 0.45 : 1,
          }}
        >
          <span style={{ color: 'var(--text)', fontWeight: 700 }}>{value}</span>
          <span style={{ color: 'var(--muted)', fontSize: 9 }}>{tier}</span>
        </span>
        <span
          onClick={() => setCount(nome, tier, value + 1)}
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--card)',
            border: '1px solid color-mix(in srgb,#2f8f5b 45%,var(--line2))',
            color: '#4cc585',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          +
        </span>
      </span>
    )
  }

  return (
    <div style={panelStyle()}>
      <PanelLabel>CONSUMÍVEIS</PanelLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
          alignItems: 'center',
          gap: 8,
          padding: '0 2px 9px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.06em',
            color: 'var(--muted)',
          }}
        >
          ITEM
        </span>
        {['ADEPTO', 'EXPERIENTE', 'MESTRE'].map((h) => (
          <span
            key={h}
            style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}
          >
            {h}
          </span>
        ))}
      </div>
      {rows.map((c) => (
        <div
          key={c.nome}
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
            alignItems: 'center',
            gap: 8,
            padding: '8px 2px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button
              onClick={() => toggleUsed(c.nome, c.used)}
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                flex: 'none',
              }}
            >
              {c.used ? tokens.emojis.pocao.Cooldown : tokens.emojis.pocao.Pronto}
            </button>
            <span style={{ fontSize: 15, flex: 'none' }}>{tokens.emojis.categoria.Consumivel}</span>
            <span
              style={{
                fontWeight: 600,
                color: c.used ? 'var(--muted)' : 'var(--blue)',
                fontSize: 14,
                textDecoration: c.used ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.nome}
            </span>
          </span>
          {counter(c.nome, 'A', c.counts.A)}
          {counter(c.nome, 'E', c.counts.E)}
          {counter(c.nome, 'M', c.counts.M)}
        </div>
      ))}
    </div>
  )
}

/* ===================== adicionar arma/tesouro ===================== */

function AddFab({
  label,
  title,
  items,
  onPick,
}: {
  label: string
  title: string
  items: { ic: string; nm: string; key: string }[]
  onPick: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 22,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        alignSelf: 'flex-end',
      }}
    >
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              width: 'min(320px,74vw)',
              maxHeight: 'min(340px,58vh)',
              overflowY: 'auto',
              background: 'var(--panel2)',
              border: '1px solid var(--line2)',
              clipPath: clip(12),
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              boxShadow: '0 18px 46px rgba(0,0,0,.5)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.1em',
                color: 'var(--muted)',
                padding: '4px 6px 6px',
              }}
            >
              {title}
            </div>
            {items.map((w) => (
              <button
                key={w.key}
                onClick={() => {
                  onPick(w.key)
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 10px',
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  clipPath: clip(6),
                }}
              >
                <span style={{ fontSize: 15, flex: 'none' }}>{w.ic}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{w.nm}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '11px 18px',
          background: 'var(--accent)',
          border: '1px solid var(--accent)',
          color: 'var(--ink)',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '.02em',
          boxShadow: '0 10px 26px rgba(0,0,0,.42)',
          clipPath: clip(9),
        }}
      >
        {label} ▾
      </button>
    </div>
  )
}

/* ===================== aba ===================== */

export function InventarioTab({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'inventario')
  const [tab, setTab] = useState('armas')
  // Moedas: MESMO estado persistido do chip da topbar (overlay Inventario.Ouro).
  const coins = num(fmPath(model.fm, 'Inventario', 'Ouro'))
  const setCoins = (n: number) => model.set('Inventario.Ouro', n)
  // Adições sem linha de FM: persistidas em extras (painéis ADICIONADAS).
  const extraArmas = model.extras.armas
  const extraTesouros = model.extras.tesouros
  const setExtraArmas = (fn: (list: string[]) => string[]) =>
    model.setExtras('armas', fn(extraArmas))
  const setExtraTesouros = (fn: (list: string[]) => string[]) =>
    model.setExtras('tesouros', fn(extraTesouros))

  const armaCatalog = useMemo(
    () =>
      catalog.content
        .filter((e: IndexDocEntry) => e.id.startsWith(ARMAS_FOLDER) && e.subtype === 'Arma')
        .map((e) => ({
          ic: grupoArmaEmoji(typeof e.grupo === 'string' ? e.grupo : ''),
          nm: e.basename ?? e.id,
          key: e.id,
        })),
    [catalog],
  )
  const tesouroCatalog = useMemo(
    () =>
      catalog.content
        .filter(
          (e: IndexDocEntry) =>
            e.id.startsWith(TESOUROS_FOLDER) &&
            e.subtype === 'Tesouro' &&
            !TESOUROS_EXCLUIR.some((prefix) => e.id.startsWith(prefix)),
        )
        .map((e) => ({ ic: tokens.emojis.bonusType.Item, nm: e.basename ?? e.id, key: e.id })),
    [catalog],
  )

  const index = Math.max(
    0,
    INV_TABS.findIndex((t) => t.id === tab),
  )

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <TabStrip
        tabs={INV_TABS}
        active={tab}
        onSelect={setTab}
        pad="12px 20px"
        right={<CoinsButton coins={coins} onChange={setCoins} />}
      />
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            width: '100%',
            transform: `translateX(-${index * 100}%)`,
            transition: 'transform .32s cubic-bezier(.2,.85,.32,1)',
          }}
        >
          <div style={{ flex: '0 0 100%', minWidth: 0, padding: '2px 1px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ArmasPanel doc={doc} refs={refs} />
            {extraArmas.length ? (
              <div style={panelStyle()}>
                <PanelLabel>ADICIONADAS</PanelLabel>
                {extraArmas.map((id, i) => (
                  <div
                    key={`${id}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 2px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <span style={{ fontSize: 15, flex: 'none' }}>
                      {armaCatalog.find((w) => w.key === id)?.ic ?? ''}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>
                      {catalog.entryById.get(id)?.basename ?? id}
                    </span>
                    <TrashBtn
                      onClick={() => setExtraArmas((list) => list.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <AddFab
              label="+ Adicionar Arma"
              title="ESCOLHER ARMA"
              items={armaCatalog}
              onPick={(id) => setExtraArmas((list) => [...list, id])}
            />
          </div>
          <div style={{ flex: '0 0 100%', minWidth: 0, padding: '2px 1px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <EquipamentosPanel doc={doc} refs={refs} />
            {extraTesouros.length ? (
              <div style={panelStyle()}>
                <PanelLabel>ADICIONADOS</PanelLabel>
                {extraTesouros.map((id, i) => (
                  <div
                    key={`${id}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 2px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <span style={{ fontSize: 14, flex: 'none' }}>{tokens.emojis.bonusType.Item}</span>
                    <span style={{ flex: 1, fontWeight: 600, color: 'var(--blue)', fontSize: 13.5 }}>
                      {catalog.entryById.get(id)?.basename ?? id}
                    </span>
                    <TrashBtn
                      onClick={() => setExtraTesouros((list) => list.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <AddFab
              label="+ Adicionar Tesouro"
              title="ESCOLHER TESOURO"
              items={tesouroCatalog}
              onPick={(id) => setExtraTesouros((list) => [...list, id])}
            />
          </div>
          <div style={{ flex: '0 0 100%', minWidth: 0, padding: '2px 1px' }}>
            <ConsumiveisPanel doc={doc} />
          </div>
        </div>
      </div>
    </div>
  )
}
