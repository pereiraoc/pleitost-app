// CARD reutilizável de item de database (issue #95, base do épico #100). Extraído
// do comércio (LocationSheet) SEM mudança de comportamento: a miniatura numa
// moldura metálica por tier + a CARTA que aparece no hover (figura + nome + stats
// do inline + descrição do inline OU da prosa do body), e a composição de duas
// cartas lado a lado (arma + propriedade). Reusa o tooltip do app (TipHover) e as
// resoluções de imagem existentes. Fonte de verdade sempre no doc — nada inventado.
import { useAssetIndex } from '../data/assets'
import { weaponImageUrl } from '../data/creature-image'
import {
  tesouroImageUrl,
  propriedadeImageUrl,
  consumivelImageUrl,
  escudoImageUrlByName,
} from '../data/equipment-image'
import { tokens } from './ficha/registry'
import { TIER_COLUNA, type Tier, type EntryMeta } from '../data/commerce'
import type { VaultDoc } from '../data/types'
import { TipHover } from './ficha/tooltips'
import type { ReactNode } from 'react'

/** Estilo "metal" por tier: gradiente da moldura (borda), brilho (glow) e tint
 *  do fundo. Adepto = aço escuro; Experiente = prata; Mestre = ouro. Usado na
 *  miniatura e na carta do tooltip. */
export const TIER_STYLE: Record<Tier, { grad: string; glow: string; tint: string }> = {
  A: {
    grad: 'linear-gradient(135deg,#8b929c,#2b2f36 48%,#9aa1ab)',
    glow: '0 2px 6px rgba(0,0,0,.5)',
    tint: 'color-mix(in srgb,#8b929c 12%,var(--card))',
  },
  E: {
    grad: 'linear-gradient(135deg,#f2f6fa,#98a2ad 48%,#fbfdff)',
    glow: '0 0 9px rgba(203,213,225,.45)',
    tint: 'color-mix(in srgb,#cbd5e1 14%,var(--card))',
  },
  M: {
    grad: 'linear-gradient(135deg,#ffe6a3,#b8860b 48%,#ffedb8)',
    glow: '0 0 11px rgba(224,183,60,.55)',
    tint: 'color-mix(in srgb,#e0b73c 16%,var(--card))',
  },
}

/** Miniatura do item numa MOLDURA metálica do tier (gradiente na borda + glow +
 *  fundo tingido) + selo de imbuição/obra-prima no canto. */
