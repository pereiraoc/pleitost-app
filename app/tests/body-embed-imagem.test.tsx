// @vitest-environment jsdom
// Embed de imagem no CORPO (![[X.png]]) tem que virar <img> com URL de asset
// de verdade. O remark-wikilinks emite `vault:<alvo>` e o override de <img> do
// MarkdownBody resolve — mas o urlTransform DEFAULT do react-markdown v10
// esvazia URLs de protocolo desconhecido ANTES do override rodar (vault: →
// ''), então toda imagem embedada no corpo sumia (src vazio). Pego no puxão
// das ilustrações da POA (2026-09-02): as 154 notas embedam a arte no corpo.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import type { IndexManifest, VaultDoc } from '../src/data/types'

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
afterEach(cleanup)

const doc = {
  id: 'Contexto/Teste',
  basename: 'Teste',
  type: 'Contexto',
  frontmatter: {},
  inlineFields: {},
  images: [{ target: 'Pencas.png', from: 'body' }],
  body: 'Prosa antes.\n\n![[Pencas.png]]\n\nProsa depois.',
} as unknown as VaultDoc

describe('embed de imagem no corpo', () => {
  it('![[Pencas.png]] renderiza <img> com src do asset (não vazio)', async () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <MarkdownBody doc={doc} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    await waitFor(() => {
      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(decodeURIComponent(img!.getAttribute('src') ?? '')).toContain('Pencas.png')
    })
  })
})
