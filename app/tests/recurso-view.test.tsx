// @vitest-environment jsdom
// RecursoView (2026-09-07): nota de Recurso no compêndio — campos do FM como
// cards com o preço na moeda do mundo, descrição em prosa, Especificação em
// cards; nada de template cru (`= this.`) nem tag #Recurso.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const docFile = path.join(cyberDir, 'Contexto/Recursos/Transporte/Gurgel Carajás.json')
const tem = fs.existsSync(docFile)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

describe('RecursoView (Gurgel Carajás real)', () => {
  it('cards do FM em Cz$, sem template cru; especificação em cards', () => {
    if (!tem) return
    const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
    const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
    setActiveContexto(def)
    const catalog = { ...buildCatalog(manifest), contextoDef: def }
    const doc = JSON.parse(fs.readFileSync(docFile, 'utf8')) as VaultDoc
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocView doc={doc} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(screen.queryByText(/= this\./)).toBeNull()
    expect(screen.queryByText(/#Recurso/)).toBeNull()
    expect(screen.getByText('Recurso · Transporte')).toBeTruthy()
    expect(screen.getByText('PREÇO')).toBeTruthy()
    expect(screen.getByText('Cz$ 400.000 · única')).toBeTruthy()
    expect(screen.getByText('Cz$ 150.000')).toBeTruthy() // Usado
    expect(screen.getByText('Cz$ 3.000 por mês')).toBeTruthy() // Manutenção (posse paga por mês)
    expect(screen.getByText('// ESPECIFICAÇÃO')).toBeTruthy()
    expect(screen.getByText('MODELO')).toBeTruthy()
    expect(screen.getByText(/carroceria de fibra Plasteel/)).toBeTruthy()
  })
})