export function ItemFigura({ img, seloImg, tier }: { img: string | null; seloImg: string | null; tier: Tier }) {
  const t = TIER_STYLE[tier]
  return (
    <span
      style={{
        position: 'relative',
        flex: 'none',
        width: 44,
        height: 44,
        borderRadius: 9,
        padding: 2,
        background: t.grad,
        boxShadow: t.glow,
      }}
    >
      <span
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          borderRadius: 7,
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          backgroundColor: t.tint,
          backgroundImage: img ? `url("${img}")` : undefined,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      >
        {img ? null : tokens.emojis.subcategoria.Tesouro}
      </span>
      {seloImg ? (
        <span
          aria-label="Propriedade"
          style={{
            position: 'absolute',
            right: -7,
            bottom: -7,
            width: 24,
            height: 24,
            backgroundImage: `url("${seloImg}")`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </span>
  )
}

/** Alvo de figura/carta: um doc (`key`) com metadados de combo (arma/propriedade)
 *  + tier + rótulo. `EntryMeta` traz armaTarget/imbTarget/propriedadeBase/thumbBasename. */
export type FiguraTarget = EntryMeta & { key: string; label: string; tier: Tier; nome?: string }

/** URL da miniatura: combo usa a imagem da ARMA; poção → Consumíveis (por tier);
 *  tesouro → Equipamentos/Implementos; escudo/armadura obra-prima → Armas pelo
 *  basename base. */
function figuraUrl(
  e: FiguraTarget,
  docsById: Map<string, VaultDoc>,
  assets: ReturnType<typeof useAssetIndex>,
): string | null {
  const nome = e.nome ?? e.label
  if (e.armaTarget) {
    const w = weaponImageUrl(docsById.get(e.armaTarget), assets)
    if (w) return w
  }
  return (
    consumivelImageUrl(nome, e.tier, assets) ??
    tesouroImageUrl(nome, e.tier, assets) ??
    (e.thumbBasename ? escudoImageUrlByName(e.thumbBasename, assets) : null)
  )
}

/** Escapa texto pra interpolar com segurança no HTML do tooltip. */
export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "[[A/B|C]]"→"C", "[[A]]"→"A"; tira aspas de string-literal dataview. */
const stripWiki = (s: string): string =>
  s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) =>
      (b ?? a).split('/').pop() ?? a,
    )
    .replace(/^"|"$/g, '')
    .trim()

/** Tipo do card, derivado do CAMINHO do doc (fonte de verdade da vault). */
export type CardKind =
  | 'arma'
  | 'armadura'
  | 'escudo'
  | 'tesouro'
  | 'habilidade'
  | 'tecnica'
  | 'magia'
  | 'acao'
  | 'propriedade'
  | 'pericia'
  | 'generic'

export function docKind(doc: VaultDoc): CardKind {
  const id = doc.id
  if (id.includes('/Equipamento/Armas/')) return 'arma'
  if (id.includes('/Equipamento/Armaduras/')) return 'armadura'
  if (id.includes('/Equipamento/Escudos/')) return 'escudo'
  if (id.includes('/Equipamento/Tesouros/')) return 'tesouro'
  if (id.includes('/Criação de Personagem/Habilidades/')) return 'habilidade'
  if (id.includes('/Criação de Personagem/Técnicas/')) return 'tecnica'
  if (id.includes('/Criação de Personagem/Magia/')) return 'magia'
  if (id.includes('/Regras/Ações/')) return 'acao'
  if (id.includes('/Regras/Propriedades/')) return 'propriedade'
  if (id.includes('/Regras/Perícias e Especializações/')) return 'pericia'
  return 'generic'
}

/** Campos (inline field → rótulo) que cada tipo mostra no card, na ordem. Os
 *  rótulos/origem vêm dos próprios dados — nada inventado. Só campos que EXISTEM
 *  renderizam. Tesouro ganha ainda Usos/Bônus do tier (tratados à parte na
 *  itemCardHtml). A descrição vem do inline (por tier) ou da prosa do body. */
const CARD_SCHEMA: Record<CardKind, [string, string][]> = {
  arma: [
    ['dano', 'Dano'],
    ['tipo', 'Tipo'],
    ['mãos', 'Mãos'],
    ['alcance', 'Alcance'],
    ['propriedades', 'Propriedades'],
    ['preço', 'Preço'],
  ],
  armadura: [
    ['bonus-defesa', 'Defesa'],
    ['força-necessaria', 'Força'],
    ['propriedades', 'Propriedades'],
    ['preço', 'Preço'],
  ],
  escudo: [
    ['bonus-defesa', 'Defesa'],
    ['dureza', 'Dureza'],
    ['danos', 'Dano'],
    ['propriedades', 'Propriedades'],
    ['preço', 'Preço'],
  ],
  tesouro: [
    ['propriedades', 'Propriedades'],
    ['preço', 'Preço'],
  ],
  habilidade: [
    ['classe', 'Classe'],
    ['rank', 'Rank'],
  ],
  tecnica: [
    ['classe', 'Classe'],
    ['rank', 'Rank'],
    ['custo', 'Custo'],
  ],
  magia: [
    ['classe', 'Classe'],
    ['habilidade', 'Habilidade'],
  ],
  acao: [
    ['perícia', 'Perícia'],
    ['propriedades', 'Propriedades'],
  ],
  propriedade: [],
  pericia: [],
  generic: [],
}
const TIER_ADJ: Record<Tier, string> = { A: 'adepto', E: 'experiente', M: 'mestre' }

/** Figura de um DOC pelo seu tipo (arma/escudo → Armas; imbuição/obra-prima →
 *  Imbuições; poção → Consumíveis; demais tesouros → Equipamentos/Implementos).
 *  Habilidade/magia/etc não têm figura → null. */
export function docImageUrl(
  doc: VaultDoc,
  tier: Tier,
  assets: ReturnType<typeof useAssetIndex>,
): string | null {
  const id = doc.id
  if (id.includes('/Equipamento/Armas/') || id.includes('/Equipamento/Escudos/')) {
    return weaponImageUrl(doc, assets)
  }
  if (id.includes('/Imbuições e Qualidade/')) return propriedadeImageUrl(doc.basename, tier, assets)
  if (id.includes('/Consumíveis/')) return consumivelImageUrl(doc.basename, tier, assets)
  if (id.includes('/Equipamento/Tesouros/')) return tesouroImageUrl(doc.basename, tier, assets)
  return null
}

/** Descrição em PROSA do body — armas guardam a descrição como texto do body
 *  (não em inline field como as imbuições/tesouros). Tira meta %%, fences,
 *  tabela, headings, hr e dataview inline; resolve wikilinks. Vazio se não tiver
 *  prosa (ex.: Azagaia). */
export function bodyDesc(doc: VaultDoc): string {
  let b = doc.body ?? ''
  b = b.replace(/%%[\s\S]*?%%/g, '') // bloco meta
  b = b.replace(/```[\s\S]*?```/g, '') // fences (dataview/rules/carta-item)
  b = b.replace(/^\s*\|.*$/gm, '') // linhas de tabela
  b = b.replace(/^\s*#{1,6}\s.*$/gm, '') // headings
  b = b.replace(/`=[^`]*`/g, '') // dataview inline `= this.x`
  b = b.replace(/^\s*-{2,}\s*$/gm, '') // hr
  const txt = stripWiki(b).replace(/\s+/g, ' ').trim()
  return txt.length > 240 ? txt.slice(0, 238).trimEnd() + '…' : txt
}

/** HTML da CARTA de um doc (figura + nome + stats do inline + descrição do tier).
 *  `showTier`: mostra "(Qualidade)" no nome — só a PROPRIEDADE (imbuição/obra-prima
 *  /material) ou o item avulso têm qualidade; a ARMA base não (a qualidade vem da
 *  propriedade). O FUNDO do tier fica em ambos (classe tier-*). */
export function itemCardHtml(doc: VaultDoc, tier: Tier, imgUrl: string | null, showTier: boolean): string {
  const f = (doc.inlineFields ?? {}) as Record<string, unknown>
  const val = (k: string) => (typeof f[k] === 'string' ? stripWiki(f[k] as string) : '')
  const row = (label: string, v: string) => (v ? `<div class="shc-row"><b>${label}</b>${esc(v)}</div>` : '')
  const kind = docKind(doc)
  const parts: string[] = CARD_SCHEMA[kind].map(([k, label]) => row(label, val(k)))
  // Tesouro (imbuição/obra-prima/equipamento/implemento/poção): Usos + Bônus do tier.
  if (kind === 'tesouro') {
    parts.push(row('Usos', val(`usos_${TIER_ADJ[tier]}`)))
    const bonus = val(`bonus_${TIER_ADJ[tier]}`)
    const btipo = val('bonus_tipo')
    parts.push(row('Bônus', bonus ? (btipo ? `${bonus} ${btipo}` : bonus) : ''))
  }
  const rows = parts.join('')
  const desc = val(`descrição_${TIER_ADJ[tier]}`) || val('descrição') || val('resumo') || bodyDesc(doc)
  const tierSpan = showTier ? `<span class="shc-tier">(${TIER_COLUNA[tier]})</span>` : ''
  return `<div class="shc-card tier-${tier}">${imgUrl ? `<img class="shc-img" src="${esc(imgUrl)}" alt=""/>` : ''}<div class="shc-name">${esc(doc.basename)}${tierSpan}</div>${rows}${desc ? `<div class="shc-desc">${esc(desc)}</div>` : ''}</div>`
}

/** HTML do hover de uma entrada: combo = carta da ARMA + carta da PROPRIEDADE lado
 *  a lado; tesouro/poção = 1 carta do próprio doc. Vazio se não houver doc. */
export function composedCardHtml(
  e: FiguraTarget,
  docsById: Map<string, VaultDoc>,
  assets: ReturnType<typeof useAssetIndex>,
): string {
  const cards: string[] = []
  const w = e.armaTarget ? docsById.get(e.armaTarget) : undefined
  // Arma base: SEM "(Qualidade)" no nome (a qualidade vem da propriedade).
  if (w) cards.push(itemCardHtml(w, e.tier, docImageUrl(w, e.tier, assets), false))
  const imb = e.imbTarget ? docsById.get(e.imbTarget) : undefined
  // Propriedade (imbuição/obra-prima/material): COM a qualidade no nome.
  if (imb) cards.push(itemCardHtml(imb, e.tier, docImageUrl(imb, e.tier, assets), true))
  if (cards.length === 0) {
    const d = docsById.get(e.key)
    // Item avulso (tesouro/poção): a qualidade é dele mesmo.
    if (d) cards.push(itemCardHtml(d, e.tier, docImageUrl(d, e.tier, assets), true))
  }
  return cards.length ? `<div class="shc-wrap">${cards.join('')}</div>` : ''
}

/** Miniatura + selo + carta-no-hover de uma entrada. */
export function useItemFigura(e: FiguraTarget, docsById: Map<string, VaultDoc>) {
  const assets = useAssetIndex()
  return {
    img: figuraUrl(e, docsById, assets),
    seloImg: e.propriedadeBase ? propriedadeImageUrl(e.propriedadeBase, e.tier, assets) : null,
    cardHtml: composedCardHtml(e, docsById, assets),
  }
}

/** Estilos da carta que aparece no hover da miniatura (dentro do tooltip). */
export const ITEM_CARD_CSS = `
.shc-wrap{display:flex;gap:8px;align-items:stretch}
.shc-card{width:174px;flex:none;display:flex;flex-direction:column;gap:2px;border:3px solid var(--line2);border-radius:11px;padding:7px}
.shc-card.tier-A{border-color:#6b727c;box-shadow:0 0 0 1px #3a3f47,0 2px 12px rgba(0,0,0,.45);background:linear-gradient(160deg,color-mix(in srgb,#8b929c 12%,var(--card)),var(--card))}
.shc-card.tier-E{border-color:#dbe3ec;box-shadow:0 0 0 1px #aeb8c4,0 0 14px rgba(203,213,225,.34);background:linear-gradient(160deg,color-mix(in srgb,#cbd5e1 12%,var(--card)),var(--card))}
.shc-card.tier-M{border-color:#e8c14a;box-shadow:0 0 0 1px #b8860b,0 0 16px rgba(224,183,60,.4);background:linear-gradient(160deg,color-mix(in srgb,#e0b73c 14%,var(--card)),var(--card))}
.shc-img{width:100%;max-height:140px;object-fit:contain;border-radius:6px;background:var(--panel);margin-bottom:3px}
.shc-name{font-weight:800;font-size:12.5px}
.shc-tier{display:block;margin-top:1px;opacity:.7;font-weight:600;font-size:11px}
.shc-row{font-size:11.5px;overflow-wrap:anywhere}
.shc-row b{color:var(--muted);font-weight:700;margin-right:4px}
.shc-desc{font-size:11px;opacity:.85;line-height:1.35;margin-top:3px}
`

/** Envolve `children` mostrando a CARTA do item no hover (desktop) / tap (mobile),
 *  reusando o tooltip do app (TipHover). Precisa de um `<TipProvider>` ancestral
 *  e do `ITEM_CARD_CSS` na tela. `propDoc` = 2ª carta (imbuição/obra-prima da
 *  arma). Sem doc → renderiza os filhos sem hover. */
export function ItemHover({
  doc,
  propDoc,
  tier = 'A',
  children,
}: {
  doc?: VaultDoc
  propDoc?: VaultDoc
  tier?: Tier
  children: ReactNode
}) {
  const assets = useAssetIndex()
  if (!doc) return <>{children}</>
  const cards: string[] = []
  if (propDoc) {
    // combo: item base (SEM qualidade no nome) + propriedade (COM qualidade).
    cards.push(itemCardHtml(doc, tier, docImageUrl(doc, tier, assets), false))
    cards.push(itemCardHtml(propDoc, tier, docImageUrl(propDoc, tier, assets), true))
  } else {
    // avulso: "(Qualidade)" só na família tesouro (a que é comprada por tier).
    cards.push(itemCardHtml(doc, tier, docImageUrl(doc, tier, assets), docKind(doc) === 'tesouro'))
  }
  return <TipHover html={`<div class="shc-wrap">${cards.join('')}</div>`}>{children}</TipHover>
}
