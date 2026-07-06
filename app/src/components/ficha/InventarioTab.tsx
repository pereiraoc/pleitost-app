// Aba INVENTÁRIO da ficha — markup/estilos verbatim do design puxado
// (design/pulled/Companion App.dc.html §INVENTÁRIO, linhas 550-719; semântica
// dos slots do invData() do script). Dados do modelo salvo LOCAL (useHeroModel
// = FM extraído + overlay); toda interação (moedas, arma/propriedade,
// qualidade, adicionar/remover, consumíveis) grava o overlay NA HORA nos
// paths de Inventario.*, espelhando os setters do Editável do plugin
// (extract/apply-armas-edit.ts, apply-equipamentos-edit.ts,
// apply-tesouros-edit.ts). Adições entram na LISTA real do FM, como no
// design (invData: allArmas = I.armas+extraArmas; tesouros ganham o grupo
// ADICIONADOS) e no plugin (addArma/addTesouro).
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { linkLabel } from '../../markdown/dataview-value'
import { useCatalog } from '../../data/CatalogContext'
import { useAssetIndex } from '../../data/assets'
import { weaponImageUrl } from '../../data/creature-image'
import { loadDoc } from '../../data/useDoc'
import { useHeroModel } from '../../data/useHeroModel'
import { clip, GoldDots, PanelTrack, TabStrip, TrackPanel } from './bits'
import { CoinsDropdown } from './pop-panels'
import type { HeroRefs } from './useHeroRefs'
import {
  ARMADURA_BASES,
  ATTR_EMOJI,
  ESCUDO_BASES,
  GRUPO_ARMA_ORDER,
  ITEM_TIER_BTN,
  grupoArmaEmoji,
  imbuicaoEmoji,
  tokens,
} from './registry'
import {
  ARMA_OBRA_PRIMA,
  ARMADURA_OBRA_PRIMA,
  RANK_BONUS_ITEM,
  bonusPorTier,
  buildItemAlias,
  buildTesouroAlias,
  deriveArmaAtributo,
  escudoObraPrima,
  fmPath,
  heroAtributos,
  num,
  parseItemAlias,
  str,
  tierCategoriaFm,
  tierLetter,
  wikiTarget,
} from './hero-model'

const INV_TABS = [
  { id: 'armas', label: 'ARMAS' },
  { id: 'equipamentos', label: 'EQUIPAMENTOS' },
  { id: 'consumiveis', label: 'CONSUMÍVEIS' },
]

const ARMAS_FOLDER = 'Sistema/Equipamento/Armas/'
const TESOUROS_FOLDER = 'Sistema/Equipamento/Tesouros/'
const CONSUMIVEIS_FOLDER = 'Sistema/Equipamento/Tesouros/Consumíveis/'
// Pasta das opções do dropdown de PROPRIEDADE da arma — "Imbuições +
// qualidade" do Editável do plugin (equipamentos-section.ts:214-216).
const IMBUICOES_FOLDER = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/'
const TESOUROS_EXCLUIR = [CONSUMIVEIS_FOLDER, IMBUICOES_FOLDER]

/** Select transparente dentro do pill desenhado — estilos verbatim do select
 *  do design (Companion App.dc.html:636, armadura/escudo); peso/tamanho
 *  seguem o texto que o pill mostrava (nome 700/15, propriedade 500/13.5). */
