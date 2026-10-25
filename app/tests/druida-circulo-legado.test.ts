// DRUIDA (vault 2026-10-25): o Círculo Druídico CONCEDE as duas essências da
// interface (Oceano: Torrencial + Enraizante) e dá slots de magia A no N3 e
// no N5. Fichas antigas guardam os picks como `Escolha.01/02.[[Círculo …]]`:
// o que virou concessão fixa não gasta slot (reembolso) e o resto migra pra
// Slot.A. Leonel (Oceano, nível 3): tinha Torrencial (01) e Congelante (02)
// → Torrencial é concessão; Congelante gasta o slot do N3.
import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as VaultDoc

it('Leonel: Congelante gasta o slot do nível 3; Torrencial e Enraizante vêm do círculo', async () => {
  const fm = {
    ...((await load('Sistema/Criaturas/Heróis/Leonel Bravolla')).frontmatter as Record<string, unknown>),
    Habilidades: {
      Lista: [
        { '[[Círculo Druídico]]': 'Regra.[[Druida]]' },
        { '[[Essência Torrencial Adepta]]': 'Escolha.01.[[Círculo do Oceano (Água e Terra)]]' },
        { '[[Essência Congelante Adepta]]': 'Escolha.02.[[Círculo do Oceano (Água e Terra)]]' },
        { '[[Círculo do Oceano (Água e Terra)]]': 'Escolha.[[Círculo Druídico]]' },
      ],
      Especiais: [],
    },
  }
  const { projection } = await projectHeroRules(fm, catalog, load)
  expect(projection.habilidadeChoices.filter((x) => x.sourceNote.startsWith('Círculo do Oceano'))).toEqual([])
  const lista = (projection.derivedFm['Habilidades'] as { Lista: Record<string, string>[] }).Lista
  const fonte = (alvo: string) => lista.find((r) => Object.keys(r)[0] === `[[${alvo}]]`)?.[`[[${alvo}]]`]
  expect(fonte('Essência Congelante Adepta')).toBe('Slot.A')
  expect(fonte('Essência Torrencial Adepta')).toMatch(/^Regra\.\[\[Círculo do Oceano/)
  expect(fonte('Essência Enraizante Adepta')).toMatch(/^Regra\.\[\[Círculo do Oceano/)
  expect(fonte('Essência Hidratante Adepta')).toBeUndefined() // nada de padrão inventado
  expect((projection.derivedFm['Magias'] as { Slots: Record<string, number> }).Slots.A).toBe(1)
}, 60000)
