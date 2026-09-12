// Subtítulo (accent2 do design) dos cards de criatura, num lugar só porque a
// regra tem três degraus: Pessoa compõe Relação · Organização · Posição (#414),
// o resto mostra Raça, senão Classe, senão o subtipo — tudo no vocabulário do
// MUNDO ativo e com os ajustes de regra do Contexto (report 2026-09-12: a
// lista mostrava "Canino" cru no Empregado do POA, enquanto a ficha já
// exibia "Segurança" pela mesma nota).
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
  const bruto =
    pessoa ||
    plainLabel(fm?.['Raça']) ||
    plainLabel(classeNoMundo(fm?.['Classe'], fm ?? {})) ||
    subtype ||
    ''
  return reskinText(bruto)
}
