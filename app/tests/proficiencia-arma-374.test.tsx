// @vitest-environment jsdom
// Report #374: "proficiência em armas não está sendo considerada — um
// arcanista (proficiente somente em armas simples) está somando sua
// proficiência nas jogadas de ataque, e contribuindo com dados de dano com
// uma montante (arma marcial)".
//
// Regra do sistema (fonte de verdade na vault):
// - Sistema/Equipamento/Armas/Armas.md: "Você perde seu bônus de
//   [[Proficiência]] nos [[Ataques]] se usar um tipo de arma que não é
//   proficiente."
// - Sistema/Regras/Regra Básica/Dados de Dano.md: o número de dados de dano
//   é definido pela proficiência COM A ARMA e em Ataques.
// O plugin também não aplica o gate (comentário `resolveProfBonusAtaque` em
// util/modificadores.ts nunca implementado) — o app corrige a regra aqui.
//
// Cenário repro: Carlos (Ataques M, Simples='P', Marciais='N', Montante fora
// das Específicas) com um MONTANTE (cac-marcial, d12+6) injetado: o mod NÃO
// pode somar o +6 de proficiência e o dano fica 1d12+6 (sem os +2 dados de
// Mestre). Trap reverso: o Punhal (simples + Específicas) MANTÉM prof M —
// coberto pelos goldens existentes (combate +11, ato-inspirador 3d4+2).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { profArmaEfetiva } from '../src/components/ficha/hero-model'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

const carlosReal = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as { frontmatter: Record<string, unknown> }
const FOR_CARLOS = Number(
  ((carlosReal.frontmatter['Atributos'] ?? {}) as Record<string, unknown>)['FOR'] ?? 0,
)

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
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${CARLOS_ID}.json`) {
          // O CENÁRIO DO REPORT: arma MARCIAL na mão de quem só tem Simples.
          const fm = data.frontmatter as Record<string, unknown>
          const inv = { ...((fm['Inventario'] ?? {}) as Record<string, unknown>) }
          const armas = { ...((inv['Armas'] ?? {}) as Record<string, unknown>) }
          armas['Lista'] = [
            ...((armas['Lista'] ?? []) as unknown[]),
            { Nome: '[[Montante]]', Atributo: 'FOR', Bonus_Item: 0, Bonus_Especial: 0 },
          ]
          inv['Armas'] = armas
          fm['Inventario'] = inv
          // Interativa zerada: nada de efeitos mexendo no mod/dano.
          fm['Interativa'] = {
            ...((fm['Interativa'] ?? {}) as Record<string, unknown>),
            Condicoes_Ativas: {},
            Efeitos_Ativos: {},
            Seletores: {},
          }
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

describe('#374 — sem proficiência na arma: sem bônus de prof, sem dados extras', () => {
  it('Montante (marcial, Marciais=N): mod = só FOR e dano 1d12+6', async () => {
    renderCombate()
    const nome = await screen.findByText(/^Montante/)
    const row = nome.closest('div[style]')!.parentElement!
    // acerto: FOR puro (sem o +6 de Mestre que o bug somava). O mod vem
    // colado no nome no textContent ("Montante+0") — âncora no nome pra não
    // colidir com o "+6" do dano (1d12+6).
    const esperado = FOR_CARLOS >= 0 ? `+${FOR_CARLOS}` : String(FOR_CARLOS)
    expect(row.textContent).toContain(`Montante${esperado}`)
    expect(row.textContent).not.toContain(`Montante+${FOR_CARLOS + 6}`)
    // dano: dados base (1d12+6), sem os 2 dados de Mestre (3d12+6 era o bug)
    expect(row.textContent).toContain('1d12+6')
    expect(row.textContent).not.toContain('3d12+6')
  }, 30000)

  it('Punhal (simples/Específicas) INTACTO: prof M segue valendo (trap reverso)', async () => {
    renderCombate()
    const nome = await screen.findByText(/^Punhal/)
    const row = nome.closest('div[style]')!.parentElement!
    // Carlos vivo: Punhal 3d4+2 (M = +2 dados) — o gate NÃO pode derrubar.
    expect(row.textContent).toContain('3d4')
  }, 30000)
})

describe('profArmaEfetiva (helper — regra pura)', () => {
  const fmBase = {
    Inventario: {
      Armas: {
        Proficiencia: { Simples: 'P', Marciais: 'N', Especificas: ['[[Rapieira]]'] },
      },
    },
  }
  it('marcial sem Marciais=P e fora das Específicas → N', () => {
    expect(profArmaEfetiva('M', 'cac-marcial', 'Montante', fmBase)).toBe('N')
    expect(profArmaEfetiva('E', 'd-marcial', 'Arco Longo', fmBase)).toBe('N')
  })
  it('simples com Simples=P → mantém o rank de Ataques', () => {
    expect(profArmaEfetiva('M', 'cac-simples', 'Punhal', fmBase)).toBe('M')
    expect(profArmaEfetiva('A', 'd-simples', 'Arco Curto', fmBase)).toBe('A')
  })
  it('arma nas Específicas ignora a categoria (proficiência específica)', () => {
    expect(profArmaEfetiva('M', 'cac-marcial', 'Rapieira', fmBase)).toBe('M')
  })
  it('natural/especial (fora das 2 categorias do sistema) não têm gate', () => {
    expect(profArmaEfetiva('M', 'natural', 'Garras', fmBase)).toBe('M')
    expect(profArmaEfetiva('M', 'especial', 'Chicote Estranho', fmBase)).toBe('M')
    expect(profArmaEfetiva('M', '', 'Sem Grupo', fmBase)).toBe('M')
  })
  it('FM sem o bloco de proficiências (legado/NPC): sem gate', () => {
    expect(profArmaEfetiva('M', 'cac-marcial', 'Montante', {})).toBe('M')
  })
})
