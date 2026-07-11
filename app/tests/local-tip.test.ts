// #140: o tooltip da Naturalidade (e das paradas do mapa) usa o FM da
// localização (nome/tipo/Descrição/Recursos), NÃO o corpo (callouts + inline
// dataview) que não renderiza bem em tooltip.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { localTipHtml } from '../src/components/ficha/local-tip'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const load = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${rel}.json`), 'utf8')) as VaultDoc

describe('#140 localTipHtml — tooltip da localização a partir do FM', () => {
  it('Canto Alto (naturalidade do Carlos): nome do local, sem vazar callout/dataview', () => {
    const doc = load('Atlas/Mundo Livre/Principado das Flores/Canto Alto')
    const html = localTipHtml(doc)!
    expect(html).toContain('Canto Alto')
    expect(html).toContain('loc-tip')
    // NÃO renderiza o corpo (callouts/dataview) — a origem do bug do #140
    expect(html).not.toContain('[!abstract]')
    expect(html).not.toContain('= this.')
    expect(html).not.toContain('```')
  })

  it('doc ausente → null (sem tooltip pra naturalidade texto-livre)', () => {
    expect(localTipHtml(undefined)).toBeNull()
  })
})
