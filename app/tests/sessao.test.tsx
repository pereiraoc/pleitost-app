// @vitest-environment jsdom
// SESSÃO (#101) — fluxo completo da tela: lista → criar sessão de um GRUPO da
// vault → ORDEM DE INICIATIVA com a vida REAL das fichas (useVidaLocal) →
// editar init reordena → PRÓXIMO avança a vez e fecha o turno (round+1,
// semântica do combat-tracker do plugin) → DETALHES mostra código/mestre →
// SAIR volta pra lista com a sessão registrada.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessaoPage } from '../src/components/sessao/SessaoPage'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetSessionStoreForTests, listSessions } from '../src/data/session-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

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
  __resetLocalStoreForTests()
  __resetSessionStoreForTests()
})
afterEach(cleanup)

function renderSessao() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/sessao']}>
        <Routes>
          <Route path="/sessao" element={<SessaoPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

// #203: criar sessão NUNCA seleciona grupo — a ficha de grupo existe só a
// partir das sessões (jogadores que entram).
async function criarSessao() {
  fireEvent.click(await screen.findByText('+ Criar nova sessão'))
}

describe('SESSÃO (#101): lista → criar → iniciativa → detalhes → sair', () => {
  it('cria sessão SEM grupo (#203): iniciativa abre com o hint da mesa vazia', async () => {
    renderSessao()
    expect(await screen.findByText('// LISTA DE SESSÕES')).toBeTruthy()
    await criarSessao()
    expect(await screen.findByText('⚔ ORDEM DE INICIATIVA')).toBeTruthy()
    expect(screen.getByText('Turno 1')).toBeTruthy()
    // sem grupo pré-selecionado: o roster vem dos JOGADORES da sessão
    expect(screen.getByText(/O grupo da mesa se monta pelos JOGADORES/)).toBeTruthy()
    // PRÓXIMO com mesa vazia não avança turno (tracker sem combatentes)
    fireEvent.click(screen.getByText('▶ PRÓXIMO'))
    expect(screen.getByText('Turno 1')).toBeTruthy()
  })

  it('DETALHES mostra nome/código/mestre; SAIR volta pra lista com a sessão', async () => {
    renderSessao()
    await criarSessao()
    await screen.findByText('⚔ ORDEM DE INICIATIVA')
    fireEvent.click(screen.getByText('DETALHES DA SESSÃO'))
    expect(await screen.findByText('MESTRE')).toBeTruthy()
    const codigo = listSessions()[0].codigo
    expect(screen.getByText(codigo)).toBeTruthy()
    expect(screen.getByText(/FERRAMENTAS DE MESTRE/)).toBeTruthy()

    fireEvent.click(screen.getByText('⏏ SAIR'))
    expect(await screen.findByText('// LISTA DE SESSÕES')).toBeTruthy()
    // sessão continua na lista, com Entrar
    expect(screen.getByText('▶ Entrar')).toBeTruthy()
    expect(screen.getByText(codigo)).toBeTruthy()
  })

  it('entrar por código desconhecido cria o registro e entra', async () => {
    renderSessao()
    const input = await screen.findByPlaceholderText('Código da sessão')
    fireEvent.change(input, { target: { value: 'ZZTOP1' } })
    fireEvent.click(screen.getByText('Entrar →'))
    // entra (mesa vazia → hint dos jogadores)
    expect(await screen.findByText(/O grupo da mesa se monta pelos JOGADORES/)).toBeTruthy()
    expect(listSessions()[0].codigo).toBe('ZZTOP1')
  })
})
