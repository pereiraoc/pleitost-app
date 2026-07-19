// @vitest-environment node
// #313: cada Especialidade libera SÓ as suas 2 Maestrias (não as 4 da perícia).
// O vínculo vem da hierarquia de pastas real da vault
// `<Perícia>/<Especialidade>/<Maestria>.md`, lida em listEspecializacoesByPericia.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { listEspecializacoesByPericia } from '../src/rules/projection'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

describe('maestriasByEspecialidade (#313)', () => {
  const { maestriasByEspecialidade, maestrias } = listEspecializacoesByPericia(catalog)

  it('cada especialidade libera só as suas 2 matérias (dados reais da vault)', () => {
    // Atletismo → Impulso {Inércia, Salto Aéreo} e Travessia {Corredor, Triatlo}.
    expect(maestriasByEspecialidade['Impulso']).toEqual(['[[Inércia]]', '[[Salto Aéreo]]'])
    expect(maestriasByEspecialidade['Travessia']).toEqual(['[[Corredor]]', '[[Triatlo]]'])
  })

  it('é um SUBCONJUNTO das maestrias da perícia (2 de 4), não todas', () => {
    // chave por-perícia = slugifyNome (sem acento, mantém caixa): "Atletismo".
    const atletismo = maestrias['Atletismo'] ?? []
    expect(atletismo.length).toBe(4) // as 4 da perícia continuam no mapa por-perícia
    expect(maestriasByEspecialidade['Impulso']!.length).toBe(2)
    for (const m of maestriasByEspecialidade['Impulso']!) expect(atletismo).toContain(m)
  })

  it('perícia PLANA (Arcana, débito): a maestria plana casa a especialidade irmã', () => {
    // Arcana é `Arcana/Truque Mágico` + `Arcana/Utensílio Mágico` (sem subpasta
    // de especialidade). A especialidade Truque Mágico deve liberar Utensílio Mágico.
    expect(maestriasByEspecialidade['Truque Mágico']).toContain('[[Utensílio Mágico]]')
  })
})
