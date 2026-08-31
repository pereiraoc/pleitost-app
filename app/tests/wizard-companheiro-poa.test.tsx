// @vitest-environment jsdom
// Report 2026-09-01: o passo do Companheiro no wizard ainda falava de PET no
// POA 1987 (🐾, "companheiro", tipos Canino/Felino…). No mundo com rename o
// passo vira EMPREGADO: lore própria, 👤, títulos compostos pelo reskin e
// cards de tipo com o nome do contrato. Na fantasia nada muda.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { PassoCompanheiro } from '../src/components/wizard/steps/PassoCompanheiro'
import type { WizardCtx } from '../src/components/wizard/steps'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoDir, 'vault-data', 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const cybContexto = path.join(repoDir, 'vault-data-cyberpunk', 'contexto.json')
// O def viaja DENTRO do Catalog (o Provider ativa o reskin dele ao montar) —
// setActiveContexto manual seria resetado pelo próprio Provider.
const catalogPoa = fs.existsSync(cybContexto)
  ? { ...catalog, contextoDef: JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef }
  : catalog

beforeAll(() => {
  globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as typeof fetch
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
  __resetLocalStoreForTests()
})

function renderPasso(cat: typeof catalog = catalog): void {
  const caId = createLocalEntity('CompanheiroAnimal', 'Novo Companheiro', {
    ...emptyCompanheiroFrontmatter(''),
    Tutor: '[[Fulano]]',
  })
  const ctx = {
    fm: { nome: 'Fulano', Wizard: { companheiroId: caId } },
    rules: undefined,
    doc: { id: 'local:Heroi:x', basename: 'Fulano' },
    model: { set: () => {} },
  } as unknown as WizardCtx
  render(
    <CatalogProvider catalog={cat}>
      <MemoryRouter>
        <PassoCompanheiro ctx={ctx} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe.skipIf(!fs.existsSync(cybContexto))('passo do Empregado no POA 1987', () => {
  it('mundo com rename: lore do contrato, EMPREGADOR, 👤, sem pet', () => {
    renderPasso(catalogPoa)
    expect(screen.getByText(/Você recebe um Empregado na folha/)).toBeTruthy()
    expect(screen.getByText(/EMPREGADOR/)).toBeTruthy()
    expect(screen.getByText(/QUEM É SEU EMPREGADO\?/)).toBeTruthy()
    expect(screen.getByText('👤')).toBeTruthy()
    expect(screen.getByText(/TIPAGEM DO EMPREGADO/)).toBeTruthy()
    // nada de vocabulário de pet na cópia do passo
    expect(screen.queryByText(/companheiro animal/i)).toBeNull()
    expect(screen.queryByText('🐾')).toBeNull()
  })
})

describe('passo do Companheiro na fantasia (identidade)', () => {
  it('sem contexto: lore canônica, TUTOR e 🐾 como sempre', () => {
    renderPasso()
    expect(screen.getByText(/Você recebe um companheiro animal/)).toBeTruthy()
    expect(screen.getByText(/TUTOR/)).toBeTruthy()
    expect(screen.getByText(/QUEM É SEU COMPANHEIRO ANIMAL\?/)).toBeTruthy()
    expect(screen.getByText('🐾')).toBeTruthy()
  })
})
