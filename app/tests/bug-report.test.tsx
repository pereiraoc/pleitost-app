// @vitest-environment jsdom
// REPORTAR BUG (#220) — req do usuário (as-is): botão acima do HERÓIS no
// painel esquerdo, fundo vermelho, ícone de bug, nome "REPORTAR BUG",
// qualquer um consegue enviar (sem login). O envio vai pro canal de
// bug-report.ts (Supabase INSERT-only; aqui, sender fake injetado).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { __setBugSenderForTests, type BugReport } from '../src/data/bug-report'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
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
})
afterEach(() => {
  cleanup()
  __setBugSenderForTests(null)
})

function renderApp() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/herois']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/herois" element={<HeroisPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('botão REPORTAR BUG (#220)', () => {
  it('fica ACIMA do HERÓIS no painel esquerdo, com fundo vermelho e ícone de bug', () => {
    renderApp()
    const btn = screen.getByRole('button', { name: /REPORTAR BUG/ })
    expect(btn.style.background).toContain('--red')
    expect(btn.textContent).toContain('🐞')
    // ordem no grupo de navegação: REPORTAR BUG vem antes do link HERÓIS
    const grupo = btn.closest('.nav-group')!
    const rotulos = [...grupo.querySelectorAll('.nav-item')].map((el) => el.textContent ?? '')
    const iBug = rotulos.findIndex((t) => t.includes('REPORTAR BUG'))
    const iHerois = rotulos.findIndex((t) => t.includes('HERÓIS'))
    expect(iBug).toBeGreaterThanOrEqual(0)
    expect(iHerois).toBeGreaterThan(iBug)
  })

  it('qualquer um envia: escreve → ENVIAR → reporte sai com contexto automático', async () => {
    const enviados: BugReport[] = []
    __setBugSenderForTests(async (r) => {
      enviados.push(r)
    })
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /REPORTAR BUG/ }))
    const dialog = screen.getByRole('dialog', { name: 'Reportar bug' })
    // #221: o modal fica POR CIMA da tela (portal no body), nunca preso
    // dentro do painel esquerdo (overflow/transform da sidebar)
    expect(dialog.closest('.sidebar')).toBeNull()
    expect(document.body.contains(dialog)).toBe(true)
    // vazio: enviar desabilitado
    const enviar = within(dialog).getByRole('button', { name: 'ENVIAR REPORTE' })
    expect((enviar as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Descrição do bug'), {
      target: { value: 'cliquei no X e sumiu tudo' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'ENVIAR REPORTE' }))
    expect(await within(dialog).findByText(/Reporte enviado/)).toBeTruthy()
    expect(enviados).toHaveLength(1)
    expect(enviados[0].texto).toBe('cliquei no X e sumiu tudo')
    expect(enviados[0].contexto.versao).toBeTruthy()
    expect(enviados[0].contexto.userAgent).toBeTruthy()
  })

  it('falha de envio mostra o erro e mantém o texto pra tentar de novo', async () => {
    __setBugSenderForTests(async () => {
      throw new Error('Servidor de reportes indisponível — tenta de novo mais tarde.')
    })
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /REPORTAR BUG/ }))
    const dialog = screen.getByRole('dialog', { name: 'Reportar bug' })
    fireEvent.change(within(dialog).getByLabelText('Descrição do bug'), {
      target: { value: 'algo quebrou' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'ENVIAR REPORTE' }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(within(dialog).getByText(/indisponível/)).toBeTruthy()
    // o texto continua lá pra reenviar
    expect(
      (within(dialog).getByLabelText('Descrição do bug') as HTMLTextAreaElement).value,
    ).toBe('algo quebrou')
  })
})
