// #519 r4 (pedido 2026-09-02): as figuras de EQUIPAMENTO e IMPLEMENTO do
// mundo POA (Recursos de Contextos/{Equipamentos,Implementos}/) entram na
// resolução de tesouroImageUrl — mundo primeiro (nome via registro de
// reskin, com sufixo de tier quando o arquivo varia), fantasia como
// fallback. Na fantasia nada muda (reskin identidade + pasta ausente).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAssetIndex } from '../src/data/assets'
import { armaduraImageUrlByName, tesouroImageUrl } from '../src/data/equipment-image'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { AssetsManifest } from '../src/data/types'

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

describe('figuras de equipamento do mundo (cyberpunk)', () => {
  it('tesouro COM tier: Anel da Resistência A → Implante Subdérmico Adepto', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Anel da Resistência', 'A', cyber)
    expect(decodeURIComponent(url ?? '')).toContain(
      'Recursos de Contextos/Equipamentos/Implante Subdérmico Adepto',
    )
  })
  it('tesouro SEM tier no arquivo: Anel Canário → Dublê', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Anel Canário', 'A', cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Equipamentos/Dublê')
  })
  // 2026-09-12: os Focos viraram Válvulas (a arte já era válvula selênica desde
  // a r3; só o nome tinha ficado em fantasia na ficha). O lookup resolve pelo
  // nome do MUNDO, então o arquivo também foi renomeado.
  it('implemento: Foco da Consistência resolve pra pasta do mundo, com o nome novo', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Foco da Consistência', '', cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Implementos/Válvula de Consistência')
  })
  it('na fantasia nada muda (Figura clássica)', () => {
    const url = tesouroImageUrl('Anel Canário', 'A', fantasia)
    expect(decodeURIComponent(url ?? '')).toContain('Imagens/Cartas/Figura/Equipamentos/Anel Canário')
  })
})

// 2026-09-12: cada equipamento passa a ter TRÊS artes (Adepta/Experiente/
// Mestre). O sufixo do arquivo é `(A)/(E)/(M)` — sem gênero, porque o nome do
// mundo pode ser feminino ("Válvula de Consistência") e o sufixo escrito
// concordaria errado. O esquema antigo (sufixo por extenso) segue valendo como
// fallback, e o arquivo SEM tier continua depois dele — é o que mantém a arte
// atual no ar enquanto as 72 novas não chegam.
describe('sufixo de tier (A)/(E)/(M)', () => {
  const idx = (...caminhos: string[]) =>
    buildAssetIndex({
      counts: {},
      assets: caminhos.map((path) => ({
        path,
        basename: path.split('/').pop()!,
        copiedTo: `assets/${path}`,
        sha256: 'x',
      })),
    } as unknown as AssetsManifest)
  const EQ = 'Recursos e Mídia/Recursos de Contextos/Equipamentos'
  const IMP = 'Recursos e Mídia/Recursos de Contextos/Implementos'

  it('equipamento: acha `<nome> (A)` e prefere ao sufixo por extenso', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl(
      'Anel da Resistência',
      'A',
      idx(`${EQ}/Implante Subdérmico (A).png`, `${EQ}/Implante Subdérmico Adepto.png`),
    )
    expect(decodeURIComponent(url ?? '')).toContain('Implante Subdérmico (A)')
  })

  it('IMPLEMENTO por tier: era o buraco — Válvula de Consistência (E)', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Foco da Consistência', 'E', idx(`${IMP}/Válvula de Consistência (E).png`))
    expect(decodeURIComponent(url ?? '')).toContain('Implementos/Válvula de Consistência (E)')
  })

  it('nome feminino não vira "Adepto": Gazua Integrada (M)', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Luvas do Ladrão', 'M', idx(`${EQ}/Gazua Integrada (M).png`))
    expect(decodeURIComponent(url ?? '')).toContain('Gazua Integrada (M)')
  })

  // 2026-09-12: armadura nunca teve carta — nem na fantasia, nem no mundo. O
  // slot ARMADURA mostrava emoji. Agora o mundo tem pasta própria.
  it('ARMADURA: resolve pelo nome do mundo (Armadura Leve → Jaqueta Reforçada)', () => {
    setActiveContexto(defPoa)
    const url = armaduraImageUrlByName(
      '[[Armadura Leve]]',
      idx('Recursos e Mídia/Recursos de Contextos/Armaduras/Jaqueta Reforçada.png'),
    )
    expect(decodeURIComponent(url ?? '')).toContain('Armaduras/Jaqueta Reforçada')
  })

  it('ARMADURA sem arte → null (o slot volta pro emoji, sem quebrar)', () => {
    setActiveContexto(defPoa)
    expect(armaduraImageUrlByName('[[Armadura Pesada]]', idx())).toBeNull()
  })

  it('sem a arte nova, cai no arquivo SEM tier (a atual segue no ar)', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Luvas do Ladrão', 'M', idx(`${EQ}/Gazua Integrada.png`))
    expect(decodeURIComponent(url ?? '')).toContain('Gazua Integrada.png')
  })
})
