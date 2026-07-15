// @vitest-environment jsdom
// COMBATE — Defesas/Resistências + Sentidos (itens 4/6/7):
//   4) tooltip de breakdown (TipHover → data-breakdown-html) no VALOR de cada
//      defesa/sentido, byte-exact com resistenciaBreakdown/sentidoBreakdown;
//   6) bolinhas de item bônus (GoldDots) + estrela (StarChip) quando
//      Bonus_Item / Bonus_Especial > 0, espelhando perícias/ataques;
//   7) conteúdo centralizado dentro de cada bloco (textAlign:center).
// Integração sobre heróis REAIS da vault:
//   - Carlos Facão de Andradas: Defesa Item=2, Percepção Item=2 (dots + tips).
//   - Carlos César: Percepção Bonus_Especial=2 (estrela ★2).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  renderBreakdownHtml,
  resistenciaBreakdown,
  sentidoBreakdown,
} from '../src/components/ficha/tooltips'
import type { ProfRow } from '../src/components/ficha/hero-model'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const FACAO_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const CESAR_ID = 'Sistema/Criaturas/Heróis/Carlos César'

function loadFm(id: string): Record<string, unknown> {
  const doc = JSON.parse(
    fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8'),
  ) as VaultDoc
  return doc.frontmatter as Record<string, unknown>
}
function attrsOf(fm: Record<string, unknown>): Record<string, number> {
  const at = (fm['Atributos'] ?? {}) as Record<string, number>
  return { FOR: at.FOR ?? 0, AGI: at.AGI ?? 0, INT: at.INT ?? 0, PRE: at.PRE ?? 0 }
}
function rowOf(fm: Record<string, unknown>, section: string, nome: string): ProfRow {
  const lista = ((fm[section] as Record<string, unknown>)['Lista'] ?? []) as ProfRow[]
  return lista.find((r) => r.Nome === nome)!
}

/** vitest 4 + jsdom sem webstorage do Node — polyfill fiel só no teste. */
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
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderCombate(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Contagem de bolinhas "on" (background var(--gold)) dentro de um container. */
function goldOnCount(root: HTMLElement): number {
  return [...root.querySelectorAll<HTMLElement>('span')].filter(
    // combate usa GoldDots compact (7px); perícias/habilidades usam 11px
    (s) => s.style.background === 'var(--gold)' && (s.style.width === '7px' || s.style.width === '11px'),
  ).length
}

describe('COMBATE Defesas/Sentidos — tooltip (item 4) + dots/estrela (item 6) + centralização (item 7)', () => {
  it('item 4: cada defesa e sentido tem TipHover com o breakdown byte-exact do plugin', async () => {
    const fm = loadFm(FACAO_ID)
    const attrs = attrsOf(fm)
    const { container } = renderCombate(FACAO_ID)
    await screen.findByText('DEFESA')

    await waitFor(() => {
      const tips = [...container.querySelectorAll<HTMLElement>('[data-breakdown-html]')].map(
        (el) => el.getAttribute('data-breakdown-html')!,
      )
      // O tooltip é o breakdown base do plugin, seguido (quando há efeito ativo)
      // do apêndice de EFEITOS em verde (#262) — então o base é PREFIXO do tip.
      const startsWithSome = (needle: string) => tips.some((t) => t.startsWith(needle))
      // Defesa (10 + PB + item…): breakdown de resistência (Base 10 crua)
      const defesaHtml = renderBreakdownHtml(
        resistenciaBreakdown(rowOf(fm, 'Defesas_Resistencias', 'Defesa'), attrs),
      )
      expect(startsWithSome(defesaHtml)).toBe(true)
      // Ímpeto (título slugado "Impeto")
      const impetoHtml = renderBreakdownHtml(
        resistenciaBreakdown(rowOf(fm, 'Defesas_Resistencias', 'Ímpeto'), attrs),
      )
      expect(startsWithSome(impetoHtml)).toBe(true)
      // Percepção (sentido — título acentuado, total assinado)
      const percHtml = renderBreakdownHtml(
        sentidoBreakdown(rowOf(fm, 'Sentidos', 'Percepção'), attrs),
      )
      expect(startsWithSome(percHtml)).toBe(true)
    })
  })

  it('item 6: GoldDots aparecem com Bonus_Item>0 (Defesa item=2 → 2 bolinhas douradas)', async () => {
    const { container } = renderCombate(FACAO_ID)
    // Bloco da Defesa: label DEFESA + 2 dots dourados na coluna de bônus.
    const defesaLabel = await screen.findByText('DEFESA')
    const bloco = defesaLabel.closest('div')!.parentElement!.parentElement as HTMLElement
    await waitFor(() => {
      // Carlos Facão: Defesa Bonus_Item = 2 → exatamente 2 bolinhas "on".
      expect(goldOnCount(bloco)).toBe(2)
    })
  })

  it('item 6: StarChip aparece com Bonus_Especial>0 (Carlos César: Percepção Esp=2 → ★2)', async () => {
    const { container } = renderCombate(CESAR_ID)
    await screen.findByText('PERCEPÇÃO')
    await waitFor(() => {
      // A estrela do StarChip mostra "2" ao lado de ★ (Percepção Esp=2).
      const stars = [...container.querySelectorAll<HTMLElement>('span')].filter((s) =>
        s.textContent?.includes('★'),
      )
      // pelo menos um chip de estrela renderizado no bloco de sentidos
      expect(stars.some((s) => s.textContent?.replace(/\s/g, '').includes('★2'))).toBe(true)
    })
  })

  it('item 7: o wrapper interno do bloco (label+valor) é centralizado (textAlign:center)', async () => {
    const { container } = renderCombate(FACAO_ID)
    const defesaLabel = await screen.findByText('DEFESA')
    // O div imediato que envolve label+valor tem textAlign center (item 7).
    const inner = defesaLabel.parentElement as HTMLElement
    expect(inner.style.textAlign).toBe('center')
    void container
  })
})
