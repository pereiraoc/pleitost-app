// @vitest-environment jsdom
// PERSISTÊNCIA da ficha (diretriz 2026-07-05): overlay local-first por herói
// sobre o modelo salvo REAL da vault (Carlos Facão de Andradas). Integração
// no padrão do repo — fetch stubado lê os JSONs do disco, expectativas
// recomputadas AQUI a partir do JSON. localStorage do jsdom é o storage real;
// "reload" = zerar a memória do store mantendo o window.localStorage.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import {
  __resetHeroStoreMemoryForTests,
  flushHeroEdits,
} from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const STORE_KEY = `pleitost.heroEdits.${CARLOS_ID}`
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>

/** vitest 4 + jsdom delega ao webstorage EXPERIMENTAL do Node (indisponível
 *  sem --localstorage-file) → window.localStorage vem undefined no teste.
 *  Polyfill fiel da API de Storage só no ambiente de teste; no navegador o
 *  localStorage real é usado. */
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

function renderFicha(tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function renderShell(tab: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, tab)]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** "Reload da página": desmonta, zera a memória do store, MANTÉM window.localStorage. */
function simulaReload(r: ReturnType<typeof render>) {
  r.unmount()
  __resetHeroStoreMemoryForTests()
}

function overlaySalvo(): Record<string, any> {
  const raw = window.localStorage.getItem(STORE_KEY)
  expect(raw).toBeTruthy()
  return JSON.parse(raw!)
}

const ANOTACOES_PH = '// Registre suas anotações de campanha aqui...'

describe('persistência do overlay (abas editáveis — grava NA HORA)', () => {
  it('editar um campo grava o overlay imediatamente e um novo mount relê', async () => {
    const r = renderFicha('anotacoes')
    const ta = (await screen.findByPlaceholderText(ANOTACOES_PH)) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Sessão 42: encontramos a tumba' } })
    // persistido NA HORA (canal imediato — sem botão salvar, sem pendência)
    expect(overlaySalvo().fm['Biografia.Anotacoes']).toBe('Sessão 42: encontramos a tumba')

    simulaReload(r)
    renderFicha('anotacoes')
    const ta2 = (await screen.findByPlaceholderText(ANOTACOES_PH)) as HTMLTextAreaElement
    expect(ta2.value).toBe('Sessão 42: encontramos a tumba')
  })

  it('moedas: topbar e aba INVENTÁRIO são o MESMO estado; sobrevive a reload', async () => {
    const ouro = Number(fm.Inventario.Ouro)
    const r = renderShell('inventario')
    await waitFor(() => expect(screen.getAllByTitle('Moedas').length).toBe(2))
    // edita pelo botão da ABA (o segundo no DOM; o primeiro é a topbar)
    fireEvent.click(screen.getAllByTitle('Moedas')[1])
    fireEvent.click(screen.getByText('+10'))
    // reflete nos DOIS lugares (uma fonte compartilhada dentro do app)
    for (const btn of screen.getAllByTitle('Moedas')) {
      expect(btn.textContent).toContain(String(ouro + 10))
    }
    // gravado NA HORA no overlay
    expect(overlaySalvo().fm['Inventario.Ouro']).toBe(ouro + 10)

    simulaReload(r)
    renderShell('inventario')
    await waitFor(() =>
      expect(
        screen
          .getAllByTitle('Moedas')
          .every((el) => el.textContent?.includes(String(ouro + 10))),
      ).toBe(true),
    )
  })
})

