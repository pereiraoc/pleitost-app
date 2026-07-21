// @vitest-environment jsdom
// Report 6729da6f: "Ato inspirador não tá alterando o dano (dá uma olhada no
// pleitost-autosheet pra resolver)". Diagnóstico: com Inspiração ATIVA o motor
// do app já aplica (+1 fixo, +1/dado — Carlos vivo: 3d4+1d12+9). O cenário do
// report é ligar o Ato SEM a Inspiração: o guard `requer` bloqueia (regra) e,
// diferente do plugin, o toggle do rail não fazia o CASCADE — o plugin
// (createOnToggleAnchored, mount-interativa-toggle.ts:38-130) AUTO-ATIVA os
// requeridos e grava em STORAGE DUAL (Condicoes_Ativas {value:1} +
// Efeitos_Ativos {on:true}). Paridade portada; oráculo = Carlos real com a
// Interativa ZERADA.
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
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${CARLOS_ID}.json`) {
          // O CENÁRIO DO REPORT: nada ativo (o FM real da mesa tinha tudo ON).
          data.frontmatter.Interativa = {
            ...(data.frontmatter.Interativa ?? {}),
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

describe('report 6729da6f — Ato Inspirador altera o dano via cascade do requer', () => {
  it('ligar o Ato SEM Inspiração: cascade ativa a Inspiração, storage dual, e o DANO muda', async () => {
    renderCombate()
    // baseline: Punhal 3d4+2 (Mestre, sem buffs)
    await screen.findByText(/3d4\+2/)
    // chip do rail (AçãoLocal própria)
    const chip = (await screen.findAllByText('Ato Inspirador')).find((el) => el.closest('button'))!
    fireEvent.click(chip.closest('button')!)
    // DANO muda na hora: +1 fixo +1×3 dados = 3d4+6 (o sintoma do report era não mudar)
    await waitFor(() => expect(screen.queryByText(/3d4\+6/)).toBeTruthy())
    // storage DUAL + cascade (paridade com o plugin):
    const edits = getHeroEdits(CARLOS_ID).fm
    const cond = edits['Interativa.Condicoes_Ativas'] as Record<string, unknown>
    const ef = edits['Interativa.Efeitos_Ativos'] as Record<string, unknown>
    expect(cond['Ato Inspirador']).toEqual({ value: 1 })
    expect(ef['Ato Inspirador']).toEqual({ on: true })
    expect(cond['Inspiração'], 'cascade do links.requer ativa a Inspiração').toEqual({ value: 1 })
  }, 30000)

  it('desligar remove dos DOIS mapas (dual-delete) e o dano volta', async () => {
    renderCombate()
    const chip = (await screen.findAllByText('Ato Inspirador')).find((el) => el.closest('button'))!
    fireEvent.click(chip.closest('button')!)
    await waitFor(() => expect(screen.queryByText(/3d4\+6/)).toBeTruthy())
    fireEvent.click(chip.closest('button')!)
    await waitFor(() => expect(screen.queryByText(/3d4\+2/)).toBeTruthy())
    const edits = getHeroEdits(CARLOS_ID).fm
    const cond = edits['Interativa.Condicoes_Ativas'] as Record<string, unknown>
    const ef = edits['Interativa.Efeitos_Ativos'] as Record<string, unknown>
    expect(cond['Ato Inspirador']).toBeUndefined()
    expect(ef['Ato Inspirador']).toBeUndefined()
  }, 30000)
})
