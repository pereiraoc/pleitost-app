// CARD reutilizável de item de database (issue #95, base do épico #100). Extraído
// do comércio (LocationSheet) SEM mudança de comportamento: a miniatura numa
// moldura metálica por tier + a CARTA que aparece no hover (figura + nome + stats
// do inline + descrição do inline OU da prosa do body), e a composição de duas
// cartas lado a lado (arma + propriedade). Reusa o tooltip do app (TipHover) e as
// resoluções de imagem existentes. Fonte de verdade sempre no doc — nada inventado.
import { useAssetIndex, resolveAsset, assetUrlFor } from '../data/assets'
import { weaponImageUrl } from '../data/creature-image'
import {
  tesouroImageUrl,
  propriedadeImageUrl,
  consumivelImageUrl,
  escudoImageUrlByName,
} from '../data/equipment-image'
import { tokens } from './ficha/registry'
import { TIER_COLUNA, TIER_PRICE_MULT, type Tier, type EntryMeta } from '../data/commerce'
import { precoPO } from '../grupo/wealth'
import type { VaultDoc } from '../data/types'
import { TipHover } from './ficha/tooltips'
import { useDetail } from '../data/detail-context'
import { useSettings } from '../settings'
import type { CSSProperties, ReactNode } from 'react'

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
    // #280: miniatura de item (44px) → thumb.
    const w = weaponImageUrl(docsById.get(e.armaTarget), assets, true)
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
  // Escudo (#267 6.6): as infos que o plugin mostra na carta (escudos-render.ts do
  // pleitost-views) — Dureza, Dano(s), Defesa (bônus), + o texto "Especial" (ex.:
  // "Pode usar para Escudada.") e as Propriedades. bonus-defesa/dureza/danos são
  // NÚMEROS no FM (val agora os coerce).
  escudo: [
    ['bonus-defesa', 'Defesa'],
    ['dureza', 'Dureza'],
    ['danos', 'Dano'],
    ['especial', 'Especial'],
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
    ['subcategoria', 'Tipo'],
    ['elemento', 'Elemento'],
    ['rank', 'Rank'],
    ['custo', 'Custo'],
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
    // #280: figura da carta de item (≤174px) → thumb, como as demais figuras.
    return weaponImageUrl(doc, assets, true)
  }
  if (id.includes('/Imbuições e Qualidade/')) return propriedadeImageUrl(doc.basename, tier, assets)
  if (id.includes('/Consumíveis/'))
    // Mesma resolução do comércio (figuraUrl): Consumíveis primeiro, com fallback
    // pra Tesouros/Cartas — assim a Poção da Velocidade aparece no tooltip como
    // já aparecia na loja (#123).
    return consumivelImageUrl(doc.basename, tier, assets) ?? tesouroImageUrl(doc.basename, tier, assets)
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

/** HABILIDADES do CORPO da nota (#268): as linhas em negrito rotuladas
 *  ("**Carga Preparatória - L:** …", "**Drenar - L:** …") que descrevem a
 *  mecânica do item ALÉM da descrição por tier. Hoje só os Implementos as têm; o
 *  resto do body (intro, bullets por tier, tabela do resumo) já vai pela descrição.
 *  Fonte de verdade = o body do doc (nada inventado). Retorna [] se não houver. */
export function bodyAbilities(doc: VaultDoc): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = []
  for (const raw of (doc.body ?? '').split('\n')) {
    // "**Rótulo:** texto" — o rótulo (com custo ex.: "- L") e o texto vêm crus do
    // body; wikilinks resolvidos, sem inventar nada.
    const m = raw.match(/^\s*\*\*([^*]+?)\*\*[:：]?\s*(.*)$/)
    if (!m) continue
    const label = stripWiki(m[1]!).replace(/[:：]\s*$/, '').trim()
    const text = stripWiki(m[2]!).trim()
    if (label) out.push({ label, text })
  }
  return out
}

