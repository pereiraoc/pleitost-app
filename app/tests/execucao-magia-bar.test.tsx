// @vitest-environment jsdom
// Execução (2026-10-02): a barra de magias da ficha mostra, por escola
// proficiente, COMO este conjurador executa no mundo (reskin.execucao da
// Contexto-Def) — cascata classe → sintonia → padrão; fantasia não mostra
// nada. O card da magia (itemCardHtml) ganha a row "Execução" quando o ctx
// traz o texto. Heróis vêm da fantasia (a POA não tem heróis extraídos); o
// contexto REAL da POA é o oráculo (pula se ausente).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { itemCardHtml } from '../src/components/item-card'
import { heroPath } from '../src/paths'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temContexto = fs.existsSync(path.join(cyberDir, 'contexto.json'))
const ZUKO_ID = 'Sistema/Criaturas/Heróis/Zuko'
const LEONEL_ID = 'Sistema/Criaturas/Heróis/Leonel Bravolla'
const BOLA_ID = 'Sistema/Criação de Personagem/Magia/Magia Anima/Magia Anima Experiente/Bola de Fogo'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

let manifest: IndexManifest
let def: ContextoDef

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
  if (temContexto) def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
})
beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

function montar(heroId: string, contextoDef: ContextoDef | undefined) {
  const catalog = contextoDef ? { ...buildCatalog(manifest), contextoDef } : buildCatalog(manifest)
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter initialEntries={[heroPath(heroId, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

async function abrirMagias() {
  const aba = await screen.findByText(/^(MAGIAS|TECNOLOGIAS)$/, {}, { timeout: 15000 })
  fireEvent.click(aba)
}

const linhaExecucao = (escola: string) =>
  waitFor(
    () => {
      const el = document.querySelector(`[data-magia-execucao="${escola}"]`)
      if (!el) throw new Error('sem linha de execução')
      return el as HTMLElement
    },
    { timeout: 15000 },
  )

describe('linha EXECUTA na barra de magias', () => {
  it('Zuko (Animista, Fogo) na POA: texto da classe', async () => {
    if (!temContexto) return
    montar(ZUKO_ID, def)
    await abrirMagias()
    const linha = await linhaExecucao('Anima')
    expect(linha.textContent).toContain(def.reskin.execucao!.classes.Animista!.Anima!)
  }, 40000)

  it('Leonel (Druida, Água) com mundo SEM classes.Druida: cai na sintonia', async () => {
    if (!temContexto) return
    const ex = def.reskin.execucao!
    const semDruida: ContextoDef = {
      ...def,
      reskin: {
        ...def.reskin,
        execucao: { ...ex, classes: Object.fromEntries(Object.entries(ex.classes).filter(([k]) => k !== 'Druida')) },
      },
    }
    montar(LEONEL_ID, semDruida)
    await abrirMagias()
    const linha = await linhaExecucao('Anima')
    expect(linha.textContent).toContain(ex.sintonias['Traço Elemental da Água']!.Anima!)
  }, 40000)

  it('fantasia (sem contexto): a barra monta e não há linha de execução', async () => {
    montar(ZUKO_ID, undefined)
    await abrirMagias()
    await screen.findByText(/POTÊNCIA MÁGICA/i, {}, { timeout: 15000 })
    expect(document.querySelector('[data-magia-execucao]')).toBeNull()
  }, 40000)
})

describe('card da magia (itemCardHtml)', () => {
  it('ganha a row Execução só quando o ctx traz o texto', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${BOLA_ID}.json`), 'utf8')) as VaultDoc
    const com = itemCardHtml(doc, 'E', null, false, false, undefined, false, { potencia: 4, mod: 1, execucao: 'Solta a carga.' })
    expect(com).toContain('<b>Execução</b>Solta a carga.')
    const sem = itemCardHtml(doc, 'E', null, false, false, undefined, false, { potencia: 4, mod: 1 })
    expect(sem).not.toContain('Execução')
  })
})
