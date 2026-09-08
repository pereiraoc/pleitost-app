// Retrato de PESSOA do mundo (2026-09-08): a tela Criaturas/PESSOAS listava as
// Pessoas da POA sem imagem — creatureImageUrl só conhecia FM Imagem e as
// pastas de herói/monstro. Agora cai no EMBED do corpo (`![[Nome.png]]`),
// a mesma fonte das views de Pessoa/Organização. Dataset real (pula se ausente).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAssetIndex } from '../src/data/assets'
import { creatureImageUrl } from '../src/data/creature-image'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const docFile = path.join(cyberDir, 'Contexto/Pessoas/Ana Mercur.json')

describe('retrato de Pessoa da POA na lista de criaturas', () => {
  it('resolve o embed do corpo pelo índice de assets (cheio e thumb)', () => {
    if (!fs.existsSync(docFile)) return
    const doc = JSON.parse(fs.readFileSync(docFile, 'utf8')) as VaultDoc
    const assets = buildAssetIndex(JSON.parse(fs.readFileSync(path.join(cyberDir, 'assets.json'), 'utf8')))
    expect(doc.images.map((i) => i.target)).toContain('Ana Mercur.png')
    const url = creatureImageUrl(doc, assets)
    expect(url).toBeTruthy()
    expect(decodeURIComponent(url!)).toContain('Pessoas/Ana Mercur')
    expect(creatureImageUrl(doc, assets, true)).toBeTruthy()
    // sem embed: nada (não inventa retrato)
    expect(creatureImageUrl({ ...doc, images: [] }, assets)).toBeNull()
  })
})