/** Resolve `= this.x` (inline dataview) no corpo: nome do arquivo + campos. */
function resolveInlineDv(doc: VaultDoc, s: string): string {
  const f = { ...(doc.frontmatter ?? {}), ...(doc.inlineFields ?? {}) } as Record<string, unknown>
  return s.replace(/`=\s*this\.([a-zA-Z0-9_.]+)`/g, (_m, path: string) => {
    if (path === 'file.name') return doc.basename
    const key = path.split('.').pop() ?? path
    const v = f[key]
    return typeof v === 'string' ? stripWiki(v) : ''
  })
}

/** Inline markdown → HTML seguro: escapa, **negrito**, *itálico*, wikilink→rótulo. */
function inlineMd(s: string): string {
  return esc(stripWiki(s))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
}

/** CORPO da regra → HTML pro tooltip (#110/#117/#125): a prosa COMPLETA (não o
 *  resumo). Tira meta %% e fences, resolve `= this.x`, e mantém a estrutura
 *  (headings/listas/tabelas/parágrafos). A 1ª imagem embed (`![[img|...]]`) vira
 *  figura flutuante no canto (ex.: retrato da classe, #103); demais embeds/
 *  transclusões (`![[Outro Doc]]`) somem (nada de "!right|profile" cru).
 *  `cutAfterTable` (classe): para depois da 1ª tabela (nível + habilidades).
 *  Fonte de verdade = o body do doc. */
