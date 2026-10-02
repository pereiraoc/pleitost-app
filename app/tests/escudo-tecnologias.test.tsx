// @vitest-environment jsdom
// ESCUDO DO MESTRE (B5) — sub-aba MAGIAS/TECNOLOGIAS por combatente: reusa o
// MagiasResumo (escola proficiente com +N/CDn, Potência/EM, listas por rank) e
// carrega a linha de EXECUÇÃO do mundo (reskin.execucao, A3) — na POA o mestre
// lê como aquele combatente executa a tecnologia. Zuko (Animista, Fogo) com a
// def real da POA; pula se o dataset cyberpunk não foi extraído.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
import { TipProvider } from '../src/components/ficha/tooltips'
import { SubTecnologias } from '../src/components/mestre/escudo/secoes'
import { montarCombatentes } from '../src/components/mestre/escudo/useCombatentes'
import { buildCharacterState, buildCharacterSummary } from '../src/data/session-repo/publish'
import type { LiveSession } from '../src/data/session-repo/live-session'
import type { ContextoDef } from '../src/data/context-def'
import type { Encounter, SessionCharacter } from '../src/data/session-repo/contract'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temContexto = fs.existsSync(path.join(cyberDir, 'contexto.json'))
const ZUKO_ID = 'Sistema/Criaturas/Heróis/Zuko'
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const zuko = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${ZUKO_ID}.json`), 'utf8')) as VaultDoc
let def: ContextoDef | undefined

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
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  if (temContexto) def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

function zukoNaMesa(): LiveSession {
  const c: SessionCharacter = {
    id: 'z1',
    sessionId: 's1',
    memberId: 'p1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: ZUKO_ID,
    visibility: 'visible',
    summary: buildCharacterSummary(zuko),
    state: buildCharacterState(zuko),
    fmBlob: zuko.frontmatter,
    updatedAt: '',
    encounterId: 'e1',
  }
  const enc = {
    id: 'e1',
    sessionId: 's1',
    sourceNotePath: '',
    name: 'E',
    status: 'active',
    roster: { entries: [] },
    difficulty: null,
    revealedCharacterIds: [],
    turnState: { order: ['z1'], currentIndex: 0, round: 1, started: true },
    createdAt: '',
  } as unknown as Encounter
  return { sessionId: 's1', gmUserId: 'gm', state: null, characters: [c], members: [], encounters: [enc] }
}

function montar(d: ContextoDef | undefined) {
  const catalog = { ...buildCatalog(manifest), contextoDef: d }
  const vm = montarCombatentes(zukoNaMesa(), true, 'todos').lista[0]!
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter>
          <TipProvider>
            <SubTecnologias vm={vm} />
          </TipProvider>
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('ESCUDO — sub-aba MAGIAS/TECNOLOGIAS por combatente', () => {
  it('Zuko na POA: bloco de magias com a linha de execução da classe (Irradiado) pra Anima', async () => {
    if (!def) return
    const { container } = montar(def)
    await waitFor(() => expect(container.querySelector('[data-resumo-execucao="Anima"]')).toBeTruthy())
    const linha = container.querySelector('[data-resumo-execucao="Anima"]')!
    expect(linha.textContent).toBe(def.reskin.execucao!.classes.Animista!.Anima!)
    expect(container.querySelector('[data-resumo-section="// MAGIAS"]')).toBeTruthy()
  })
  it('fantasia (sem def): o bloco de magias existe e NÃO tem linha de execução', async () => {
    const { container } = montar(undefined)
    await waitFor(() => expect(container.querySelector('[data-resumo-section="// MAGIAS"]')).toBeTruthy())
    expect(container.querySelector('[data-resumo-execucao]')).toBeNull()
  })
})
