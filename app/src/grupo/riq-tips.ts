// Tooltips DINÂMICOS da tabela "RIQUEZA DA MESA" — issue #384: o conteúdo
// discriminado (tesouros/consumíveis/ouro/Δ por célula e os "por integrante"
// da linha Grupo) vinha ESTÁTICO do snapshot do design (grupo-tips.js),
// chaveado por ÍNDICE de linha na ordem por Δ do snapshot — com dados vivos a
// ordem muda (e o grupo pode nem ser o do snapshot), então o valor
// discriminado caía no INTEGRANTE ERRADO. Aqui o MARKUP é copiado VERBATIM
// das entradas riq:r* do design puxado (design/pulled/grupo-tips.js) e os
// DADOS vêm do inventário real (itemize* em wealth.ts — a MESMA precificação
// dos totais, sem drift soma↔detalhe).
import { emojis } from '../generated/tokens'
import { fmtPlain, fmtSigned } from './stats'
import type { GtipEntry } from './gtips'
import type { WealthLine } from './wealth'

// Glifos das linhas do detalhe — registro central (generated/tokens), os
// MESMOS que o design usa: 💍 subcategoria.Tesouro, 🧪 categoria.Consumivel,
// 🪙 glyph.GoldCoin. ⚔️/🛡️ das linhas de arma/armadura+escudo são verbatim
// do markup do design (que usa 🛡️ pra armadura E escudo): equivalem a
// EMOJI.inv.Equipamentos / EMOJI.subcategoria.Escudo do registro.
const EM_TESOURO = emojis.subcategoria.Tesouro
const EM_CONSUMIVEL = emojis.categoria.Consumivel
const EM_OURO = emojis.glyph.GoldCoin
const EM_ARMA = emojis.inv.Equipamentos
const EM_ARMADURA_ESCUDO = emojis.subcategoria.Escudo

/** Largura das entradas riq:r* do store do design (buildGtip → 420 efetivo). */
const W = 220

/** Rótulos/nomes viram innerHTML (GtipOverlay) — escapa o mínimo HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Grade "label · valor · PO" de UMA linha — estilo verbatim do design.
const LINE_GRID =
  'display:grid;grid-template-columns:minmax(0,1fr) minmax(4.5ch,max-content) min-content;' +
  'gap:0.35em 0.45em;align-items:baseline;font-variant-numeric:tabular-nums;'

function tipLine(label: string, value: string): string {
  return (
    `<div style="${LINE_GRID}line-height:1.35;"><span style="min-width:0;">${esc(label)}</span>` +
    `<strong style="justify-self:end;">${esc(value)}</strong>` +
    `<span style="opacity:.75;white-space:nowrap;">PO</span></div>`
  )
}

/** Linha Σ (total) — borda superior + peso 800, verbatim do design. */
function tipSum(value: string): string {
  return (
    `<div style="${LINE_GRID}margin-top:4px;border-top:1px solid var(--line);padding-top:4px;` +
    `font-weight:800;line-height:1.35;"><span>Σ</span>` +
    `<strong style="justify-self:end;">${esc(value)}</strong>` +
    `<span style="opacity:.75;white-space:nowrap;">PO</span></div>`
  )
}

/** Wrapper + cabeçalho com régua — verbatim do design (gap 5 nas listas,
 *  6 no Δ). O `head` é constante nossa (não escapa). */
function tipWrap(gap: number, head: string, body: string): string {
  return (
    `<div style="display:grid;gap:${gap}px;font-weight:600;line-height:1.35;">` +
    `<div style="font-weight:800;border-bottom:1px solid var(--line);padding-bottom:4px;">${head}</div>` +
    `${body}</div>`
  )
}

/** Célula CNS do membro: linhas na ordem do FM (como no design) + Σ. */
export function riqTipConsumiveis(lines: WealthLine[]): GtipEntry {
  const body = lines.map((l) => tipLine(l.label, fmtPlain(l.value))).join('')
  const sum = lines.reduce((s, l) => s + l.value, 0)
  return { h: tipWrap(5, `${EM_CONSUMIVEL} Consumíveis`, body + tipSum(fmtPlain(sum))), w: W }
}

