// @vitest-environment jsdom
// F4 do #347 — report ccc57891 (parte restante): "Não consigo ver a descrição
// completa de um artefato nem pelo tooltip nem pelo compêndio". O ItemSheet só
// renderizava a CARTA — artefatos têm tabelas de magias/restrições no CORPO da
// nota. Agora o body markdown renderiza abaixo da carta (padrão do painel de
// detalhes do plugin: nota inteira).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const GARRAS_ID = 'Sistema/Equipamento/Tesouros/Artefatos/Garras do Rei-Mago'
const garras = JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${GARRAS_ID}.json`), 'utf8')) as VaultDoc

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(cleanup)

describe('F4 — descrição completa do artefato (#347)', () => {
  it('DocView do Garras mostra a carta E o corpo da nota (descrição completa)', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocView doc={garras} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    // corpo da nota (descrição narrativa) — antes só a carta renderizava
    expect(await screen.findByText(/par de espadas curvas foi criado das garras/)).toBeTruthy()
  })
})