export function bodyHtml(
  doc: VaultDoc,
  assets?: ReturnType<typeof useAssetIndex>,
  opts?: { cutAfterTable?: boolean },
): string {
  let b = doc.body ?? ''
  b = b.replace(/%%[\s\S]*?%%/g, '') // meta
  // Embeds `![[X|...]]`: 1ª imagem resolvível → figura flutuante; resto some.
  let floatImg = ''
  b = b.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_m, target: string) => {
    const t = target.trim()
    if (!floatImg && assets && /\.(png|jpe?g|webp|gif|svg)$/i.test(t)) {
      const ent = resolveAsset(assets, t)
      if (ent) {
        // #280: figura flutuante da carta (88px) → thumb.
        floatImg = `<img class="shc-body-img" src="${esc(assetUrlFor(ent, true))}" alt=""/>`
      }
    }
    return ''
  })
  b = b.replace(/```[\s\S]*?```/g, '') // fences (dataview/rules/carta-item)
  b = resolveInlineDv(doc, b)
  const out: string[] = []
  let inList = false
  let para: string[] = []
  let table: string[][] = []
  let emittedTable = false
  const nameKey = doc.basename.replace(/[\s-]/g, '').toLowerCase()
  const flushPara = () => {
    // Cada linha-fonte do parágrafo vira uma LINHA (br) — os docs escrevem uma
    // afirmação por linha (ex.: "**Sucesso:** …", "**Falha:** …"); juntar com
    // espaço colava tudo numa linha só.
    if (para.length) out.push(`<p>${para.map((l) => inlineMd(l)).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (inList) out.push('</ul>')
    inList = false
  }
  const flushTable = () => {
    if (table.length) {
      const rows = table.filter((r) => !r.every((c) => /^:?-+:?$/.test(c.trim()) || !c.trim()))
      const body = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c.trim())}</td>`).join('')}</tr>`)
        .join('')
      if (body) {
        out.push(`<table class="shc-tbl">${body}</table>`)
        emittedTable = true
      }
    }
    table = []
  }
  for (const raw of b.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushPara()
      flushList()
      flushTable()
      if (opts?.cutAfterTable && emittedTable) break // classe: para após a tabela
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara()
      flushList()
      table.push(
        line
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          // Só separa em pipes NÃO escapados — `\|` dentro de `[[A\|B]]` é 1 célula.
          .split(/(?<!\\)\|/)
          .map((c) => c.replace(/\\\|/g, '|')),
      )
      continue
    }
    flushTable()
    if (opts?.cutAfterTable && emittedTable) break // classe: para após a tabela
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      flushList()
      const txt = inlineMd(h[2]!).trim()
      // Pula o heading do próprio doc — o card já mostra o nome no topo. Casa por
      // PREFIXO: "Anima (PRE)" / "Anima - PRE" também são o título, não conteúdo.
      const stripped = txt.replace(/<[^>]+>/g, '').replace(/[\s-]/g, '').toLowerCase()
      if (txt && !stripped.startsWith(nameKey)) out.push(`<div class="shc-h">${txt}</div>`)
      continue
    }
    if (/^\s*-{3,}\s*$/.test(line)) {
      flushPara()
      flushList()
      continue
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/)
    if (li) {
      flushPara()
      if (!inList) {
        out.push('<ul class="shc-ul">')
        inList = true
      }
      out.push(`<li>${inlineMd(li[1]!)}</li>`)
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushPara()
  flushList()
  flushTable()
  return floatImg + out.join('')
}

/** HTML da CARTA de um doc (figura + nome + stats do inline + descrição do tier).
 *  `showTier`: mostra "(Qualidade)" no nome — só a PROPRIEDADE (imbuição/obra-prima
 *  /material) ou o item avulso têm qualidade; a ARMA base não (a qualidade vem da
 *  propriedade). O FUNDO do tier fica em ambos (classe tier-*). */
export function itemCardHtml(
  doc: VaultDoc,
  tier: Tier,
  imgUrl: string | null,
  showTier: boolean,
  fullBody = false,
  assets?: ReturnType<typeof useAssetIndex>,
  cutAfterTable = false,
): string {
  const f = (doc.inlineFields ?? {}) as Record<string, unknown>
  // Alguns tipos (magia) guardam os campos no FRONTMATTER, não no inline —
  // busca no inline primeiro, cai no frontmatter (fonte de verdade do doc).
  const fmv = (doc.frontmatter ?? {}) as Record<string, unknown>
  // Lê um campo do inline (primeiro) ou do FM. Coerce NÚMEROS e ARRAYS: desde a
  // migração inline→FM (v2.0.37), campos como `mãos`/`bonus-defesa`/`dureza`/`danos`
  // são NÚMEROS e `propriedades` é uma LISTA de wikilinks no FM — antes `val` só
  // via strings e devolvia "" (arma sem Mãos/Propriedades, escudo sem Defesa/Dureza/
  // Dano — o bug do #267 6.6). Números → string; listas → wikilinks resolvidos e
  // juntados por vírgula (mesmo display do comércio/plugin).
  const coerce = (raw: unknown): string => {
    if (typeof raw === 'string') return stripWiki(raw)
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    if (Array.isArray(raw)) {
      return raw
        .map((x) => (typeof x === 'string' ? stripWiki(x) : typeof x === 'number' ? String(x) : ''))
        .filter(Boolean)
        .join(', ')
    }
    return ''
  }
  const val = (k: string) => {
    const inlineV = f[k]
    if (inlineV !== undefined && inlineV !== null && inlineV !== '') return coerce(inlineV)
    return coerce(fmv[k])
  }
  // Base v2: campos por tier viraram OBJETOS aninhados no frontmatter
  // (descrição: {adepto, experiente, mestre}); fallback pro flat antigo
  // (descrição_adepto no inline).
  const tierVal = (field: string): string => {
    const word = TIER_ADJ[tier]
    const obj = fmv[field]
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const v = (obj as Record<string, unknown>)[word]
      if (typeof v === 'string') return stripWiki(v)
    }
    return val(`${field}_${word}`)
  }
  const row = (label: string, v: string) => (v ? `<div class="shc-row"><b>${label}</b>${esc(v)}</div>` : '')
  const kind = docKind(doc)
  // Preço com o MULTIPLICADOR de qualidade (#122/#127): itens cuja qualidade é
  // própria (tesouro/imbuição/poção — showTier) custam preço_base × TIER_PRICE_MULT
  // do tier (A=1, E=5, M=25), como o comércio e o wealth.ts. A ARMA base (showTier
  // false) mantém o preço cru. Sem preço numérico → cai no inline cru.
  const precoStr = (): string => {
    const base = precoPO(doc)
    if (base <= 0) return val('preço')
    return `${base * (showTier ? TIER_PRICE_MULT[tier] : 1)} PO`
  }
  const parts: string[] = CARD_SCHEMA[kind].map(([k, label]) =>
    k === 'preço' ? row(label, precoStr()) : row(label, val(k)),
  )
  // Tesouro (imbuição/obra-prima/equipamento/implemento/poção): Usos + Bônus do tier.
  if (kind === 'tesouro') {
    parts.push(row('Usos', tierVal('usos')))
    const bonus = tierVal('bonus')
    const btipo = val('bonus_tipo')
    parts.push(row('Bônus', bonus ? (btipo ? `${bonus} ${btipo}` : bonus) : ''))
  }
  const rows = parts.join('')
  // Habilidades do CORPO (#268): implementos guardam mecânica extra no body
  // ("**Carga Preparatória - L:** …", "**Drenar - L:** …") que NÃO está na
  // descrição por tier — o usuário quer vê-la na carta. Só a família tesouro
  // (que tem essas linhas) as ganha; o resto do body vai pela descrição normal.
  const abilitiesHtml =
    !fullBody && kind === 'tesouro'
      ? bodyAbilities(doc)
          .map(
            (a) =>
              `<div class="shc-ability"><b>${esc(a.label)}</b>${a.text ? ` ${esc(a.text)}` : ''}</div>`,
          )
          .join('')
      : ''
  // fullBody (#110/#117/#125): a PROSA completa da regra (HTML) em vez do resumo.
  const descHtml = fullBody
    ? bodyHtml(doc, assets, { cutAfterTable })
    : esc(tierVal('descrição') || val('descrição') || val('resumo') || bodyDesc(doc)) + abilitiesHtml
  const tierSpan = showTier ? `<span class="shc-tier">(${TIER_COLUNA[tier]})</span>` : ''
  // Borda: itens de rank (magia/hab/téc/ação) básicos → azul (tier-B); os demais
  // seguem a qualidade/tier (aço/prata/ouro).
  const borderTier = RANK_KINDS.has(kind) && docIsBasica(doc) ? 'B' : tier
  // Card com TABELA cresce (sem teto de altura, um pouco mais largo) pra não
  // cortar a tabela (ex.: Tratar Ferimentos, #138).
  const hasTable = fullBody && descHtml.includes('shc-tbl')
  const cardCls = `shc-card tier-${borderTier}${fullBody ? ' shc-card--wide' : ''}${hasTable ? ' shc-card--table' : ''}`
  const descCls = `shc-desc${fullBody ? ' shc-body' : ''}`
  return `<div class="${cardCls}">${imgUrl ? `<img class="shc-img" src="${esc(imgUrl)}" alt=""/>` : ''}<div class="shc-name">${esc(doc.basename)}${tierSpan}</div>${rows}${descHtml ? `<div class="${descCls}">${descHtml}</div>` : ''}</div>`
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
.shc-wrap{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch}
.shc-card{width:174px;flex:none;display:flex;flex-direction:column;gap:2px;border:3px solid var(--line2);border-radius:11px;padding:7px}
.shc-card.tier-B{border-color:#4a90d9;box-shadow:0 0 0 1px #2f5f92,0 2px 12px rgba(0,0,0,.4);background:linear-gradient(160deg,color-mix(in srgb,#4a90d9 12%,var(--card)),var(--card))}
.shc-card.tier-A{border-color:#6b727c;box-shadow:0 0 0 1px #3a3f47,0 2px 12px rgba(0,0,0,.45);background:linear-gradient(160deg,color-mix(in srgb,#8b929c 12%,var(--card)),var(--card))}
.shc-card.tier-E{border-color:#dbe3ec;box-shadow:0 0 0 1px #aeb8c4,0 0 14px rgba(203,213,225,.34);background:linear-gradient(160deg,color-mix(in srgb,#cbd5e1 12%,var(--card)),var(--card))}
.shc-card.tier-M{border-color:#e8c14a;box-shadow:0 0 0 1px #b8860b,0 0 16px rgba(224,183,60,.4);background:linear-gradient(160deg,color-mix(in srgb,#e0b73c 14%,var(--card)),var(--card))}
.shc-img{width:100%;max-height:140px;object-fit:contain;border-radius:9px;margin-bottom:3px}
.shc-name{font-weight:800;font-size:12.5px}
.shc-tier{display:block;margin-top:1px;opacity:.7;font-weight:600;font-size:11px}
.shc-row{font-size:11.5px;overflow-wrap:anywhere}
.shc-row b{color:var(--muted);font-weight:700;margin-right:4px}
.shc-desc{font-size:11px;opacity:.85;line-height:1.35;margin-top:3px}
.shc-ability{font-size:10.5px;line-height:1.3;margin-top:4px}
.shc-ability b{color:var(--muted);font-weight:700;margin-right:3px}
.shc-card--wide{width:284px;max-height:60vh;overflow:hidden}
.shc-card--table{width:max-content;max-width:min(92vw,600px);max-height:70vh;overflow:auto}
.shc-body-img{float:right;width:88px;margin:0 0 5px 9px;border-radius:9px;box-shadow:0 2px 7px rgba(0,0,0,.4)}
.shc-body{opacity:.95}
.shc-body::after{content:"";display:block;clear:both}
.shc-body p{margin:0 0 5px 0}
.shc-body p:last-child{margin-bottom:0}
.shc-body .shc-h{font-weight:800;margin:6px 0 3px 0;font-size:11.5px}
.shc-body .shc-ul{margin:2px 0 5px 0;padding-left:15px}
.shc-body .shc-ul li{margin:1px 0}
.shc-body .shc-tbl{border-collapse:collapse;margin:4px 0;width:100%;font-size:10.5px}
.shc-body .shc-tbl td{border:1px solid var(--line2);padding:2px 5px;vertical-align:top}
`

