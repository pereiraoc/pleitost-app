// @vitest-environment jsdom
// Issue #219 (report de jogador real): "fiz um Dante importado e não tô
// conseguindo adicionar e tirar vantagem de combate ou acerto decisivo usando
// os botões, e não tá mudando corretamente o dano."
//
// CAUSA RAIZ: o Dante da vault vem com o bloco `Interativa` (estado VOLÁTIL
// salvo pelo plugin pleitost-autosheet) DENTRO do frontmatter — com "Vantagem
// de Combate" e "Acerto Decisivo" congelados em AMBOS os mapas
// (Condicoes_Ativas E Efeitos_Ativos, dual-write do plugin pra Estados,
// mount-interativa-toggle.ts). O portableFromDoc copiava o bloco pra cópia
// local; o toggleChip do app escreve num mapa SÓ, enquanto o chipOn lê o OR
// dos dois → o chip nunca desligava e o dano (Apunhalante requer VC;
// DadoDecisivo) ficava preso.
//
// Fluxo REAL reproduzido na tela: importPortable(portableFromDoc(Dante)) →
// FichaPage aba COMBATE → clica os toggles → estado E dano mudam no DOM.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  getLocalEntity,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { importPortable, portableFromDoc } from '../src/data/hero-transfer'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const dante = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'Sistema/Criaturas/Heróis/Dante.json'), 'utf8'),
) as VaultDoc

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
  __resetLocalStoreForTests()
})
afterEach(cleanup)

function renderCombate(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Chip ligado = cor do grupo (CombateTab: `color: on ? c.cor : 'var(--text)'`). */
function chipLigado(chip: HTMLElement): boolean {
  return chip.style.color !== 'var(--text)'
}

/** Dano exibido do Punhal Relampejante (span "⚔️ <dano>" da linha da arma). */
function danoPunhal(): string {
  const nome = screen.getByText('Punhal Relampejante (E)')
  const row = nome.parentElement!
  const span = [...row.querySelectorAll('span')].find((s) =>
    (s.textContent ?? '').trim().startsWith('⚔️'),
  )
  expect(span, 'span de dano do Punhal').toBeTruthy()
  return (span!.textContent ?? '').trim()
}

async function abrirCombateEsperarChips() {
  const vant = await screen.findByRole(
    'button',
    { name: /Vantagem de Combate/ },
    { timeout: 20000 },
  )
  const acerto = screen.getByRole('button', { name: /Acerto Decisivo/ })
  // linha do Punhal renderizada (refs das armas carregadas)
  await screen.findByText('Punhal Relampejante (E)', undefined, { timeout: 20000 })
  return { vant, acerto }
}

// Precondição do report: o FM REAL do Dante na vault carrega o estado volátil
// do plugin congelado em AMBOS os mapas. Se esta precondição falhar, o Dante
// foi re-extraído sem estado e o cenário do #219 precisa de outra fixture.
it('fixture: Dante da vault tem VC/AD congelados em Condicoes_Ativas E Efeitos_Ativos', () => {
  const inter = dante.frontmatter['Interativa'] as Record<string, Record<string, unknown>>
  expect(inter, 'Dante.json sem bloco Interativa').toBeTruthy()
  expect(inter['Condicoes_Ativas']['Vantagem de Combate']).toBeTruthy()
  expect(inter['Condicoes_Ativas']['Acerto Decisivo']).toBeTruthy()
  expect(inter['Efeitos_Ativos']['Vantagem de Combate']).toBeTruthy()
  expect(inter['Efeitos_Ativos']['Acerto Decisivo']).toBeTruthy()
})

describe('#219: Dante importado — toggles de VC/AD funcionam e o dano reflete', () => {
  it('importar do compêndio NÃO traz o estado volátil do plugin (Interativa é estado, não ficha)', () => {
    const id = importPortable(portableFromDoc(dante, 'Dante'))
    const rec = getLocalEntity(id)!
    expect(rec.frontmatter['Interativa']).toBeUndefined()
    // a ficha em si veio inteira
    expect(rec.frontmatter['Classe']).toBe(dante.frontmatter['Classe'])
    expect(rec.frontmatter['Nível']).toBe(dante.frontmatter['Nível'])
  })

  it('importa → COMBATE: chips nascem DESLIGADOS; clicar liga/desliga e o dano muda', { timeout: 40000 }, async () => {
    const id = importPortable(portableFromDoc(dante, 'Dante'))
    renderCombate(id)
    const { vant, acerto } = await abrirCombateEsperarChips()

    // cópia recém-importada nasce sem estado volátil → chips desligados
    expect(chipLigado(vant), 'Vantagem de Combate deve nascer desligada').toBe(false)
    expect(chipLigado(acerto), 'Acerto Decisivo deve nascer desligado').toBe(false)
    const danoBase = danoPunhal()

    // liga VANTAGEM DE COMBATE → chip acende e o dano do Punhal muda
    // (Apunhalante: requer VC → PassoDeDado +1 e DanoArmaFixo +1)
    fireEvent.click(vant)
    await waitFor(() => expect(chipLigado(vant)).toBe(true))
    await waitFor(() => expect(danoPunhal()).not.toBe(danoBase))
    const danoComVC = danoPunhal()

    // desliga → chip apaga e o dano VOLTA ao base (trap reverso)
    fireEvent.click(vant)
    await waitFor(() => expect(chipLigado(vant)).toBe(false))
    await waitFor(() => expect(danoPunhal()).toBe(danoBase))

    // liga ACERTO DECISIVO → chip acende e o dano muda (DadoDecisivo +1 dado)
    fireEvent.click(acerto)
    await waitFor(() => expect(chipLigado(acerto)).toBe(true))
    await waitFor(() => expect(danoPunhal()).not.toBe(danoBase))
    expect(danoPunhal()).not.toBe(danoComVC)

    // desliga → volta ao base
    fireEvent.click(acerto)
    await waitFor(() => expect(chipLigado(acerto)).toBe(false))
    await waitFor(() => expect(danoPunhal()).toBe(danoBase))
  })

  // O jogador do report JÁ TEM um Dante importado com o estado congelado no
  // localStorage (importado antes do fix). O toggle precisa conseguir DESLIGAR
  // um label presente nos DOIS mapas — dual-delete, como o plugin
  // (mount-interativa-toggle.ts: `delete condicoesMap; delete efeitosMap`).
  it('entidade já importada COM estado congelado: clicar DESLIGA (dual-delete) e o dano cai', { timeout: 40000 }, async () => {
    const { aliases: _a, 'dg-publish': _dg, ...fmCongelado } = dante.frontmatter
    const id = createLocalEntity('Heroi', 'Dante', structuredClone(fmCongelado))
    renderCombate(id)
    const { vant, acerto } = await abrirCombateEsperarChips()

    // estado congelado da vault → chips nascem LIGADOS
    expect(chipLigado(vant)).toBe(true)
    expect(chipLigado(acerto)).toBe(true)
    const danoCongelado = danoPunhal()

    // clicar em VC desliga o chip (remove dos DOIS mapas) e o dano cai
    fireEvent.click(vant)
    await waitFor(() => expect(chipLigado(vant)).toBe(false))
    await waitFor(() => expect(danoPunhal()).not.toBe(danoCongelado))

    // clicar em AD desliga também (estava nos dois mapas)
    fireEvent.click(acerto)
    await waitFor(() => expect(chipLigado(acerto)).toBe(false))
  })
})
