// @vitest-environment jsdom
// GUARDA DE VAZAMENTO (report 2026-09-10: "tem vários alias errados em
// POA1987 — competências, combate, wizard, magias, ataques… dá uma olhada com
// cuidado pra não ficar vazando nome errado por aí"). Renderiza as telas que
// o report cita com o Contexto-Def REAL da POA e varre texto, tooltip
// (`title`) e `aria-label` atrás de QUALQUER nome que o mundo renomeia. As
// exceções do reskin (nomes que a POA mantém) não contam.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarContextoAosDocs, buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { setActiveContexto } from '../src/data/reskin'
import { __resetLocalStoreForTests, createLocalEntity } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { WIZARD_STEPS } from '../src/components/wizard/steps'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const temMundo = fs.existsSync(cybContexto) && fs.existsSync(path.join(vaultDataDir, 'index.json'))

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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!temMundo)('POA 1987: nenhum nome de fantasia na ficha nem no wizard', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef
  const catalog = {
    ...buildCatalog({ ...manifest, docs: aplicarContextoAosDocs(manifest.docs, def) }),
    contextoDef: def,
  }
  // nomes renomeados pelo mundo (o nome da POA não contém o da fantasia —
  // "Lança" → "Lança de Andaime" não é vazamento)
  const pares: [string, string][] = []
  const termos = (def.reskin as { termos?: Record<string, string> }).termos ?? {}
  for (const [k, v] of [...Object.entries(def.reskin.notas), ...Object.entries(termos)]) {
    if (typeof v === 'string' && v && v !== k && k.length > 3 && !v.toLowerCase().includes(k.toLowerCase())) pares.push([k, v])
  }
  const proibidos = pares.map(([k]) => ({ k, re: new RegExp(`(?<![\\p{L}])${esc(k)}(?![\\p{L}])`, 'u') }))
  const excecoes = [...def.reskin.excecoes].sort((a, b) => b.length - a.length)

  function vazamentos(): string[] {
    const textos: string[] = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const tag = n.parentElement?.tagName
      if (tag !== 'STYLE' && tag !== 'SCRIPT' && n.nodeValue?.trim()) textos.push(n.nodeValue)
    }
    document.querySelectorAll('[title],[aria-label]').forEach((el) => {
      for (const a of ['title', 'aria-label']) {
        const v = el.getAttribute(a)
        if (v) textos.push(v)
      }
    })
    const out = new Set<string>()
    for (const t0 of textos) {
      let t = t0
      for (const ex of excecoes) t = t.split(ex).join('∅')
      for (const p of proibidos) if (p.re.test(t)) out.add(`${p.k} ← "${t0.slice(0, 80)}"`)
    }
    return [...out]
  }

  beforeAll(() => {
    if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
      const file = path.join(vaultDataDir, rel)
      const ok = fs.existsSync(file)
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
    }) as typeof fetch
    setActiveContexto(def)
  })
  afterAll(() => setActiveContexto(null))
  beforeEach(() => {
    window.localStorage.clear()
    __resetLocalStoreForTests()
    __resetHeroStoreMemoryForTests()
  })
  afterEach(cleanup)

  function montar(id: string, tab: string) {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, tab)]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }

  // Arcanista (magia arcana, tesouros), Monge (Arte Marcial) e Bardo
  // (subclasses, performance) cobrem as origens que o report listou
  for (const heroi of ['Flohx Fritz', 'Kenji', 'Carlos Facão de Andradas']) {
    for (const tab of ['combate', 'habilidades']) {
      it(`${heroi} · ${tab}`, async () => {
        montar(`Sistema/Criaturas/Heróis/${heroi}`, tab)
        await sleep(4000)
        expect(vazamentos()).toEqual([])
      }, 30000)
    }
  }

  it('wizard · passo das magias (Arcanista)', async () => {
    const base = JSON.parse(
      fs.readFileSync(path.join(vaultDataDir, 'Sistema/Criaturas/Heróis/Flohx Fritz.json'), 'utf8'),
    ) as { frontmatter: Record<string, unknown> }
    const passo = WIZARD_STEPS.findIndex((s) => s.id === 'magias') + 1
    expect(passo).toBeGreaterThan(0)
    const id = createLocalEntity('Heroi', 'Flohx wizard', { ...base.frontmatter, Wizard: { passo } })
    montar(id, 'perfil')
    await sleep(4000)
    expect(vazamentos()).toEqual([])
  }, 30000)
})
