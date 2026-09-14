// @vitest-environment jsdom
// LINK QUEBRADO NA ABA BESTIÁRIO DO LUGAR (report do mestre, 2026-09-13): "fui
// em porto alegre, fui na aba de bestiário, cliquei no 'Batida Grande', que me
// levou pra .../compendio/Atlas/Porto Alegre/Campanhas/Combates/Batida Grande
// mas não tem nada, ta dizendo pasta não encontrada".
//
// A causa: `DetailLink` tem DOIS jeitos de dizer pra onde vai — `id` (um id de
// doc, que vira `docPath(id)`, absoluto) e `to` (um href literal). A aba
// passava `to={e.id}`, e um id cru como href é RELATIVO: o navegador grudou no
// caminho do lugar que estava aberto. Dentro do app o clique ainda abria o
// painel (o onClick faz preventDefault), então o defeito só aparecia ao abrir
// em nova aba, recarregar ou compartilhar o endereço.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { BestiarioTab } from '../src/components/compendium/BestiarioTab'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const CIDADE = 'Atlas/Porto Alegre/Porto Alegre'
const temDataset = fs.existsSync(path.join(cyberDir, `${CIDADE}.json`))
const ler = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

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
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  catalog = { ...buildCatalog(manifest), contextoDef: def }
  setActiveContexto(def)
})
afterEach(() => {
  cleanup()
})

describe.skipIf(!temDataset)('links da aba BESTIÁRIO do lugar', () => {
  it('o encontro aponta pro doc dele, não pro caminho do lugar aberto', async () => {
    render(
      <MemoryRouter initialEntries={[`/compendio/${CIDADE}`]}>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <BestiarioTab doc={ler(CIDADE)} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    const link = await screen.findByText('Batida Grande')
    const href = link.getAttribute('href') ?? ''
    // absoluto e apontando pro doc — nunca relativo ao lugar
    expect(href.startsWith('/')).toBe(true)
    expect(decodeURIComponent(href)).toBe('/doc/Campanhas/Combates/Batida Grande')
    expect(decodeURIComponent(href)).not.toContain('Atlas/Porto Alegre')
  })

  it('a criatura também aponta pro doc dela', async () => {
    render(
      <MemoryRouter initialEntries={[`/compendio/${CIDADE}`]}>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <BestiarioTab doc={ler(CIDADE)} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getAllByRole('link').length).toBeGreaterThan(10))
    for (const a of screen.getAllByRole('link')) {
      expect(decodeURIComponent(a.getAttribute('href') ?? '')).toMatch(/^\/doc\//)
    }
  })
})

// FIGURA E BARRA DE DIFICULDADE (pedido do mestre, 2026-09-13): "onde tem
// Bestiário, vou querer que tu inclua também a imagem do lado que nem na parte
// de serviços. E na parte de encontros prontos, aquele mesmo negócio com as
// dificuldades pros níveis, exatamente igual na parte de compêndio/campanhas/
// combates, pra ficar mesmo estilo."
describe.skipIf(!temDataset)('a aba mostra figura e dificuldade', () => {
  const montar = () =>
    render(
      <MemoryRouter initialEntries={[`/compendio/${CIDADE}`]}>
        <CatalogProvider catalog={catalog}>
          <DetailProvider>
            <BestiarioTab doc={ler(CIDADE)} />
          </DetailProvider>
        </CatalogProvider>
      </MemoryRouter>,
    )

  it('cada criatura da lista tem a figura ao lado', async () => {
    const { container } = montar()
    await screen.findByText('Batida Grande')
    const linhas = container.querySelectorAll('[data-criatura]')
    expect(linhas.length).toBeGreaterThan(0)
    for (const linha of linhas) {
      expect(linha.querySelector('[data-criatura-figura]')).not.toBeNull()
    }
  })

  // Report do mestre (2026-09-13): "ta aparecendo TIER X - RANK Y, só que essa
  // parte de '- RANK Y' não precisa, só atrapalha, até porque ta errado. E ta
  // faltando deixar o competente, elite e solo com aquelas tags da mesma cor
  // que tu ta colocando na aba de criaturas/bestiário."
  it('o cabeçalho do grupo é só o TIER, sem rank', async () => {
    const { container } = montar()
    await screen.findByText('Batida Grande')
    expect(container.textContent).not.toContain('RANK')
    expect(screen.getByText('TIER 0')).toBeTruthy()
  })

  it('competente, elite e solo levam a MESMA tarja da aba de Criaturas', async () => {
    const { container } = montar()
    await screen.findByText('Batida Grande')
    const solo = container.querySelector('[data-criatura="O Despachante"] .combate-monstro-mod')
    expect(solo?.className).toContain('is-solo')
    expect(solo?.textContent).toBe('Solo')
    const comp = container.querySelector('[data-criatura="Sargento de Pelotão"] .combate-monstro-mod')
    expect(comp?.className).toContain('is-competente')
    // criatura sem modificador não ganha tarja nenhuma
    expect(
      container.querySelector('[data-criatura="Brigadiano de Esquina"] .combate-monstro-mod'),
    ).toBeNull()
  })

  it('o encontro pronto traz a barrinha por nível, a mesma dos Combates', async () => {
    const { container } = montar()
    await screen.findByText('Batida Grande')
    const encontro = container.querySelector('[data-encontro="Batida Grande"]')!
    await waitFor(() => {
      expect(encontro.querySelector('[data-mestre-levelbar]')).not.toBeNull()
    })
    // um segmento por nível de herói, como na grade de Combates
    const segs = encontro.querySelectorAll('.gm-enc-levelbar-seg')
    expect(segs.length).toBeGreaterThan(5)
    expect(segs[0]!.getAttribute('data-level')).toBe('1')
  })
})

// O outro lado do report: "checa se tem casos de lugares que estão
// referenciando um combate que não existe mais". O `Onde` do Combate é texto
// com wikilinks; um alvo que não resolve some da navegação sem erro nenhum.
describe.skipIf(!temDataset)('referências dos encontros', () => {
  it('todo lugar citado no Onde de um Combate existe na vault', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
    const nomes = new Set(manifest.docs.map((d) => d.basename).filter(Boolean) as string[])
    const quebrados: string[] = []
    for (const d of manifest.docs) {
      if (d.type !== 'Combate') continue
      const onde = String(ler(d.id).frontmatter?.['Onde'] ?? '')
      for (const m of onde.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
        const alvo = m[1]!.split('/').pop()!.trim()
        if (!nomes.has(alvo)) quebrados.push(`${d.basename}: [[${alvo}]]`)
      }
    }
    expect(quebrados).toEqual([])
  })
})
