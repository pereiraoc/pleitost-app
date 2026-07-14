// @vitest-environment jsdom
// F2 (#246) — visualizador de Criação de Personagem por SUBTIPO + Regra.
// Pedido AS-IS: cada tipo mostrado DIFERENTE (fácil identificar o que é),
// bonito; Regras de forma amigável. Verificado sobre docs REAIS da vault
// (fetch fake sobre ../vault-data).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocPage } from '../src/components/compendium/DocPage'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

function renderDoc(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[`/doc/${id}`]}>
        <Routes>
          <Route path="/doc/*" element={<DocPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const MAGIA = 'Sistema/Criação de Personagem/Magia/Magia Especial/Ruído Estridente'
const TECNICA = 'Sistema/Criação de Personagem/Técnicas/Mago/Avaliação Arcana Aplicada ao Combate'
const CLASSE = 'Sistema/Criação de Personagem/Classes/Animista'
const REGRA = 'Sistema/Regras/Ações/Ações'
const ADAGA = 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga'

describe('CriacaoView por subtipo (#246)', () => {
  it('MAGIA: badge Magia·Arcana + chips escola/rank/custo + resumo', async () => {
    renderDoc(MAGIA)
    expect(await screen.findByRole('heading', { name: 'Ruído Estridente' })).toBeTruthy()
    // badge do subtipo (identifica o tipo)
    expect(screen.getByText('Magia · Arcana')).toBeTruthy()
    // chips dos campos-chave (do FM da magia)
    expect(screen.getByText('Escola')).toBeTruthy()
    expect(screen.getByText('Especial')).toBeTruthy()
    expect(screen.getByText('Rank')).toBeTruthy()
    expect(screen.getByText('Básica')).toBeTruthy()
    expect(screen.getByText('Custo')).toBeTruthy()
    expect(screen.getByText('2A')).toBeTruthy()
    // resumo em destaque (com wikilink navegável — Vigor)
    const resumo = document.querySelector('.criacao-resumo') as HTMLElement
    expect(resumo).toBeTruthy()
    expect(resumo.textContent).toMatch(/dano sônico/)
  })

  it('TÉCNICA: chips lidos dos INLINE fields (classe/rank/custo)', async () => {
    renderDoc(TECNICA)
    expect(await screen.findByRole('heading', { name: 'Avaliação Arcana Aplicada ao Combate' })).toBeTruthy()
    expect(screen.getByText(/Técnica · Adepta/)).toBeTruthy()
    expect(screen.getByText('Classe')).toBeTruthy()
    // classe vem do inline field "classe:: [[Mago]]" → wikilink "Mago"
    expect(screen.getAllByText('Mago').length).toBeGreaterThan(0)
    expect(screen.getByText('Custo')).toBeTruthy()
    expect(screen.getByText('1A')).toBeTruthy()
  })

  it('CLASSE: imagem + atributo-chave; distinta da Magia', async () => {
    renderDoc(CLASSE)
    expect(await screen.findByText('Classe · Conjurador')).toBeTruthy()
    // o header do subtipo é o 1º heading (o corpo pode repetir o título)
    expect(screen.getAllByRole('heading', { name: 'Animista' }).length).toBeGreaterThan(0)
    // atributo-chave no chip (PRE também aparece no corpo — escopa ao chip)
    const chips = document.querySelector('.criacao-chips') as HTMLElement
    expect(chips.textContent).toContain('Atributo-chave')
    expect(chips.textContent).toContain('PRE')
    // retrato da classe (FM Imagem → doc-hero)
    await waitFor(() => expect(document.querySelector('.doc-hero')).toBeTruthy())
  })
})

describe('RegraView (#246)', () => {
  it('REGRA: leitura em coluna confortável com o texto real', async () => {
    renderDoc(REGRA)
    expect(await screen.findByText('Regra')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: /Ações/ }).length).toBeGreaterThan(0)
    const body = document.querySelector('.doc-reading-body') as HTMLElement
    expect(body).toBeTruthy()
    expect(body.textContent).toMatch(/Ações são a base/)
  })
})

describe('controle: outros tipos não viram CriacaoView/RegraView (#246)', () => {
  it('Adaga (Item) segue como carta de item, não CriacaoView', async () => {
    renderDoc(ADAGA)
    await screen.findByText('Adaga')
    // sem chips de criação nem coluna de leitura de regra
    expect(document.querySelector('.criacao-chips')).toBeNull()
    expect(document.querySelector('.doc-reading-body')).toBeNull()
  })
})
