// @vitest-environment jsdom
// ABAS DO ATLAS (2026-09-09) — pedido do mestre: a página de Porto Alegre
// tinha a lista de bairros no fim de tudo e o mapa enfiado nos Detalhes. Agora
// cada coisa tem aba: os lugares-filhos (rótulo = o subtipo deles no plural, e
// é por isso que se chama "Bairros" sem ninguém escrever "Bairros"), o MAPA e
// o TRANSPORTE — este último com a malha desenhada sobre o mapa real.
// Dataset REAL da POA como oráculo.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { setActiveContexto } from '../src/data/reskin'
import { DocView } from '../src/components/compendium/DocPage'
import { ehCidadeDaMalha } from '../src/components/compendium/LocationSheet'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

let catalog: ReturnType<typeof buildCatalog>
let def: ContextoDef
let poa: VaultDoc
let moinhos: VaultDoc

function docPorBasename(basename: string): VaultDoc {
  const m = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const achado = m.docs.find((d) => d.basename === basename)
  if (!achado) throw new Error(`sem doc: ${basename}`)
  return JSON.parse(fs.readFileSync(path.join(cyberDir, `${achado.id}.json`), 'utf8')) as VaultDoc
}

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  if (!temDataset) return
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  catalog = { ...buildCatalog(manifest), contextoDef: def }
  poa = docPorBasename('Porto Alegre')
  moinhos = docPorBasename('Moinhos de Vento')
})

afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

function montar(doc: VaultDoc) {
  setActiveContexto(def)
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const abas = () => screen.getAllByRole('tab').map((b) => b.textContent)

describe.skipIf(!temDataset)('abas do Atlas em Porto Alegre', () => {
  it('a aba dos lugares-filhos se chama pelo SUBTIPO deles no plural e lista os bairros', async () => {
    const { container } = montar(poa)
    // o rótulo só existe depois que as Localizações carregam (o subtipo é delas)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Bairros' })).toBeTruthy())
    // report 2026-09-10: na cidade o MAPA é a página. Os Detalhes dela são o
    // template vazio da vault e somem; Locais de Interesse e Hexploração
    // também (não há callout, e a POA não faz hexcrawl).
    expect(abas()).toEqual(['Mapa', 'Transporte', 'Bairros', 'Comércio', 'Serviços'])
    fireEvent.click(screen.getByRole('tab', { name: 'Bairros' }))
    const filhos = Array.from(container.querySelectorAll('[data-atlas-child]')).map(
      (a) => a.getAttribute('data-atlas-child')?.split('/').pop(),
    )
    expect(filhos).toContain('Moinhos de Vento')
    expect(filhos).toContain('Restinga')
    expect(filhos.length).toBeGreaterThan(10)
    // e não está mais no fim de outra aba
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(container.querySelectorAll('[data-atlas-child]').length).toBe(0)
  })

  it('a aba MAPA traz o mapa da nota com os pinos; a de TRANSPORTE, a malha por cima dele', async () => {
    const { container } = montar(poa)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Mapa' })).toBeTruthy())
    // MAPA é a PRIMEIRA aba da cidade, e já abre nela
    expect(screen.getByRole('tab', { name: 'Mapa' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }))
    await waitFor(() => expect(container.querySelector('[data-mapa-local]')).not.toBeNull())
    expect(container.querySelectorAll('[data-marker]').length).toBeGreaterThan(5)
    // sem canvas (jsdom) não há área de bairro: o bairro cai no pino de sempre
    expect(container.querySelector('[data-marker="Moinhos de Vento"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Transporte' }))
    await waitFor(() => expect(container.querySelector('[data-malha-no-mapa]')).not.toBeNull())
    // as linhas do filtro desenhadas sobre o mapa real, nas posições da nota
    const traços = container.querySelectorAll('[data-malha-no-mapa] path[data-linha]')
    expect(traços.length).toBeGreaterThan(5)
    // ... e sobre o MESMO mapa da aba MAPA (não o esquemático)
    expect(container.querySelector('[data-mapa-local] img')?.getAttribute('src')).toContain(
      'Porto%20Alegre%20RPG',
    )
    expect(container.querySelector('[data-malha-mapa]')).toBeNull()
    // as capacidades da aba TRANSPORTE da ficha vêm junto…
    expect(container.querySelector('[data-filtro]')).not.toBeNull()
    expect(container.querySelector('[data-planejador]')).not.toBeNull()
    expect(container.querySelector('[data-legenda]')).not.toBeNull()
    // … menos o cartão do herói, que é coisa de ficha
    expect(container.querySelector('[data-transporte-ficha]')).toBeNull()
  })

  it('a legenda seleciona a linha e o traço dela engrossa no mapa real', async () => {
    const { container } = montar(poa)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Transporte' })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'Transporte' }))
    await waitFor(() => expect(container.querySelector('[data-legenda]')).not.toBeNull())
    const legenda = container.querySelector('[data-legenda]') as HTMLElement
    const botao = within(legenda).getAllByRole('button')[0] as HTMLButtonElement
    const id = botao.getAttribute('data-linha')!
    fireEvent.click(botao)
    expect(container.querySelector('[data-parada-a-parada]')).not.toBeNull()
    const escolhida = container.querySelector(`[data-malha-no-mapa] path[data-linha="${id}"]`)!
    const outra = [...container.querySelectorAll('[data-malha-no-mapa] path[data-linha]')].find(
      (p) => p.getAttribute('data-linha') !== id,
    )!
    expect(Number(escolhida.getAttribute('opacity'))).toBeGreaterThan(
      Number(outra.getAttribute('opacity')),
    )
  })
})

describe.skipIf(!temDataset)('abas do Atlas num bairro', () => {
  it('o subtipo dos filhos muda o rótulo; sem malha própria, sem aba TRANSPORTE', async () => {
    montar(moinhos)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Pontos de Interesse' })).toBeTruthy())
    // MAPA e TRANSPORTE somem em quem não tem mapa próprio nem é a cidade da
    // malha — não ficam como aba desabilitada nos 200 e tantos lugares.
    expect(screen.queryByRole('tab', { name: 'Transporte' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Mapa' })).toBeNull()
  })

  it('a aba TRANSPORTE é da CIDADE que o contexto declara, não de qualquer lugar', () => {
    setActiveContexto(def)
    expect(def.transporte?.cidade).toBe('Porto Alegre')
    expect(ehCidadeDaMalha(poa)).toBe(true)
    expect(ehCidadeDaMalha(moinhos)).toBe(false)
    setActiveContexto(null)
    expect(ehCidadeDaMalha(poa)).toBe(false)
  })
})
