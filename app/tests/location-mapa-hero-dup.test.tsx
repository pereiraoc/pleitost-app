// @vitest-environment jsdom
// Report 2026-08-29: a página de Porto Alegre mostrava a imagem do mapa DUAS
// vezes — o hero do topo (única imagem do doc, vinda do embed do body) e o
// MapaLocal logo abaixo (a mesma imagem, com os pins do leaflet). Quando o
// hero é a MESMA imagem do bloco leaflet, ele some — o mapa já é o visual.
// Um retrato próprio + mapa distinto continuam coexistindo.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const manifest = JSON.parse(
  fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

const portoAlegre = readDoc('Atlas/Porto Alegre/Porto Alegre')

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

describe('hero duplicado do mapa (Porto Alegre)', () => {
  it('sanidade: a única imagem do doc É a imagem do leaflet', () => {
    expect(portoAlegre.images.length).toBe(1)
    expect(portoAlegre.images[0]!.target).toBe(portoAlegre.locationBody?.leaflet?.image)
  })

  it('a imagem do mapa aparece UMA vez (só no MapaLocal, com pins)', async () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocView doc={portoAlegre} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('img[src*="Porto%20Alegre%20RPG"]').length).toBe(1)
    })
    // os pins do leaflet estão presentes (é o MapaLocal, não o hero)
    expect(container.textContent).toContain('Moinhos de Vento')
  })
})
