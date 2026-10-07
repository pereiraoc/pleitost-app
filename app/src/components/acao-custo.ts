// Custos de AÇÃO (1/2/3 ações, reação, ação livre) — registro central do
// ícone que os representa. O glifo vem das artes do user (design/acoes/*.png,
// vetorizadas por scripts/acoes-icones.py → generated/acao-icones.ts); o
// componente que desenha é <AcaoIcone> (AcaoIcone.tsx).
//
// Vocabulário de ENTRADA = chaves do registro `custo` (tokens.emojis.custo /
// seletores `custo` do supercharged): 1A, 2A, 3A, L (livre), R (reação). Os
// demais custos (P, Min, "10 Min"...) não são de ação e seguem com o emoji.
import { ACAO_GLIFOS } from '../generated/acao-icones'

export type AcaoTipo = keyof typeof ACAO_GLIFOS

/** custo da vault (chave do registro `custo`) → tipo do ícone. */
export const ACAO_DO_CUSTO: Readonly<Record<string, AcaoTipo>> = {
  '1A': '1',
  '2A': '2',
  '3A': '3',
  L: 'livre',
  R: 'reacao',
}

/** Rótulo (aria-label/tooltip e texto puro) — os nomes que o user dá aos
 *  custos ("1 ação, 2 ações, 3 ações, reação, ação livre"). */
export const ACAO_ROTULO: Readonly<Record<AcaoTipo, string>> = {
  '1': '1 Ação',
  '2': '2 Ações',
  '3': '3 Ações',
  reacao: 'Reação',
  livre: 'Ação Livre',
}

/** Tipo de ação do custo cru (`custo` do FM/inline), ou null se não é de ação. */
export function custoAcaoTipo(custo: unknown): AcaoTipo | null {
  if (typeof custo !== 'string') return null
  return ACAO_DO_CUSTO[custo.trim()] ?? null
}

/** Valida um tipo que veio como string (ex.: atributo data-link-acao). */
export function acaoTipo(v: unknown): AcaoTipo | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACAO_ROTULO, v) ? (v as AcaoTipo) : null
}

/** Custo como dígito/sigla de badge ("2A" → "2", "P" → "P") — o que os badges
 *  de custo mostram quando o custo NÃO é de ação. */
export function custoDigits(custo: unknown): string {
  const c = typeof custo === 'string' ? custo.trim() : ''
  const m = /^(\d+)/.exec(c)
  return m ? m[1]! : c
}
