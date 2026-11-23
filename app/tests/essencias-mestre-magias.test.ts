// Essências Mestre compostas concedem a magia Mestre (sfynz 6fbfdd71, 2026-11-19):
// Cristal → Parede Espinhosa, Gelo → Criogenia, Magma → Erupção, Meteoro →
// Chuva de Meteoritos (Terremoto e Madeira já davam Fenda Tectônica e Revolta
// da Terra). A guarda é por DADO: toda composta da pasta `Essências Mestre` que
// declara `Complementar Magias.Lista [[X]]` tem que pôr X na escola Anima da
// ficha que a gasta — nos dois mundos. Composta nova que ganhar magia entra
// sozinha.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
// Os heróis só existem no dataset da fantasia (a POA nasceu zerada): a ficha
// base é sempre o Zuko de lá; o catálogo e as notas são os do mundo testado.
const ZUKO = JSON.parse(
  fs.readFileSync(path.join(path.dirname(appDir), 'vault-data', 'Sistema/Criaturas/Heróis/Zuko.json'), 'utf8'),
) as VaultDoc

function mundo(dirName: string) {
  const dir = path.join(path.dirname(appDir), dirName)
  const temDataset = fs.existsSync(path.join(dir, 'index.json'))
  const ler = (id: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as VaultDoc
  return { dir, temDataset, ler }
}

/** `[[X]]`/`[[X|y]]` → X */
function alvo(raw: string): string {
  return /\[\[([^\]|]+)/.exec(raw)?.[1]?.trim() ?? ''
}

function magiasNaEscola(derivedFm: any, escola: string): string[] {
  const g = (derivedFm.Magias?.Lista ?? []).find((e: any) => String(e.Nome) === escola)
  return (g?.Lista ?? []).map((row: any) => alvo(Object.keys(row)[0]!))
}

for (const dirName of ['vault-data', 'vault-data-cyberpunk']) {
  const m = mundo(dirName)
  describe.skipIf(!m.temDataset)(`Essências Mestre compostas concedem a magia (${dirName})`, () => {
    const manifest = m.temDataset
      ? (JSON.parse(fs.readFileSync(path.join(m.dir, 'index.json'), 'utf8')) as IndexManifest)
      : ({ docs: [] } as unknown as IndexManifest)
    const compostas = manifest.docs
      .filter((d) => /\/Essências Mestre\/Essência /.test(d.id))
      .map((d) => {
        const doc = m.ler(d.id)
        const regras = ((doc.frontmatter as any)?.Elementos_de_Regra ?? []) as unknown[]
        const magias = regras
          .map(String)
          .filter((r) => r.startsWith('Complementar Magias.Lista '))
          .map(alvo)
        // as duas Experientes-mãe: sem elas o Requisito poda a nota inteira
        const requisitos = regras
          .map(String)
          .filter((r) => r.startsWith('Requisito Contem(Habilidades) '))
          .map(alvo)
        return { nome: d.basename ?? path.basename(d.id), magias, requisitos }
      })
      .filter((c) => c.magias.length > 0)

    it('as quatro compostas do lote de 2026-11-19 estão entre as que concedem magia', () => {
      const nomes = compostas.map((c) => c.nome)
      for (const n of ['Essência do Cristal', 'Essência do Gelo', 'Essência do Magma', 'Essência do Meteoro']) {
        expect(nomes).toContain(n)
      }
    })

    it('a regra de cada composta aponta pra uma magia que existe no catálogo', () => {
      const magiasDoCatalogo = new Set(
        manifest.docs.filter((d) => d.type === 'Magia').map((d) => d.basename),
      )
      for (const c of compostas) {
        for (const magia of c.magias) expect(magiasDoCatalogo, `${c.nome} → ${magia}`).toContain(magia)
      }
    })

    it.each(compostas.map((c) => [c.nome, c] as const))(
      'ficha com as duas Experientes que gasta %s ganha a magia Mestre na escola Anima',
      async (nome, c) => {
        const catalog = buildCatalog(manifest)
        const fm = structuredClone(ZUKO.frontmatter) as any
        fm.Habilidades ??= {}
        fm.Habilidades.Lista = [
          ...(fm.Habilidades.Lista ?? []),
          ...c.requisitos.map((r) => ({ [`[[${r}]]`]: 'Slot.E' })),
          { [`[[${nome}]]`]: 'Slot.M' },
        ]
        const out = await projectHeroRules(fm, catalog, async (id) => m.ler(id))
        const anima = magiasNaEscola(out.projection.derivedFm, 'Anima')
        for (const magia of c.magias) expect(anima).toContain(magia)
      },
    )

    it('sem as Experientes-mãe o Requisito poda a composta (não concede a magia)', async () => {
      const c = compostas.find((x) => x.nome === 'Essência do Meteoro')!
      const catalog = buildCatalog(manifest)
      const fm = structuredClone(ZUKO.frontmatter) as any
      fm.Habilidades.Lista = [...(fm.Habilidades.Lista ?? []), { [`[[${c.nome}]]`]: 'Slot.M' }]
      const out = await projectHeroRules(fm, catalog, async (id) => m.ler(id))
      expect(magiasNaEscola(out.projection.derivedFm, 'Anima')).not.toContain('Chuva de Meteoritos')
    })
  })
}