/** Envolve `children` mostrando a CARTA do item no hover (desktop) / tap (mobile),
 *  reusando o tooltip do app (TipHover). Precisa de um `<TipProvider>` ancestral
 *  e do `ITEM_CARD_CSS` na tela. `propDoc` = 2ª carta (imbuição/obra-prima da
 *  arma). Sem doc → renderiza os filhos sem hover. */
/** Tier (A/E/M) de um doc pelo RANK/qualidade dele (inline `rank::` ou
 *  subcategoria) — Adepto/Adepta/Básica→A, Experiente→E, Mestre→M. Pros itens da
 *  ficha (habilidade/técnica/magia) o RANK é a qualidade → dá a cor da borda. */
/** Rank cru do doc (inline `rank::` OU frontmatter `rank:` OU subcategoria). */
function docRankRaw(doc: VaultDoc): string {
  const f = (doc.inlineFields ?? {}) as Record<string, unknown>
  const fmv = (doc.frontmatter ?? {}) as Record<string, unknown>
  const raw = typeof f['rank'] === 'string' ? f['rank'] : typeof fmv['rank'] === 'string' ? fmv['rank'] : ''
  return (raw || String(doc.subtype ?? '')).toLowerCase()
}

export function docTier(doc: VaultDoc): Tier {
  const s = docRankRaw(doc)
  if (s.includes('mestre')) return 'M'
  if (s.includes('experiente')) return 'E'
  return 'A'
}

