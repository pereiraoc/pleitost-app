// @vitest-environment jsdom
// RODA DAS ESSÊNCIAS na ficha (2026-10-25): o Animista compra as Essências
// Elementais com os slots de magia pela roda do ciclo — a pura da sintonia vem
// de graça, cada slot abre uma vizinha; o anel das Experientes só aparece
// quando há slot Experiente.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
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

function Painel({ doc }: { doc: VaultDoc }) {
  const refs = useHeroRefs(doc)
  return <MagiasHabPanel doc={doc} refs={refs} forceEdit />
}

function renderHeroi(extra: Record<string, unknown>) {
  const id = createLocalEntity('Heroi', 'Animista', {
    ...emptyHeroFrontmatter(),
    Classe: '[[Animista]]',
    Sintonia: '[[Traço Elemental do Fogo]]',
    Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
    ...extra,
  })
  render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <TipProvider>
          <Painel doc={getLocalDoc(id)!} />
        </TipProvider>
      </DetailProvider>
    </CatalogProvider>,
  )
  return id
}
const no = (k: string) => document.querySelector(`[data-roda-no="${k}"]`) as SVGGElement | null
const estado = (k: string) => no(k)?.getAttribute('data-roda-estado')

const habLista = (id: string) =>
  (((getLocalDoc(id)!.frontmatter['Habilidades'] as Record<string, unknown>)?.['Lista'] ?? []) as Record<string, unknown>[])
const fonteDe = (id: string, alvo: string) => {
  const row = habLista(id).find((r) => Object.keys(r)[0] === `[[${alvo}]]`)
  return row ? String(Object.values(row)[0]) : null
}
const contador = (t: string) => document.querySelector(`[data-roda-contador="${t}"]`)?.textContent ?? ''

