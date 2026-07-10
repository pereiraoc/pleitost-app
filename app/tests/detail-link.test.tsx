// @vitest-environment jsdom
// #88: links internos de doc (wikilinks em campos/markdown) abrem nos DETALHES
// da sidebar QUANDO há uma (DetailProvider); fora dela, navegam pro /doc/*.
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail } from '../src/data/detail-context'
import { InlineFieldValue } from '../src/components/compendium/InlineFieldValue'
import { docPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const KRASNOGOR_ID = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'

afterEach(cleanup)

function Probe() {
  const d = useDetail()
  return <div data-target={d?.target?.id ?? ''} />
}

describe('#88 DetailLink / wikilinks abrem na sidebar', () => {
  it('COM sidebar: clicar no wikilink abre o doc nos DETALHES (não navega)', () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DetailProvider>
            <InlineFieldValue value="[[Krasnogor]]" />
            <Probe />
          </DetailProvider>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const link = screen.getByText('Krasnogor')
    expect(link.tagName).toBe('A')
    fireEvent.click(link)
    expect((document.querySelector('[data-target]') as HTMLElement).getAttribute('data-target')).toBe(
      KRASNOGOR_ID,
    )
  })

  it('SEM sidebar: o wikilink NAVEGA (Link do router, href = /doc/…)', () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <InlineFieldValue value="[[Krasnogor]]" />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const link = screen.getByText('Krasnogor') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(docPath(KRASNOGOR_ID))
  })
})
