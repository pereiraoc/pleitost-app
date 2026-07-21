// @vitest-environment jsdom
// F6 do plano #347 — report b5e2a8b6 (3 partes):
//   1. lista de heróis/grupos mostrava "duas espadas" (⚔️) em vez da imagem do
//      grupo da mesa → o card da MESA agora usa useMesaGroupImageUrl (subida >
//      herdada), a MESMA fonte da ficha do grupo;
//   2. clicar na imagem da ficha do grupo não dava zoom → Lightbox (como as
//      outras fichas);
//   3. tooltip fora da tela → clamp por useLayoutEffect a cada tip (visual).
// Aqui: partes 1 e 2 (DOM); a 3 é geométrica (getBoundingClientRect no jsdom
// é zero) e fica pra validação visual.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { MESA_GRUPO_ID, setLiveSession } from '../src/data/session-repo/live-session'
import { GrupoView } from '../src/grupo/GrupoView'
import { __resetSessionStoreForTests, createSession, setActiveSessionCode } from '../src/data/session-store'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// pixel PNG transparente — imagem "subida" da mesa (state.grupoImagem)
const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
  __resetSessionStoreForTests()
  setLiveSession({
    sessionId: 's1',
    gmUserId: 'gm',
    state: { grupoImagem: DATA_URL },
    characters: [],
    members: [],
    encounters: [],
  })
  const local = createSession('Mesa', null, 'gm')
  setActiveSessionCode(local.codigo)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderMesa() {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={null} user={{ id: 'p1', nome: 'Ana' }}>
        <MemoryRouter>
          <GrupoView groupId={MESA_GRUPO_ID} />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('F6 — imagem do grupo (#347)', () => {
  // a img decorativa usa alt="" (sem role img) — busca por tag + src.
  const achaImg = async (): Promise<HTMLImageElement> => {
    const { waitFor } = await import('@testing-library/react')
    let out: HTMLImageElement | undefined
    await waitFor(() => {
      out = [...document.querySelectorAll('img')].find((i) => i.src === DATA_URL)
      expect(out, 'imagem da mesa renderizada do state').toBeTruthy()
    })
    return out!
  }

  it('a ficha da mesa mostra a imagem SUBIDA (state.grupoImagem), não o ⚔️', async () => {
    renderMesa()
    await achaImg()
  })

  it('clicar na imagem AMPLIA (Lightbox), como nas outras fichas', async () => {
    renderMesa()
    const img = await achaImg()
    expect(img.style.cursor).toBe('zoom-in')
    fireEvent.click(img)
    expect(await screen.findByRole('dialog', { name: /Imagem ampliada/ })).toBeTruthy()
  })
})