describe('Roda das Essências', () => {
  it('nível 1: a pura vem de graça; cada slot A abre uma vizinha', async () => {
    const id = renderHeroi({ Nível: 1 })
    await waitFor(() => expect(estado('A:Essência Flamejante')).toBe('tem'), { timeout: 15000 })
    expect(estado('A:Essência Explosiva')).toBe('livre')
    expect(estado('A:Essência Incendiária')).toBe('livre')
    expect(estado('A:Essência Sísmica')).toBe('fechado')
    expect(estado('A:Essência Hidratante')).toBe('oposto')
    expect(no('E:Essência Flamejante')).toBeNull() // sem Elementalista, sem anel E
    expect(contador('A')).toContain('0/2')
    fireEvent.click(no('A:Essência Explosiva')!)
    await waitFor(() => expect(fonteDe(id, 'Essência Explosiva Adepta')).toBe('Slot.A'))
    await waitFor(() => expect(estado('A:Essência Sísmica')).toBe('livre'), { timeout: 15000 })
    expect(contador('A')).toContain('1/2')
    fireEvent.click(no('A:Essência Sísmica')!)
    await waitFor(() => expect(contador('A')).toContain('2/2'), { timeout: 15000 })
    // sem slot: o resto do caminho fecha
    expect(estado('A:Essência Incendiária')).toBe('semVaga')
    // a pura concedida não se desfaz
    fireEvent.click(no('A:Essência Flamejante')!)
    expect(fonteDe(id, 'Essência Flamejante Adepta')).toBeNull()
    expect(estado('A:Essência Flamejante')).toBe('tem')
    // ligações que ENTRAM no elemento oposto (Água pro Fogo) viram X
    const cortes = [...document.querySelectorAll('[data-roda-corte]')].map((n) => n.getAttribute('data-roda-corte')).sort()
    expect(cortes).toEqual(['Essência Congelante|Essência Ciclonal', 'Essência Enraizante|Essência Torrencial'])
    // símbolos alquímicos (não emoji) nas marcas de elemento
    expect(document.querySelectorAll('[data-simbolo-elemento]').length).toBeGreaterThanOrEqual(4)
    // o slot A é do Círculo: nada de magia Anima avulsa pra aprender
    expect(document.querySelectorAll('button[aria-label^="Aprender "]').length).toBe(0)
  }, 40000)
  it('nível 4: o anel das Experientes aparece com os slots do Elementalista', async () => {
    renderHeroi({
      Nível: 4,
      Habilidades: { Lista: [{ '[[Essência Explosiva Adepta]]': 'Slot.A' }] },
    })
    await waitFor(() => expect(no('E:Essência Flamejante')).toBeTruthy(), { timeout: 15000 })
    await waitFor(() => expect(estado('E:Essência Flamejante')).toBe('livre'), { timeout: 15000 })
    expect(estado('E:Essência Explosiva')).toBe('livre')
    expect(estado('E:Essência Mineral')).toBe('fechado')
    expect(contador('E')).toContain('0/2')
    expect(no('M:Essência Flamejante')).toBeNull()
  }, 40000)
  it('ficha antiga (escolhas) migra pra slot e desfaz', async () => {
    const fx = JSON.parse(fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/heroi-adiantado-animista.json'), 'utf8'))
    const id = renderHeroi(fx.frontmatter)
    await waitFor(() => expect(estado('A:Essência Sísmica')).toBe('tem'), { timeout: 15000 })
    fireEvent.click(no('A:Essência Sísmica')!)
    await waitFor(() => expect(estado('A:Essência Sísmica')).not.toBe('tem'), { timeout: 15000 })
    const lista = JSON.stringify(habLista(id))
    expect(lista).not.toContain('Essência Sísmica Adepta')
    // a regravação já sai na forma nova
    expect(fonteDe(id, 'Essência Mineral Adepta')).toBe('Slot.A')
    expect(lista).not.toContain('Escolha.03.[[Magias Anima]]')
  }, 40000)
  it('nível 7: anel Mestre com as compostas ENTRE as vizinhas, gastando o slot M', async () => {
    const id = renderHeroi({
      Nível: 7,
      Habilidades: {
        Lista: [
          { '[[Essência Explosiva Adepta]]': 'Slot.A' },
          { '[[Essência Flamejante Experiente]]': 'Slot.E' },
          { '[[Essência Explosiva Experiente]]': 'Slot.E' },
        ],
      },
    })
    await waitFor(() => expect(no('M:Essência do Meteoro')).toBeTruthy(), { timeout: 15000 })
    await waitFor(() => expect(estado('M:Essência do Meteoro')).toBe('livre'), { timeout: 15000 })
    expect(estado('M:Essência do Sol')).toBe('fechado') // falta a Incendiária Experiente
    expect(no('M:Essência Flamejante')).toBeNull() // nada de Mestre "de uma essência só"
    fireEvent.click(no('M:Essência do Meteoro')!)
    await waitFor(() => expect(fonteDe(id, 'Essência do Meteoro')).toBe('Slot.M'))
  }, 40000)
  it('Druida do Oceano: a interface é a âncora, slots de vizinha em vizinha, sem corda', async () => {
    renderHeroi({
      Classe: '[[Druida]]',
      Sintonia: '[[Traço Elemental da Água]]',
      Nível: 3,
      Atributos: { Principal: 'INT', FOR: 0, AGI: 1, INT: 3, PRE: 2 },
      Habilidades: { Lista: [{ '[[Círculo do Oceano (Água e Terra)]]': 'Escolha.[[Círculo Druídico]]' }] },
    })
    await waitFor(() => expect(estado('A:Essência Torrencial')).toBe('tem'), { timeout: 15000 })
    expect(estado('A:Essência Enraizante')).toBe('tem')
    await waitFor(() => expect(estado('A:Essência Hidratante')).toBe('livre'), { timeout: 15000 })
    expect(estado('A:Essência Mineral')).toBe('livre')
    expect(estado('A:Essência Sísmica')).toBe('fechado')
    expect(estado('A:Essência Congelante')).toBe('fechado')
    expect(estado('A:Essência Flamejante')).toBe('oposto')
    expect(contador('A')).toContain('0/1')
    expect(document.querySelectorAll('[data-roda-corda]').length).toBe(0)
    // destaque FORTE só no elemento da sintonia; o outro do círculo, discreto
    const destaque = (el: string) => document.querySelector(`[data-roda-marca="${el}"]`)?.getAttribute('data-roda-destaque')
    expect(destaque('Água')).toBe('forte')
    expect(destaque('Terra')).toBe('fraco')
    expect(destaque('Fogo')).toBeNull()
    // a ligação acesa entre dois elementos vira de uma cor na outra
    const arco = document.querySelector('[data-roda-arco="Essência Enraizante|Essência Torrencial"]')
    expect(arco?.getAttribute('stroke')).toMatch(/^url\(#roda.*-arco-\d+\)$/)
  }, 40000)
})
