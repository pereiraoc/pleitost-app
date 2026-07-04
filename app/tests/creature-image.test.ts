// Hierarquia de imagem (espelho do plugin) sobre o assets.json real.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAssetIndex } from '../src/data/assets'
import { creatureImageUrl, groupImageUrl } from '../src/data/creature-image'
import type { AssetsManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const assets = buildAssetIndex(
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8')) as AssetsManifest,
)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

describe('creatureImageUrl (hierarquia do plugin) sobre assets reais', () => {
  it('herói com retrato pelo nome usa Retratos/<nome>', () => {
    // Affonso.png existe em Retratos
    const url = creatureImageUrl(readDoc('Sistema/Criaturas/Heróis/Affonso'), assets)
    expect(url).toContain('/Retratos/Affonso.png')
  })

  it('herói sem retrato cai pra imagem da classe quando existir', () => {
    const doc = readDoc('Sistema/Criaturas/Heróis/Adriann') // Classe [[Mago|Mago]]
    const url = creatureImageUrl(doc, assets)
    // expectativa independente: existe Retratos/Adriann.*? senão Classes/Mago.*?
    const has = (p: string) =>
      ['.png', '.jpg', '.jpeg', '.webp'].some((e) =>
        assets.byPath.has(`Recursos e Mídia/Imagens/${p}${e}`),
      )
    if (has('Retratos/Adriann')) expect(url).toContain('/Retratos/Adriann')
    else if (has('Classes/Mago')) expect(url).toContain('/Classes/Mago')
    else expect(url).toBeNull()
  })

  it('grupo usa Retratos/<basename do grupo>', () => {
    const url = groupImageUrl('Carlos, Dante, Mera, Pind, Thoren', assets)
    expect(url).toContain('/Retratos/Carlos%2C%20Dante%2C%20Mera%2C%20Pind%2C%20Thoren.png')
  })

  it('sem nada na hierarquia → null (caller usa fallback)', () => {
    expect(groupImageUrl('grupo-que-nao-existe', assets)).toBeNull()
  })
})
