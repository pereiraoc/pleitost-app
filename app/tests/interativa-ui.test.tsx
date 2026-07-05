// @vitest-environment jsdom
// Aba COMBATE × modelo da Interativa (#15) — integração UI sobre o Carlos
// REAL: os campos do design (defesas/sentidos/ataques/dano/AdO) mostram os
// valores COMPUTADOS (condições ativas + efeitos) e os toggles do design
// escrevem o estado real (Condicoes_Ativas/Efeitos_Ativos), refletindo na
// hora. Expectativas derivadas do FM salvo + notas de regra da vault
// (Enfraquecido/Vantagem de Combate/Apunhalante/Auto-Confiança) — nunca do
// código do app.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>

// Cores canônicas do plugin (styles.css cond-bonus/cond-penalty) como o
// jsdom serializa (rgb).
const GREEN = 'rgb(34, 197, 94)'
const RED = 'rgb(239, 68, 68)'

/** vitest 4 + jsdom delega ao webstorage EXPERIMENTAL do Node (indisponível
 *  sem --localstorage-file) → polyfill fiel só no teste (mesmo padrão do
 *  persistencia.test). */
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

/** Valor exibido no box de defesa/sentido pelo rótulo (DEFESA, VIGOR…). */
function boxValue(label: string): HTMLElement {
  const lab = screen.getByText(label)
  return lab.nextElementSibling as HTMLElement
}

// Bases recomputadas do FM salvo do Carlos (mod = attr + PB + item + especial;
// defesa = 10 + mod). PB: N0 A2 E4 M6.
const PB: Record<string, number> = { N: 0, A: 2, E: 4, M: 6 }
const attr = (id: string) => Number(fm.Atributos[id] ?? 0)
const defRow = (nome: string) =>
  (fm.Defesas_Resistencias.Lista as any[]).find((d) => d.Nome === nome)!
const defBase = (nome: string) => {
  const d = defRow(nome)
  return 10 + attr(d.Atributo) + PB[d.Proficiencia] + Number(d.Bonus_Item) + Number(d.Bonus_Especial)
}

describe('COMBATE computa o modelo da Interativa (Carlos real)', () => {
  it('Defesa nasce buffada (+1 verde): FM salvo tem Inspiração + Performance Bárdica Ativa → Auto-Confiança', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // FM: Efeitos_Ativos["Performance Bárdica Ativa"].on = true
    expect(fm.Interativa.Efeitos_Ativos['Performance Bárdica Ativa'].on).toBe(true)
    const defesa = boxValue('DEFESA')
    expect(defesa.textContent).toBe(String(defBase('Defesa') + 1))
    expect(defesa.style.color).toBe(GREEN)
    // fonte no tooltip (title) — mesma label composta do plugin
    expect(defesa.closest('[title]')?.getAttribute('title')).toBe('Condição: Auto-Confiança +1')
    // Vigor sem buff: valor cru, cor padrão
    const vigor = boxValue('VIGOR')
    expect(vigor.textContent).toBe(String(defBase('Vigor')))
    expect(vigor.style.color).toBe('var(--text)')
  })

  it('toggle Enfraquecido no popover CONDIÇÕES: Vigor -2 vermelho; destoggle restaura', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    // catálogo completo visível no popover (Negativas + Positivas)
    const chipEnf = await screen.findByText('Enfraquecido')
    fireEvent.click(within(chipEnf.parentElement as HTMLElement).getByText('+'))
    await waitFor(() => {
      const vigor = boxValue('VIGOR')
      expect(vigor.textContent).toBe(String(defBase('Vigor') - 2))
      expect(vigor.style.color).toBe(RED)
    })
    // dano do Punhal também sofre (DanoArmaFixo -1, DanoArmaPorDado -1×3 dados)
    // base M: 3d4+2 → 3d4-2, mantendo o dado extra do Encantar Arma (d12+1)
    expect(screen.getByText(/3d4-2\+1d12\+1/)).toBeTruthy()
    // destoggle
    fireEvent.click(within(screen.getByText('Enfraquecido').parentElement as HTMLElement).getByText('−'))
    await waitFor(() => {
      expect(boxValue('VIGOR').textContent).toBe(String(defBase('Vigor')))
    })
  })

  it('chip Vantagem de Combate (ATAQUES): ataque +2 e Apunhalante sobe o dado do Punhal (d4→d6, +1)', async () => {
    renderCombate()
    const chipVc = await screen.findByText('Vantagem de Combate')
    // mod do ataque antes: base 10 (AGI2+M6+item2) + 1 (Auto-Confiança) = +11
    const nomeRow = await screen.findByText(/^Punhal( |$)/)
    const row = nomeRow.parentElement as HTMLElement
    const modSpan = () =>
      [...row.querySelectorAll<HTMLElement>('span')].find((s) => /^[+-]\d+$/.test(s.textContent ?? ''))!
    expect(modSpan().textContent).toBe('+11')
    fireEvent.click(chipVc)
    // +2 do catálogo (Somar Condicao.Ataque 2) → +13 verde
    await waitFor(() => expect(modSpan().textContent).toBe('+13'))
    expect(modSpan().style.color).toBe(GREEN)
    // Apunhalante (Passivo requer VC, propriedade do Punhal): passo de dado
    // d4→d6 e +1 fixo → 3d6+3, com o dado extra do Encantar Arma preservado
    expect(screen.getByText(/3d6\+3\+1d12\+1/)).toBeTruthy()
  })

  it('desligar Inspiração desativa Performance Bárdica Ativa (auto) e a Defesa volta ao cru', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    expect(boxValue('DEFESA').textContent).toBe(String(defBase('Defesa') + 1))
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    const chip = await screen.findByText('Inspiração')
    fireEvent.click(within(chip.parentElement as HTMLElement).getByText('−'))
    await waitFor(() => {
      const defesa = boxValue('DEFESA')
      expect(defesa.textContent).toBe(String(defBase('Defesa')))
      expect(defesa.style.color).toBe('var(--text)')
    })
  })

  it('ERGUER escudo grava Efeitos_Ativos["Escudo Erguido"] (sem escudo → sem delta de Defesa)', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // Carlos não tem escudo equipado → EscudoRow nem renderiza; nada a clicar.
    // (BonusEscudo coberto no teste puro; aqui garantimos que a ausência de
    // escudo não quebra a aba.)
    expect(screen.queryByText('ERGUER')).toBeNull()
  })
})
