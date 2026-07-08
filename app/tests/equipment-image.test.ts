// Resolução de figuras de equipamento do INVENTÁRIO (issue #65) sobre o
// assets.json REAL — mesmas convenções do render de cartas do pleitost-views.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAssetIndex } from '../src/data/assets'
import {
  escudoImageUrl,
  isObraPrima,
  obraPrimaSeloUrl,
  propriedadeImageUrl,
  tesouroImageUrl,
} from '../src/data/equipment-image'
import type { AssetsManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const assets = buildAssetIndex(
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8')) as AssetsManifest,
)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

/** URL do asset (copiedTo url-encoded) → caminho legível pra asserção. */
const decoded = (url: string | null): string => decodeURIComponent(url ?? '')

describe('propriedadeImageUrl (imbuição + qualidade, sufixo FEMININO)', () => {
  it('imbuição real: Imbuição Torrencial + M → Imbuições e Têmperas/... Mestre.png', () => {
    const url = propriedadeImageUrl('Imbuição Torrencial', 'M', assets)
    expect(decoded(url)).toContain('Imbuições e Têmperas/Imbuição Torrencial Mestre.png')
  })

  it('Obra-prima automática da arma: Arma Obra-prima + A → ... Adepta.png', () => {
    const url = propriedadeImageUrl('Arma Obra-prima', 'A', assets)
    expect(decoded(url)).toContain('Imbuições e Têmperas/Arma Obra-prima Adepta.png')
  })

  it('sem tier ou sem base → null (a pasta só tem imagens com sufixo de tier)', () => {
    expect(propriedadeImageUrl('Imbuição Torrencial', '', assets)).toBeNull()
    expect(propriedadeImageUrl('', 'M', assets)).toBeNull()
  })
})

describe('obraPrimaSeloUrl (selo SÓ pra Obra-prima)', () => {
  it('isObraPrima só nas propriedades "<X> Obra-prima"', () => {
    expect(isObraPrima('Arma Obra-prima')).toBe(true)
    expect(isObraPrima('Armadura Obra-prima')).toBe(true)
    expect(isObraPrima('Escudo Obra-prima')).toBe(true)
    expect(isObraPrima('Broquel Obra-prima')).toBe(true)
    expect(isObraPrima('Imbuição Torrencial')).toBe(false)
  })

  it('selo presente pra Armadura Obra-prima + E (fixture do Carlos)', () => {
    const url = obraPrimaSeloUrl('Armadura Obra-prima', 'E', assets)
    expect(decoded(url)).toContain('Imbuições e Têmperas/Armadura Obra-prima Experiente.png')
  })

  it('imbuição real NÃO gera selo (null)', () => {
    expect(obraPrimaSeloUrl('Imbuição Relampejante', 'E', assets)).toBeNull()
  })
})

describe('escudoImageUrl (mesma resolução das armas: Figura/Armas/<basename>.png)', () => {
  it('Broquel → Figura/Armas/Broquel.png', () => {
    const url = escudoImageUrl(readDoc('Sistema/Equipamento/Escudos/Broquel'), assets)
    expect(decoded(url)).toContain('Figura/Armas/Broquel.png')
  })

  it('Escudo → Figura/Armas/Escudo.png', () => {
    const url = escudoImageUrl(readDoc('Sistema/Equipamento/Escudos/Escudo'), assets)
    expect(decoded(url)).toContain('Figura/Armas/Escudo.png')
  })

  it('sem doc (Sem Escudo) → null', () => {
    expect(escudoImageUrl(undefined, assets)).toBeNull()
  })
})

describe('tesouroImageUrl (Figura/Equipamentos, sufixo MASCULINO com fallback sem tier)', () => {
  it('tesouro COM figura de tier: Anel da Resistência + A → ... Adepto.png', () => {
    const url = tesouroImageUrl('Anel da Resistência', 'A', assets)
    expect(decoded(url)).toContain('Figura/Equipamentos/Anel da Resistência Adepto.png')
  })

  it('tesouro SEM figura de tier cai pro nome puro: Anel Canário + A → Anel Canário.png', () => {
    // não existe "Anel Canário Adepto.png"; resolve o sem-sufixo
    const url = tesouroImageUrl('Anel Canário', 'A', assets)
    expect(decoded(url)).toContain('Figura/Equipamentos/Anel Canário.png')
    expect(decoded(url)).not.toContain('Adepto')
  })

  it('tesouro inexistente → null', () => {
    expect(tesouroImageUrl('Tesouro Que Não Existe', 'A', assets)).toBeNull()
  })
})
