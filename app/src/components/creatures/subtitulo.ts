// Subtítulo (accent2 do design) dos cards de criatura, num lugar só porque a
// regra tem degraus: Pessoa compõe Relação · Organização · Posição (#414); o
// resto compõe CLASSE · RAÇA (TAMANHO), caindo no subtipo quando não tem
// nenhuma das duas — tudo no vocabulário do MUNDO ativo e com os ajustes de
// regra do Contexto (report 2026-09-12: a lista mostrava "Canino" cru no
// Empregado do POA; e o monstro "Incomum" aparecia sem o tamanho).
import { reskinText } from '../../data/reskin'
import { classeNoMundo } from '../../rules/mundo-ajustes'

const WIKI = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/

/** Texto plano de um valor FM que pode ser wikilink ("[[Mago|Mago]]" → "Mago"). */
export function plainLabel(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string' || !value) return ''
  const match = WIKI.exec(value)
  return match ? (match[2] ?? match[1]!) : value
}

export function subtituloDeCriatura(
  fm: Record<string, unknown> | undefined,
  subtype: string | null | undefined,
): string {
  const pessoa =
    subtype === 'Pessoa'
      ? [fm?.['Relação'], fm?.['Organização'], fm?.['Posição']]
          .map(plainLabel)
          .filter(Boolean)
          .join(' · ')
      : ''
  const bruto = pessoa || [
    plainLabel(classeNoMundo(fm?.['Classe'], fm ?? {})),
    racaComTamanho(fm),
  ].filter(Boolean).join(' · ') || subtype || ''
  return reskinText(bruto)
}

/** Raça COM o tamanho (pedido do mestre, 2026-09-12: "nos casos que tu mostra
 *  como Incomum tu não diz o tamanho"). O alias da raça humana já traz
 *  ("Humano (Médio)"); quando não traz, o FM `Tamanho` completa. */
function racaComTamanho(fm: Record<string, unknown> | undefined): string {
  const raca = plainLabel(fm?.['Raça'])
  if (!raca) return ''
  const tamanho = plainLabel(fm?.['Tamanho'])
  return !tamanho || raca.includes(tamanho) ? raca : `${raca} (${tamanho})`
}
