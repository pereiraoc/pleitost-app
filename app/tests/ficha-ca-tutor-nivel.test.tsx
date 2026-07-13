// @vitest-environment jsdom
// NÍVEL SATÉLITE DO TUTOR (issue #201) — família CompanheiroAnimal do plugin:
// o nível do CA acompanha o tutor (extract/sync-ca-tutor-nivel.ts +
// cola/process-yaml-extract-phase.ts:86-113). Porta no app: extractHeroRules
// resolve o FM do tutor, computa a escala no nível DELE e injeta
// calculated["Nível"] → merge-calculated materializa no derivedFm → o NVL do
// PERFIL mostra o nível do tutor mesmo com o FM salvo divergente.
//
// Fixture: Metis real (vault-data) com o Nível ADULTERADO pra 3 — o FM real
// tem 7 (igual à Mera), o que tornaria o sync invisível. O teste serve o JSON
// adulterado pro id da Metis via fetch fake.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const METIS_ID = 'Sistema/Criaturas/Companheiros Animais/Metis, a Graxaim'
const MERA_ID = 'Sistema/Criaturas/Heróis/Mera'
const readDoc = (id: string) =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const mera = readDoc(MERA_ID)
const meraNivel = Number((mera.frontmatter as Record<string, unknown>)['Nível']) // 7

// Metis com nível DIVERGENTE do tutor (3 ≠ 7) — só o Nível muda.
const metisDoctored: VaultDoc = (() => {
  const doc = readDoc(METIS_ID)
  ;(doc.frontmatter as Record<string, unknown>)['Nível'] = 3
  return doc
})()

const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  id === METIS_ID ? metisDoctored : readDoc(id)

beforeAll(() => {
  expect(meraNivel).toBeGreaterThan(3) // o sync precisa ser observável
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, '')).replace(/\.json$/, '')
    if (rel === METIS_ID)
      return { ok: true, status: 200, json: async () => metisDoctored }
    const file = path.join(vaultDataDir, `${rel}.json`)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

describe('CA satélite: nível do Metis segue o da Mera (tutor)', () => {
  it('rules: derivedFm["Nível"] = nível do tutor (calculated["Nível"] via sync)', async () => {
    const { projection } = await projectHeroRules(
      metisDoctored.frontmatter as Record<string, unknown>,
      catalog,
      loadFromDisk,
    )
    expect(projection.derivedFm['Nível']).toBe(meraNivel)
  })

  it('herói de controle: derivedFm mantém o Nível salvo (sem sync)', async () => {
    const { projection } = await projectHeroRules(
      mera.frontmatter as Record<string, unknown>,
      catalog,
      loadFromDisk,
    )
    expect(projection.derivedFm['Nível']).toBe(meraNivel)
  })

  it('PERFIL: NVL mostra o nível do TUTOR, não o FM salvo divergente', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(METIS_ID)]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText(`NVL ${meraNivel}`)).toBeTruthy()
    expect(screen.queryByText('NVL 3')).toBeNull()
  })
})
