// @vitest-environment jsdom
// #303 regressão: o ícone supercharged (emoji do doc-alvo) precisa CHEGAR no DOM
// como data-link-icon no <a> — o CSS a[data-link-icon]::before o prepende. O
// teste unitário de link-icon.ts só cobria o cálculo do emoji; aqui garante que
// o atributo sobrevive ao render (MarkdownBody → DetailLink), que era o bug.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

function makeStorage(): Storage {
  const d = new Map<string, string>()
  return {
    get length() {
      return d.size
    },
    clear: () => d.clear(),
    getItem: (k: string) => (d.has(k) ? d.get(k)! : null),
    key: (i: number) => [...d.keys()][i] ?? null,
    removeItem: (k: string) => void d.delete(k),
    setItem: (k: string, v: string) => void d.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(cleanup)

function renderBody(body: string) {
  const doc = {
    id: 'x',
    path: 'x.md',
    basename: 'x',
    type: null,
    subtype: null,
    grupo: null,
    kind: 'content',
    frontmatter: {},
    body,
    inlineFields: {},
    ruleElements: [],
  } as unknown as VaultDoc
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter>
          <MarkdownBody doc={doc} />
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('#303 ícone supercharged sobrevive ao render', () => {
  it('wikilink pra doc ganha data-link-icon no <a> (linkIcons ON por padrão)', async () => {
    const { container } = renderBody('Veja [[Bardo]].')
    const a = await waitFor(() => {
      const el = container.querySelector('a')
      expect(el, 'o wikilink virou <a>').toBeTruthy()
      return el as HTMLElement
    })
    // Bardo é uma Classe → emoji de categoria (👑); o atributo tem que existir
    expect(a.getAttribute('data-link-icon')).toBeTruthy()
  })

  it('com linkIcons DESLIGADO, o <a> não tem data-link-icon', async () => {
    window.localStorage.setItem('pleitost.settings.linkIcons', 'false')
    __resetSettingsForTests()
    const { container } = renderBody('Veja [[Bardo]].')
    const a = await waitFor(() => {
      const el = container.querySelector('a')
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    expect(a.getAttribute('data-link-icon')).toBeNull()
  })
})
