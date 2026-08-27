// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { createLocalEntity, getLocalEntity, emptyHeroFrontmatter, __resetLocalStoreForTests } from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest)

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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

// #512 (continuação) — o pick de escolha de perícia precisa RESOLVER DE
// VOLTA no select (round-trip visual): o write estava certo, mas o
// inferPickFromIncrementos pulava incrementos de rank (guard !inc.field) e o
// select voltava vazio — "eu Clico e não seleciona".
it('Perícia Adepta do Domador: selecionar Atletismo persiste E o select mostra', async () => {
  const id = createLocalEntity('Heroi', 'Domador Probe', {
    ...(emptyHeroFrontmatter() as Record<string, unknown>),
    Classe: '[[Caçador]]',
    'Nível': 1,
    Atributos: { FOR: 2, AGI: 3, INT: 1, PRE: 1 },
  })
  render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
  await waitFor(() => expect(document.body.textContent).toContain('Estratégia de Caça'), { timeout: 30000 })
  // liga o modo Alterar da árvore de habilidades
  const toggles = screen.getAllByText(/alterar/i)
  const out: string[] = [`toggles=${toggles.length}`]
  for (const t of toggles) fireEvent.click(t)
  await new Promise((r) => setTimeout(r, 300))
  const sels = [...document.querySelectorAll('select')]
  for (const s of sels) {
    const aria = s.getAttribute('aria-label') ?? ''
    if (/perícia|pericia/i.test(aria)) {
      out.push(`SELECT aria=${aria} value=${JSON.stringify((s as HTMLSelectElement).value)} opts=${[...(s as HTMLSelectElement).options].map((o) => o.value).join(' | ')}`)
    }
  }
  const alvo = sels.find((s) => /perícia adepta/i.test(s.getAttribute('aria-label') ?? '')) as HTMLSelectElement
  expect(alvo, 'select da Perícia Adepta na árvore').toBeTruthy()
  const opt = [...alvo.options].map((o) => o.value).find((v) => v.includes('Atletismo'))!
  expect(opt).toBeTruthy()
  fireEvent.change(alvo, { target: { value: opt } })
  // o incremento tagueado persiste E o select re-resolve o pick (round-trip)
  await waitFor(
    () => {
      const fmCur = getLocalEntity(id)!.frontmatter as Record<string, unknown>
      const rows = ((fmCur['Pericias'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<Record<string, unknown>>
      const atl = rows.find((r) => r['Nome'] === 'Atletismo')
      expect(JSON.stringify(atl?.['Incrementos'] ?? [])).toContain('Estratégia de Caça (Domador)')
      const sel2 = [...document.querySelectorAll('select')].find((s) =>
        /perícia adepta/i.test(s.getAttribute('aria-label') ?? ''),
      ) as HTMLSelectElement
      expect(sel2?.value).toContain('Atletismo')
    },
    { timeout: 20000 },
  )
  void out
}, 60000)
