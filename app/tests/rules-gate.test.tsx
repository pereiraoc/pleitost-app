// @vitest-environment jsdom
// #57 — GATE de re-extração no useHeroRules. Espia o `loadDoc` (resolvedor do
// BFS): a extração (async, cara) só pode re-disparar quando um campo que a
// REGRA lê muda. Digitar nome/motivação (novo objeto fm, mas mesma ruleKey) NÃO
// pode carregar doc de novo — mas a projeção AINDA reflete a bio nova
// (derivedFm re-fundido de graça). Trocar a Classe SIM re-extrai.
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import type { IndexManifest, VaultDoc } from '../src/data/types'

// Espia loadDoc: conta CADA chamada do resolvedor (o cache do loadDoc evita o
// fetch, mas a extração ainda invoca loadDoc por nó do BFS — logo o contador
// detecta uma re-extração mesmo com tudo cacheado).
const spy = vi.hoisted(() => ({ calls: 0 }))
vi.mock('../src/data/useDoc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/data/useDoc')>()
  return {
    ...actual,
    loadDoc: (id: string) => {
      spy.calls++
      return actual.loadDoc(id)
    },
  }
})

// Import DEPOIS do vi.mock pra pegar o loadDoc espiado.
const { useHeroRules } = await import('../src/rules/useHeroRules')

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8')) as VaultDoc
const fm0 = carlos.frontmatter as Record<string, unknown>

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <CatalogProvider catalog={catalog}>{children}</CatalogProvider>
)

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms))

describe('#57 gate: bio NÃO re-extrai; campo de regra SIM', () => {
  it('editar nome/motivação reaproveita a extração (0 novas cargas) mas refaz a projeção', async () => {
    const { result, rerender } = renderHook(({ fm }) => useHeroRules(fm), {
      initialProps: { fm: fm0 },
      wrapper,
    })

    // Extração inicial completa quando a projeção aparece.
    await waitFor(() => expect(result.current).toBeTruthy())
    const afterInitial = spy.calls
    expect(afterInitial).toBeGreaterThan(0)

    // Edição de BIO: novo objeto fm, mesma ruleKey.
    const bio0 = (fm0['Biografia'] ?? {}) as Record<string, unknown>
    const fmBio = { ...fm0, nome: 'Carlão Editado', Biografia: { ...bio0, Motivacao: 'Nova motivação' } }
    rerender({ fm: fmBio })
    await tick() // deixa qualquer efeito assíncrono correr

    // NENHUMA carga nova de doc (extração pulada)…
    expect(spy.calls).toBe(afterInitial)
    // …mas a projeção reflete a bio nova (derivedFm re-fundido do fm corrente).
    expect(result.current).toBeTruthy()
    expect((result.current!.derivedFm as Record<string, unknown>)['nome']).toBe('Carlão Editado')

    // Edição de CLASSE: ruleKey muda → re-extrai (novas cargas).
    rerender({ fm: { ...fmBio, Classe: '[[Mago]]' } })
    await waitFor(() => expect(spy.calls).toBeGreaterThan(afterInitial))
  })
})
