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
import { ConsumivelHover, ItemHover, ITEM_CARD_CSS } from '../item-card'
import { TipProvider } from './tooltips'
import { weaponImageUrl } from '../../data/creature-image'
import {
  escudoImageUrlByName,
  obraPrimaSeloUrl,
  propriedadeImageUrl,
  tesouroImageUrl,
} from '../../data/equipment-image'
import { loadDoc, useDocs } from '../../data/useDoc'
import { TIER_PRICE_MULT, resaleRefund } from '../../data/commerce'
import { sistemaConfig } from '../../data/system-config'
import { precoPO } from '../../grupo/wealth'
import { useHeroModel } from '../../data/useHeroModel'
import { fichaFamiliaOf } from '../../data/familia'
import { useHeroRules } from '../../rules/useHeroRules'
import { clip, EditToggle, GoldDots, PanelTrack, TabStrip, TrackPanel } from './bits'
import { itemCategoria } from '../compendium/item-taxonomy'
import { buildEquippedGear } from '../../data/purchase'
import { CoinsDropdown } from './pop-panels'
import type { HeroRefs } from './useHeroRefs'
import {
  ATTR_EMOJI,
  GRUPO_ARMA_ORDER,
  ITEM_TIER_BTN,
  grupoArmaEmoji,
  imbuicaoEmoji,
  orderArmasByGrupo,
  tokens,
} from './registry'
import { armaduraBases, escudoBases } from './equipment-bases'
import {
  ARMA_OBRA_PRIMA,
  ARMADURA_OBRA_PRIMA,
  RANK_BONUS_ITEM,
  bonusPorTier,
  buildItemAlias,
  buildTesouroAlias,
  deriveArmaAtributo,
  docField,
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
// Toda a pasta Imbuições e Qualidade — excluída do catálogo de Tesouros
// (imbuições/qualidade não entram no "Adicionar Tesouro").
const IMBUICOES_FOLDER = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/'
// Só as IMBUIÇÕES reais aplicáveis a ARMA (subpasta Imbuições/) — as
// Obra-primas de armadura/escudo/broquel/ferramenta (subpasta Qualidade/) NÃO
// são propriedade de arma (issue #76); a de ARMA entra à parte, abaixo.
// Espelha o listImbuicoes do plugin, que exclui as obra-primas não-arma
// (cola/yaml-block-deps-factory.ts:686-692).
const IMBUICOES_ARMA_FOLDER = `${IMBUICOES_FOLDER}Imbuições/`
// Base do wikilink da Obra-prima automática da arma ("Arma Obra-prima"),
// derivada da constante do modelo — nunca string inventada.
const ARMA_OBRA_PRIMA_BASE = wikiTarget(ARMA_OBRA_PRIMA)
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

/** Botão VENDER (#300): remove o item E credita Ouro (fração de revenda). Mostra
 *  o valor de revenda no rótulo (ou tooltip, no modo `compact` dos tesouros).
 *  refund 0 (item sem valor de mercado) → vende mesmo assim, sem creditar. */
function SellBtn({ refund, onClick, compact }: { refund: number; onClick: () => void; compact?: boolean }) {
  const title = refund > 0 ? `Vender por ${refund} PO` : 'Vender (sem valor de revenda)'
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        border: 'none',
        background: 'none',
        padding: 4,
        color: 'var(--muted)',
        cursor: 'pointer',
        flex: 'none',
        alignSelf: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'var(--mono)',
        fontSize: 10.5,
        letterSpacing: '.06em',
      }}
    >
      <span style={{ fontSize: 14 }}>💰</span>
      {compact ? null : <span>VENDER{refund > 0 ? ` +${refund}` : ''}</span>}
    </button>
  )
}

/** Selo de OBRA-PRIMA (issue #65): overlay POR CIMA da imagem do item
 *  (arma/armadura/escudo), canto inferior DIREITO, DENTRO do quadrado, menor
 *  pra não cobrir o item. `url` já é o selo real da vault (figura
 *  "<X> Obra-prima <tier>.png" — que É um selo de cera). */
