// REGISTRO DE MAPAS POR REGIÃO (issue #67) — fonte de verdade de "que região
// tem mapa de hexcrawl". Uma REGIÃO (doc de Localização raiz, subcategoria
// Região) tem um mapa quando o asset da grade hexagonal existe pra ela. Por
// ora só o Mundo Livre: a nota `Atlas/Mundo Livre/Mundo Livre` embute o asset
// real `Mapa do Mundo Livre.png` no corpo (doc.images), e a grade calibrada
// em exploracao.ts é sobre essa imagem.
//
// NÃO inventar dados: a chave é o id REAL do doc de região no catálogo e o
// asset é o path REAL no manifest — os mesmos que o group-store/PanelExploracao
// já usam. Adicionar uma nova região = uma linha aqui + a calibração da grade.
//
// A geometria da grade (size/offset/passos, pixelToHex, …) mora em
// exploracao.ts e é COMUM às regiões suportadas hoje; se uma futura região
// precisar de outra calibração, esta entrada ganharia os parâmetros próprios.

import type { VaultDoc } from './types'

export interface RegionMap {
  /** Id do doc de Localização (raiz da região) no catálogo. */
  regionId: string
  /** Path exato do asset do mapa no manifest de assets (byPath/resolveAsset). */
  mapAsset: string
}

/** Regiões com mapa configurado. Só o Mundo Livre por ora (a grade de
 *  exploracao.ts é calibrada sobre esse asset). */
export const REGION_MAPS: RegionMap[] = [
  {
    regionId: 'Atlas/Mundo Livre/Mundo Livre',
    mapAsset: 'Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.png',
  },
]

const BY_REGION = new Map<string, RegionMap>(REGION_MAPS.map((m) => [m.regionId, m]))

/** Config do mapa de uma região pelo id do doc, ou null. */
export function regionMapById(regionId: string): RegionMap | null {
  return BY_REGION.get(regionId) ?? null
}

/** Config do mapa de hexcrawl que este doc de Localização ancora, ou null.
 *  Hoje o mapa vive na nota-raiz da região (o doc É a região do mapa); a
 *  detecção é por id, sem heurística de string. */
export function regionMapForDoc(doc: VaultDoc): RegionMap | null {
  return regionMapById(doc.id)
}
