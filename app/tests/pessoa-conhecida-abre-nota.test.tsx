// @vitest-environment jsdom
// Report 4bdc3927 (2026-09-17): "Quando clico em uma pessoa conhecida não
// abre as notas dela, tá abrindo anotações." O clique no nome (PessoasPanel,
// aba Anotações) abria o RESUMO (PessoaResumo — Relação/Organização/Posição/
// Detalhes, exatamente as anotações que o herói escreveu), não a NOTA da
// pessoa. Fix: pessoa com nota própria abre `kind: 'doc'` (DocView/PessoaView
// completa); membros de GRUPO (criaturas) continuam no resumo de ficha.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail } from '../src/data/detail-context'
import { PessoasPanel } from '../src/components/ficha/PessoasPanel'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
  pessoaFrontmatter,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage?.clear?.()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

/** Espião do DetailContext: captura o target aberto. */
let aberto: { kind: string; id: string } | null = null
function EspiaoDetail({ children }: { children: React.ReactNode }) {
  const detail = useDetail()
  if (detail) {
    const original = detail.open.bind(detail)
    detail.open = (t) => {
      aberto = t as { kind: string; id: string }
      original(t)
    }
  }
  return <>{children}</>
}

describe('clique na pessoa conhecida (report 4bdc3927)', () => {
  it('pessoa com nota abre a NOTA (kind doc), não o resumo', async () => {
    aberto = null
    const heroiId = createLocalEntity('Heroi', 'Protagonista', emptyHeroFrontmatter())
    const pessoaId = createLocalEntity('Pessoa', 'Zé da Esquina', pessoaFrontmatter({ 'Relação': 'Aliado', 'Organização': '', 'Posição': '', Detalhes: '' }))
    setLocalEntityFm(heroiId, 'Pessoas', [
      { Nome: 'Zé da Esquina', 'Relação': 'Aliado', Alvo: pessoaId },
    ])
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DetailProvider>
            <EspiaoDetail>
              <PessoasPanel doc={getLocalDoc(heroiId)!} />
            </EspiaoDetail>
          </DetailProvider>
        </MemoryRouter>
      </CatalogProvider>,
    )
    fireEvent.click(await screen.findByText('Zé da Esquina'))
    expect(aberto).not.toBeNull()
    expect(aberto!.kind).toBe('doc')
    expect(aberto!.id).toBe(pessoaId)
  })
})
