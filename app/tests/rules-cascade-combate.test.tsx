// @vitest-environment jsdom
// CASCATA de rule elements no COMBATE (issue #49): a aba COMBATE lê a BASE do
// FM DERIVADO (FM salvo ⊕ cascata de regras), com os Efeitos Interativos
// aplicados POR CIMA. Prova que a cascata (ex.: a Classe define o Atributo
// Principal → o rank do atributo muda) alcança as defesas do COMBATE, e que a
// camada da Interativa (condições/buffs) continua somando sobre essa base.
//
// ORÁCULO: Carlos REAL, mas com os ranks de INT/PRE TROCADOS no FM salvo
// (INT=3, PRE=2) — uma ficha "fora de constraint". A Classe do Carlos (Bardo)
// define `Atributos.Principal = PRE` com allowed=["PRE"]; a restrição de
// principal do motor (applyPrincipalConstraint) devolve PRE ao rank 3 no
// DERIVADO (PRE=3, INT=2). Vigor usa PRE → base do COMBATE tem que refletir o
// DERIVADO (PRE=3), não o salvo (PRE=2). Com Carlos materializado nos demais
// campos, os goldens da Interativa continuam idênticos (derivedFm≈savedFm).
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
// FM salvo do Carlos com INT/PRE trocados (fora da constraint da Classe). A
// cascata de regras deve devolver PRE ao rank 3 no FM derivado.
const SAVED_ATRIBUTOS = { Principal: 'PRE', FOR: 0, AGI: 2, INT: 3, PRE: 2 }
// Atributos DERIVADOS esperados após applyPrincipalConstraint (allowed=["PRE"]).
const DERIVED_ATRIBUTOS = { Principal: 'PRE', FOR: 0, AGI: 2, INT: 2, PRE: 3 }

const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>

const GREEN = 'rgb(34, 197, 94)'
const RED = 'rgb(239, 68, 68)'

const PB: Record<string, number> = { N: 0, A: 2, E: 4, M: 6 }
const defRow = (nome: string) =>
  (fm.Defesas_Resistencias.Lista as any[]).find((d) => d.Nome === nome)!
/** Base de uma defesa (10 + attr + PB + item + especial) com um mapa de
 *  atributos ESCOLHIDO (salvo vs derivado). */
const defBaseWith = (nome: string, attrs: Record<string, number>) => {
  const d = defRow(nome)
  return 10 + Number(attrs[d.Atributo] ?? 0) + PB[d.Proficiencia] + Number(d.Bonus_Item) + Number(d.Bonus_Especial)
}

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
  // Serve os arquivos do vault-data; APENAS o doc do Carlos sai com os ranks
  // de atributo trocados (fora da constraint) — o resto (Classe/Habilidades/
  // Condições) vem REAL, pra cascata real re-derivar o principal.
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${CARLOS_ID}.json`) {
          data.frontmatter.Atributos = { ...SAVED_ATRIBUTOS }
        }
        return data
      },
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

function boxValue(label: string): HTMLElement {
  const lab = screen.getByText(label)
  // Item 4 embrulhou o VALOR num TipHover (<span> com o breakdown) entre o
  // label e o número; desce até o <div> que carrega texto+cor do valor.
  let el = lab.nextElementSibling as HTMLElement
  while (el && el.children.length === 1 && !el.style.color && el.firstElementChild) {
    el = el.firstElementChild as HTMLElement
  }
  return el
}

describe('cascata de regras alcança o COMBATE (issue #49)', () => {
  it('sanidade: o FM salvo tem PRE=2, mas o DERIVADO devolve PRE ao rank 3 (Vigor sobe 1)', () => {
    // Vigor usa PRE: base salva (PRE=2) = 17; base derivada (PRE=3) = 18.
    expect(defBaseWith('Vigor', SAVED_ATRIBUTOS)).toBe(17)
    expect(defBaseWith('Vigor', DERIVED_ATRIBUTOS)).toBe(18)
  })

  it('Vigor no COMBATE usa a BASE DERIVADA (PRE=3), não o FM salvo (PRE=2)', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // A projeção de regras resolve async (fallback no salvo enquanto resolve,
    // como no HabilidadesTab) → aguarda a base DERIVADA assentar. Sem a cascata
    // (base = FM salvo) Vigor ficaria em 17; com derivedFm, 18.
    await waitFor(() =>
      expect(boxValue('VIGOR').textContent).toBe(String(defBaseWith('Vigor', DERIVED_ATRIBUTOS))),
    )
    expect(boxValue('VIGOR').textContent).not.toBe(String(defBaseWith('Vigor', SAVED_ATRIBUTOS)))
  })

  it('um efeito interativo (Enfraquecido -2) ainda soma POR CIMA da base derivada', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    const vigorDerivado = defBaseWith('Vigor', DERIVED_ATRIBUTOS)
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    const chipEnf = await screen.findByText('Enfraquecido')
    fireEvent.click(within(chipEnf.parentElement as HTMLElement).getByText('+'))
    await waitFor(() => {
      const vigor = boxValue('VIGOR')
      // base DERIVADA (18) com o efeito -2 aplicado por cima = 16, vermelho.
      expect(vigor.textContent).toBe(String(vigorDerivado - 2))
      expect(vigor.style.color).toBe(RED)
    })
  })

  it('a camada da Interativa continua ativa: Defesa (AGI, inalterado) mantém Auto-Confiança +1', async () => {
    // AGI não muda na cascata (só INT/PRE trocam) → base da Defesa idêntica ao
    // Carlos real; o buff Auto-Confiança (Performance Bárdica no FM) soma +1.
    expect(fm.Interativa.Efeitos_Ativos['Performance Bárdica Ativa'].on).toBe(true)
    renderCombate()
    await screen.findByText('DEFESA')
    const defesa = boxValue('DEFESA')
    expect(defesa.textContent).toBe(String(defBaseWith('Defesa', DERIVED_ATRIBUTOS) + 1))
    expect(defesa.style.color).toBe(GREEN)
  })
})
