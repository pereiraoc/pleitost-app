// @vitest-environment jsdom
// #482 — trocar o PASSADO mantinha o incremento {A:'Passado'} na perícia do
// pick antigo: ela seguia AMARELA ("como se tivesse vindo do passado") mesmo
// o passado tendo mudado. Agora editar o texto do Passado RESETA o benefício
// (strip do incremento Passado em perícias/ofícios; ranks de Slot ficam) e o
// jogador escolhe a perícia do passado novo.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PassadoBox } from '../src/components/ficha/PerfilTab'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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

function heroiComPassado(): string {
  const id = createLocalEntity('Heroi', 'Zé do Passado', emptyHeroFrontmatter())
  setLocalEntityFm(id, 'Biografia.Passado', 'Falso Profeta')
  // Diplomacia = perícia do passado SUBIDA ALÉM (M via slots) — shape real (Uni)
  setLocalEntityFm(id, 'Pericias.Lista', [
    {
      Nome: '[[Diplomacia]]',
      Proficiencia: 'M',
      Incrementos: [{ A: 'Slot.A' }, { A: 'Passado' }, { E: 'Slot.E' }, { M: 'Slot.M' }],
    },
    { Nome: '[[Sociedades]]', Proficiencia: 'A', Incrementos: [{ A: 'Slot.A' }] },
  ])
  return id
}

function renderBox(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <PassadoBox doc={getLocalDoc(id)!} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const rowsDe = (id: string) =>
  ((getLocalDoc(id)!.frontmatter as Record<string, unknown>)['Pericias'] as {
    Lista: Record<string, unknown>[]
  }).Lista

describe('#482 — trocar o passado reseta o benefício', () => {
  it('editar o texto do PASSADO tira o incremento Passado; ranks de Slot ficam', async () => {
    const id = heroiComPassado()
    renderBox(id)
    fireEvent.change(await screen.findByLabelText('PASSADO'), {
      target: { value: 'Cuidador de Ovelhas' },
    })
    const rows = rowsDe(id)
    const diplomacia = rows.find((r) => String(r['Nome']).includes('Diplomacia'))!
    expect(JSON.stringify(diplomacia['Incrementos'])).not.toContain('Passado')
    expect(diplomacia['Proficiencia']).toBe('M') // subida por Slot não regride
  })

  it('perícia que era SÓ do passado volta pra N ao trocar', async () => {
    const id = createLocalEntity('Heroi', 'Zé Novato', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Biografia.Passado', 'Vigia')
    setLocalEntityFm(id, 'Pericias.Lista', [
      { Nome: '[[Furtividade]]', Proficiencia: 'A', Incrementos: [{ A: 'Passado' }] },
    ])
    renderBox(id)
    fireEvent.change(await screen.findByLabelText('PASSADO'), { target: { value: 'Eremita' } })
    const furtividade = rowsDe(id)[0]!
    expect(JSON.stringify(furtividade['Incrementos'])).not.toContain('Passado')
    expect(furtividade['Proficiencia']).toBe('N')
  })

  it('digitar o MESMO passado (sem troca real) não mexe em nada', async () => {
    const id = heroiComPassado()
    renderBox(id)
    fireEvent.change(await screen.findByLabelText('PASSADO'), {
      target: { value: 'Falso Profeta' },
    })
    const diplomacia = rowsDe(id).find((r) => String(r['Nome']).includes('Diplomacia'))!
    expect(JSON.stringify(diplomacia['Incrementos'])).toContain('Passado')
  })
})

// Report 6f010c01 (2026-09-01): trocar o Passado pra perícia que o usuário JÁ
// tinha como Adepto via Slot.A ENGOLIA o incremento — o piso do Passado passa
// a cobrir o rank e o slot deve ser DEVOLVIDO (removido da linha; o
// slot-accounting lê do FM). Slot acima do piso novo (E/M) permanece.
describe('refund de Slot coberto pelo Passado (report 6f010c01)', () => {
  it('Slot.A some quando o Passado passa a conceder A; Slot.E fica', async () => {
    const { applyPassadoPickToRows } = await import('../src/rules/passado-options')
    const rows = [
      {
        Nome: '[[Sobrevivência]]',
        Proficiencia: 'E',
        Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
      },
      { Nome: '[[Atletismo]]', Proficiencia: 'A', Incrementos: [{ A: 'Slot.A' }] },
    ]
    const out = applyPassadoPickToRows(rows, (r) => String(r.Nome).includes('Sobrevivência'))
    const sob = out[0]!
    // Slot.A devolvido; Passado cobre o A; Slot.E preservado → segue E
    expect(sob.Incrementos).toEqual([{ E: 'Slot.E' }, { A: 'Passado' }])
    expect(sob.Proficiencia).toBe('E')
    // linha NÃO escolhida fica intocada (slot do usuário preservado)
    expect(out[1]!.Incrementos).toEqual([{ A: 'Slot.A' }])
  })

  it('objeto de incremento com par misto perde só o par redundante', async () => {
    const { applyPassadoPickToRows } = await import('../src/rules/passado-options')
    const rows = [
      {
        Nome: '[[Furtividade]]',
        Proficiencia: 'E',
        Incrementos: [{ A: 'Slot.A', E: 'Slot.E' }],
      },
    ]
    const out = applyPassadoPickToRows(rows, () => true)
    expect(out[0]!.Incrementos).toEqual([{ E: 'Slot.E' }, { A: 'Passado' }])
    expect(out[0]!.Proficiencia).toBe('E')
  })
})
