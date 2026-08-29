// @vitest-environment jsdom
// #519: notas da vault POA (template de impressão) carregam divs
// `<div style="page-break-after: always;"></div>` entre as seções. O
// react-markdown (sem rehype-raw) vaza HTML cru como TEXTO — o Contexto Atual
// aparecia cheio de divs literais no meio da prosa. O render deve remover os
// artefatos de impressão antes do parse.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const manifest = JSON.parse(
  fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

const contextoAtual = readDoc('Contexto/Histórias/Contexto Atual/Contexto Atual')

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

describe('artefatos de impressão da vault POA', () => {
  it('sanidade: o body real do Contexto Atual TEM os divs de page-break', () => {
    expect(contextoAtual.body).toContain('page-break-after')
  })

  it('o render não vaza os divs como texto', () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <MarkdownBody doc={contextoAtual} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(screen.queryByText(/page-break-after/)).toBeNull()
    expect(document.body.textContent).not.toContain('page-break')
    expect(document.body.textContent).not.toContain('<div')
  })
})
