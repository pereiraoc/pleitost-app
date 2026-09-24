// @vitest-environment jsdom
// #466 — COSTURAS: onde a interpolação entra. (a) card de hover
// (itemCardHtml) com contexto → valor + original entre parênteses, com
// tooltip; sem contexto → texto da nota como sempre. (b) MarkdownBody
// (DETALHES/compêndio) com `formulaCtx`. (c) magiaGroups (Combate) carrega o
// contexto por escola do bloco.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { itemCardHtml } from '../src/components/item-card'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import { magiaGroups } from '../src/components/ficha/CombateTab'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const lerDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const COMBUSTAO = 'Sistema/Criação de Personagem/Magia/Magia Anima/Magia Anima Adepta/Combustão'

afterEach(cleanup)

describe('#466 — costuras', () => {
  it('itemCardHtml: com contexto, "1d6×potência" vira 4d6 com tooltip e original; sem contexto, fica a prosa', () => {
    const doc = lerDoc(COMBUSTAO)
    const com = itemCardHtml(doc, 'A', null, false, true, undefined, false, { potencia: 4, mod: 3 })
    expect(com).toContain('<span class="shc-formula" title="potência 4">4d6</span>')
    expect(com).toContain('(potência × 1d6)')
    expect(com).not.toContain('1d6×potência')
    const sem = itemCardHtml(doc, 'A', null, false, true)
    expect(sem).toContain('1d6×potência')
    expect(sem).not.toContain('shc-formula')
  })

  it('MarkdownBody com formulaCtx interpola o corpo', async () => {
    const doc = lerDoc(COMBUSTAO)
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <MarkdownBody doc={doc} formulaCtx={{ potencia: 4, mod: 3 }} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText(/4d6 \(potência × 1d6\)/)).toBeTruthy()
  })

  it('magiaGroups: cada linha carrega o contexto da escola do bloco', () => {
    const fm = {
      Atributos: { FOR: 0, AGI: 2, INT: 1, PRE: 3 },
      Magias: {
        Potencia: 8,
        Lista: [{ Nome: 'Anima', Atributo: 'PRE', Lista: [{ '[[Combustão]]': 'Slot.A' }] }],
      },
    }
    const refDoc = (raw: string) => {
      const r = catalog.resolve(raw)
      return r.kind === 'doc' ? lerDoc(r.id) : undefined
    }
    const grupos = magiaGroups(fm, refDoc as never)
    const linha = grupos.flatMap((g) => g.magias).find((m) => m.n.includes('Combustão'))
    expect(linha?.formulaCtx).toEqual({ potencia: 8, mod: 3 })
  })
})
