// DRUIDA (vault 2026-10-25): o Círculo Druídico passou a CONCEDER as duas
// essências da interface (Oceano: Torrencial + Enraizante) no lugar das duas
// escolhas do nível 1. Fichas antigas guardam esses picks como
// `Escolha.01/02.[[Círculo …]]`; a escolha que restou (nível 3) não pode
// herdar um pick que agora é concessão fixa, e não pode cair num padrão que
// o jogador nunca escolheu. Leonel (Oceano, nível 3): tinha Torrencial (01)
// e Congelante (02) → Torrencial vira concessão; Congelante é o pick do N3.
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

it('Leonel: Congelante vira o pick do nível 3; Torrencial e Enraizante vêm do círculo', async () => {
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
  const c = projection.habilidadeChoices.find((x) => x.sourceNote.startsWith('Círculo do Oceano'))!
  expect(c.pick).toBe('[[Essência Congelante Adepta]]')
  expect(c.source).toBe('inferred')
  const alvos = JSON.stringify((projection.derivedFm['Habilidades'] as { Lista: unknown[] }).Lista)
  expect(alvos).toContain('Essência Enraizante Adepta')
  expect(alvos).toContain('Essência Torrencial Adepta')
  expect(alvos).not.toContain('Essência Hidratante Adepta') // nada de padrão inventado
}, 60000)
