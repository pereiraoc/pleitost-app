// @vitest-environment jsdom
// F3 do plano #347 — pedaços da aba COMBATE que existiam no plugin e faltavam
// no app, na FORMA decidida na review do usuário:
//   7fc4db09 movimento: CAIXINHA ao lado de Intuição (não seção), valor = o
//     MAIOR movimento da ficha, tooltip com breakdown + demais tipos;
//   a389cb35 ofícios: no FIM do painel de perícias (não seção), prof ≠ N,
//     calcOficio (atributo só conta com prof ≥ A);
//   0c29814d tesouros passivos: listados sem a linha de usos;
//   522291d8 manobras: tooltip de BREAKDOWN no modificador (estilo do app).
// Oráculo: Carlos REAL — AGI 2 → movimento 6; Oficio (Poeta) A/INT=1 → +3;
// Atuacao (Chula) M/PRE=3 → +9; Conhecimento N filtrado; Anel da Resistência
// (usos "passivo") aparece na sub-aba TESOUROS.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

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
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('F3 — combate: movimento/ofícios/tesouros passivos/manobras (#347)', () => {
  it('caixinha MOVIMENTO ao lado dos sentidos, valor 4+AGI, com breakdown', async () => {
    renderCombate()
    const label = await screen.findByText('MOVIMENTO')
    // valor = 4 (base) + AGI 2 = 6 no MESMO card da caixinha
    const card = label.closest('div')!.parentElement!.parentElement as HTMLElement
    expect(card.textContent).toContain('6')
    // tooltip de breakdown no estilo padrão (data-breakdown-html com o título)
    const hover = label.closest('[data-breakdown-html]') as HTMLElement
    expect(hover?.getAttribute('data-breakdown-html')).toContain('Terrestre')
  })

  it('ofícios no FIM das perícias com calcOficio (prof≠N; atributo só ≥A)', async () => {
    renderCombate()
    fireEvent.click(await screen.findByText('PERÍCIAS'))
    await screen.findByText('OFÍCIOS')
    // Oficio (Poeta) A/INT → INT 1 + prof 2 = +3
    const poeta = await screen.findByText(/\(Poeta\)/)
    expect(poeta.closest('div')!.parentElement!.textContent).toContain('+3')
    // Atuacao (Chula) M/PRE → PRE 3 + prof 6 = +9
    const chula = await screen.findByText(/\(Chula\)/)
    expect(chula.closest('div')!.parentElement!.textContent).toContain('+9')
    // Conhecimento tem prof N → NÃO aparece (match exato — "Conhecimento
    // Arcano Adepto" de habilidades é outra coisa)
    expect(screen.queryByText('Conhecimento')).toBeNull()
  })

  it('tesouro PASSIVO (Anel da Resistência) aparece em TESOUROS sem linha de usos', async () => {
    renderCombate()
    // "TESOUROS" existe também fora das sub-abas — clica no botão da sub-aba.
    const tabs = await screen.findAllByText('TESOUROS')
    fireEvent.click(tabs.find((el) => el.closest('button'))!)
    const anel = await screen.findByText('Anel da Resistência (A)')
    // sem bolinhas de uso: o bloco do anel não tem o rótulo USOS/CARGAS
    const bloco = anel.parentElement as HTMLElement
    expect(bloco.textContent).not.toContain('USOS')
    expect(bloco.textContent).not.toContain('CARGAS')
    // e um com usos segue com a linha (Anel Canário 1/10min)
    const canario = await screen.findByText('Anel Canário (A)')
    expect((canario.parentElement as HTMLElement).textContent).toContain('USOS')
    // Foco da Intensificação: CARGAS (inicia descarregado)
    const foco = await screen.findByText('Foco da Intensificação (A)')
    expect((foco.parentElement as HTMLElement).textContent).toContain('CARGAS')
  })

  it('modificador de MANOBRAS tem tooltip de breakdown (estilo do app)', async () => {
    renderCombate()
    const manobras = await screen.findByText('Manobras')
    const hover = manobras.parentElement!.querySelector('[data-breakdown-html]') as HTMLElement
    expect(hover, 'TipHover no modificador de manobras').toBeTruthy()
    const html = hover.getAttribute('data-breakdown-html') ?? ''
    expect(html).toContain('Manobras')
    expect(html).toContain('Mestre') // proficiência de ATAQUE (M) no breakdown
  })
})
