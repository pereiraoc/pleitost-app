// @vitest-environment jsdom
// DELTA DA FICHA DO COMPANHEIRO ANIMAL (issue #201) — a ficha do CA é a do
// herói COM as mudanças da família CompanheiroAnimal do plugin
// pleitost-autosheet (fonte: render/tabs/ca/tab-completa.ts + FICHA_FAMILIA
// em src/data/familia.ts). Evidência NO DOM sobre o modelo salvo REAL do
// Metis, com um herói de CONTROLE (Mera) provando que os gates não vazam:
//   PERFIL       → TUTOR aparece (com o tutor real); some AVENTUREIRO
//                  CLASSE / APELIDO / IDENTIDADE / EXPERIÊNCIA.
//   COMPETÊNCIAS → some a sub-aba MAGIAS, o PASSADO, os Equipamentos,
//                  Ofícios e Especializações; perícias = whitelist de 6.
//   COMBATE      → some a sub-aba MAGIAS; perícias filtradas; sem Técnicas.
//   INVENTÁRIO   → some CONSUMÍVEIS, Moedas e os pickers de armadura/escudo.
//   ANOTAÇÕES    → aba não existe pro CA (rota cai no PERFIL).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
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
const metis = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${METIS_ID}.json`), 'utf8'),
) as VaultDoc

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderFicha(id: string, tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('PERFIL do CA (plugin perfil-card.ts:315-342 + biografia-card.ts:20)', () => {
  it('mostra o campo TUTOR com o tutor real do FM (Mera)', async () => {
    renderFicha(METIS_ID)
    expect(await screen.findByText('TUTOR')).toBeTruthy()
    // Valor exibido = linkLabel do FM Tutor "[[Mera]]".
    const tutorBox = await screen.findByLabelText('Tutor')
    expect(tutorBox.textContent).toContain('Mera')
  })

  it('esconde o que a família CA não tem: aventureiro, apelido, biografia, experiência', async () => {
    renderFicha(METIS_ID)
    await screen.findByText('TUTOR') // ancora o render
    expect(screen.queryByText(/AVENTUREIRO CLASSE/)).toBeNull()
    expect(screen.queryByLabelText('Apelido')).toBeNull()
    // Sub-abas IDENTIDADE/EXPERIÊNCIA (biografia + aventureiro) não existem.
    expect(screen.queryByText('IDENTIDADE')).toBeNull()
    expect(screen.queryByText('EXPERIÊNCIA')).toBeNull()
    // Cluster do Passado (biografia-card, só Heroi).
    expect(screen.queryByText(/PASSADO/)).toBeNull()
  })

  it('controle Heroi: TUTOR não existe; biografia/experiência continuam', async () => {
    renderFicha(MERA_ID)
    expect(await screen.findByText(/AVENTUREIRO CLASSE/)).toBeTruthy()
    expect(screen.queryByText('TUTOR')).toBeNull()
    expect(screen.getByLabelText('Apelido')).toBeTruthy()
    expect(screen.getByText('IDENTIDADE')).toBeTruthy()
    expect(screen.getByText('EXPERIÊNCIA')).toBeTruthy()
  })

  it('mantém o corpo comum da ficha: nome, sintonia e classe reais do FM', async () => {
    renderFicha(METIS_ID)
    expect((await screen.findAllByDisplayValue(metis.basename!)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Canino Médio').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Sintonia')).toBeTruthy()
  })
})
