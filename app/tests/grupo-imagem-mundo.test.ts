// RETRATO PADRÃO DE GRUPO POR MUNDO (pedido do mestre, 2026-09-14).
//
// `Imagens/Retratos/Grupo de Criaturas.png` é o ÚLTIMO degrau do fallback e é
// figura do PADRÃO DO SISTEMA, compartilhada entre os mundos — sobrescrevê-la
// com arte da POA trocava o default da fantasia junto (foi o que aconteceu e
// teve que ser revertido). A arte da POA vive em
// `Recursos de Contextos/Grupo de Criaturas.png`, e a escolha é DIRIGIDA POR
// DADOS, igual às Classes (#519): a pasta do mundo só existe no índice de
// assets daquele mundo, então na fantasia o passo simplesmente não casa.
//
// Regra: o retrato PRÓPRIO do grupo (Retratos/<nome do grupo>) continua
// ganhando de tudo — o degrau por mundo troca só o DEFAULT.
import { describe, expect, it } from 'vitest'
import { buildAssetIndex } from '../src/data/assets'
import { defaultGroupImageUrl, groupImageUrl } from '../src/data/creature-image'
import type { AssetsManifest } from '../src/data/types'

const RETRATOS = 'Recursos e Mídia/Imagens/Retratos'
const CTX = 'Recursos e Mídia/Recursos de Contextos'

const manifest = (paths: string[]): AssetsManifest =>
  ({
    counts: { total: paths.length, referenced: paths.length, orphan: 0, missing: 0 },
    assets: paths.map((p) => ({
      path: p,
      basename: p.split('/').pop()!,
      copiedTo: `assets/${p}`,
      sha256: '',
      referencedBy: [],
      orphan: false,
      ambiguous: false,
    })),
    missing: [],
  }) as unknown as AssetsManifest

const soFantasia = buildAssetIndex(manifest([`${RETRATOS}/Grupo de Criaturas.png`]))
const comMundo = buildAssetIndex(
  manifest([`${RETRATOS}/Grupo de Criaturas.png`, `${CTX}/Grupo de Criaturas.png`]),
)

describe('retrato padrão de grupo por mundo', () => {
  it('sem arte do mundo (fantasia) usa o default do sistema em Retratos', () => {
    const url = defaultGroupImageUrl(soFantasia)
    expect(url).not.toBeNull()
    expect(decodeURIComponent(url!)).toContain(`${RETRATOS}/Grupo de Criaturas`)
  })

  it('com arte do mundo (POA) o default passa a ser a de Recursos de Contextos', () => {
    const url = defaultGroupImageUrl(comMundo)
    expect(url).not.toBeNull()
    expect(decodeURIComponent(url!)).toContain(`${CTX}/Grupo de Criaturas`)
    expect(decodeURIComponent(url!)).not.toContain(RETRATOS)
  })

  it('o retrato próprio do grupo continua ganhando do default do mundo', () => {
    const comRetratoProprio = buildAssetIndex(
      manifest([
        `${RETRATOS}/Grupo de Criaturas.png`,
        `${CTX}/Grupo de Criaturas.png`,
        `${RETRATOS}/Os Contratados.png`,
      ]),
    )
    const url = groupImageUrl('Os Contratados', comRetratoProprio)
    expect(decodeURIComponent(url!)).toContain(`${RETRATOS}/Os Contratados`)
  })

  it('sem índice de assets não inventa URL', () => {
    expect(defaultGroupImageUrl(undefined)).toBeNull()
  })
})
