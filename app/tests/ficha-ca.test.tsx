// @vitest-environment jsdom
// FICHA DE COMPANHEIRO ANIMAL (issues #34 + #201): /heroi/<id> renderiza o
// modelo salvo REAL do Metis — o CORPO COMUM da ficha (Vida/Atributos/
// Perícias da família/Ações/Ataques/Grupo) é o mesmo do herói. O DELTA da
// família CompanheiroAnimal (Tutor, nível do tutor, seções escondidas —
// FICHA_FAMILIA de src/data/familia.ts, porta do plugin) é coberto em
// ficha-ca-delta.test.tsx e ficha-ca-tutor-nivel.test.tsx; aqui só entra o
// que o CA MANTÉM (ex.: rota ?tab=anotacoes cai no PERFIL, sem aba própria).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const METIS_ID = 'Sistema/Criaturas/Companheiros Animais/Metis, a Graxaim'
const metis = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${METIS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = metis.frontmatter as Record<string, any>

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderFicha(tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(METIS_ID, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

// Expectativas independentes, direto do JSON do Metis.
const wikiLabel = (v: string) =>
  /\[\[[^\]|]+\|([^\]]+)\]\]/.exec(v)?.[1] ?? v.replace(/^\[\[|\]\]$/g, '')
const classeReal = wikiLabel(String(fm.Classe)) // "Canino Médio"
const nivelReal = Number(fm['Nível']) // 7

describe('FichaPage aceita Companheiro Animal (Metis, modelo salvo real)', () => {
  it('PERFIL: nome, Classe e Nível reais do FM de CA', async () => {
    renderFicha()
    // Metis não tem `nome` no FM (nem aliases) → exibe o basename (heroNome)
    expect((await screen.findAllByDisplayValue(metis.basename!)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(classeReal)).length).toBeGreaterThan(0)
    expect(screen.getByText(`NVL ${nivelReal}`)).toBeTruthy()
  })

  it('COMBATE: vida corrente da Interativa sobre o máximo do modelo', async () => {
    renderFicha('combate')
    const vitCur = Number(fm.Interativa.Recursos_Restantes.Vitalidade) // 15
    const vitMax = Number(fm.Vida.Vitalidade) // 20
    expect(await screen.findByText(`${vitCur} / ${vitMax}`)).toBeTruthy()
    expect(screen.getByText('VITALIDADE')).toBeTruthy()
  })

  it('COMPETÊNCIAS: atributos reais do CA (Principal FOR)', async () => {
    renderFicha('habilidades')
    expect(await screen.findByText('⚖️ ATRIBUTOS')).toBeTruthy()
    expect(screen.getAllByText(String(fm.Atributos.Principal)).length).toBeGreaterThan(0)
  })

  it('INVENTÁRIO: arma natural real do FM (sem Moedas — delta #201)', async () => {
    renderFicha('inventario')
    // arma da lista real ("[[Mandíbula]]")
    expect(await screen.findByText('Mandíbula')).toBeTruthy()
    // CA não tem Moedas (plugin tab-inventario.ts:126-128).
    expect(screen.queryByTitle('Moedas')).toBeNull()
  })

  it('ANOTAÇÕES: aba não existe pro CA — rota cai no PERFIL (#201)', async () => {
    renderFicha('anotacoes')
    // Conteúdo do PERFIL (campo TUTOR da família CA) no lugar das anotações.
    expect(await screen.findByText('TUTOR')).toBeTruthy()
    expect(screen.queryByText('// ANOTAÇÕES DE CAMPANHA')).toBeNull()
  })

  it('GRUPO: FM grupo vazio cai no empty state desenhado (seção vazia controlada)', async () => {
    renderFicha('grupos')
    expect(await screen.findByText('// NENHUM REGISTRO NESTA CATEGORIA')).toBeTruthy()
  })
})
