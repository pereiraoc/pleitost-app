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
import { tesouroImageUrl } from '../src/data/equipment-image'
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
  it('tesouro SEM tier no arquivo: Anel Canário → Sensor Canário', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Anel Canário', 'A', cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Equipamentos/Sensor Canário')
  })
  it('implemento: Foco da Consistência resolve pra pasta do mundo', () => {
    setActiveContexto(defPoa)
    const url = tesouroImageUrl('Foco da Consistência', '', cyber)
    expect(decodeURIComponent(url ?? '')).toContain('Recursos de Contextos/Implementos/Foco da Consistência')
  })
  it('na fantasia nada muda (Figura clássica)', () => {
    const url = tesouroImageUrl('Anel Canário', 'A', fantasia)
    expect(decodeURIComponent(url ?? '')).toContain('Imagens/Cartas/Figura/Equipamentos/Anel Canário')
  })
})
