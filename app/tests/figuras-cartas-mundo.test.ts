// #519 r4 (2026-09-03): as cartas de ARMAS, CONSUMÍVEIS e IMBUIÇÕES E
// TÊMPERAS do mundo POA entram na resolução de figura — mundo primeiro
// (nome via registro de reskin, sufixo de tier quando o arquivo varia),
// fantasia como fallback. Mesmo padrão dos Equipamentos/Implementos (#551).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAssetIndex } from '../src/data/assets'
import { weaponImageUrl } from '../src/data/creature-image'
import { consumivelImageUrl, propriedadeImageUrl, escudoImageUrlByName } from '../src/data/equipment-image'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { AssetsManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const manifest = (dir: string) =>
  JSON.parse(fs.readFileSync(path.join(repoDir, dir, 'assets.json'), 'utf8')) as AssetsManifest
const cyber = buildAssetIndex(manifest('vault-data-cyberpunk'))
const fantasia = buildAssetIndex(manifest('vault-data'))
const defPoa = JSON.parse(
  fs.readFileSync(path.join(repoDir, 'vault-data-cyberpunk', 'contexto.json'), 'utf8'),
) as ContextoDef

afterEach(() => setActiveContexto(null))

const armaDoc = (basename: string): VaultDoc =>
  ({ id: `Armas/${basename}`, basename, frontmatter: {}, images: [] }) as unknown as VaultDoc

describe('cartas do mundo (cyberpunk): armas, consumíveis, imbuições', () => {
  it('arma: Arco de Caça resolve pra Recursos de Contextos/Armas', () => {
    setActiveContexto(defPoa)
    const url = weaponImageUrl(armaDoc('Arco de Caça'), cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Armas/Arco de Caça.png')
  })
  it('consumível: Poção de Cura A → linha do mundo com tier', () => {
    setActiveContexto(defPoa)
    const url = consumivelImageUrl('Poção de Cura', 'A', cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Consumíveis/')
  })
  it('imbuição: Imbuição Torrencial A → Módulo Torrencial Adepta', () => {
    setActiveContexto(defPoa)
    const url = propriedadeImageUrl('Imbuição Torrencial', 'A', cyber)
    expect(decodeURIComponent(url ?? '')).toContain(
      'Recursos de Contextos/Imbuições e Têmperas/Módulo Torrencial Adepta',
    )
  })
  it('selo: Arma Obra-prima M → Arma Premium Mestre (overlay via propriedade)', () => {
    setActiveContexto(defPoa)
    const url = propriedadeImageUrl('Arma Obra-prima', 'M', cyber)
    expect(decodeURIComponent(url ?? '')).toContain(
      'Recursos de Contextos/Imbuições e Têmperas/Arma Premium Mestre',
    )
  })
  it('escudo por nome: resolve pela pasta de Armas do mundo', () => {
    setActiveContexto(defPoa)
    const url = escudoImageUrlByName('[[Broquel]]', cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Armas/')
  })
  it('na fantasia nada muda', () => {
    expect(decodeURIComponent(weaponImageUrl(armaDoc('Adaga'), fantasia) ?? '')).toContain(
      'Imagens/Cartas/Figura/Armas/Adaga',
    )
    expect(decodeURIComponent(propriedadeImageUrl('Imbuição Torrencial', 'A', fantasia) ?? '')).toContain(
      'Imagens/Cartas/Figura/Imbuições e Têmperas/Imbuição Torrencial Adepta',
    )
  })
})
