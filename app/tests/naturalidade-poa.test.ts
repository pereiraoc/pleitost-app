// Report de50ef5d (2026-08-31): "não tá dando pra selecionar naturalidade no
// POA1987 (fica vazio)" — o SELECTABLE só aceitava Capital/Grande/Pequena
// Cidade e o Atlas urbano usa Bairro/Cidade. Valida sobre o dataset REAL dos
// dois mundos: POA lista bairros selecionáveis; fantasia segue igual.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { listLocalizacoes, naturalidadeSelectLines } from '../src/rules/naturalidade'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)

function linhas(world: string) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoDir, world, 'index.json'), 'utf8'),
  ) as IndexManifest
  const catalog = buildCatalog(manifest)
  return naturalidadeSelectLines(listLocalizacoes(catalog))
}

describe.skipIf(!fs.existsSync(path.join(repoDir, 'vault-data-cyberpunk', 'index.json')))(
  'naturalidade no POA 1987 (report de50ef5d)',
  () => {
    it('bairros de Porto Alegre são selecionáveis', () => {
      const sel = linhas('vault-data-cyberpunk').filter((l) => l.value !== null && !l.disabled)
      const nomes = sel.map((l) => l.label)
      expect(nomes.some((n) => n.includes('Restinga'))).toBe(true)
      expect(nomes.some((n) => n.includes('Moinhos de Vento'))).toBe(true)
      expect(sel.length).toBeGreaterThan(10)
    })
  },
)

describe('naturalidade na fantasia segue como era', () => {
  it('cidades do Mundo Livre selecionáveis; nada de vazio', () => {
    const sel = linhas('vault-data').filter((l) => l.value !== null && !l.disabled)
    expect(sel.length).toBeGreaterThan(5)
  })
})
