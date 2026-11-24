// @vitest-environment jsdom
// Reportado por @thallesagm (#598): "Colar da eloquência precisa de um campo
// para indicar o idioma escolhido." + mestre (2026-11-23): "o cara pode ter
// mais de uma ferramenta e mais de um colar da eloquência, justamente porque
// eles podem ter esses detalhes diferentes. Ferramenta tem que dar pra escolher
// especificamente a perícia [e] as ações daquela perícia […]. Colar da
// eloquência tem que ser texto livre." A nota declara a escolha no FM
// (`escolha: Perícia` / `escolha: Idioma`); a escolha fica no NOME do tesouro.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { escolhaDoTesouro, lerEscolha, rotuloComEscolha } from '../src/data/tesouro-escolha'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name}`)
  return readDoc(r.id)
}
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const STORE_KEY = `pleitost.heroEdits.${CARLOS_ID}`
const carlos = readDoc(CARLOS_ID).frontmatter as Record<string, any>
const BASE = (carlos.Inventario.Tesouros as string[]).filter((t) => !/Foco da/.test(t))

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
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

describe('escolha do tesouro (FM da nota → nome do tesouro)', () => {
  it('a nota declara: Ferramenta = Perícia, Colar = texto "Idioma"; os outros, nada', () => {
    expect(escolhaDoTesouro(byName('Ferramenta Obra-prima'))).toEqual({ tipo: 'pericia' })
    expect(escolhaDoTesouro(byName('Colar da Eloquência'))).toEqual({ tipo: 'texto', rotulo: 'Idioma' })
    expect(escolhaDoTesouro(byName('Anel Canário'))).toBeNull()
  })

  it('nome ↔ escolha, ida e volta', () => {
    const P = { tipo: 'pericia' } as const
    const T = { tipo: 'texto', rotulo: 'Idioma' } as const
    const F = 'Ferramenta Obra-prima'
    const C = 'Colar da Eloquência'
    expect(rotuloComEscolha(F, P, { pericia: 'Atletismo', detalhe: 'Escalar' })).toBe('Ferramenta Obra-prima de Atletismo (Escalar)')
    expect(rotuloComEscolha(F, P, { pericia: 'Ladinagem', detalhe: '' })).toBe('Ferramenta Obra-prima de Ladinagem')
    expect(rotuloComEscolha(F, P, { pericia: '', detalhe: '' })).toBe(F)
    expect(rotuloComEscolha(C, T, { pericia: '', detalhe: 'Élfico' })).toBe('Colar da Eloquência (Élfico)')
    expect(rotuloComEscolha(C, T, { pericia: '', detalhe: '  ' })).toBe(C)
    expect(lerEscolha(F, 'Ferramenta Obra-prima de Atletismo (Escalar)', P)).toEqual({ pericia: 'Atletismo', detalhe: 'Escalar' })
    expect(lerEscolha(F, 'Ferramenta Obra-prima de Ladinagem', P)).toEqual({ pericia: 'Ladinagem', detalhe: '' })
    expect(lerEscolha(F, F, P)).toEqual({ pericia: '', detalhe: '' })
    expect(lerEscolha(C, 'Colar da Eloquência (Élfico)', T)).toEqual({ pericia: '', detalhe: 'Élfico' })
    expect(lerEscolha(C, C, T)).toEqual({ pericia: '', detalhe: '' })
  })
})

const salvo = () => JSON.parse(window.localStorage.getItem(STORE_KEY)!).fm['Inventario.Tesouros'] as string[]
function renderInventario(tesouros: string[]) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify({ fm: { 'Inventario.Tesouros': tesouros }, session: {} }))
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'inventario')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}
const linhas = (c: HTMLElement, nome: string) => [...c.querySelectorAll<HTMLElement>(`[data-tesouro="${nome}"]`)]

