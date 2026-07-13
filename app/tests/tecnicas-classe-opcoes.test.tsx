// @vitest-environment jsdom
// Issue #216 (report de jogador): as OPÇÕES de técnica ofereciam técnica de
// outra classe e escondiam as elegíveis.
//
// (a) "oferecendo magia distante p guerreiro" — o painel "Técnicas Não
//     Aprendidas" filtrava por PASTA (Classe + Genéricas + Multidisciplinar),
//     mas a fonte de verdade da elegibilidade é o `classe::` de CADA nota
//     (plugin: listTecnicas, yaml-block-deps-factory.ts:254-325 +
//     computeTecnicasDerived, view-model.ts:508-532). "Magia Distante" mora em
//     Multidisciplinar/ mas declara `classe:: [[Animista]],[[Arcanista]]` —
//     não pode aparecer pra Guerreiro.
// (b) "só oferece magia escrita em arma pra mago mc maestria" — a escolha
//     "Técnica Experiente Secundária" (Maestria em Classe Secundária, linha do
//     Mago) declara 5 técnicas no Selecionar, mas o filtro de LINHAGEM do app
//     (bug #5, pensado pras pastas-linha de essência) podava tudo menos o
//     pick default: Técnicas/Mago é pasta de CLASSE (várias técnicas por
//     rank), não uma linha — a lista do Selecionar é a fonte de verdade
//     (o plugin não filtra essas options).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// Heróis REAIS da vault: Thoren (Guerreiro, slots A/E/M) e Zuko (Animista).
const THOREN_ID = 'Sistema/Criaturas/Heróis/Thoren'
const ZUKO_ID = 'Sistema/Criaturas/Heróis/Zuko'
const thoren = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${THOREN_ID}.json`), 'utf8'),
) as VaultDoc
const thorenFm = thoren.frontmatter as Record<string, any>

// Fixture-check: "Magia Distante" é Multidisciplinar com classe:: restrita
// (Animista/Arcanista) — o cenário exato do report.
const magiaDistante = JSON.parse(
  fs.readFileSync(
    path.join(
      vaultDataDir,
      'Sistema/Criação de Personagem/Técnicas/Multidisciplinar/Magia Distante.json',
    ),
    'utf8',
  ),
) as VaultDoc

// As 5 técnicas Experientes de Mago do Selecionar da linha do Mago em
// "Maestria em Classe Secundária" (doc real da vault).
const MAGO_EXPERIENTES = [
  'Magia Escrita em Arma',
  'Combinação Distratora',
  'Repertório Diverso',
  'Combinação Neutralizante',
  'Encantamento Residual',
]

/** vitest 4 + jsdom sem webstorage do Node — polyfill fiel só no teste. */
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
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderFicha(heroId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(heroId, 'habilidades')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Entra no Alterar do painel "Técnicas" e devolve o container das
 *  não-aprendidas (📚). */
async function abrirNaoAprendidas(): Promise<HTMLElement> {
  const heading = await screen.findByText('Técnicas')
  fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
  const titulo = await screen.findByText('📚 Técnicas Não Aprendidas')
  return titulo.parentElement as HTMLElement
}

describe('#216a: Técnicas Não Aprendidas filtram pelo classe:: da nota (não pela pasta)', () => {
  it('fixture: Magia Distante é Multidisciplinar e restrita a Animista/Arcanista', () => {
    expect(magiaDistante.id).toContain('/Técnicas/Multidisciplinar/')
    const classe = String((magiaDistante.inlineFields as Record<string, unknown>)['classe'])
    expect(classe).toContain('[[Animista]]')
    expect(classe).toContain('[[Arcanista]]')
    expect(classe).not.toContain('[[Guerreiro]]')
  })

  it('Guerreiro (Thoren) NÃO vê Magia Distante; vê as com classe compatível/aberta', async () => {
    renderFicha(THOREN_ID)
    const panel = await abrirNaoAprendidas()
    // Controles positivos primeiro (a lista carrega async): Ambidestria
    // (classe:: Guerreiro,Caçador — Multidisciplinar) e Manobras Potentes
    // (Genérica, classe:: vazio = qualquer classe).
    await waitFor(() => {
      expect(within(panel).getByText('Ambidestria')).toBeTruthy()
      expect(within(panel).getByText('Manobras Potentes')).toBeTruthy()
    })
    // O bug: Magia Distante (classe:: Animista/Arcanista) oferecida a Guerreiro.
    expect(within(panel).queryByText('Magia Distante')).toBeNull()
    expect(screen.queryByLabelText('Aprender Magia Distante')).toBeNull()
  })

  it('Animista (Zuko) segue vendo Magia Distante (classe:: contém Animista)', async () => {
    renderFicha(ZUKO_ID)
    const panel = await abrirNaoAprendidas()
    await waitFor(() => {
      expect(within(panel).getByText('Magia Distante')).toBeTruthy()
    })
  })
})

describe('#216b: Maestria em Classe Secundária (Mago) oferece TODAS as técnicas do Selecionar', () => {
  beforeEach(() => {
    // Thoren multiclasse Mago com a técnica Mestre "Maestria em Classe
    // Secundária" aprendida (no lugar da Rapidez Marcial, mantendo o slot M).
    const habs = (thorenFm.Habilidades?.Lista ?? []) as Record<string, unknown>[]
    const tecs = (thorenFm.Tecnicas?.Lista ?? []) as Record<string, unknown>[]
    window.localStorage.setItem(
      `pleitost.heroEdits.${THOREN_ID}`,
      JSON.stringify({
        fm: {
          'Habilidades.Lista': [...habs, { '[[Treinamento de Mago]]': 'Manual' }],
          'Tecnicas.Lista': [
            ...tecs.filter((r) => !('[[Rapidez Marcial]]' in r)),
            { '[[Maestria em Classe Secundária]]': 'Slot.M' },
          ],
        },
      }),
    )
  })

  it('o dropdown "Técnica Experiente Secundária" lista as 5 técnicas Experientes de Mago', async () => {
    renderFicha(THOREN_ID)
    const heading = await screen.findByText('Técnicas')
    fireEvent.click(within(heading.parentElement!).getByText('✎ Alterar'))
    const dd = (await screen.findByLabelText('Técnica Experiente Secundária')) as HTMLSelectElement
    expect(dd.tagName).toBe('SELECT')
    await waitFor(() => {
      const labels = [...dd.options].map((o) => o.textContent)
      for (const tec of MAGO_EXPERIENTES) {
        expect(labels, `opção "${tec}" ausente do dropdown`).toContain(tec)
      }
    })
  })
})
