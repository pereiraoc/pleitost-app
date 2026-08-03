// @vitest-environment jsdom
// Report #407: "A parte de criaturas de bestiário ainda está errada na parte
// de habilidades … ver como o pleitost-autosheet lida com habilidades
// (incluindo as manualmente colocadas) normais e especiais". O app não
// renderizava Habilidades.Especiais nem tinha adição manual. Espelho do
// plugin (habilidades-card.ts:208-324 + apply-habilidades-edit.ts):
//   - dropdown "➕ Habilidade" lista as notas de Sistema/Regras/Bestiário/
//     Habilidades/ ainda não presentes (match por basename); selecionar grava
//     `{"[[Nome]]": "Manual"}` em Habilidades.Lista (idempotente);
//   - linha Manual tem 🗑️ (remove por basename); linhas de Regra não têm;
//   - seção "Habilidades Especiais" ({nome,texto}) com add/edit/remove.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  emptyMonstroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import { applyFmEdits, getHeroEdits, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { heroPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
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
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderFicha(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function mergedFm(id: string): Record<string, unknown> {
  const base = getLocalDoc(id)!
  return applyFmEdits(base.frontmatter as Record<string, unknown>, getHeroEdits(id).fm)
}

function habLista(id: string): Record<string, unknown>[] {
  const hab = (mergedFm(id)['Habilidades'] ?? {}) as Record<string, unknown>
  return (Array.isArray(hab['Lista']) ? hab['Lista'] : []) as Record<string, unknown>[]
}

function habEspeciais(id: string): Record<string, unknown>[] {
  const hab = (mergedFm(id)['Habilidades'] ?? {}) as Record<string, unknown>
  return (Array.isArray(hab['Especiais']) ? hab['Especiais'] : []) as Record<string, unknown>[]
}

async function abrirAlterarHabilidades() {
  const heading = await screen.findByText('Habilidades', { selector: 'div' })
  fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
  return heading
}

describe('#407 — habilidades manuais do bestiário (espelho do plugin)', () => {
  it('dropdown ➕ Habilidade adiciona com source Manual; 🗑️ remove', async () => {
    const id = createLocalEntity('Monstro', 'Lagarto Teste', emptyMonstroFrontmatter())
    renderFicha(id)
    await abrirAlterarHabilidades()
    const sel = (await screen.findByLabelText('Adicionar habilidade')) as HTMLSelectElement
    // opções vêm de Sistema/Regras/Bestiário/Habilidades/
    const labels = Array.from(sel.options).map((o) => o.textContent)
    expect(labels).toContain('Vigor Bruto')
    fireEvent.change(sel, { target: { value: 'Vigor Bruto' } })
    await waitFor(() => {
      const manual = habLista(id).find((r) => Object.keys(r)[0] === '[[Vigor Bruto]]')
      expect(manual?.['[[Vigor Bruto]]']).toBe('Manual')
    })
    // a linha aparece na árvore e tem o 🗑️ (só Manual tem)
    const remover = await screen.findByRole('button', { name: 'Remover Vigor Bruto' })
    fireEvent.click(remover)
    await waitFor(() => {
      expect(habLista(id).some((r) => Object.keys(r)[0] === '[[Vigor Bruto]]')).toBe(false)
    })
  })

  it('habilidade já presente sai das opções do dropdown (idempotente)', async () => {
    const fm = emptyMonstroFrontmatter()
    ;(fm['Habilidades'] as Record<string, unknown>)['Lista'] = [{ '[[Vigor Bruto]]': 'Manual' }]
    const id = createLocalEntity('Monstro', 'Lagarto Teste', fm)
    renderFicha(id)
    await abrirAlterarHabilidades()
    const sel = (await screen.findByLabelText('Adicionar habilidade')) as HTMLSelectElement
    const labels = Array.from(sel.options).map((o) => o.textContent)
    expect(labels).not.toContain('Vigor Bruto')
  })
})

describe('#407 — Habilidades Especiais ({nome, texto})', () => {
  it('add → edita nome/texto (blur) → remove, gravando Habilidades.Especiais', async () => {
    const id = createLocalEntity('Monstro', 'Lagarto Teste', emptyMonstroFrontmatter())
    renderFicha(id)
    expect(await screen.findByText('Nenhuma habilidade especial.')).toBeTruthy()
    await abrirAlterarHabilidades()
    fireEvent.click(screen.getByRole('button', { name: /Habilidade Especial/ }))
    await waitFor(() => expect(habEspeciais(id)).toHaveLength(1))
    const nome = (await screen.findByPlaceholderText('Nome')) as HTMLInputElement
    fireEvent.change(nome, { target: { value: 'Bafo Ácido' } })
    fireEvent.blur(nome)
    const texto = screen.getByPlaceholderText('Resumo') as HTMLTextAreaElement
    fireEvent.change(texto, { target: { value: 'Cone de ácido 3m.' } })
    fireEvent.blur(texto)
    await waitFor(() => {
      expect(habEspeciais(id)[0]).toEqual({ nome: 'Bafo Ácido', texto: 'Cone de ácido 3m.' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remover habilidade especial Bafo Ácido' }))
    await waitFor(() => expect(habEspeciais(id)).toHaveLength(0))
  })

  it('trap reverso: ficha de HERÓI não tem Especiais nem ➕ Habilidade', async () => {
    const id = createLocalEntity('Heroi', 'Heroi Teste', emptyHeroFrontmatter())
    renderFicha(id)
    await screen.findByText('NÍVEL')
    expect(screen.queryByText('Habilidades Especiais')).toBeNull()
    expect(screen.queryByLabelText('Adicionar habilidade')).toBeNull()
  })
})