describe('inventário: o campo da escolha no ✎ Alterar', () => {
  it('Colar: texto livre do idioma; dois colares, cada um com o seu', async () => {
    const COLAR = '[[Colar da Eloquência|Colar da Eloquência (Experiente)]]'
    const { container } = renderInventario([...BASE, COLAR, '[[Colar da Eloquência|Colar da Eloquência (Anânico) (Adepto)]]'])
    await waitFor(() => expect(linhas(container, 'Colar da Eloquência')).toHaveLength(1), { timeout: 10000 })
    expect(screen.queryByLabelText('Idioma')).toBeNull() // fora do Alterar, só o nome
    fireEvent.click(screen.getByRole('button', { name: '✎ Alterar' }))
    const campo = await waitFor(() => within(linhas(container, 'Colar da Eloquência')[0]!).getByLabelText('Idioma'), {
      timeout: 10000,
    })
    fireEvent.change(campo, { target: { value: 'Élfico' } })
    fireEvent.blur(campo)
    await waitFor(() =>
      expect(salvo()).toEqual([
        ...BASE,
        '[[Colar da Eloquência|Colar da Eloquência (Élfico) (Experiente)]]',
        '[[Colar da Eloquência|Colar da Eloquência (Anânico) (Adepto)]]',
      ]),
    )
  })

  it('Ferramenta: perícia + atividade daquela perícia (ações da vault)', async () => {
    const { container } = renderInventario([...BASE, '[[Ferramenta Obra-prima|Ferramenta Obra-prima de Ladinagem (Adepto)]]'])
    await waitFor(() => expect(linhas(container, 'Ferramenta Obra-prima de Ladinagem')).toHaveLength(1), { timeout: 10000 })
    fireEvent.click(screen.getByRole('button', { name: '✎ Alterar' }))
    const pericia = (await screen.findByLabelText('Perícia', {}, { timeout: 10000 })) as HTMLSelectElement
    expect(pericia.value).toBe('Ladinagem')
    const atividade = (await waitFor(() => {
      const a = screen.getByLabelText('Atividade') as HTMLSelectElement
      expect([...a.options].map((o) => o.value)).toContain('Destrancar')
      return a
    }, { timeout: 10000 })) as HTMLSelectElement
    expect([...atividade.options].map((o) => o.value)).not.toContain('Escalar')
    fireEvent.change(atividade, { target: { value: 'Destrancar' } })
    await waitFor(() =>
      expect(salvo()).toContain('[[Ferramenta Obra-prima|Ferramenta Obra-prima de Ladinagem (Destrancar) (Adepto)]]'),
    )
    // trocar a perícia limpa a atividade (era de Ladinagem)
    fireEvent.change(screen.getByLabelText('Perícia'), { target: { value: 'Atletismo' } })
    await waitFor(() => expect(salvo()).toContain('[[Ferramenta Obra-prima|Ferramenta Obra-prima de Atletismo (Adepto)]]'))
  })

  it('"+ Adicionar Tesouro": um 2º Colar entra mesmo já tendo um', async () => {
    // o 1º ainda sem idioma: mesmo nome do que vai entrar — antes era "já tem"
    const { container } = renderInventario([...BASE, '[[Colar da Eloquência|Colar da Eloquência (Adepto)]]'])
    await waitFor(() => expect(linhas(container, 'Colar da Eloquência')).toHaveLength(1), { timeout: 10000 })
    fireEvent.click(screen.getByRole('button', { name: 'EQUIPAMENTOS' }))
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar Tesouro/ }))
    const item = await waitFor(() => {
      const span = [...document.querySelectorAll<HTMLElement>('button span')].find((x) => x.textContent === 'Colar da Eloquência')
      expect(span).toBeTruthy()
      return span!.closest('button')!
    })
    fireEvent.click(item)
    await waitFor(() =>
      expect(salvo().filter((t) => t.startsWith('[[Colar da Eloquência|'))).toEqual([
        '[[Colar da Eloquência|Colar da Eloquência (Adepto)]]',
        '[[Colar da Eloquência|Colar da Eloquência (Adepto)]]',
      ]),
    )
  })
})
