// @vitest-environment jsdom
// FIGURAS DA CAMPANHA (2026-09-08c) — ida e volta REAL: o extractor cifra os
// bytes da imagem com a chave do doc trancado (cifrarBytes) e o app só mostra
// a figura DEPOIS de destravar (senha da aventura ou Modo Desenvolvedor).
// Trancada: nem o embed nem o arquivo existem pro app.
import { useEffect } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cifrarBytes, cifrarDoc, nomeCifrado } from '../../extractor/cifra-doc.mjs'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocPage } from '../src/components/compendium/DocPage'
import { __resetDocLocksForTests, setDevSenha } from '../src/data/doc-lock'
import { __resetArquivosCifradosForTests } from '../src/data/arquivos-cifrados'
import { __resetSettingsForTests, useSettings } from '../src/settings'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const ID = 'Campanhas/Aventuras/Trancada'
const SENHA = 's3nha'
const DEV = 'dev-teste'
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
  '# 2. Contexto',
  '## 2.3 Personagens',
  '### Nico',
  '> [!info] Personagem',
  '> **Papel:** guia',
  '',
  '![[Nico.png|Nico, o guia]]',
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
  senhaDev: DEV,
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
// captura o Blob entregue ao createObjectURL pra provar que os bytes voltaram
let blobDaFigura: Blob | null = null
beforeEach(() => {
  blobDaFigura = null
  URL.createObjectURL = ((b: Blob) => {
    blobDaFigura = b
    return 'blob:figura-teste'
  }) as typeof URL.createObjectURL
  window.localStorage.clear()
  __resetSettingsForTests()
  __resetDocLocksForTests()
  __resetArquivosCifradosForTests()
})
afterEach(() => cleanup())

/** Bytes de um Blob (o Blob do jsdom não tem arrayBuffer()). */
function bytesDoBlob(b: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer))
    fr.onerror = () => reject(fr.error)
    fr.readAsArrayBuffer(b)
  })
}

function DevOn() {
  const { setDesenvolvedor } = useSettings()
  useEffect(() => setDesenvolvedor(true), [setDesenvolvedor])
  return null
}

function renderDoc(dev = false) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[`/doc/${ID}`]}>
        {dev ? <DevOn /> : null}
        <Routes>
          <Route path="/doc/*" element={<DocPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('figuras de aventura trancada', () => {
  it('o envelope público não cita a imagem e nada renderiza enquanto trancada', async () => {
    const json = JSON.stringify(CIFRADO)
    expect(json).not.toContain('Nico')
    expect(json).not.toContain('Imagens/')
    const { container } = renderDoc()
    await screen.findByLabelText('Senha da aventura')
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.querySelector('[data-av-figura]')).toBeNull()
  })

  it('senha certa: a figura do registro e a da cena aparecem decifradas', async () => {
    const { container } = renderDoc()
    fireEvent.change(await screen.findByLabelText('Senha da aventura'), { target: { value: SENHA } })
    fireEvent.click(screen.getByRole('button', { name: 'DESTRAVAR' }))
    await waitFor(() => expect(document.querySelector('[data-av-formato]')).toBeTruthy())
    await waitFor(() => expect(container.querySelectorAll('img').length).toBeGreaterThan(0))
    const figs = [...container.querySelectorAll('[data-av-figura]')]
    expect(figs.map((f) => f.getAttribute('data-av-figura'))).toEqual(['Nico.png', 'Nico.png'])
    expect(container.textContent).toContain('Nico, o guia')
    expect(container.textContent).toContain('Na multidão')
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('blob:figura-teste')
    // decifrada de verdade: os bytes do PNG voltam, com o tipo certo
    const blob = blobDaFigura as Blob | null
    expect(blob?.type).toBe('image/png')
    expect(await bytesDoBlob(blob!)).toEqual(PNG)
  })

  it('Modo Desenvolvedor destrava a figura sem senha', async () => {
    await setDevSenha(DEV)
    const { container } = renderDoc(true)
    await waitFor(() => expect(document.querySelector('[data-av-formato]')).toBeTruthy())
    await waitFor(() => expect(container.querySelectorAll('img').length).toBeGreaterThan(0))
  })
})
