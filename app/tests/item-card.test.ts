// Card reutilizável de item (issue #95) — testa o renderizador extraído do
// comércio com docs REAIS da vault: prosa do body (arma), campos do inline,
// "(Qualidade)" só na propriedade/avulso, e a composição arma + imbuição.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { bodyDesc, itemCardHtml, composedCardHtml } from '../src/components/item-card'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name}`)
  return readDoc(r.id)
}

const espadaCurva = byName('Espada Curva')
const azagaia = byName('Azagaia')
const adaga = byName('Adaga')
const anel = byName('Anel Canário')
const relampejante = byName('Imbuição Relampejante')

describe('bodyDesc — descrição em prosa do body (armas)', () => {
  it('extrai a prosa da arma que tem descrição', () => {
    expect(bodyDesc(espadaCurva)).toContain('Cimitarra')
  })
  it('vazio quando a arma não tem prosa', () => {
    expect(bodyDesc(azagaia)).toBe('')
  })
})

describe('itemCardHtml — card de um doc', () => {
  it('propriedade/avulso: mostra nome + "(Qualidade)" + stat do inline', () => {
    const html = itemCardHtml(anel, 'A', null, true)
    expect(html).toContain('Anel Canário')
    expect(html).toContain('shc-tier') // "(Adepto)" em linha própria
    expect(html).toContain('(Adepto)')
    expect(html).toContain('tier-A')
  })
  it('arma base: SEM "(Qualidade)" no nome, mas COM stats (Dano) e o fundo do tier', () => {
    const html = itemCardHtml(adaga, 'A', null, false)
    expect(html).toContain('Adaga')
    expect(html).not.toContain('shc-tier') // sem o span de qualidade
    expect(html).toContain('Dano')
    expect(html).toContain('tier-A') // fundo do tier fica
  })
})

describe('composedCardHtml — combo arma × imbuição', () => {
  const combo = {
    key: `${adaga.id}|${relampejante.id}`,
    label: 'Adaga Relampejante',
    tier: 'A' as const,
    armaTarget: adaga.id,
    imbTarget: relampejante.id,
  }
  const docsById = new Map<string, VaultDoc>([
    [adaga.id, adaga],
    [relampejante.id, relampejante],
  ])

  it('renderiza DUAS cartas (arma + imbuição), só a imbuição com "(Qualidade)"', () => {
    const html = composedCardHtml(combo, docsById, undefined)
    expect(html).toContain('shc-wrap')
    expect((html.match(/class="shc-card/g) ?? []).length).toBe(2)
    expect(html).toContain('Adaga')
    expect(html).toContain('Relampejante')
    // exatamente 1 selo de qualidade "(Adepto)" — o da imbuição (arma não tem)
    expect((html.match(/shc-tier/g) ?? []).length).toBe(1)
  })
})
