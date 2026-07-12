// Bug #4: as magias concedidas pelas essências (via `Complementar Magias.Lista
// [[X]]` nas notas das essências) NÃO estavam sendo distribuídas nas escolas ao
// PROJETAR — só apareciam se já estivessem "assadas" no FM salvo (chars criados
// pelo plugin). Um char criado no app (essências escolhidas, magias não salvas)
// ficava sem as magias. O app agora re-deriva: rule-applier carrega a fonte por
// item (`Regra.[[essência]]`) e a projeção distribui o delta plano `Magias.Lista`
// nas escolas certas (subcategoria da nota da magia = escola), espelhando o
// enrichMagias + serialize-to-fm do plugin.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const ZUKO_ID = 'Sistema/Criaturas/Heróis/Zuko'
const zuko = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${ZUKO_ID}.json`), 'utf8')) as VaultDoc
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

/** Zuko como se fosse criado no app: mantém as essências escolhidas em
 *  Habilidades.Lista mas ZERA as magias já assadas sob cada escola — força o
 *  app a re-derivar as magias das essências do zero. */
function zukoSemMagiasAssadas(): Record<string, unknown> {
  const fm = structuredClone(zuko.frontmatter) as any
  for (const g of fm.Magias?.Lista ?? []) if (Array.isArray(g.Lista)) g.Lista = []
  return fm
}

/** Alvos (wikilink base) das magias numa escola do FM derivado. */
function magiasNaEscola(derivedFm: any, escolaNome: string): string[] {
  const g = (derivedFm.Magias?.Lista ?? []).find((e: any) => String(e.Nome) === escolaNome)
  return (g?.Lista ?? []).map((row: any) => Object.keys(row)[0])
}
function fontesNaEscola(derivedFm: any, escolaNome: string): string[] {
  const g = (derivedFm.Magias?.Lista ?? []).find((e: any) => String(e.Nome) === escolaNome)
  return (g?.Lista ?? []).map((row: any) => Object.values(row)[0] as string)
}

let derivedFm: any
beforeAll(async () => {
  const out = await projectHeroRules(zukoSemMagiasAssadas(), catalog, loadFromDisk)
  derivedFm = out.projection.derivedFm
})

describe('magias das essências re-derivadas na projeção (bug #4)', () => {
  it('as magias concedidas pelas essências entram na escola Anima', () => {
    const anima = magiasNaEscola(derivedFm, 'Anima')
    // essências do Zuko concedem: Raio Flamejante, Cone de Fogo (Flamejante),
    // Tocha Flutuante, Combustão (Incendiária), Manifestação Básica, Invocar
    // Elemental Menor (Criação), Corte de Vento, Lufada de Vento (Ciclonal).
    expect(anima).toContain('[[Raio Flamejante]]')
    expect(anima).toContain('[[Combustão]]')
    expect(anima).toContain('[[Corte de Vento]]')
    expect(anima.length).toBeGreaterThanOrEqual(8)
  })

  it('cada magia carrega a fonte da essência que a concedeu (Regra.[[essência]])', () => {
    const g = (derivedFm.Magias.Lista as any[]).find((e) => e.Nome === 'Anima')
    const raio = g.Lista.find((row: any) => Object.keys(row)[0] === '[[Raio Flamejante]]')
    expect(String(Object.values(raio)[0])).toMatch(/^Regra\.\[\[Essência .+\]\]$/)
    // fontes distintas por essência (não todas a mesma última regra)
    const fontes = new Set(fontesNaEscola(derivedFm, 'Anima'))
    expect(fontes.size).toBeGreaterThanOrEqual(2)
  })

  it('não vaza magia-string crua no topo de Magias.Lista (escola-groups só)', () => {
    for (const g of derivedFm.Magias.Lista as any[]) {
      expect(typeof g === 'object' && g !== null && !Array.isArray(g)).toBe(true)
      expect(g.Nome).toBeTruthy()
    }
  })

  it('char REAL (magias já assadas): regra re-concede mas NÃO duplica', async () => {
    // Zuko real tem as 8 magias assadas sob Anima; a regra das essências
    // re-concede as mesmas — appendMergeFmList dedup por alvo, então continua 8.
    const out = await projectHeroRules(zuko.frontmatter as Record<string, unknown>, catalog, loadFromDisk)
    const anima = magiasNaEscola(out.projection.derivedFm, 'Anima')
    expect(anima.length).toBe(8)
    expect(new Set(anima).size).toBe(anima.length) // sem duplicatas
  })
})
