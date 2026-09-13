// @vitest-environment jsdom
// Pedidos do mestre (2026-09-12), na lista do BESTIÁRIO:
//  - quem tem Modificador (Competente/Solo/Elite) ganha uma tarja ao lado do
//    losango TIER, pra dar pra ver de longe quem é;
//  - criatura LOCAL com o mesmo nome de uma da base some (o botão "📥 Criar
//    do Bestiário" copiava o monstro da vault com o MESMO nome e a lista
//    mostrava os dois — "representante da camisa 12").
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import {
  createLocalEntity,
  emptyMonstroFrontmatter,
  getLocalEntity,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { idsLocaisDuplicados, nomeSemColisao } from '../src/data/local-vault-dupes'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexDocEntry, IndexManifest } from '../src/data/types'

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
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderNpcs() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/npcs']}>
        <Routes>
          <Route path="/npcs" element={<NpcsPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** O card inteiro de uma criatura (o nome vive no `.npc-nome`). */
function card(nome: string): HTMLElement | null {
  const alvo = [...document.querySelectorAll('.npc-nome')].find((n) => n.textContent === nome)
  return (alvo?.closest('.npc-card') as HTMLElement | undefined) ?? null
}

const entry = (basename: string, subtype = 'Monstro'): IndexDocEntry =>
  ({ id: `v/${basename}`, path: '', basename, type: 'Criatura', subtype, kind: 'content' }) as IndexDocEntry

describe('tarja do Modificador na lista', () => {
  it('quem tem Modificador mostra a tarja; quem não tem, não', async () => {
    renderNpcs()
    fireEvent.click(await screen.findByText('BESTIÁRIO'))
    await waitFor(() => expect(card('Guarda Oficial')).not.toBeNull())
    // Guarda Oficial: FM `Modificador: Competente` (vault de fantasia)
    // o texto vai cru e o CSS (.combate-monstro-mod) faz o caixa-alta, mesma
    // convenção da tag do roster de combate
    const tarja = card('Guarda Oficial')!.querySelector('.combate-monstro-mod')
    expect(tarja?.textContent).toBe('Competente')
    expect(tarja?.classList.contains('is-competente')).toBe(true)
    // Arruaceiro não declara Modificador — nenhuma tarja
    expect(card('Arruaceiro')!.querySelector('.combate-monstro-mod')).toBeNull()
  }, 30000)
})

describe('duplicado LOCAL × BASE', () => {
  it('a regra pura casa por nome dentro da mesma família', () => {
    const vault = [entry('Guarda Oficial'), entry('Arruaceiro')]
    const locais = [
      { ...entry('guarda oficial'), id: 'local:Monstro:1' },
      { ...entry('Nova Criatura'), id: 'local:Monstro:2' },
    ]
    expect(idsLocaisDuplicados(vault, locais)).toEqual(['local:Monstro:1'])
  })

  it('o nome sem colisão ganha o sufixo de cópia, e numera se repetir', () => {
    const ocupados = ['Guarda Oficial', 'Guarda Oficial (cópia)']
    expect(nomeSemColisao('Arruaceiro', ocupados)).toBe('Arruaceiro')
    expect(nomeSemColisao('Guarda Oficial', ocupados)).toBe('Guarda Oficial (cópia 2)')
    expect(nomeSemColisao('Guarda Oficial', ['Guarda Oficial'])).toBe('Guarda Oficial (cópia)')
  })

  it('a lista mostra só o da base, e o local homônimo é apagado de verdade', async () => {
    const idLocal = createLocalEntity('Monstro', 'Guarda Oficial', emptyMonstroFrontmatter())
    renderNpcs()
    fireEvent.click(await screen.findByText('BESTIÁRIO'))
    await waitFor(() => expect(card('Guarda Oficial')).not.toBeNull())
    await waitFor(() => expect(getLocalEntity(idLocal)).toBeUndefined())
    const nomes = [...document.querySelectorAll('.npc-nome')].map((n) => n.textContent)
    expect(nomes.filter((n) => n === 'Guarda Oficial')).toHaveLength(1)
  }, 30000)

  it('local com nome PRÓPRIO continua na lista (trap reverso)', async () => {
    const idLocal = createLocalEntity('Monstro', 'Bicho do Teste', emptyMonstroFrontmatter())
    renderNpcs()
    fireEvent.click(await screen.findByText('BESTIÁRIO'))
    await waitFor(() => expect(card('Bicho do Teste')).not.toBeNull())
    expect(getLocalEntity(idLocal)).toBeDefined()
  }, 30000)
})
