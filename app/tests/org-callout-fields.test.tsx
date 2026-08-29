// @vitest-environment jsdom
// Report 2026-08-29: "vários itens de contexto sem as informações" — as
// Organizações da POA guardam Objetivo/Influência/Descrição como PROSA LITERAL
// no segundo callout do corpo (o FM correspondente fica vazio):
//   >**Objetivo de Longo Prazo:** Exportar equipamentos táticos.
// A OrgView só lia FM → os cards sumiam. Agora os campos literais do callout
// entram como cards TAMBÉM, com o rótulo da própria nota (fonte de verdade),
// sem duplicar os que o FM já forneceu.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const manifest = JSON.parse(
  fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

const renner = readDoc('Contexto/Organizações/Empresas/Renner')

beforeAll(() => {
  globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as typeof fetch
})

afterEach(cleanup)

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('OrgView lê os campos literais do callout (template POA)', () => {
  it('sanidade: Renner tem a prosa no callout e o FM correspondente vazio', () => {
    expect(renner.type).toBe('Organização')
    expect(renner.body).toContain('**Objetivo de Longo Prazo:** Exportar equipamentos táticos.')
    expect(renner.frontmatter['Objetivo_de_Longo_Prazo']).toBeFalsy()
  })

  it('cards do FM (Resumo/Líder) E do callout (Objetivos/Influência/Descrição)', () => {
    renderDoc(renner)
    // FM
    expect(screen.getByText('Especialista em vestuário industrial e uniformes.')).toBeTruthy()
    expect(screen.getByText('Eduardo Renner')).toBeTruthy()
    // callout literal — rótulo da própria nota + valor
    expect(screen.getByText('Objetivo de Longo Prazo')).toBeTruthy()
    expect(screen.getByText('Exportar equipamentos táticos.')).toBeTruthy()
    expect(screen.getByText('Objetivo Imediato')).toBeTruthy()
    expect(screen.getByText('Influência')).toBeTruthy()
    expect(screen.getByText(/Fornece fardas a escolas técnicas/)).toBeTruthy()
    expect(screen.getByText(/Produz tecidos anti-perfuração/)).toBeTruthy()
    // nada de template cru nem empty state
    expect(screen.queryByText(/= this\./)).toBeNull()
    expect(screen.queryByText('// ORGANIZAÇÃO SEM INFORMAÇÕES REGISTRADAS')).toBeNull()
  })

  it('não duplica campo que o FM já forneceu (Resumo aparece uma vez)', () => {
    renderDoc(renner)
    expect(screen.getAllByText(/Especialista em vestuário industrial/).length).toBe(1)
  })
})