/** Rank Básica (magia/habilidade/técnica de rank básico) → borda azul simples. */
function docIsBasica(doc: VaultDoc): boolean {
  const s = docRankRaw(doc)
  return s.includes('básica') || s.includes('basica') || s.includes('básico') || s.includes('basico')
}

/** Tipos cuja borda reflete o RANK do doc (não a qualidade comprada). */
const RANK_KINDS = new Set<CardKind>(['habilidade', 'tecnica', 'magia', 'acao'])

export function ItemHover({
  doc,
  propDoc,
  tier,
  children,
  style,
  fullBody,
  clickToOpen,
}: {
  doc?: VaultDoc
  propDoc?: VaultDoc
  tier?: Tier
  children: ReactNode
  style?: CSSProperties
  /** Mostra a PROSA COMPLETA da regra (não o resumo) — ficha em edição. */
  fullBody?: boolean
  /** #bug11/#3c: clicar abre o doc no painel de DETALHES (direita) — a ficha
   *  COMPLETA do item/artefato, sem sair da tela. Requer DetailCtl no shell. */
  clickToOpen?: boolean
}) {
  const assets = useAssetIndex()
  const detail = useDetail()
  // Pedido 2026-07-21: preferência global em Config/Geral — clicar no item
  // abre nos DETALHES (direita) em vez de só o tooltip. Central AQUI: vale
  // pra técnicas/habilidades/ações/magias/tesouros (todo ItemHover da ficha).
  const { clickDetalhes } = useSettings()
  let html: string | null = null
  if (doc) {
    // Sem tier explícito (ex.: habilidade/técnica/magia), deriva do RANK do doc —
    // assim a borda metálica do card reflete Adepto/Experiente/Mestre.
    const t = tier ?? docTier(doc)
    // Classe: corta o corpo depois da tabela de nível + habilidades (#103).
    const cut = doc.id.includes('/Classes/')
    const cards: string[] = []
    if (propDoc) {
      // combo: item base (SEM qualidade no nome) + propriedade (COM qualidade).
      cards.push(itemCardHtml(doc, t, docImageUrl(doc, t, assets), false, fullBody, assets, cut))
      cards.push(itemCardHtml(propDoc, t, docImageUrl(propDoc, t, assets), true, fullBody, assets))
    } else {
      // avulso: "(Qualidade)" só na família tesouro (a que é comprada por tier).
      cards.push(
        itemCardHtml(doc, t, docImageUrl(doc, t, assets), docKind(doc) === 'tesouro', fullBody, assets, cut),
      )
    }
    html = `<div class="shc-wrap">${cards.join('')}</div>`
  }
  // `always`: o doc pode chegar async (refs) — manter o mesmo wrapper evita
  // remontar os filhos (ex.: <select> do Perfil) quando o card aparece.
  const canOpen = (clickToOpen || clickDetalhes) && detail && doc
  return (
    <TipHover
      html={html}
      style={style}
      always
      onActivate={canOpen ? () => detail!.open({ kind: 'doc', id: doc!.id }) : undefined}
    >
      {children}
    </TipHover>
  )
}

