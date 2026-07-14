// FENCE ```bounty``` (#248) — registrada no mapa FENCES (fence-registry.tsx),
// nunca por if-de-string no call-site. Parseia o bloco (port do pleitost-views)
// e renderiza a BountyCard. A meta (rank/subcategoria) vem do FRONTMATTER do
// doc que embute o bloco — mesma decisão de process-bounty-block.ts:12-13
// (rank = fm.rank; subcategoria = fm.subcategoria). Funciona tanto na
// AventuraView quanto em qualquer doc que embuta o bounty.
import type { FenceProps } from '../fence-registry'
import { BountyCard } from './BountyCard'
import { parseBountyBlock } from './parse-bounty'

/** Subcategoria da missão: FM.subcategoria (fonte do plugin), com o subtype
 *  extraído como fallback (o extractor grava subtype = FM.subcategoria). */
export function bountyMetaFromDoc(doc: {
  subtype: string | null
  frontmatter: Record<string, unknown>
}) {
  const fm = doc.frontmatter
  return {
    rank: fm.rank,
    subcategoria: fm.subcategoria ?? doc.subtype,
  }
}

export function BountyFence({ code, doc }: FenceProps) {
  const data = parseBountyBlock(code)
  return <BountyCard data={data} meta={bountyMetaFromDoc(doc)} />
}
