// @vitest-environment jsdom
// TELA CONTEXTO (2026-09-09) — pedido do mestre: os dossiês do presente
// agrupados pelo grupo (a pasta), cada um num card com a figura contida à
// direita (clicar na figura amplia, clicar na esquerda abre o dossiê ali
// mesmo, e aberto NÃO repete a figura), e a linha do tempo do passado num
// botão fechado lá em cima. Dataset REAL da POA como oráculo.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { ContextoPage } from '../src/components/compendium/ContextoPage'
import { semFiguras } from '../src/components/compendium/contexto-template'
import { APP_NAV, NAV_MUNDOS, NAV_ROUTES, navSection } from '../src/components/layout/design-nav'
import type { IndexManifest } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'index.json'))

let catalog: ReturnType<typeof buildCatalog>

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  if (!temDataset) return
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  catalog = buildCatalog(manifest)
})

afterEach(cleanup)

function montar() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <ContextoPage />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('semFiguras', () => {
  it('tira o embed de imagem solto e deixa o resto intacto', () => {
    const corpo = ['![[Degradação Ambiental.png]]', '', '#### Poluição', 'O ar carrega poeira.'].join('\n')
    expect(semFiguras(corpo)).toBe(['', '#### Poluição', 'O ar carrega poeira.'].join('\n'))
    // texto com imagem no meio da frase não é embed solto: fica
    expect(semFiguras('veja ![[x.png]] aqui')).toBe('veja ![[x.png]] aqui')
    expect(semFiguras('![[Nota]]')).toBe('![[Nota]]') // transclusão de nota, não figura
  })
})

describe.skipIf(!temDataset)('tela CONTEXTO', () => {
  it('agrupa os dossiês pelo grupo da vault, com o nome do grupo acima dos cards', async () => {
    const { container } = montar()
    await waitFor(() =>
      expect(container.querySelector('[data-ctx-grupo="Ambiente e Sustentabilidade"]')).not.toBeNull(),
    )
    const grupos = [...container.querySelectorAll('[data-ctx-grupo]')].map((g) =>
      g.getAttribute('data-ctx-grupo'),
    )
    expect(grupos).toContain('Ambiente e Sustentabilidade')
    expect(grupos).toContain('Economia e Sobrevivência')
    expect(grupos.length).toBeGreaterThan(5)
    const ambiente = container.querySelector('[data-ctx-grupo="Ambiente e Sustentabilidade"]')!
    expect(ambiente.querySelector('.ctx-grupo-titulo')?.textContent).toBe('Ambiente e Sustentabilidade')
    const cards = [...ambiente.querySelectorAll('[data-ctx-card]')].map((c) =>
      c.getAttribute('data-ctx-card'),
    )
    expect(cards).toContain('Degradação Ambiental')
    // a nota-da-pasta (índice de transclusões) não é card
    expect(cards).not.toContain('Ambiente e Sustentabilidade')
  })

  it('o card mostra assunto e figura à direita; aberto, traz o corpo SEM a figura', async () => {
    const { container } = montar()
    await waitFor(() =>
      expect(container.querySelector('[data-ctx-card="Degradação Ambiental"]')).not.toBeNull(),
    )
    const card = container.querySelector('[data-ctx-card="Degradação Ambiental"]') as HTMLDetailsElement
    await waitFor(() => expect(card.querySelector('.ctx-card-assunto')?.textContent).toContain('poluição'))
    // figura contida no card, à direita do texto
    await waitFor(() =>
      expect(card.querySelector('[data-ctx-figura="Degradação Ambiental.png"] img')).not.toBeNull(),
    )
    // fechado de início: o corpo não está aberto
    expect(card.open).toBe(false)
    // clicar na ESQUERDA abre o dossiê aqui mesmo
    fireEvent.click(card.querySelector('.ctx-card-texto') as HTMLElement)
    expect(within(card).getByText(/poeira metálica/)).toBeTruthy()
    // e o corpo aberto NÃO repete a figura (só a miniatura do card segue)
    expect(card.querySelectorAll('img').length).toBe(1)
    expect(within(card).getByText('abrir página →')).toBeTruthy()
  })

  it('clicar na figura amplia e NÃO abre o card', async () => {
    const { container } = montar()
    await waitFor(() =>
      expect(container.querySelector('[data-ctx-card="Degradação Ambiental"] [data-ctx-figura]')).not.toBeNull(),
    )
    const card = container.querySelector('[data-ctx-card="Degradação Ambiental"]') as HTMLDetailsElement
    await waitFor(() => expect(card.querySelector('[data-ctx-figura] img')).not.toBeNull())
    fireEvent.click(card.querySelector('[data-ctx-figura] img') as HTMLElement)
    expect(document.querySelector('[data-lightbox]')).not.toBeNull()
    expect(card.open).toBe(false)
  })

  it('a linha do tempo do passado abre num botão, fechada de início e em ordem', async () => {
    const { container } = montar()
    const caixa = container.querySelector('[data-linha-do-tempo]') as HTMLDetailsElement
    expect(caixa).not.toBeNull()
    expect(caixa.open).toBe(false)
    expect(caixa.querySelector('summary')?.textContent).toContain('LINHA DO TEMPO')
    fireEvent.click(caixa.querySelector('summary') as HTMLElement)
    await waitFor(() => expect(caixa.querySelectorAll('.ctx-tl-item').length).toBeGreaterThan(5))
    const datas = [...caixa.querySelectorAll('.ctx-tl-date')].map((d) => d.textContent!)
    const anos = datas.map((d) => Number(d.slice(-4)))
    expect([...anos].sort((a, b) => a - b)).toEqual(anos)
    expect(caixa.textContent).toContain('Grande Enchente de 1986')
  })
})

describe('atalhos ATLAS e CONTEXTO na sidebar', () => {
  it('ficam logo acima do COMPÊNDIO e só no mundo que os tem', () => {
    const ids = APP_NAV.map((i) => i.id)
    expect(ids.indexOf('contexto')).toBe(ids.indexOf('compendio') - 1)
    expect(ids.indexOf('atlas')).toBe(ids.indexOf('contexto') - 1)
    expect(NAV_MUNDOS.atlas).toEqual(['cyberpunk'])
    expect(NAV_MUNDOS.contexto).toEqual(['cyberpunk'])
    expect(NAV_MUNDOS.compendio).toBeUndefined() // sem gate = todos os mundos
    expect(NAV_ROUTES.contexto).toBe('/contexto')
    expect(NAV_ROUTES.atlas).toBe('/compendio/Atlas')
  })

  it('o prefixo mais longo vence: dentro do Atlas quem acende é o ATLAS', () => {
    expect(navSection('/compendio/Atlas')).toBe('atlas')
    expect(navSection('/compendio/Atlas/Porto Alegre')).toBe('atlas')
    expect(navSection('/compendio')).toBe('compendio')
    expect(navSection('/compendio/Sistema/Regras')).toBe('compendio')
    expect(navSection('/doc/Atlas/Porto Alegre/Porto Alegre')).toBe('compendio')
    expect(navSection('/contexto')).toBe('contexto')
    expect(navSection('/herois')).toBe('herois')
    expect(navSection('/qualquer-outra')).toBeNull()
  })
})
