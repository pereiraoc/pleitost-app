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
import { activeWorld } from './world'
import { existeNoDatasetDoMundo } from './world-dataset'

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

/** Pasta da região (o doc-raiz mora nela, e todo lugar dela abaixo). */
const pastaDaRegiao = (regionId: string) => regionId.split('/').slice(0, -1).join('/')

/**
 * Este lugar está DENTRO de alguma região com mapa de hexcrawl? A aba
 * Hexploração é um afixo de onboarding: desabilitada com nota, ela convida o
 * mestre a mapear a região. Onde o hexcrawl não existe (Porto Alegre 1987, que
 * é uma cidade, não um hexcrawl) seria ruído em 226 lugares — e o mestre pediu
 * que sumisse (report 2026-09-10). Derivado dos próprios ids do registro:
 * `Atlas/Mundo Livre/…` está dentro do Mundo Livre; `Atlas/Porto Alegre/…`
 * não está dentro de região nenhuma.
 */
export function dentroDeRegiaoComHexcrawl(doc: VaultDoc): boolean {
  return REGION_MAPS.some((m) => doc.id.startsWith(`${pastaDaRegiao(m.regionId)}/`))
}

/** O MUNDO ATIVO tem hexcrawl? (report 2026-09-10: a ficha de grupo da
 *  sessão no POA 1987 abria na EXPLORAÇÃO do Mundo Livre.) Vem dos dados: a
 *  região do registro precisa existir no dataset PRÓPRIO do mundo — o POA
 *  herda o Sistema da fantasia, mas não traz o Atlas do Mundo Livre. A
 *  fantasia é a base (o dataset dela é o próprio catálogo). */
export function mundoTemHexcrawl(): boolean {
  if (activeWorld() === 'fantasia') return REGION_MAPS.length > 0
  return REGION_MAPS.some((m) => existeNoDatasetDoMundo(`${m.regionId}.json`))
}

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
