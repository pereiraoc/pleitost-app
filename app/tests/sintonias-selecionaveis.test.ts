// Report c2d838bc (2026-09-14): os Fatores negativos e Positrônico/Negatrônico
// da POA apareciam como SINTONIA selecionável no wizard. As notas de
// Sistema/…/Sintonia/Tipagens/ tinham `categoria: Sintonia` com subcategoria
// vazia — e o seletor lista exatamente "Sintonia sem subcategoria" (é como os
// Traços Elementais ficam de fora). Fix nos DADOS (vault POA): as Tipagens
// ganharam `subcategoria: Tipagem`. Este teste trava a integridade: nos dois
// datasets, as Sintonias ELEGÍVEIS (sem subcategoria) são só os 4 Traços.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)

const TRACOS = [
  'Traço Elemental da Terra',
  'Traço Elemental da Água',
  'Traço Elemental do Fogo',
  'Traço Elemental do Vento',
]

// espelho do filtro de listNotesByCategoria (projection.ts): "sem subcategoria"
const semSubcategoria = (raw: unknown) =>
  raw == null || String(raw).trim() === '' || String(raw).trim().toLowerCase() === 'null'

describe('sintonias selecionáveis (report c2d838bc)', () => {
  for (const dir of ['vault-data', 'vault-data-cyberpunk']) {
    it(`${dir}: só os 4 Traços Elementais são Sintonia sem subcategoria`, () => {
      const m = JSON.parse(
        fs.readFileSync(path.join(repoDir, dir, 'index.json'), 'utf8'),
      ) as IndexManifest
      const elegiveis = m.docs
        .filter((d) => d.type === 'Sintonia' && semSubcategoria(d.subtype))
        .map((d) => d.basename)
        .sort()
      expect(elegiveis).toEqual([...TRACOS].sort())
    })
  }
})