/** Célula ORO do membro. */
export function riqTipOuro(ouro: number): GtipEntry {
  return { h: tipWrap(5, `${EM_OURO} Ouro`, tipLine('Ouro no inventário', fmtPlain(ouro))), w: W }
}

/** Origens das linhas da célula TSR (mesma partição do pricing). */
export interface TesouroLines {
  armas: WealthLine[]
  armaduraEscudo: WealthLine[]
  tesouros: WealthLine[]
}

/** Célula TSR do membro: linhas com o glifo da origem, ordenadas por valor
 *  desc (sort estável; empate mantém armas → armadura/escudo → tesouros,
 *  a ordem observada no snapshot do design) + Σ + nota. */
export function riqTipTesouros(t: TesouroLines): GtipEntry {
  const all = [
    ...t.armas.map((l) => ({ ...l, label: `${EM_ARMA} ${l.label}` })),
    ...t.armaduraEscudo.map((l) => ({ ...l, label: `${EM_ARMADURA_ESCUDO} ${l.label}` })),
    ...t.tesouros.map((l) => ({ ...l, label: `${EM_TESOURO} ${l.label}` })),
  ]
  all.sort((a, b) => b.value - a.value)
  const body = all.map((l) => tipLine(l.label, fmtPlain(l.value))).join('')
  const sum = all.reduce((s, l) => s + l.value, 0)
  const note =
    '<div style="font-size:0.88em;color:var(--muted);margin-top:6px;border-top:1px solid var(--line);' +
    'padding-top:6px;line-height:1.35;">Tesouros do inventário, armadura, escudo e armas ' +
    '(sem ouro nem consumíveis).</div>'
  return { h: tipWrap(5, `${EM_TESOURO} Tesouros`, body + tipSum(fmtPlain(sum)) + note), w: W }
}

/** Célula Δ do membro: esperado pelo nível DELE + diferença. */
export function riqTipDelta(nivel: number, expected: number, delta: number): GtipEntry {
  const body =
    tipLine(`📌 Esperado (economia · nível ${fmtPlain(nivel)})`, fmtPlain(expected)) +
    tipLine('➡️ Diferença (vs esperado)', fmtSigned(delta))
  return { h: tipWrap(6, '📊 Δ de riqueza', body), w: W }
}

/** Linha Grupo, célula NVL: maior nível vivo (texto verbatim do design). */
export function riqTipGrupoNivel(maxNivel: number): GtipEntry {
  return {
    h:
      '<div style="font-weight:600;line-height:1.35;">Maior nível entre os integrantes: ' +
      `<strong>${fmtPlain(maxNivel)}</strong>.</div>`,
    w: W,
  }
}

/** "… por integrante" da linha Grupo: valor desc, nome asc pt (ordem
 *  observada no snapshot do design) + Σ. */
function riqTipPorIntegrante(titulo: string, rows: WealthLine[]): GtipEntry {
  const sorted = [...rows].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt'),
  )
  const body = sorted.map((r) => tipLine(r.label, fmtPlain(r.value))).join('')
  const sum = rows.reduce((s, r) => s + r.value, 0)
  return { h: tipWrap(5, esc(titulo), body + tipSum(fmtPlain(sum))), w: W }
}

// Títulos verbatim do design (riq:r5c2/c3/c4).
export const riqTipGrupoConsumiveis = (rows: WealthLine[]): GtipEntry =>
  riqTipPorIntegrante('Consumíveis por integrante', rows)
export const riqTipGrupoOuro = (rows: WealthLine[]): GtipEntry =>
  riqTipPorIntegrante('Ouro por integrante', rows)
export const riqTipGrupoTesouros = (rows: WealthLine[]): GtipEntry =>
  riqTipPorIntegrante('Tesouros (sem ouro) por integrante', rows)
