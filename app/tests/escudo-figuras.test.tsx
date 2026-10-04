// @vitest-environment jsdom
// ESCUDO DO MESTRE — figuras de aventura TRANCADA (cifradas com a chave do
// doc) também resolvem no painel CENA: o escudo publica os arquivos do doc
// destravado (ArquivosCifradosProvider) como a DocPage — sem isso o VaultImage
// não acha o alvo e a figura some.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { cifrarBytes, cifrarDoc, nomeCifrado } from '../../extractor/cifra-doc.mjs'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { __resetDocLocksForTests, unlockWithSenha } from '../src/data/doc-lock'
import { __resetArquivosCifradosForTests } from '../src/data/arquivos-cifrados'
import { __resetSettingsForTests } from '../src/settings'
import { setLiveSession, type LiveSession } from '../src/data/session-repo/live-session'
import { SubCena } from '../src/components/mestre/escudo/SubCena'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const ID = 'Campanhas/Aventuras/Trancada'
const SENHA = 's3nha'
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8])
const K = new Uint8Array(32).fill(7)
const BLOB = new Uint8Array(cifrarBytes(Buffer.from(K), Buffer.from(PNG)))
const ENC = `assets-cifrados/${nomeCifrado(ID, 'Imagens/Nico.png')}.enc`

const body = [
  '# 1. Resumo',
  '',
  '> [!abstract] Resumo',
  '> Uma noite.',
  '',
  '# 3. Cenas',
  '## Cena 1 — Saída',
  '> [!info] Cena',
  '> **Tipo:** Social',
  '',
  '![[Nico.png|Na multidão]]',
  '',
].join('\n')

const record = {
  id: ID,
  path: `${ID}.md`,
  basename: 'Trancada',
  type: 'Aventura',
  subtype: null,
  grupo: null,
  frontmatter: { categoria: 'Aventura', Senha: SENHA, Chamada: 'teaser' },
  inlineFields: {},
  ruleElements: [],
  links: [],
  images: [{ target: 'Nico.png', from: 'body' }],
  headings: [],
  body,
}
const CIFRADO = cifrarDoc(record, {
  camposPublicos: ['Chamada'],
  senhaDev: 'dev-teste',
  chave: Buffer.from(K),
  privadoExtra: { arquivos: [{ target: 'Nico.png', path: 'Imagens/Nico.png', copiedTo: ENC }] },
}) as unknown as VaultDoc

const entry: IndexDocEntry = { id: ID, path: `${ID}.md`, kind: 'content', basename: 'Trancada', type: 'Aventura', subtype: null, protegido: true }
const manifest: IndexManifest = { vaultRoot: '.', counts: {}, byType: {}, docs: [entry] } as unknown as IndexManifest
const catalog = buildCatalog(manifest)

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, '').replace(/\?.*$/, ''))
    if (rel === `${ID}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(CIFRADO)) }
    if (rel === ENC) return { ok: true, status: 200, arrayBuffer: async () => BLOB.buffer.slice(0) }
    if (rel === 'assets.json') return { ok: true, status: 200, json: async () => ({ counts: {}, assets: [], missing: [] }) }
    return { ok: false, status: 404, json: async () => ({}) }
  }) as typeof fetch
})
beforeEach(() => {
  URL.createObjectURL = (() => 'blob:figura-escudo') as typeof URL.createObjectURL
  window.localStorage.clear()
  __resetSettingsForTests()
  __resetDocLocksForTests()
  __resetArquivosCifradosForTests()
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

describe('ESCUDO — figura cifrada na CENA', () => {
  it('aventura destravada: a figura da cena atual aparece decifrada', async () => {
    await unlockWithSenha(CIFRADO, SENHA, false)
    setLiveSession({
      sessionId: 's1',
      gmUserId: 'gm-1',
      characters: [],
      members: [],
      encounters: [],
      state: { aventura: { docId: ID, titulo: 'Trancada', cenaAtual: 'saida', concluidas: [], iniciadaEm: '2026-10-04T00:00:00Z' } },
    } as unknown as LiveSession)
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <SubCena />
        </MemoryRouter>
      </CatalogProvider>,
    )
    await waitFor(() => expect(container.querySelector('[data-escudo-cena-atual="saida"]')).toBeTruthy())
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:figura-escudo'))
  })
})
