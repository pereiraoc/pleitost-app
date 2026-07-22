// @vitest-environment jsdom
// Pedido 2026-07-21 (2 partes):
// (a) tesouro aberto no painel de DETALHES (direita, espaço estreito) mostrava
//     as 3 cartas de qualidade LADO A LADO espremidas — na sidebar elas devem
//     empilhar (uma embaixo da outra): registro do doc-view 'item' agora passa
//     `sidebar` pro ItemSheet, que adiciona `item-cards-stack`.
// (b) preferência em Config/GERAL ("Clique Abre nos Detalhes"): com ela LIGADA,
//     clicar em técnicas/habilidades/ações/magias/consumíveis (todo ItemHover/
//     ConsumivelHover da ficha) abre o doc nos DETALHES; DESLIGADA (default)
//     mantém só o tooltip — comportamento clássico preservado.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router-dom'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail } from '../src/data/detail-context'
import { ItemHover, ConsumivelHover } from '../src/components/item-card'
import { ItemSheet, isItem } from '../src/components/compendium/ItemView'
import { resolveDocView } from '../src/components/compendium/doc-view-registry'
import { __resetSettingsForTests } from '../src/settings'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as Parameters<typeof buildCatalog>[0]
const catalog = buildCatalog(manifest)
const ANEL = JSON.parse(
  fs.readFileSync(
    path.join(
      vaultDataDir,
      'Sistema/Equipamento/Tesouros/Equipamentos/Equipamentos de Defesa/Anel da Resistência.json',
    ),
    'utf8',
  ),
) as VaultDoc
const POCAO = JSON.parse(
  fs.readFileSync(
    path.join(vaultDataDir, 'Sistema/Equipamento/Tesouros/Consumíveis/Poção da Coragem.json'),
    'utf8',
  ),
) as VaultDoc

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
  // useAssetIndex faz fetch do índice — 404 silencioso serve (carta sem figura).
  globalThis.fetch = (async () => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  })) as unknown as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(() => {
  cleanup()
  __resetSettingsForTests()
})

/** Espião do painel de detalhes: expõe o alvo aberto. */
const alvo: { atual: { kind: string; id: string } | null } = { atual: null }
function EspiaoDetail() {
  const d = useDetail()
  alvo.atual = d?.target ?? null
  return null
}

describe('(a) cartas de qualidade EMPILHADAS no painel de detalhes', () => {
  it('sidebar: ItemSheet ganha item-cards-stack (coluna); página cheia não', () => {
    const side = render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <ItemSheet doc={ANEL} sidebar />
        </CatalogProvider>
      </MemoryRouter>,
    )
    expect(side.container.querySelector('.item-page-card.item-cell-tiers.item-cards-stack')).toBeTruthy()
    cleanup()
    const page = render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <ItemSheet doc={ANEL} />
        </CatalogProvider>
      </MemoryRouter>,
    )
    expect(page.container.querySelector('.item-cell-tiers')).toBeTruthy()
    expect(page.container.querySelector('.item-cards-stack')).toBeNull()
  })

  it('o REGISTRO do doc-view repassa o opts.sidebar (era ignorado — o bug)', () => {
    expect(isItem(ANEL)).toBe(true)
    const view = resolveDocView(ANEL)!
    const { container } = render(
      <MemoryRouter>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>{view(ANEL, { sidebar: true })}</DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    expect(container.querySelector('.item-cards-stack')).toBeTruthy()
  })
})

describe('(b) preferência "Clique Abre nos Detalhes" (Config/GERAL)', () => {
  it('default DESLIGADA: clique no ItemHover NÃO abre detalhes (só tooltip)', () => {
    alvo.atual = null
    const { getByText } = render(
      <DetailProvider>
        <ItemHover doc={ANEL}>
          <span>Anel da Resistência</span>
        </ItemHover>
        <EspiaoDetail />
      </DetailProvider>,
    )
    fireEvent.click(getByText('Anel da Resistência'))
    expect(alvo.atual).toBeNull()
  })

  it('LIGADA: clique no ItemHover abre kind=doc com o id do doc', () => {
    window.localStorage.setItem('pleitost.settings.clickDetalhes', 'true')
    alvo.atual = null
    const { getByText } = render(
      <DetailProvider>
        <ItemHover doc={ANEL}>
          <span>Anel da Resistência</span>
        </ItemHover>
        <EspiaoDetail />
      </DetailProvider>,
    )
    fireEvent.click(getByText('Anel da Resistência'))
    expect(alvo.atual?.kind).toBe('doc')
    expect(alvo.atual?.id).toBe(ANEL.id)
  })

  it('LIGADA: ConsumivelHover (poções) também abre nos detalhes', () => {
    window.localStorage.setItem('pleitost.settings.clickDetalhes', 'true')
    alvo.atual = null
    const { getByText } = render(
      <DetailProvider>
        <ConsumivelHover doc={POCAO}>
          <span>Poção da Coragem</span>
        </ConsumivelHover>
        <EspiaoDetail />
      </DetailProvider>,
    )
    fireEvent.click(getByText('Poção da Coragem'))
    expect(alvo.atual?.kind).toBe('doc')
    expect(alvo.atual?.id).toBe(POCAO.id)
  })

  it('DESLIGADA: ConsumivelHover segue só tooltip', () => {
    alvo.atual = null
    const { getByText } = render(
      <DetailProvider>
        <ConsumivelHover doc={POCAO}>
          <span>Poção da Coragem</span>
        </ConsumivelHover>
        <EspiaoDetail />
      </DetailProvider>,
    )
    fireEvent.click(getByText('Poção da Coragem'))
    expect(alvo.atual).toBeNull()
  })
})