function SeloObraPrima({ url, size }: { url: string; size: number }) {
  return (
    <span
      aria-label="Obra-prima"
      style={{
        position: 'absolute',
        right: 4,
        bottom: 4,
        width: size,
        height: size,
        backgroundImage: `url("${url}")`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        pointerEvents: 'none',
      }}
    />
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
  const rules = useHeroRules(model.fm)
  // Base de LEITURA = FM DERIVADO (atributos cascateados ⇒ bônus de arma vindos
  // de regra aparecem); a ESCRITA (patchArma) regrava a lista SALVA. SEM camada
  // interativa aqui (leitura estática do derivado).
  const fm = rules?.derivedFm ?? model.fm
  const lista = (fmPath(model.fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[]
  const rows = useMemo(() => armaRowsFromFm(fm), [fm])
  const atributos = heroAtributos(fm).values

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

  // Dropdown de PROPRIEDADE da ARMA (issue #76) — só o que aplica a ARMA:
  // imbuições reais (Imbuições e Qualidade/Imbuições) + 'Arma Obra-prima' (a
  // qualidade da arma). As obra-primas de armadura/escudo/broquel/ferramenta
  // ficam de fora. Espelha o listImbuicoes do plugin (equipamentos-section.ts:
  // 214-226 sobre yaml-block-deps-factory.ts:686-692).
  const imbuicoes = useMemo(
    () => [
      ...catalog.content
        .filter((e: IndexDocEntry) => e.id.startsWith(IMBUICOES_ARMA_FOLDER))
        .map((e) => e.basename ?? e.id)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      ARMA_OBRA_PRIMA_BASE,
    ],
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
  // (equipamentos-section.ts:186-203): grava nome (wikilink basename,
  // setArmaNome/apply-armas-edit.ts:89-97) + atributo derivado do grupo e da
  // propriedade Precisa num ÚNICO write (batch do plugin).
  const setNome = (i: number, id: string) => {
    // Opção vazia ("Selecionar arma") — onChange(null) do linkedDropdown:
    // setArmaNome grava nome vazio (apply-armas-edit.ts:96) e o atributo do
    // batch vem de deriveArmaAtributo SEM info → FOR (apply-armas-edit.ts:48).
    if (!id) {
      patchArma(i, { Nome: '', Atributo: deriveArmaAtributo('', '', atributos) })
      return
    }
    const entry = catalog.entryById.get(id)
    if (!entry) return
    const nome = entry.basename ?? id
    void loadDoc(id)
      .catch(() => undefined)
      .then((armaDoc) =>
        patchArma(i, {
          Nome: `[[${nome}]]`,
          Atributo: deriveArmaAtributo(entry.grupo, docField(armaDoc, 'propriedades'), atributos),
        }),
      )
  }

  // Propriedade — espelha setArmaPropriedade (apply-armas-edit.ts:121-131):
  // wikilink basename; vazio limpa o campo. 'Arma Obra-prima' NÃO é imbuição,
  // é a qualidade sem imbuição: grava a MESMA string canônica do ramo
  // auto-Obra-prima do A/E/M (setArmaRank:157), pra que o dropdown e o clique
  // no tier convirjam (issue #76).
  const setProp = (i: number, base: string) =>
    patchArma(i, {
      Propriedade: !base ? '' : base === ARMA_OBRA_PRIMA_BASE ? ARMA_OBRA_PRIMA : `[[${base}]]`,
    })

  const removeArma = (i: number) =>
    model.set(
      'Inventario.Armas.Lista',
      lista.filter((_, j) => j !== i),
    )

  // #300: VENDER = remover a arma E creditar Ouro (refund já calculado no render
  // a partir do valor de mercado da imbuição × tier × taxa de revenda).
  const sellArma = (i: number, refund: number) => {
    if (refund > 0) {
      const ouro = num(fmPath(model.fm, 'Inventario', 'Ouro'))
      model.set('Inventario.Ouro', ouro + refund)
    }
    model.set(
      'Inventario.Armas.Lista',
      lista.filter((_, j) => j !== i),
    )
  }

  return (
    <div style={{ ...panelStyle(), display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <PanelLabel>ARMAS</PanelLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 3 }}>
          {rows.map((arma, i) => {
            const armaDoc = refs.refDoc(arma.nomeRaw)
            const propDoc = refs.refDoc(arma.propriedadeRaw)
            const ench = linkLabel(str(arma.propriedadeRaw))
            const enchIc = imbuicaoEmoji(docField(propDoc, 'propriedades'))
            // Imagem real da arma (issue #12): embed do doc → figura da carta
            // (hierarquia em weaponImageUrl); sem imagem → slot vazio do design.
            // #280: slot de inventário (pequeno) → thumb.
            const img = weaponImageUrl(armaDoc, assets, true)
            // Valor do dropdown de arma: id do doc no catálogo; arma fora do
            // catálogo mantém o rótulo atual como opção extra (nunca some).
            const armaTarget = wikiTarget(arma.nomeRaw)
            const armaRes = armaTarget ? catalog.resolve(armaTarget) : null
            const armaId = armaRes?.kind === 'doc' ? armaRes.id : armaTarget
            const armaNoCatalogo = armaGroups.some((g) => g.entries.some((e) => e.id === armaId))
            const propBase = (wikiTarget(arma.propriedadeRaw).split('/').pop() ?? '').trim()
            // Figura da PROPRIEDADE/imbuição (issue #65) e o selo de OBRA-PRIMA
            // (overlay POR CIMA da figura da arma quando a propriedade é a
            // Obra-prima automática): mesma resolução das cartas do pleitost-views.
            const propImg = propriedadeImageUrl(propBase, arma.tier, assets)
            const weaponSelo = obraPrimaSeloUrl(propBase, arma.tier, assets)
            // #300: valor de revenda = preço da imbuição/propriedade × mult do
            // tier × taxa de revenda (arma-base sem imbuição → 0).
            const armaRefund = resaleRefund(
              propDoc ? precoPO(propDoc) * TIER_PRICE_MULT[arma.tier || 'A'] : 0,
              sistemaConfig.getRevenda(),
            )
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
                <ItemHover doc={armaDoc} propDoc={propDoc} tier={arma.tier || 'A'}>
                  <span
                    style={{
                      position: 'relative',
                      width: 96,
                      height: 96,
                      flex: 'none',
                      background: 'var(--panel2)',
                      border: '1px solid var(--line2)',
                      clipPath: clip(9),
                      backgroundImage: img ? `url("${img}")` : undefined,
                      // figura INTEIRA reduzida no quadrado, sem esticar nem
                      // cortar (issue #27) — mesmo fit do render das cartas do
                      // pleitost-views (armas-render.ts:162-164: <img> com
                      // max-width/max-height preserva o aspecto e mostra tudo)
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                    }}
                  >
                    {/* Selo de obra-prima (issue #65): canto inferior DIREITO,
                        DENTRO do quadrado, menor pra não cobrir a arma. */}
                    {weaponSelo ? <SeloObraPrima url={weaponSelo} size={34} /> : null}
                  </span>
                </ItemHover>
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
                          {/* opção vazia SEMPRE presente, como o linkedDropdown
                              do Editável (linked-dropdown.ts:69-71, emptyLabel
                              "Selecionar arma" — equipamentos-section.ts:184;
                              golden carlos/editavel__tab-inventario.html tem a
                              opção mesmo com o Punhal selecionado). Selecionar
                              limpa a arma e volta o atributo pra FOR. */}
                          <option value="">Selecionar arma</option>
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
                        // stretch: o quadrado da imbuição vai do topo do A/E/M à
                        // base do dropdown de propriedade (pedido do usuário).
                        alignItems: 'stretch',
                        gap: 12,
                      }}
                    >
                      {/* Quadrado da figura da PROPRIEDADE/imbuição (issue #65):
                          LOGO ANTES da seleção de propriedade, empurrando pro
                          lado a qualidade (A/E/M) e a propriedade. Tamanho FIXO
                          (76px, um pouco menor que o quadrado 96 da arma) e
                          centrado: aspect-ratio + alignSelf stretch num flex-row
                          colapsa a largura a 0 e a imbuição sumia (issue #78). */}
                      {/* Hover na IMAGEM da propriedade → SÓ o card da propriedade
                          (conforme o tier selecionado), não a arma (#118). */}
                      <ItemHover doc={propDoc} tier={arma.tier || undefined} style={{ alignSelf: 'stretch', marginTop: 17 }}>
                        <span
                          style={{
                            flex: 'none',
                            width: 76,
                            alignSelf: 'stretch',
                            background: 'var(--panel2)',
                            border: '1px solid var(--line2)',
                            clipPath: clip(7),
                            backgroundImage: propImg ? `url("${propImg}")` : undefined,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                          }}
                        />
                      </ItemHover>
                      <span
                        style={{
                          flex: 1,
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
                        <SellBtn refund={armaRefund} onClick={() => sellArma(i, armaRefund)} />
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
  img,
  selo,
  onBase,
  onTier,
  doc,
  propDoc,
}: {
  titulo: string
  badge: string
  bases: string[]
  gear: Record<string, unknown>
  img?: string | null
  selo?: string | null
  onBase: (base: string) => void
  onTier: (tier: '' | 'A' | 'E' | 'M') => void
  doc?: VaultDoc
  propDoc?: VaultDoc
}) {
  const base = linkLabel(str(gear['Nome'])) || bases[0]!
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
        <ItemHover doc={doc} propDoc={propDoc} tier={tierLetter(gear['Categoria']) || undefined}>
          <span
            style={{
              position: 'relative',
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
              ...(img
                ? {
                    backgroundImage: `url("${img}")`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                  }
                : {}),
            }}
          >
            {/* Figura real do item (issue #65: escudo → Figura/Armas); sem figura
                → emoji placeholder (armadura não tem mapeamento base→imagem). */}
            {img ? null : badge}
            {selo ? <SeloObraPrima url={selo} size={24} /> : null}
          </span>
        </ItemHover>
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
  img: string | null
  doc?: VaultDoc
}

function EquipamentosPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const model = useHeroModel(doc, 'inventario')
  const caps = fichaFamiliaOf(doc)
  const fm = model.fm
  const armadura = (fmPath(fm, 'Inventario', 'Armadura') ?? {}) as Record<string, unknown>
  const escudo = (fmPath(fm, 'Inventario', 'Escudo') ?? {}) as Record<string, unknown>
  // Docs de armadura/escudo + suas propriedades pro card no hover (#119). As
  // refs do herói só têm o SALVO; aqui resolvo pelo FM DERIVADO (pega a peça
  // recém-escolhida no overlay também).
  const gearIds = useMemo(() => {
    const s = new Set<string>()
    for (const g of [armadura, escudo]) {
      for (const k of ['Nome', 'Propriedade']) {
        const r = catalog.resolve(wikiTarget(g[k]))
        if (r.kind === 'doc') s.add(r.id)
      }
    }
    return [...s]
  }, [armadura, escudo, catalog])
  const gearDocs = useDocs(gearIds)
  const gearDoc = (v: unknown): VaultDoc | undefined => {
    const r = catalog.resolve(wikiTarget(v))
    return r.kind === 'doc' ? gearDocs?.get(r.id) : undefined
  }
  // Selo de obra-prima (issue #65) a partir da Propriedade (Obra-prima
  // automática) + qualidade do item; imbuição real ou item comum → sem selo.
  const gearSelo = (gear: Record<string, unknown>) =>
    obraPrimaSeloUrl(
      (wikiTarget(gear['Propriedade']).split('/').pop() ?? '').trim(),
      tierLetter(gear['Categoria']) ?? '',
      assets,
    )
  // Bases dos dropdowns = docs REAIS das pastas Armaduras/Escudos (issue #63),
  // como as armas listam de Armas/ — nunca strings hardcodadas.
  const armaduraOpts = useMemo(() => armaduraBases(catalog), [catalog])
  const escudoOpts = useMemo(() => escudoBases(catalog), [catalog])

  // Base escolhida vira o Nome do container: wikilink quando o doc existe na
  // vault (formato do FM salvo), senão o rótulo plano do design.
  const nomeFm = (base: string) => {
    const res = catalog.resolve(base)
    return res.kind === 'doc' ? `[[${base}]]` : base
  }
  const writeGear = (path: string, gear: Record<string, unknown>, patch: Record<string, unknown>) =>
    model.set(path, { ...gear, ...patch })
  // Materializa a DUREZA BASE do escudo a partir do doc real (dureza::) ao
  // trocar a base. No plugin, `Definir Inventario.Escudo.Dureza N` (rule
  // editável do doc do escudo) é aplicada pelo BFS ao SALVAR — o setter NÃO
  // toca dureza (apply-equipamentos-edit.ts:94-98). O app não roda esse BFS
  // sobre o FM salvo (modelForMode é projeção pura, sem extract), então o
  // COMBATE lê `Inventario.Escudo.Dureza` direto do FM; para o escudo recém-
  // escolhido carregar o valor real (Broquel 2 / Escudo 4) materializamos a
  // dureza base aqui. O bônus de Dureza por Obra-prima (tier) vem das regras e
  // NÃO é recomputado no setter — heróis da vault já trazem esse valor no FM.
  const writeEscudoBase = (path: string, gear: Record<string, unknown>, base: string) => {
    if (/^Sem\b/.test(base)) {
      writeGear(path, gear, { Nome: '', Categoria: '', Propriedade: '', Dureza: 0 })
      return
    }
    const res = catalog.resolve(base)
    const nome = res.kind === 'doc' ? `[[${base}]]` : base
    if (res.kind !== 'doc') {
      writeGear(path, gear, { Nome: nome, Categoria: '', Propriedade: '' })
      return
    }
    void loadDoc(res.id)
      .catch(() => undefined)
      .then((escDoc) =>
        writeGear(path, gear, {
          Nome: nome,
          Categoria: '',
          Propriedade: '',
          Dureza: num(docField(escDoc, 'dureza')),
        }),
      )
  }
  // Espelha os setters do Editável (apply-equipamentos-edit.ts):
  //  - trocar a base limpa categoria+propriedade (setArmaduraNome:50-55 /
  //    setEscudoNome:87-110; escudo "Sem" grava nome vazio como o plugin);
  //  - A/E/M desselecionado zera categoria+propriedade (:73-77/:114-121);
  //  - A/E/M sem peça ("Sem …"/nome vazio) é no-op (:78/:122);
  //  - A/E/M seleciona categoria + Obra-prima automática (armadura :79-81;
  //    escudo :123-125 via resolveObraPrimaTarget).
  const gearHandlers = (path: string, gear: Record<string, unknown>, kind: 'armadura' | 'escudo') => ({
    onBase: (base: string) =>
      kind === 'escudo'
        ? writeEscudoBase(path, gear, base)
        : writeGear(path, gear, { Nome: nomeFm(base), Categoria: '', Propriedade: '' }),
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
        const grupo = parts.length > 1 ? parts[parts.length - 2]! : ''
        return {
          nome,
          tier: tier ?? '',
          bonus: tier ? bonusPorTier(tDoc, tier) : 0,
          grupo: grupo.toUpperCase(),
          index,
          // Figura do tesouro (issue #65): Figura/Equipamentos/<Nome>[ <Tier>].png.
          img: tesouroImageUrl(nome, tier ?? '', assets),
          doc: tDoc ?? undefined,
        }
      }),
    [tesourosRaw, refs, assets],
  )
  const removeTesouro = (index: number) =>
    model.set(
      'Inventario.Tesouros',
      tesourosRaw.filter((_, j) => j !== index),
    )
  // #300: valor de revenda de um tesouro = preço × mult do tier × taxa (mesma
  // base do `custo` usado na ordenação).
  const tesouroRefund = (r: TesouroRow) =>
    resaleRefund(precoPO(r.doc) * TIER_PRICE_MULT[r.tier || 'A'], sistemaConfig.getRevenda())
  const sellTesouro = (index: number, refund: number) => {
    if (refund > 0) {
      const ouro = num(fmPath(model.fm, 'Inventario', 'Ouro'))
      model.set('Inventario.Ouro', ouro + refund)
    }
    model.set(
      'Inventario.Tesouros',
      tesourosRaw.filter((_, j) => j !== index),
    )
  }
  // Toggle Alterar/Concluir do painel de TESOUROS (feedback): fora do Alterar a
  // tela fica enxuta (só qualidade, sem Item Bônus/tiers/ações — melhor no celular).
  const [tesEdit, setTesEdit] = useState(false)
  // Peça de EQUIPAMENTO não equipada guardada nos Tesouros (armadura/escudo):
  // detecta pelo doc-alvo; ganha botão "Equipar" que a move pro slot.
  const gearSlotOf = (r: TesouroRow): 'Armadura' | 'Escudo' | null => {
    const c = r.doc ? itemCategoria(r.doc) : 'outro'
    return c === 'armadura' ? 'Armadura' : c === 'escudo' ? 'Escudo' : null
  }
  const equiparTesouro = (r: TesouroRow) => {
    const slot = gearSlotOf(r)
    if (!slot) return
    const dureza = slot === 'Escudo' ? num(docField(r.doc, 'dureza')) : 0
    const novo = buildEquippedGear(slot, r.nome, r.tier || 'A', dureza)
    // Tira a peça equipada da lista; devolve a que estava equipada (se houver)
    // pros Tesouros (swap — não perde a peça anterior).
    let next = tesourosRaw.filter((_, j) => j !== r.index)
    const atual = slot === 'Armadura' ? armadura : escudo
    const atualNome = linkLabel(str(atual['Nome']))
    if (atualNome && !/^Sem\b/.test(atualNome)) {
      next = [...next, buildTesouroAlias(atualNome, tierLetter(atual['Categoria']) || 'A')]
    }
    model.set('Inventario.Tesouros', next)
    model.set(`Inventario.${slot}`, novo)
  }
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
    // Ordena cada grupo por CUSTO efetivo (base × mult do tier), mais caros no
    // topo (#121).
    const custo = (r: TesouroRow) => precoPO(r.doc) * TIER_PRICE_MULT[r.tier || 'A']
    return [...byGroup.entries()].map(([title, groupRows]) => ({
      title,
      dois: groupRows.some((r) => r.bonus > 0) ? 1 : 0,
      rows: [...groupRows].sort((a, b) => custo(b) - custo(a)),
    }))
  }, [rows])

  return (
    <>
      {/* Armadura/escudo por família (#201): o CA não equipa nenhum — usa
          Armadura Natural (plugin defesa.ts:58-64; tab-completa do CA só tem
          Tesouros). Gate central FICHA_FAMILIA. */}
      {caps.equipamentos ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 16 }}>
          <GearCard
            titulo="ARMADURA"
            badge={tokens.emojis.equipProf.Armadura}
            bases={armaduraOpts}
            gear={armadura}
            // Armadura sem mapeamento base→imagem confiável → placeholder (emoji);
            // selo de obra-prima ainda aparece quando ranqueada.
            img={null}
            selo={gearSelo(armadura)}
            doc={gearDoc(armadura['Nome'])}
            propDoc={gearDoc(armadura['Propriedade'])}
            {...gearHandlers('Inventario.Armadura', armadura, 'armadura')}
          />
          <GearCard
            titulo="ESCUDO"
            badge={tokens.emojis.equipProf.Escudo}
            bases={escudoOpts}
            gear={escudo}
            img={escudoImageUrlByName(String(escudo['Nome'] ?? ''), assets)}
            selo={gearSelo(escudo)}
            doc={gearDoc(escudo['Nome'])}
            propDoc={gearDoc(escudo['Propriedade'])}
            {...gearHandlers('Inventario.Escudo', escudo, 'escudo')}
          />
        </div>
      ) : null}

      <div style={panelStyle()}>
        {/* Cabeçalho com toggle Alterar/Concluir (feedback) — como as outras
            seções. Fora do Alterar a tela fica enxuta (sem Item Bônus/tiers). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <PanelLabel>TESOUROS</PanelLabel>
          <span style={{ flex: 1 }} />
          <EditToggle edit={tesEdit} onToggle={() => setTesEdit((v) => !v)} />
        </div>
        {(() => {
          // Colunas por modo: Alterar = nome/qualidade/bônus/ações; leitura =
          // nome/equipar (qualidade vira sufixo (A)/(E)/(M) no nome — menos
          // coluna, mais fácil no celular).
          const cols = tesEdit ? '1.5fr 1fr 1fr 72px' : '1fr auto'
          return groups.map((g) => (
            <div key={g.title} style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: cols,
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 2px 6px',
                }}
              >
                <span
                  style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: '#7d8593' }}
                >
                  {g.title}
                </span>
                {tesEdit ? (
                  <>
                    <span style={{ textAlign: 'center', ...mono9, letterSpacing: '.04em' }}>QUALIDADE</span>
                    <span style={{ textAlign: 'center', ...mono9, letterSpacing: '.04em', opacity: g.dois }}>
                      ITEM BÔNUS
                    </span>
                  </>
                ) : null}
                <span />
              </div>
              {g.rows.map((r) => {
                // Borda esquerda colorida pela QUALIDADE (tipo como é na loja).
                const tierBd = r.tier ? ITEM_TIER_BTN[r.tier].bd : 'var(--line2)'
                const slot = gearSlotOf(r)
                return (
                  <div
                    key={r.nome + r.tier}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: cols,
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 9px',
                      marginBottom: 5,
                      background: 'var(--card)',
                      border: '1px solid var(--line2)',
                      borderLeft: `3px solid ${tierBd}`,
                      clipPath: clip(8),
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <ItemHover doc={r.doc} tier={r.tier || undefined}>
                        {r.img ? (
                          <span
                            style={{
                              flex: 'none',
                              width: 30,
                              height: 30,
                              background: 'var(--panel2)',
                              border: '1px solid var(--line2)',
                              clipPath: clip(6),
                              backgroundImage: `url("${r.img}")`,
                              backgroundSize: 'contain',
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'center',
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 14, flex: 'none' }}>{tokens.emojis.bonusType.Item}</span>
                        )}
                      </ItemHover>
                      <ItemHover doc={r.doc} tier={r.tier || undefined}>
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
                      </ItemHover>
                      {/* Fora do Alterar, a qualidade vira sufixo (A)/(E)/(M) no
                          nome (tier-colorido, casa com a borda) — sem coluna. */}
                      {!tesEdit && r.tier ? (
                        <span
                          style={{
                            flex: 'none',
                            fontFamily: 'var(--mono)',
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: tierBd,
                          }}
                        >
                          ({r.tier})
                        </span>
                      ) : null}
                    </span>
                    {tesEdit ? (
                      <>
                        <span style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                          <TierBtns sel={r.tier} size={22} onSelect={(next) => setTierTesouro(r.index, next)} />
                        </span>
                        <span style={{ display: 'flex', gap: 5, justifyContent: 'center', opacity: g.dois }}>
                          <GoldDots on={r.bonus} />
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <SellBtn compact refund={tesouroRefund(r)} onClick={() => sellTesouro(r.index, tesouroRefund(r))} />
                          <span
                            onClick={() => removeTesouro(r.index)}
                            title="Descartar (sem devolver ouro)"
                            style={{ color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }}
                          >
                            🗑️
                          </span>
                        </span>
                      </>
                    ) : (
                      // Fora do Alterar: qualidade já está no nome (sufixo) e na
                      // borda; aqui só o botão Equipar (quando é peça equipável).
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {slot ? (
                          <button
                            onClick={() => equiparTesouro(r)}
                            title={`Equipar (${slot})`}
                            style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 10,
                              letterSpacing: '.06em',
                              color: 'var(--accent)',
                              background: 'transparent',
                              border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                              padding: '5px 10px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              clipPath: clip(6),
                            }}
                          >
                            EQUIPAR
                          </button>
                        ) : null}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        })()}
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

