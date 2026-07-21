// @vitest-environment jsdom
// F8 do plano #347 — regressões que FECHAM dois reports antigos da mesa
// 2026-07-20 (ambos de versões anteriores aos reworks):
//   1c4740b9: "Não tá aparecendo VITALIDADE negativo quando tem MORAL maior
//     que zero" — a vitalidade pode negativar direto (clampVit até −vitMax,
//     pop-panels.tsx) e a ficha MOSTRA o valor negativo com a moral intacta.
//   c631ad3d: "ao deselecionar a condição Segurar Arma Com Duas Mãos essa
//     condição some da lista" — o toggle agora vive POR ARMA nos ataques
//     (ArmaPropToggles), renderizado dos DESCRIPTORS (não do estado ativo):
//     desligar não o remove da UI.
// Integração sobre heróis REAIS da vault (Carlos: vida 24/48; Thoren: Espada
// Bastarda com propriedade Duas-mãos).
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
const THOREN_ID = 'Sistema/Criaturas/Heróis/Thoren'

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
      json: async () => {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (rel === `${CARLOS_ID}.json`) {
          // Cenário do report: vitalidade NEGATIVA com moral > 0 no estado salvo.
          data.frontmatter.Interativa = {
            ...(data.frontmatter.Interativa ?? {}),
            Recursos_Restantes: { Vitalidade: -5, Moral: 10, Moral_Temporaria: 0 },
          }
        }
        if (rel === `${THOREN_ID}.json`) {
          // Toggle começa DESLIGADO (sem condição ativa persistida).
          data.frontmatter.Interativa = {
            ...(data.frontmatter.Interativa ?? {}),
            Condicoes_Ativas: {},
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

describe('F8 — regressões dos reports antigos (#347)', () => {
  it('1c4740b9: vitalidade NEGATIVA aparece na ficha com moral > 0', async () => {
    renderCombate(CARLOS_ID)
    // O rótulo da vida usa `${vit} / ${vitMax}` — com o estado semeado tem que
    // mostrar o negativo, e a moral intacta ao lado (não zerada nem escondida).
    expect(await screen.findByText('-5 / 24')).toBeTruthy()
    expect(await screen.findByText('10 / 48')).toBeTruthy()
  })

  it('c631ad3d: desligar "Segurar com Duas Mãos" NÃO remove o toggle da UI', async () => {
    renderCombate(THOREN_ID)
    // Toggle por-arma abaixo da Espada Bastarda (ArmaPropToggles) — OFF.
    const ligar = await screen.findByTitle('Ativar Segurar com Duas Mãos pra Espada Bastarda')
    fireEvent.click(ligar)
    // ON: o botão vira "Desativar…" (mesmo chip, estado ativo).
    const desligar = await screen.findByTitle('Desativar Segurar com Duas Mãos')
    fireEvent.click(desligar)
    // O BUG era o chip sumir aqui. Ele tem que CONTINUAR renderizado, de volta
    // ao estado desligado, pronto pra reativar.
    expect(await screen.findByTitle('Ativar Segurar com Duas Mãos pra Espada Bastarda')).toBeTruthy()
    expect(screen.getAllByText('Segurar com Duas Mãos').length).toBeGreaterThan(0)
  })
})
