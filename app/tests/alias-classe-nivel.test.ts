// @vitest-environment node
// ALIAS CLASSE COMPOR com GATE DE NÍVEL (bug Carlos/Menestrel, 2026-08-15):
// todo slot de composição pode ter vários writers gated por nível (Bardo tem
// N1 "Bardo" → N4 "Trovador" → N7 "Menestrel" no slot 0; o CA tem N1
// "Pequeno" → N4 "Médio" no slot 1). O vencedor do slot tem que ser o de
// MAIOR nível satisfeito — não o último visitado pelo BFS (ordem de aplicação
// é acidente de travessia). A BASE do wikilink segue sendo o fragmento de
// nível mais baixo (o nome canônico da classe-mãe, ex.: "Bardo").
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { str } from '../src/components/ficha/hero-model'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const fixture = (rel: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes', rel), 'utf8')) as VaultDoc

describe('Alias Classe Compor — vencedor do slot por NÍVEL', () => {
  it('Carlos (Bardo N7): o título do nível 7 vence o slot 0 → "Menestrel …"', async () => {
    const carlos = fixture('Carlos Facão de Andradas.json')
    const { projection } = await projectHeroRules(
      carlos.frontmatter as Record<string, unknown>,
      catalog,
      loadFromDisk,
    )
    const classe = str((projection.derivedFm as Record<string, unknown>)['Classe'])
    // base preservada (o wikilink resolve na classe-mãe) + display do N7
    expect(classe).toBe('[[Bardo|Menestrel Inspirador de Luta Artística]]')
  })

  it('Metis (CA N7): o tamanho N4 segue vencendo o slot 1 → "Canino Médio"', async () => {
    const metis = await loadFromDisk('Sistema/Criaturas/Companheiros Animais/Metis, a Graxaim')
    const { projection } = await projectHeroRules(
      metis.frontmatter as Record<string, unknown>,
      catalog,
      loadFromDisk,
    )
    const classe = str((projection.derivedFm as Record<string, unknown>)['Classe'])
    expect(classe).toBe('[[Companheiro Animal Canino|Canino Médio]]')
  })
})
