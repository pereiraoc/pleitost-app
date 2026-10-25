// ESSÊNCIAS POR SLOT (2026-10-25): a Anima aprende essência como a Arcana
// aprende magia — com o slot da ESCOLA Anima (`Magias.Lista.Anima.Slots.*`;
// na secundária, `Magias.Secundaria.Lista.Anima.Slots.*` do Treinamento de
// Animista — contas em rules/slots-magia.ts), e o que ele compra é uma
// ESSÊNCIA, gravada em `Habilidades.Lista` com a fonte `Slot.<rank>`
// ({"[[Essência Mineral Adepta]]": "Slot.A"}). As magias seguem vindo da
// essência. A pura da sintonia (Magias Anima), a interface do Círculo
// Druídico e a Essência Invertida são concessões fixas (`Complementar`).
// Regra de quem abre (vizinhança, opostos): rules/roda-essencias.ts.

export type RankEssencia = 'A' | 'E' | 'M'

/** Nota de essência (habilidade que concede magias da Anima). */
export function ehEssencia(nome: string): boolean {
  return /^Essência\s/.test(nome)
}

/** Essência MENOR (linha secundária do Treinamento de Animista). */
export function ehMenor(nome: string): boolean {
  return /\sMenor$/.test(nome)
}

/** Rank que a essência ocupa: pelo sufixo da nota ("… Adepta", "… Experiente
 *  Menor"); Mestre composta não tem sufixo ("Essência do Meteoro"). */
export function rankDaEssencia(nome: string): RankEssencia | null {
  if (!ehEssencia(nome)) return null
  if (/\sExperiente(\sMenor)?$/.test(nome)) return 'E'
  if (/\sMestre$/.test(nome)) return 'M'
  if (/\s(Adepta|Menor)$/.test(nome)) return 'A'
  return 'M'
}

const ESCOLHA_PAI = /^Escolha\.(?:\d+\.)?\[\[([^\]|]+)/

/** MIGRAÇÃO (fichas de antes dos slots): essência gravada como pick de
 *  `Escolha_Habilidades` vira gasto de slot do rank dela. A da Essência
 *  Invertida sai: agora é concessão fixa. Idempotente; devolve o MESMO objeto
 *  quando não há o que migrar. */
export function migrarEssenciasParaSlots(fm: Record<string, unknown>): Record<string, unknown> {
  const hab = fm['Habilidades'] as Record<string, unknown> | undefined
  const lista = hab?.['Lista']
  if (!Array.isArray(lista)) return fm
  let mudou = false
  const nova: unknown[] = []
  for (const row of lista) {
    const [k, v] = row && typeof row === 'object' ? (Object.entries(row as Record<string, unknown>)[0] ?? []) : []
    const pai = typeof v === 'string' ? ESCOLHA_PAI.exec(v)?.[1] : undefined
    const alvo = typeof k === 'string' ? k.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim() : ''
    const rank = pai ? rankDaEssencia(alvo) : null
    if (!pai || !rank) {
      nova.push(row)
      continue
    }
    mudou = true
    if (pai.trim() === 'Essência Invertida') continue
    nova.push({ [k as string]: `Slot.${rank}` })
  }
  return mudou ? { ...fm, Habilidades: { ...hab, Lista: nova } } : fm
}
