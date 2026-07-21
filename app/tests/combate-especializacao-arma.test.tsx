// @vitest-environment jsdom
// Issue #217 (report de jogador): "especialização em arma não tá refletindo
// (tipo se pego guerreiro com especialização em arcos não tá mostrando o +1
// de bônus de especialização)".
//
// A habilidade "Especialização em Arma (Arcos)" declara (doc real da vault):
//   Condicional Inventario.Armas.Lista,[[Arco de Guerra]]
//     Sobrescrever Inventario.Armas.Lista.[[Arco de Guerra]].Bonus_Especial 1
// O rule-applier do app produzia o delta, mas o merge (merge-calculated.ts)
// não tinha handler pra `Inventario.Armas.Lista.<alvo>.<Campo>` — o +1 nunca
// chegava ao derivedFm e o modificador de ataque da arma ficava sem o bônus.
// Espelho do plugin: resolveInventario (rule-target-registry.ts:257-271) +
// setInventarioArmas/matchAtaqueNome (merge-setters.ts:379-427).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { PROF_BONUS, type RankLetter } from '../src/components/ficha/registry'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// Herói REAL da vault: Thoren (Guerreiro) tem [[Arco de Guerra]] no
// inventário com Bonus_Especial 0 salvo — a especialização em Arcos entra por
// overlay e o +1 TEM que aparecer ao vivo (cascata), sem re-salvar a ficha.
const THOREN_ID = 'Sistema/Criaturas/Heróis/Thoren'
const thoren = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${THOREN_ID}.json`), 'utf8'),
) as VaultDoc
const fm = thoren.frontmatter as Record<string, any>
const arco = (fm.Inventario.Armas.Lista as Record<string, any>[]).find(
  (a) => String(a.Nome) === '[[Arco de Guerra]]',
)!

// Expectativas recomputadas AQUI a partir do JSON (independentes do código da
// ficha): mod de ataque = atributo + proficiência de Ataques + item + especial.
const profAtaque = String(fm.Ataques.Proficiencia) as RankLetter
const attr = Number(fm.Atributos[String(arco.Atributo)])
const modSemEspecial = attr + PROF_BONUS[profAtaque] + Number(arco.Bonus_Item ?? 0)
const modComEspecial = modSemEspecial + 1

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
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${THOREN_ID}.json`) {
          // F2 (#347): o FM REAL do Thoren tem Inspiração::Carlos ativa (a mesa
          // gravou) e o app passou a APLICAR efeitos de aliado (+1 ataque) —
          // este teste isola a ESPECIALIZAÇÃO, então limpa as entradas
          // compartilhadas (label::aliado) preservando o estado próprio.
          const inter = data.frontmatter.Interativa ?? {}
          const cond = Object.fromEntries(
            Object.entries((inter.Condicoes_Ativas ?? {}) as Record<string, unknown>).filter(
              ([k]) => !k.includes('::'),
            ),
          )
          data.frontmatter.Interativa = { ...inter, Condicoes_Ativas: cond }
        }
        return data
      },
    }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
  // Guerreiro COM Especialização em Arma (Arcos) — overlay local, como um
  // jogador montando a ficha no app.
  const habs = (fm.Habilidades?.Lista ?? []) as Record<string, unknown>[]
  window.localStorage.setItem(
    `pleitost.heroEdits.${THOREN_ID}`,
    JSON.stringify({
      fm: {
        'Habilidades.Lista': [...habs, { '[[Especialização em Arma (Arcos)]]': 'Manual' }],
      },
    }),
  )
})
afterEach(cleanup)

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(THOREN_ID, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#217: Especialização em Arma reflete +1 no modificador de ataque', () => {
  it('fixture: Arco de Guerra salvo SEM Bonus_Especial (o +1 tem que vir da cascata)', () => {
    expect(Number(arco.Bonus_Especial ?? 0)).toBe(0)
  })

  it(`Arco de Guerra mostra +${modComEspecial} (com o +1 de especialização) e a estrela`, async () => {
    renderCombate()
    // Label da linha = nome + propriedade + tier ("Arco de Guerra Obra-prima (A)").
    const nome = await screen.findByText(/^Arco de Guerra/, {}, { timeout: 5000 })
    const row = nome.parentElement as HTMLElement
    await waitFor(() => {
      expect(within(row).getByText(`+${modComEspecial}`)).toBeTruthy()
      // estrela do bônus de especialização no ModBox (star=Bonus_Especial>0)
      expect(within(row).getByText('★')).toBeTruthy()
    })
    expect(within(row).queryByText(`+${modSemEspecial}`)).toBeNull()
  })
})