function pillSelectStyle(weight: number, size: number): CSSProperties {
  return {
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'transparent',
    border: 'none',
    color: 'var(--blue)',
    fontSize: size,
    fontWeight: weight,
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

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
  const catalog = useCatalog()
  const model = useHeroModel(doc, 'inventario')
  const lista = (fmPath(model.fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  const rows = useMemo(() => armaRowsFromFm(model.fm), [model.fm])
  const atributos = heroAtributos(model.fm).values

  // Overlay grava a LISTA inteira (write-through de container, como o plugin).
  const patchArma = (i: number, patch: Record<string, unknown>) =>
    model.set(
      'Inventario.Armas.Lista',
      lista.map((arma, j) => (j === i ? { ...arma, ...patch } : arma)),
    )

  // Dropdown de ARMA agrupado por grupo — espelha buildArmaOptionGroups do
  // Editável (equipamentos-section.ts:284-308: ordem GRUPO_ORDER, armas em
  // ordem alfabética pt-BR dentro do grupo).
  const armaGroups = useMemo(() => {
    const byGrupo = new Map<string, IndexDocEntry[]>()
    for (const e of catalog.content) {
      if (!e.id.startsWith(ARMAS_FOLDER) || e.subtype !== 'Arma') continue
      const g = (typeof e.grupo === 'string' ? e.grupo : '').toLowerCase()
      const list = byGrupo.get(g) ?? []
      list.push(e)
      byGrupo.set(g, list)
    }
    return GRUPO_ARMA_ORDER.filter((g) => byGrupo.has(g.key)).map((g) => ({
      ...g,
      entries: byGrupo
        .get(g.key)!
        .sort((a, b) => (a.basename ?? '').localeCompare(b.basename ?? '', 'pt-BR')),
    }))
  }, [catalog])

  // Dropdown de PROPRIEDADE — imbuições + qualidade (equipamentos-section.ts:214-226).
  const imbuicoes = useMemo(
    () =>
      catalog.content
        .filter((e: IndexDocEntry) => e.id.startsWith(IMBUICOES_FOLDER))
        .map((e) => e.basename ?? e.id)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [catalog],
  )

  // Qualidade A/E/M — espelha setArmaRank do plugin (apply-armas-edit.ts:139-160):
  // desselecionar zera categoria+bônus e some com a Obra-prima automática;
  // selecionar exige arma com nome, seta categoria + bônus do tier e completa
  // propriedade vazia com Arma Obra-prima.
  const setTier = (i: number, tier: '' | 'A' | 'E' | 'M') => {
    const arma = lista[i]
    if (!arma) return
    if (tier === '') {
      patchArma(i, {
        Categoria: '',
        Bonus_Item: 0,
        ...(/Arma Obra-prima/.test(str(arma['Propriedade'])) ? { Propriedade: '' } : {}),
      })
      return
    }
    if (!str(arma['Nome'])) return
    patchArma(i, {
      Categoria: tierCategoriaFm(tier),
      Bonus_Item: RANK_BONUS_ITEM[tier],
      ...(str(arma['Propriedade']) ? {} : { Propriedade: ARMA_OBRA_PRIMA }),
    })
  }

  // Trocar a arma — espelha o onChange do dropdown do Editável
  // (equipamentos-section.ts:141-160): grava nome (wikilink basename,
  // setArmaNome/apply-armas-edit.ts:89-97) + atributo derivado do grupo e da
  // propriedade Precisa num ÚNICO write (batch do plugin).
  const setNome = (i: number, id: string) => {
    const entry = catalog.entryById.get(id)
    if (!entry) return
    const nome = entry.basename ?? id
    void loadDoc(id)
      .catch(() => undefined)
      .then((armaDoc) =>
        patchArma(i, {
          Nome: `[[${nome}]]`,
          Atributo: deriveArmaAtributo(entry.grupo, armaDoc?.inlineFields['propriedades'], atributos),
        }),
      )
  }

  // Propriedade — espelha setArmaPropriedade (apply-armas-edit.ts:121-131):
  // wikilink basename; vazio limpa o campo.
  const setProp = (i: number, base: string) => patchArma(i, { Propriedade: base ? `[[${base}]]` : '' })

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
            // Imagem real da arma (issue #12): embed do doc → figura da carta
            // (hierarquia em weaponImageUrl); sem imagem → slot vazio do design.
            const img = weaponImageUrl(armaDoc, assets)
            // Valor do dropdown de arma: id do doc no catálogo; arma fora do
            // catálogo mantém o rótulo atual como opção extra (nunca some).
            const armaTarget = wikiTarget(arma.nomeRaw)
            const armaRes = armaTarget ? catalog.resolve(armaTarget) : null
            const armaId = armaRes?.kind === 'doc' ? armaRes.id : armaTarget
            const armaNoCatalogo = armaGroups.some((g) => g.entries.some((e) => e.id === armaId))
            const propBase = (wikiTarget(arma.propriedadeRaw).split('/').pop() ?? '').trim()
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
                    backgroundImage: img ? `url("${img}")` : undefined,
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
                        <select
                          value={armaId}
                          onChange={(e) => setNome(i, e.target.value)}
                          aria-label="Arma"
                          style={pillSelectStyle(700, 15)}
                        >
                          {!armaId ? (
                            /* emptyLabel do dropdown do Editável (equipamentos-section.ts:146) */
                            <option value="">Selecionar arma</option>
                          ) : null}
                          {armaId && !armaNoCatalogo ? (
                            <option value={armaId}>{arma.nome}</option>
                          ) : null}
                          {armaGroups.map((g) => (
                            <optgroup key={g.key} label={`${grupoArmaEmoji(g.key)} ${g.label}`}>
                              {g.entries.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.basename}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
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
                        <select
                          value={propBase}
                          onChange={(e) => setProp(i, e.target.value)}
                          aria-label="Propriedade da arma"
                          style={pillSelectStyle(500, 13.5)}
                        >
                          {/* vazio do design: ench '—' das armas adicionadas (pickArma) */}
                          <option value="">—</option>
                          {propBase && !imbuicoes.includes(propBase) ? (
                            <option value={propBase}>{ench}</option>
                          ) : null}
                          {imbuicoes.map((nome) => (
                            <option key={nome} value={nome}>
                              {nome === propBase ? ench : nome}
                            </option>
                          ))}
                        </select>
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
  // Espelha os setters do Editável (apply-equipamentos-edit.ts):
  //  - trocar a base limpa categoria+propriedade (setArmaduraNome:50-55 /
  //    setEscudoNome:87-110; escudo "Sem" grava nome vazio como o plugin);
  //  - A/E/M desselecionado zera categoria+propriedade (:73-77/:114-121);
  //  - A/E/M sem peça ("Sem …"/nome vazio) é no-op (:78/:122);
  //  - A/E/M seleciona categoria + Obra-prima automática (armadura :79-81;
  //    escudo :123-125 via resolveObraPrimaTarget).
  const gearHandlers = (path: string, gear: Record<string, unknown>, kind: 'armadura' | 'escudo') => ({
    onBase: (base: string) =>
      writeGear(path, gear, {
        Nome: kind === 'escudo' && /^Sem\b/.test(base) ? '' : nomeFm(base),
        Categoria: '',
        Propriedade: '',
      }),
    onTier: (tier: '' | 'A' | 'E' | 'M') => {
      if (!tier) {
        writeGear(path, gear, { Categoria: '', Propriedade: '' })
        return
      }
      const base = linkLabel(str(gear['Nome']))
      if (!base || /^Sem\b/.test(base)) return
      writeGear(path, gear, {
        Categoria: tierCategoriaFm(tier),
        Propriedade: kind === 'armadura' ? ARMADURA_OBRA_PRIMA : escudoObraPrima(gear['Nome']),
      })
    },
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
  // Qualidade do tesouro — espelha setTesouroTier do plugin
  // (apply-tesouros-edit.ts:60-78): reescreve o alias com o novo tier;
  // "null não desseleciona — tesouro sem tier não faz sentido. UI trata
  // click no rank ATIVO como NO-OP".
  const setTierTesouro = (index: number, tier: '' | 'A' | 'E' | 'M') => {
    if (!tier) return
    const { nome } = parseItemAlias(tesourosRaw[index])
    model.set(
      'Inventario.Tesouros',
      tesourosRaw.map((raw, j) => (j === index ? buildTesouroAlias(nome, tier) : raw)),
    )
  }

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
          {...gearHandlers('Inventario.Armadura', armadura, 'armadura')}
        />
        <GearCard
          titulo="ESCUDO"
          badge={tokens.emojis.equipProf.Escudo}
          bases={ESCUDO_BASES}
          gear={escudo}
          {...gearHandlers('Inventario.Escudo', escudo, 'escudo')}
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
                  <TierBtns sel={r.tier} size={22} onSelect={(next) => setTierTesouro(r.index, next)} />
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
    // Posição do design (dc.html:707: right:26 bottom:22 z40, absolute no
    // container full-height da tela) — fixed porque aqui quem rola é o
    // .app-main; as bordas visíveis da section coincidem com o viewport.
    <div
      style={{
        position: 'fixed',
        right: 26,
        bottom: 22,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
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

  // Adicionar ARMA (issue #14) — vira linha REAL de Inventario.Armas.Lista no
  // overlay, como no plugin (addArma/emptyArma, apply-armas-edit.ts:64-82 —
  // fonte "Manual") e no design (pickArma: a arma escolhida entra na lista de
  // cards). Nome/atributo seguem o batch do dropdown do Editável
  // (equipamentos-section.ts:141-160: wikilink basename + deriveArmaAtributo).
  const addArma = (id: string) => {
    const entry = catalog.entryById.get(id)
    if (!entry) return
    const nome = entry.basename ?? id
    void loadDoc(id)
      .catch(() => undefined)
      .then((armaDoc) => {
        const lista = (fmPath(model.fm, 'Inventario', 'Armas', 'Lista') ?? []) as unknown[]
        model.set('Inventario.Armas.Lista', [
          ...lista,
          {
            Nome: `[[${nome}]]`,
            Atributo: deriveArmaAtributo(
              entry.grupo,
              armaDoc?.inlineFields['propriedades'],
              heroAtributos(model.fm).values,
            ),
            Bonus_Item: 0,
            Bonus_Especial: 0,
            Categoria: '',
            Propriedade: '',
            Fonte: 'Manual',
          },
        ])
      })
  }

  // Adicionar TESOURO (issue #14) — espelha addTesouro do plugin
  // (apply-tesouros-edit.ts:38-51): alias `[[X|X (Adepto)]]` (tier A default);
  // tesouro repetido é no-op ("já tem").
  const addTesouro = (id: string) => {
    const entry = catalog.entryById.get(id)
    if (!entry) return
    const nome = entry.basename ?? id
    const tesouros = (fmPath(model.fm, 'Inventario', 'Tesouros') ?? []) as unknown[]
    if (tesouros.some((raw) => parseItemAlias(raw).nome === nome)) return
    model.set('Inventario.Tesouros', [...tesouros, buildTesouroAlias(nome, 'A')])
  }

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
        // strip→painel = contentPad vertical do design (dc.html:524)
        gap: 24,
      }}
    >
      <TabStrip
        tabs={INV_TABS}
        active={tab}
        onSelect={setTab}
        pad="12px 20px"
        right={<CoinsButton coins={coins} onChange={setCoins} />}
      />
      <PanelTrack index={index}>
          {/* pad 0: contentPad dos painéis do design já vem do .app-main */}
          <TrackPanel pad="0" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ArmasPanel doc={doc} refs={refs} />
          </TrackPanel>
          <TrackPanel pad="0" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <EquipamentosPanel doc={doc} refs={refs} />
          </TrackPanel>
          <TrackPanel pad="0">
            <ConsumiveisPanel doc={doc} />
          </TrackPanel>
      </PanelTrack>
      {/* Fab da aba ativa no nível da TELA, como o invAdd do design
          (dc.html:707: absolute right:26 bottom:22 no container da tela;
          consumíveis não tem fab). */}
      {tab === 'armas' ? (
        <AddFab label="+ Adicionar Arma" title="ESCOLHER ARMA" items={armaCatalog} onPick={addArma} />
      ) : tab === 'equipamentos' ? (
        <AddFab
          label="+ Adicionar Tesouro"
          title="ESCOLHER TESOURO"
          items={tesouroCatalog}
          onPick={addTesouro}
        />
      ) : null}
    </div>
  )
}
