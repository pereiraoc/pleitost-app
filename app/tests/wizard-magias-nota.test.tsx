// @vitest-environment jsdom
// Passo MAGIAS do wizard (2026-10-02): a regra de conjuração deixa de ser
// string fixa em português de fantasia e passa a ser a NOTA `Conjuração
// Mágica` renderizada (reskinDescricao ?? body) — o mundo que tiver corpo
// próprio pra regra mostra o dele; a fantasia mostra o canônico. Embeds da
// nota (Magia Arcana/Anima, Potência, Energia) não entram: os chips do passo
// já cobrem.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import type { IndexManifest } from '../src/data/types'
import { PassoMagias } from '../src/components/wizard/steps/PassoMagias'
import type { WizardCtx } from '../src/components/wizard/steps'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
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
  setActiveContexto(null)
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

const FM_ANIMISTA = {
  Classe: '[[Animista]]',
  Sintonia: '[[Traço Elemental do Fogo]]',
  Magias: { Potencia: 4, EM: 4, Lista: [{ Nome: 'Anima', Proficiencia: 'A', Lista: [] }] },
}

function ctxDe(fm: Record<string, unknown>): WizardCtx {
  return {
    fm,
    rules: { stale: false, sintoniaRuleLocked: false, sintonias: [], derivedFm: fm },
    doc: { id: 'local:Heroi:x', basename: 'Novo Herói' },
    model: { set: () => {}, setVolatile: () => {} },
    refs: { refDoc: () => undefined },
  } as unknown as WizardCtx
}

function defComDescricao(texto: string): ContextoDef {
  return {
    id: 'poa-1987',
    nome: 'Porto Alegre 1987',
    fonte: 'x',
    moeda: { simbolo: 'Cz$', nome: 'Cruzado' },
    atlas: { raiz: 'Atlas', mapa: null },
    pericias: {},
    reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [], descricoes: { 'Conjuração Mágica': texto } },
    disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
    base: { sempreDisponiveis: [] },
  } as unknown as ContextoDef
}

function montar(def?: ContextoDef) {
  const cat = def ? { ...catalog, contextoDef: def } : catalog
  return render(
    <CatalogProvider catalog={cat}>
      <DetailProvider>
        <MemoryRouter>
          <PassoMagias ctx={ctxDe(FM_ANIMISTA)} />
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

const regraMontada = (re: RegExp) =>
  waitFor(
    () => {
      const el = document.querySelector('[data-wizard-regra-conjuracao]')
      if (!el || !re.test(el.textContent ?? '')) throw new Error('regra ainda não montou')
      return el as HTMLElement
    },
    { timeout: 15000 },
  )

describe('passo MAGIAS — regra vem da nota, não de string fixa', () => {
  it('fantasia: o corpo canônico de Conjuração Mágica aparece, sem os embeds', async () => {
    montar()
    const regra = await regraMontada(/mão livre/)
    expect(regra.textContent).toMatch(/ao menos uma mão livre/)
    expect(regra.textContent).toMatch(/Recursos/)
    // embeds de nota suprimidos (os chips do passo já abrem Magia Arcana/Anima)
    expect(screen.queryByText(/Lista de Magias Anima/)).toBeNull()
  }, 30000)

  it('mundo com descricoes["Conjuração Mágica"]: mostra o texto do mundo, não o canônico', async () => {
    montar(defComDescricao('## Executando uma Tecnologia\nTexto do mundo: a mão do adaptador esquenta.'))
    const regra = await regraMontada(/adaptador/)
    expect(regra.textContent).toMatch(/a mão do adaptador esquenta/)
    expect(regra.textContent).not.toMatch(/gestos mágicos/)
  }, 30000)
})
