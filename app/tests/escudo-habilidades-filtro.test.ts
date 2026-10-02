// @vitest-environment node
// ESCUDO DO MESTRE — disponibilidade das vistas por combatente e o corte das
// habilidades que não entram na lista: modificadores de bestiário (estrutura
// do monstro) e ESSÊNCIAS (o que fazem aparece em MAGIAS). Corte pela PASTA
// resolvida no catálogo, nunca por nome.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/data/catalog'
import {
  habilidadeOcultaNoEscudo,
  temHabilidades,
  temMagias,
  temPertences,
  vistasDisponiveis,
} from '../src/components/mestre/escudo/disponibilidade'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const fmDe = (rel: string) => (JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${rel}.json`), 'utf8')) as VaultDoc).frontmatter as Record<string, unknown>
const goblin = fmDe('Sistema/Criaturas/Bestiário/Goblin Batedor')
const zuko = fmDe('Sistema/Criaturas/Heróis/Zuko')
const carlos = JSON.parse(fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'heroes', 'Carlos Facão de Andradas.json'), 'utf8')).frontmatter as Record<string, unknown>

describe('habilidadeOcultaNoEscudo', () => {
  it('modificadores de bestiário e essências ficam fora; habilidades de verdade ficam', () => {
    for (const n of ['Competente', 'Solo', 'Elite', 'Evolução Básica de Monstro']) expect(habilidadeOcultaNoEscudo(catalog, n), n).toBe(true)
    for (const n of ['Essência Flamejante Adepta', 'Essência Ciclonal Adepta', 'Essência de Criação Adepta', 'Essência Congelante Menor']) {
      expect(habilidadeOcultaNoEscudo(catalog, n), n).toBe(true)
    }
    for (const n of ['Escaramuça Goblin', 'Performance Bárdica', 'Evolução Básica', 'Magias Anima']) expect(habilidadeOcultaNoEscudo(catalog, n), n).toBe(false)
    expect(habilidadeOcultaNoEscudo(catalog, 'Nota Que Não Existe')).toBe(false)
  })
})

describe('vistasDisponiveis', () => {
  it('Goblin Batedor: ataques e perícias sim; magias (tudo N, sem lista) e pertences (só armas) não', () => {
    expect(vistasDisponiveis(goblin, catalog)).toEqual({ ataques: true, magias: false, pericias: true, habilidades: true, pertences: false })
  })
  it('Carlos: tudo disponível (armadura/tesouros/consumíveis contam; armas não)', () => {
    expect(vistasDisponiveis(carlos, catalog)).toEqual({ ataques: true, magias: true, pericias: true, habilidades: true, pertences: true })
  })
  it('Zuko: habilidades vazias depois de tirar as essências? não — Evolução Básica e Magias Anima ficam; magias sim', () => {
    expect(temMagias(zuko)).toBe(true)
    expect(temHabilidades(zuko, catalog)).toBe(true)
  })
  it('pertences: só armas/escudo → vazio; armadura → cheio', () => {
    expect(temPertences({ Inventario: { Armas: { Lista: [{ Nome: '[[Espada]]' }] }, Escudo: { Nome: '[[Escudo]]' } } })).toBe(false)
    expect(temPertences({ Inventario: { Armadura: { Nome: '[[Armadura Leve]]' } } })).toBe(true)
    expect(temPertences({ Inventario: { Consumiveis: ['[[Poção de Cura|Poção de Cura (Adepto) (x0)]]'] } })).toBe(false)
    expect(temPertences({ Inventario: { Consumiveis: ['[[Poção de Cura|Poção de Cura (Adepto) (x2)]]'] } })).toBe(true)
  })
  it('habilidades: só modificadores/essências → vazio; técnica sozinha → cheio', () => {
    expect(temHabilidades({ Habilidades: { Lista: [{ '[[Competente]]': 'x' }, { '[[Essência Flamejante Adepta]]': 'x' }] } }, catalog)).toBe(false)
    expect(temHabilidades({ Tecnicas: { Lista: [{ '[[Pluma]]': 'x' }] } }, catalog)).toBe(true)
  })
})
