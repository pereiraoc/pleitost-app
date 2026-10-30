// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail } from '../src/data/detail-context'
import { MagiasHabPanel } from '../src/components/ficha/HabilidadesTab'
import { useHeroRefs } from '../src/components/ficha/useHeroRefs'
import type { VaultDoc } from '../src/data/types'
import { TipProvider } from '../src/components/ficha/tooltips'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest)

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
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

// Pedido do mestre (2026-10-29): "na parte de magias, fora do Alterar, não
// consigo clicar numa essência pra ver o que ela faz (abrir na barra lateral),
// só se ela tá selecionada" — e "olha o planejamento também". Regra: fora do
// Alterar o clique SEMPRE abre a nota; no Alterar (e no Planejamento) gasta/
// desfaz quando dá, e nos outros nós abre a nota.
const alvo: { atual: { kind: string; id: string } | null } = { atual: null }
function EspiaoDetail() {
  const d = useDetail()
  alvo.atual = (d?.target as { kind: string; id: string } | undefined) ?? null
  return null
}
beforeEach(() => {
  alvo.atual = null
})

function Painel({ doc, edit }: { doc: VaultDoc; edit: boolean }) {
  const refs = useHeroRefs(doc)
  return <MagiasHabPanel doc={doc} refs={refs} forceEdit={edit} />
}
const heroiFogo = (nivel: number) =>
  createLocalEntity('Heroi', 'Animista', {
    ...emptyHeroFrontmatter(),
    Classe: '[[Animista]]',
    Sintonia: '[[Traço Elemental do Fogo]]',
    Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
    Nível: nivel,
  })
function renderMagias(id: string, edit: boolean) {
  render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <EspiaoDetail />
        <TipProvider>
          <Painel doc={getLocalDoc(id)!} edit={edit} />
        </TipProvider>
      </DetailProvider>
    </CatalogProvider>,
  )
}
const no = (k: string) => document.querySelector(`[data-roda-no="${k}"]`) as SVGGElement | null
const estado = (k: string) => no(k)?.getAttribute('data-roda-estado')
const habLista = (id: string) => JSON.stringify((getLocalDoc(id)!.frontmatter['Habilidades'] as Record<string, unknown>)?.['Lista'] ?? [])
const abriu = async (nome: string) => waitFor(() => expect(alvo.atual?.id ?? '').toMatch(new RegExp(`/${nome}$`)))

describe('Círculo das Essências: clicar abre a regra', () => {
  it('fora do Alterar: livre, oposta, fechada e escolhida abrem a nota — sem gastar slot', async () => {
    const id = heroiFogo(1)
    renderMagias(id, false)
    await waitFor(() => expect(estado('A:Essência Flamejante')).toBe('tem'), { timeout: 15000 })
    const antes = habLista(id)
    for (const [k, nota] of [
      ['A:Essência Explosiva', 'Essência Explosiva Adepta'],
      ['A:Essência Hidratante', 'Essência Hidratante Adepta'],
      ['A:Essência Sísmica', 'Essência Sísmica Adepta'],
      ['A:Essência Flamejante', 'Essência Flamejante Adepta'],
    ] as const) {
      fireEvent.click(no(k)!)
      await abriu(nota)
    }
    expect(habLista(id)).toBe(antes)
    expect(estado('A:Essência Explosiva')).toBe('livre')
  }, 40000)

  it('no Alterar: livre gasta o slot; fechada e concedida abrem a nota', async () => {
    const id = heroiFogo(1)
    renderMagias(id, true)
    await waitFor(() => expect(estado('A:Essência Explosiva')).toBe('livre'), { timeout: 15000 })
    fireEvent.click(no('A:Essência Sísmica')!)
    await abriu('Essência Sísmica Adepta')
    fireEvent.click(no('A:Essência Flamejante')!) // concedida: não desfaz
    await abriu('Essência Flamejante Adepta')
    fireEvent.click(no('A:Essência Explosiva')!)
    await waitFor(() => expect(habLista(id)).toContain('{"[[Essência Explosiva Adepta]]":"Slot.A"}'))
  }, 40000)

  it('Planejamento: no Círculo do nível, essência fechada abre a nota', { timeout: 60000 }, async () => {
    const id = heroiFogo(1)
    render(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <EspiaoDetail />
          <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Routes>
          </MemoryRouter>
        </DetailProvider>
      </CatalogProvider>,
    )
    fireEvent.click(await screen.findByText('PLANEJAMENTO'))
    await waitFor(() => expect(document.querySelector('[data-nivel="2"]')).toBeTruthy(), { timeout: 20000 })
    const card2 = document.querySelector('[data-nivel="2"]') as HTMLElement
    fireEvent.click([...card2.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('MAGIAS'))!)
    const noP = (k: string) => document.querySelector(`[data-roda-essencias] [data-roda-no="${k}"]`)
    await waitFor(() => expect(noP('A:Essência Sísmica')?.getAttribute('data-roda-estado')).toBe('fechado'), { timeout: 15000 })
    fireEvent.click(noP('A:Essência Sísmica')!)
    await abriu('Essência Sísmica Adepta')
  })
})