describe('volátil da aba COMBATE (Interativa.* com autosave)', () => {
  const rest = fm.Interativa.Recursos_Restantes
  const vit = Number(rest.Vitalidade)
  const moral = Number(rest.Moral)
  const temp = Number(rest.Moral_Temporaria || 0)
  const vitMax = Number(fm.Vida.Vitalidade)
  const moralMax = Number(fm.Vida.Moral)

  it('vida: topbar e barra da aba são o MESMO estado; persiste e sobrevive a reload', async () => {
    const r = renderShell('combate')
    const chip = await screen.findByTitle('Vida')
    expect(chip.textContent).toContain(`${vit + moral + temp}/${vitMax + moralMax}`)

    // painel do chip da topbar: −1 na linha VITALIDADE (primeira linha)
    fireEvent.click(chip)
    fireEvent.click(screen.getAllByText('−1')[0])
    const vitNovo = vit - 1
    // chip da topbar reflete na hora…
    expect(chip.textContent).toContain(`${vitNovo + moral + temp}/${vitMax + moralMax}`)
    // …e a barra de vida DA ABA mostra o mesmo valor (fonte compartilhada)
    expect(screen.getAllByText(`${vitNovo} / ${vitMax}`).length).toBeGreaterThan(0)

    // autosave debounced (semântica autoSaveInterativa): ainda não persistiu…
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
    // …até o flush (equivale ao timer de 800 ms / beforeunload)
    flushHeroEdits()
    expect(overlaySalvo().fm['Interativa.Recursos_Restantes.Vitalidade']).toBe(vitNovo)

    simulaReload(r)
    renderShell('combate')
    const chip2 = await screen.findByTitle('Vida')
    expect(chip2.textContent).toContain(`${vitNovo + moral + temp}/${vitMax + moralMax}`)
  })

  it('EM: diamantes da sub-aba MAGIAS gravam Interativa.Recursos_Restantes.EM', async () => {
    const emMax = Number(fm.Magias.EM)
    const emCur = Number(rest.EM)
    const r = renderFicha('combate')
    fireEvent.click(await screen.findByRole('button', { name: 'MAGIAS' }))
    // apaga o primeiro diamante aceso (toggle do design: clicar no i-ésimo
    // com i+1 === em zera pra i)
    const diamantes = screen.getAllByTitle('Alternar EM')
    expect(diamantes.length).toBe(emMax)
    fireEvent.click(diamantes[emCur - 1])
    expect(screen.getByText(`${emCur - 1} / ${emMax}`)).toBeTruthy()
    flushHeroEdits()
    expect(overlaySalvo().fm['Interativa.Recursos_Restantes.EM']).toBe(emCur - 1)

    simulaReload(r)
    renderFicha('combate')
    fireEvent.click(await screen.findByRole('button', { name: 'MAGIAS' }))
    expect(screen.getByText(`${emCur - 1} / ${emMax}`)).toBeTruthy()
  })

  it('condições: toggle persiste o container Condicoes_Ativas (chip segue visível)', async () => {
    const ativas = Object.keys(fm.Interativa.Condicoes_Ativas) // Carlos: 1 (Encantar Arma)
    // mesma pluralização do CombateTab (nAtivas>1 → "Ativas"; 1 → "Ativa"; 0 → "Nenhuma")
    const condLabelFor = (n: number) => (n ? `${n}${n > 1 ? ' Ativas' : ' Ativa'}` : 'Nenhuma')
    const r = renderFicha('combate')
    const btnCond = await screen.findByText('CONDIÇÕES')
    expect(screen.getByText(condLabelFor(ativas.length))).toBeTruthy()
    fireEvent.click(btnCond.closest('button')!)
    // desliga a primeira condição real (botão de remover é o ÚLTIMO do chip —
    // chips com seletor numérico têm o counter −/+ antes dele, #29; o nome
    // também aparece como magia no trilho de painéis → escopa pelo chip)
    const acharChip = () =>
      screen
        .getAllByText(ativas[0])
        .map((el) => el.parentElement as HTMLElement)
        .find((p) => p?.querySelector('button'))
    await waitFor(() => expect(acharChip()).toBeTruthy())
    fireEvent.click([...acharChip()!.querySelectorAll('button')].pop()!)
    expect(screen.getByText(condLabelFor(ativas.length - 1))).toBeTruthy()
    // chip continua visível (união extraído ∪ overlay), só desligado
    expect(acharChip()).toBeTruthy()
    flushHeroEdits()
    const salvo = overlaySalvo().fm['Interativa.Condicoes_Ativas']
    expect(Object.keys(salvo)).not.toContain(ativas[0])
    // demais condições (se houver) seguem no container salvo
    for (const outra of ativas.slice(1)) expect(Object.keys(salvo)).toContain(outra)

    simulaReload(r)
    renderFicha('combate')
    expect(await screen.findByText(condLabelFor(ativas.length - 1))).toBeTruthy()
  })
})

describe('log de mudanças (modo debug) e reset', () => {
  it('debug ON acumula entradas corretas; OFF não loga; clear limpa', async () => {
    window.__pleitostDebug!.enable()
    renderFicha('anotacoes')
    const ta = await screen.findByPlaceholderText(ANOTACOES_PH)
    fireEvent.change(ta, { target: { value: 'nota' } })

    const entradas = window.__pleitostDebug!.log()
    expect(entradas.length).toBe(1)
    expect(entradas[0]).toMatchObject({
      heroId: CARLOS_ID,
      path: 'Biografia.Anotacoes',
      valorNovo: 'nota',
      origem: 'anotacoes',
    })
    expect(entradas[0].valorAntigo).toBe(fm.Biografia.Anotacoes) // valor extraído
    expect(entradas[0].timestamp).toBeTruthy()

    window.__pleitostDebug!.disable()
    fireEvent.change(ta, { target: { value: 'nota 2' } })
    expect(window.__pleitostDebug!.log().length).toBe(1)

    window.__pleitostDebug!.clear()
    expect(window.__pleitostDebug!.log().length).toBe(0)
  })

  it('reset descarta as edições locais e volta ao FM extraído', async () => {
    renderFicha('anotacoes')
    const ta = (await screen.findByPlaceholderText(ANOTACOES_PH)) as HTMLTextAreaElement
    const original = String(fm.Biografia.Anotacoes ?? '')
    fireEvent.change(ta, { target: { value: 'temporário' } })
    expect(window.localStorage.getItem(STORE_KEY)).toBeTruthy()

    act(() => window.__pleitostDebug!.reset(CARLOS_ID))
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
    await waitFor(() => expect(ta.value).toBe(original))
  })
})