function ConsumiveisPanel({ doc, refs }: { doc: VaultDoc; refs: HeroRefs }) {
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
        <ConsumivelHover doc={refs.refDoc(nome)} tier={tier}>
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
        </ConsumivelHover>
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
            <ConsumivelHover doc={refs.refDoc(c.nome)}>
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
            </ConsumivelHover>
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
    // #63: ancoramento responsivo em .inv-fab (recuar pra esquerda do painel
    // direito fixo, como o create-fab do herói) — o `right` mora no CSS; aqui
    // fica o resto (fixed/bottom/z40/coluna). fixed porque quem rola é o
    // .app-main; as bordas visíveis da section coincidem com o viewport.
    <div
      className="inv-fab"
      style={{
        position: 'fixed',
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
  // Delta por FAMÍLIA (#201): CA sem CONSUMÍVEIS nem Moedas (plugin
  // tab-inventario.ts:126-128, só Heroi) e com tesouros restritos aos 3
  // permitidos (tabs/ca/tab-completa.ts:33-43).
  const caps = fichaFamiliaOf(doc)
  const invTabs = INV_TABS.filter((t) => t.id !== 'consumiveis' || caps.consumiveis)
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
              docField(armaDoc, 'propriedades'),
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
      // #298: ordena por GRUPO_ARMA_ORDER (naturais/especiais no fim) + alfabético,
      // igual ao dropdown agrupado — antes vinha na ordem crua do índice.
      orderArmasByGrupo(
        catalog.content.filter(
          (e: IndexDocEntry) => e.id.startsWith(ARMAS_FOLDER) && e.subtype === 'Arma',
        ),
      ).map((e) => ({
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
            !TESOUROS_EXCLUIR.some((prefix) => e.id.startsWith(prefix)) &&
            // CA só equipa os 3 tesouros permitidos — filtro VERBATIM de
            // filterCaTesouros do plugin (tabs/ca/tab-completa.ts:39-41).
            (!caps.tesourosPermitidos || caps.tesourosPermitidos.has(e.basename ?? e.id)),
        )
        .map((e) => ({ ic: tokens.emojis.bonusType.Item, nm: e.basename ?? e.id, key: e.id })),
    [catalog, caps],
  )

  const index = Math.max(
    0,
    invTabs.findIndex((t) => t.id === tab),
  )

  return (
    <TipProvider>
      <style>{ITEM_CARD_CSS}</style>
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
        tabs={invTabs}
        active={tab}
        onSelect={setTab}
        pad="12px 20px"
        // Moedas por família (#201): CA não tem (tab-inventario.ts:126-128).
        right={caps.moedas ? <CoinsButton coins={coins} onChange={setCoins} /> : null}
      />
      <PanelTrack index={index}>
          {/* pad 0: contentPad dos painéis do design já vem do .app-main */}
          <TrackPanel pad="0" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <ArmasPanel doc={doc} refs={refs} />
          </TrackPanel>
          <TrackPanel pad="0" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <EquipamentosPanel doc={doc} refs={refs} />
          </TrackPanel>
          {caps.consumiveis ? (
            <TrackPanel pad="0">
              <ConsumiveisPanel doc={doc} refs={refs} />
            </TrackPanel>
          ) : null}
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
    </TipProvider>
  )
}