/** HTML das 3 cartas (A/E/M) de um consumível/poção — cada tier com a sua figura
 *  e a descrição CONCISA daquele tier (`descrição_adepto/experiente/mestre` já é o
 *  que itemCardHtml escolhe pra desc). */
export function allTiersCardHtml(doc: VaultDoc, assets: ReturnType<typeof useAssetIndex>): string {
  const cards = (['A', 'E', 'M'] as Tier[]).map((t) => itemCardHtml(doc, t, docImageUrl(doc, t, assets), true))
  return `<div class="shc-wrap">${cards.join('')}</div>`
}

/** Hover de consumível (poção): sem `tier` (mouse no NOME) → as 3 qualidades lado a
 *  lado; com `tier` (mouse no número 1A/1E/1M) → só aquela qualidade. */
export function ConsumivelHover({
  doc,
  tier,
  children,
  style,
}: {
  doc?: VaultDoc
  tier?: Tier
  children: ReactNode
  style?: CSSProperties
}) {
  const assets = useAssetIndex()
  const detail = useDetail()
  const { clickDetalhes } = useSettings()
  const html = !doc
    ? null
    : tier
      ? `<div class="shc-wrap">${itemCardHtml(doc, tier, docImageUrl(doc, tier, assets), true)}</div>`
      : allTiersCardHtml(doc, assets)
  // Mesma preferência do ItemHover: clique abre o consumível nos DETALHES.
  const canOpen = clickDetalhes && detail && doc
  return (
    <TipHover
      html={html}
      style={style}
      always
      onActivate={canOpen ? () => detail!.open({ kind: 'doc', id: doc!.id }) : undefined}
    >
      {children}
    </TipHover>
  )
}
