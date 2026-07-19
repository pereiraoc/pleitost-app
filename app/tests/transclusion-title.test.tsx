// @vitest-environment jsdom
// Bug: a nota-índice do compêndio "Especialização e Maestria" embute as
// especialidades via ![[X]]; o app escondia o título de cada embed
// (hideLeadingTitle), então saíam sem nome. Agora a transclusão MANTÉM o título
// do alvo (como no Obsidian). Folder-notes não são afetadas (lá o embed vira null).
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
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
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

function renderBody(body: string) {
  const doc = {
    id: 'x', path: 'x.md', basename: 'x', type: null, subtype: null, grupo: null,
    kind: 'content', frontmatter: {}, body, inlineFields: {}, ruleElements: [],
  } as unknown as VaultDoc
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <MarkdownBody doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('transclusão mantém o título do alvo (compêndio)', () => {
  it('![[Impulso]] mostra "Impulso" como cabeçalho do bloco embutido', async () => {
    const { container } = renderBody('## [[Atletismo]]:\n![[Impulso]]')
    await waitFor(() => expect(container.querySelector('.note-embed')).toBeTruthy())
    const embed = container.querySelector('.note-embed') as HTMLElement
    // o nome do alvo aparece como heading dentro do embed (antes era escondido)
    await waitFor(() => {
      const h = [...embed.querySelectorAll('h1,h2,h3,h4,h5,h6')].some((el) =>
        /Impulso/.test(el.textContent ?? ''),
      )
      expect(h).toBe(true)
    })
  })
})
