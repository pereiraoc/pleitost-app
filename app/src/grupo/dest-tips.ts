// Tooltip DINÂMICO do painel DESTAQUES — #415 (mesma classe do #384/riqueza):
// o breakdown do modificador ("Atributo/Proficiência/Item/Especialização")
// vinha ESTÁTICO do snapshot do design (grupo-tips.js, chaves dest:fN
// sequenciais) — com dados vivos a contagem/ordem dos tops muda e o valor
// discriminado caía no INTEGRANTE ERRADO (report: Sobrevivência do Thoren com
// "Item: +0" tendo bônus real). O MARKUP é verbatim da entrada dest:f1 do
// design puxado; os DADOS vêm das partes reais do top (destaques.ts, a MESMA
// conta do skillMod/magiaMod — sem drift valor↔detalhe).
import { emojis } from '../generated/tokens'
import { fmtSigned } from './stats'
import type { GtipEntry } from './gtips'
import type { SkillTop } from './destaques'

// Glifos das linhas — registro central (generated/tokens, bloco `tooltip`:
// os MESMOS do breakdown da ficha). Nota: o snapshot do design usava 🌟 na
// linha de Especialização; o registro central grava ⭐ (tooltip.Especializacao)
// — o registro manda.
const EM_ATRIBUTO = emojis.tooltip.Atributo
const EM_PROF = emojis.tooltip.Proficiencia
const EM_ITEM = emojis.tooltip.Item
const EM_ESPECIAL = emojis.tooltip.Especializacao

/** Largura das entradas dest:f* do store do design. */
const W = 220

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Breakdown do modificador de UM top (perícia ou magia) — markup verbatim de
 *  dest:f1 com os números vivos. `headerEmoji` = emoji do atributo (perícias,
 *  como no snapshot: 💪/💨/…) ou da escola (magias). */
export function destTipModificador(headerEmoji: string, top: SkillTop): GtipEntry {
  const h =
    `<div style="display:grid;gap:5px;font-weight:600;line-height:1.35;">` +
    `<div style="font-weight:800;border-bottom:1px solid var(--line);padding-bottom:4px;` +
    `margin-bottom:2px;">${headerEmoji} Modificador <strong>${fmtSigned(top.mod)}</strong></div>` +
    `<div>${EM_ATRIBUTO} Atributo (${esc(top.attr)}): ${fmtSigned(top.attrVal)}</div>` +
    `<div>${EM_PROF} Proficiência (${esc(top.prof)}): ${fmtSigned(top.profVal)}</div>` +
    `<div>${EM_ITEM} Item: ${fmtSigned(top.item)}</div>` +
    `<div>${EM_ESPECIAL} Especialização: ${fmtSigned(top.especial)}</div></div>`
  return { h, w: W }
}

/** Texto do ⚠️ "Ninguém com Adepto ou melhor" — entrada GENÉRICA do design,
 *  referenciada pela CHAVE ESTÁVEL dest:f27 (o índice sequencial deslizava
 *  quando a contagem de tops vivos difere do snapshot). */
export const WARN_ADEPTO_KEY = 'dest:f27'
