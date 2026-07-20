// @vitest-environment jsdom
// CONFIG/SISTEMA EDITÁVEL (#202) — req do usuário: "Tu não ta me deixando
// editar as configs de sistema que estão lá na config/sistema". As tabelas de
// sistema (multiplicadores de tier, região/raridade, poções) são editáveis NA
// TELA, persistem em pleitost.settings.sistema, alimentam as tabelas VIVAS da
// loja (TIER_PRICE_MULT etc.) e RESTAURAR PADRÃO volta aos defaults — que são
// congelados e nunca mudam.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { ConfigPage } from '../src/components/config/ConfigPage'
import {
  COMBO_MULT,
  POCAO_DICE,
  RARIDADE_MULT,
  TESOUROS_BASICOS,
  TIER_PRICE_MULT,
  raridadeTesouro,
} from '../src/data/commerce'
import { sistemaConfig } from '../src/data/system-config'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'))
const catalog = buildCatalog(manifest)

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
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  sistemaConfig.__resetForTests()
  // aba SISTEMA só aparece com Modo Mestre ligado
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

function renderConfig() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/config']}>
        <Routes>
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirSistema() {
  renderConfig()
  fireEvent.click(await screen.findByRole('button', { name: 'SISTEMA' }))
  await screen.findByText('Multiplicadores de Preço por Tier')
}

describe('config/sistema editável (#202)', () => {
  it('multiplicador de tier: edita na tela → tabela viva + localStorage; defaults congelados', async () => {
    await abrirSistema()
    const adepto = screen.getByLabelText('multiplicador Adepto') as HTMLInputElement
    expect(adepto.value).toBe('1')
    fireEvent.change(adepto, { target: { value: '2' } })
    // a tela reflete e a tabela VIVA da loja muda junto
    expect((screen.getByLabelText('multiplicador Adepto') as HTMLInputElement).value).toBe('2')
    expect(TIER_PRICE_MULT.A).toBe(2)
    // persistiu no override, não nos defaults
    const saved = JSON.parse(window.localStorage.getItem('pleitost.settings.sistema')!)
    expect(saved.tierMult.A).toBe(2)
    expect(sistemaConfig.defaults.tierMult.A).toBe(1)
  })

  it('override persiste entre montagens (recarregar a tela mantém o valor)', async () => {
    await abrirSistema()
    fireEvent.change(screen.getByLabelText('multiplicador Experiente'), { target: { value: '7' } })
    cleanup()
    await abrirSistema()
    expect((screen.getByLabelText('multiplicador Experiente') as HTMLInputElement).value).toBe('7')
    expect(TIER_PRICE_MULT.E).toBe(7)
  })

  it('RESTAURAR PADRÃO dos multiplicadores volta ×1/×5/×25 e limpa o override', async () => {
    await abrirSistema()
    fireEvent.change(screen.getByLabelText('multiplicador Adepto'), { target: { value: '9' } })
    // o botão de reset da seção é o irmão do título
    const secao = screen.getByText('Multiplicadores de Preço por Tier').parentElement!
    fireEvent.click(secao.querySelector('button')!)
    expect((screen.getByLabelText('multiplicador Adepto') as HTMLInputElement).value).toBe('1')
    expect(TIER_PRICE_MULT.A).toBe(1)
    expect(TIER_PRICE_MULT.E).toBe(5)
    expect(TIER_PRICE_MULT.M).toBe(25)
    const saved = JSON.parse(window.localStorage.getItem('pleitost.settings.sistema')!)
    expect(saved.tierMult).toBeUndefined()
  })

  it('região: raridade e combos arma×imbuição editáveis com reset próprio', async () => {
    await abrirSistema()
    fireEvent.change(screen.getByLabelText('modificador Tesouro incomum'), { target: { value: '0.5' } })
    fireEvent.change(screen.getByLabelText('modificador Arma incomum + imbuição incomum'), {
      target: { value: '0.25' },
    })
    expect(RARIDADE_MULT.incomum).toBe(0.5)
    expect(COMBO_MULT.ii).toBe(0.25)
    const secao = screen.getByText('Modificadores por Região').parentElement!
    fireEvent.click(secao.querySelector('button')!)
    expect(RARIDADE_MULT.incomum).toBe(0.25)
    expect(COMBO_MULT.ii).toBe(0.125)
  })

  it('básicos: remover/adicionar reflete em raridadeTesouro; restaurar volta à lista da nota', async () => {
    await abrirSistema()
    // Bracelete Elemental é básico (vem da nota) → básico-incomum fora dos Recursos.
    expect(raridadeTesouro('Bracelete Elemental', false)).toBe('basico-incomum')
    // Remover pelo ✕ do chip → deixa de ser básico (vira incomum comum).
    fireEvent.click(screen.getByLabelText('remover Bracelete Elemental dos básicos'))
    expect([...TESOUROS_BASICOS]).not.toContain('Bracelete Elemental')
    expect(raridadeTesouro('Bracelete Elemental', false)).toBe('incomum')
    // Adicionar um tesouro que não era básico (pelo select) → passa a básico.
    expect(raridadeTesouro('Anel Canário', false)).toBe('incomum')
    fireEvent.change(screen.getByLabelText('adicionar tesouro básico'), {
      target: { value: 'Anel Canário' },
    })
    expect([...TESOUROS_BASICOS]).toContain('Anel Canário')
    expect(raridadeTesouro('Anel Canário', false)).toBe('basico-incomum')
    // Persistiu no override; defaults congelados intactos.
    const saved = JSON.parse(window.localStorage.getItem('pleitost.settings.sistema')!)
    expect(saved.basicos).toContain('Anel Canário')
    expect(saved.basicos).not.toContain('Bracelete Elemental')
    expect(sistemaConfig.defaults.basicos).toContain('Bracelete Elemental')
    // "restaurar" (botão dedicado) volta à lista da nota.
    fireEvent.click(screen.getByTitle('restaurar a lista de básicos da nota'))
    expect([...TESOUROS_BASICOS]).toContain('Bracelete Elemental')
    expect([...TESOUROS_BASICOS]).not.toContain('Anel Canário')
  })

  it('poções: dado por local × tier editável como texto, com reset', async () => {
    await abrirSistema()
    const cell = screen.getByLabelText('poções Capital Adepto') as HTMLInputElement
    const original = cell.value
    fireEvent.change(cell, { target: { value: '3d6' } })
    expect(POCAO_DICE['Capital'].A).toBe('3d6')
    expect(sistemaConfig.defaults.pocao['Capital'].A).toBe(original)
    const secao = screen.getByText('Quantidade de Poções').parentElement!
    fireEvent.click(secao.querySelector('button')!)
    expect(POCAO_DICE['Capital'].A).toBe(original)
  })
})
