// @vitest-environment jsdom
// #570 — USOS de habilidades e técnicas (paridade #152 do plugin): notas com
// `usos_nome::` + `usos_freq::` (Herbalismo Prático → "Curativo Herbal"
// 4/dia) viram contadores em Interativa.Usos_Recursos (`tec:<nota>` /
// `hab:<nota>`), visíveis na RECUPERAÇÃO da aba Combate, e o Dormir/Descansar
// restaura pelo sufixo da frequência. Mera (vault) já tem
// `tec:Herbalismo Prático: 3` gravado pelo plugin — o app ignorava.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { getHeroEdits, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { buildDescansoUsoItems, dormirWrites } from '../src/components/ficha/descanso'
import { usosDeNota, wikiTarget } from '../src/components/ficha/hero-model'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const MERA_ID = 'Sistema/Criaturas/Heróis/Mera'
const HERBALISMO_ID = 'Sistema/Criação de Personagem/Técnicas/Caçador/Herbalismo Prático'
const lerDoc = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8'))

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
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

describe('usosDeNota + buildDescansoUsoItems', () => {
  it('lê usos_nome/usos_freq da nota (aspas fora) e o máximo da frequência', () => {
    expect(usosDeNota(lerDoc(HERBALISMO_ID))).toEqual({ rotulo: 'Curativo Herbal', freq: '4/dia', max: 4 })
    expect(usosDeNota(lerDoc('Sistema/Criação de Personagem/Classes/Bardo'))).toBeNull()
  })
  it('Mera: Herbalismo Prático vira item tec:<nota> com 4 usos; Dormir restaura pra 4', () => {
    const mera = lerDoc(MERA_ID)
    const refDoc = (raw: unknown) => {
      const r = catalog.resolve(wikiTarget(String(raw)))
      return r.kind === 'doc' ? lerDoc(r.id) : undefined
    }
    const itens = buildDescansoUsoItems(mera.frontmatter as Record<string, unknown>, refDoc)
    const herb = itens.find((i) => i.key === 'tec:Herbalismo Prático')
    expect(herb).toMatchObject({ max: 4, freq: '4/dia', label: 'Curativo Herbal', origem: 'tecnica', ancorado: true })
    const writes = dormirWrites({
      vit: 10, vitMax: 20, moralMax: 10, emMax: 0, emSecMax: 0, nivel: 3,
      usos: { 'tec:Herbalismo Prático': 1 }, usoItems: itens,
    })
    const usos = Object.fromEntries(writes)['Interativa.Usos_Recursos'] as Record<string, unknown>
    expect(usos['tec:Herbalismo Prático']).toBe(4)
  })
})

describe('#570 — Curativo Herbal na RECUPERAÇÃO da Mera', () => {
  function renderCombate(heroId: string) {
    return render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(heroId, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }
  it('mostra "Curativo Herbal" com 4 bolinhas (3 cheias, do FM) e consumir grava tec:Herbalismo Prático', async () => {
    renderCombate(MERA_ID)
    fireEvent.click(await screen.findByText('RECUPERAÇÃO', undefined, { timeout: 15000 }))
    // ("Curativo Herbal" também é o chip da AçãoLocal — a linha de USOS é a
    // marcada com data-uso)
    await waitFor(() => expect(document.querySelector('[data-uso="tec:Herbalismo Prático"]')).toBeTruthy(), {
      timeout: 15000,
    })
    const linha = document.querySelector('[data-uso="tec:Herbalismo Prático"]') as HTMLElement
    expect(linha.textContent).toContain('Curativo Herbal')
    expect(linha.textContent).toContain('4/dia')
    const dots = [...linha.querySelectorAll('[data-dots] > span > span')] as HTMLElement[]
    expect(dots).toHaveLength(4)
    expect(dots.filter((d) => d.style.background !== 'transparent')).toHaveLength(3)
    // consumir 1 uso: clica na 3ª bolinha (cheia) → 2 restantes
    fireEvent.click(dots[2]!)
    const usos = getHeroEdits(MERA_ID).fm['Interativa.Usos_Recursos'] as Record<string, unknown>
    expect(usos['tec:Herbalismo Prático']).toBe(2)
  }, 40000)
})
