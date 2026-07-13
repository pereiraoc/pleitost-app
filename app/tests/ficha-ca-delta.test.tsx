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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { AppShell } from '../src/components/layout/AppShell'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  removeLocalEntity,
} from '../src/data/local-entities'
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

describe('COMPETÊNCIAS do CA (plugin tabs/ca/tab-completa.ts + family-pericias.ts)', () => {
  // O PanelTrack mantém TODAS as sub-abas montadas no DOM — as ausências
  // valem pra aba inteira, sem precisar navegar entre sub-abas.
  it('sem MAGIAS, PASSADO, Equipamentos, Ofícios, Especializações e Técnicas', async () => {
    renderFicha(METIS_ID, 'habilidades')
    expect(await screen.findByText('⚖️ ATRIBUTOS')).toBeTruthy()
    expect(screen.queryByText('MAGIAS')).toBeNull() // sub-aba não existe
    expect(screen.queryByText(/PASSADO/)).toBeNull()
    expect(screen.queryByText('Armas Simples')).toBeNull() // EquipamentosProf
    expect(screen.queryByText('Ofícios')).toBeNull()
    expect(screen.queryByText(/Especializações/)).toBeNull()
    expect(screen.queryByText('Técnicas')).toBeNull()
  })

  it('perícias = whitelist de 6 (CA_PERICIAS); as outras 7 não renderizam', async () => {
    renderFicha(METIS_ID, 'habilidades')
    expect(await screen.findByText('Perícias')).toBeTruthy()
    for (const nome of ['Atletismo', 'Acrobacia', 'Furtividade', 'Sobrevivência', 'Enganação', 'Intimidação'])
      expect(screen.getAllByText(nome).length, nome).toBeGreaterThan(0)
    for (const nome of ['Ladinagem', 'Arcana', 'Sociedades', 'Guerra', 'Medicina', 'Diplomacia'])
      expect(screen.queryByText(nome), nome).toBeNull()
  })

  it('TIPO estático no lugar de CLASSE INICIAL; sem stepper de nível (satélite do tutor)', async () => {
    renderFicha(METIS_ID, 'habilidades')
    expect(await screen.findByText(/TIPO/)).toBeTruthy()
    expect(screen.queryByText(/CLASSE INICIAL/)).toBeNull()
    expect(screen.queryByText('▲')).toBeNull() // stepper de nível
  })

  it('controle Heroi: MAGIAS/PASSADO/Ofícios/CLASSE INICIAL/stepper presentes', async () => {
    renderFicha(MERA_ID, 'habilidades')
    expect(await screen.findByText('MAGIAS')).toBeTruthy()
    expect(screen.getAllByText(/PASSADO/).length).toBeGreaterThan(0)
    expect(screen.getByText('Ofícios')).toBeTruthy()
    expect(screen.getAllByText('Ladinagem').length).toBeGreaterThan(0)
    expect(screen.getByText(/CLASSE INICIAL/)).toBeTruthy()
    expect(screen.getByText('▲')).toBeTruthy()
  })
})

describe('COMBATE do CA (mount-interativa.ts:785 showMagias = Heroi)', () => {
  it('sem sub-aba MAGIAS; perícias filtradas; armas naturais e vida continuam', async () => {
    renderFicha(METIS_ID, 'combate')
    // Vida real da Interativa (corpo comum preservado).
    const fm = metis.frontmatter as Record<string, any>
    const vit = `${fm.Interativa.Recursos_Restantes.Vitalidade} / ${fm.Vida.Vitalidade}`
    expect(await screen.findByText(vit)).toBeTruthy()
    expect(screen.queryByText('MAGIAS')).toBeNull()
    // Arma natural real do FM na aba ATAQUES.
    expect(screen.getAllByText('Mandíbula').length).toBeGreaterThan(0)
    // PanelTrack mantém as sub-abas no DOM: perícias fora da whitelist não
    // aparecem em lugar NENHUM do combate do CA.
    expect(screen.queryByText('Ladinagem')).toBeNull()
  })

  it('controle Heroi: sub-aba MAGIAS presente no combate', async () => {
    renderFicha(MERA_ID, 'combate')
    expect(await screen.findByText('MAGIAS')).toBeTruthy()
  })
})

describe('INVENTÁRIO do CA (plugin tab-inventario.ts:126-128 + tab-completa.ts:33-43)', () => {
  it('sem CONSUMÍVEIS, sem Moedas e sem pickers de armadura/escudo; tesouros reais ficam', async () => {
    renderFicha(METIS_ID, 'inventario')
    // Arma natural real (corpo comum preservado).
    expect(await screen.findByText('Mandíbula')).toBeTruthy()
    expect(screen.queryByText('CONSUMÍVEIS')).toBeNull()
    expect(screen.queryByTitle('Moedas')).toBeNull()
    expect(screen.queryByText('ARMADURA')).toBeNull()
    expect(screen.queryByText('ESCUDO')).toBeNull()
    // Tesouros equipados reais do FM (Anel do Equilíbrio é permitido pro CA).
    expect(screen.getAllByText(/Anel do Equilíbrio/).length).toBeGreaterThan(0)
  })

  it('catálogo de tesouros do CA = só os 3 permitidos (filterCaTesouros)', async () => {
    renderFicha(METIS_ID, 'inventario')
    await screen.findByText('Mandíbula')
    // Abre o picker da aba EQUIPAMENTOS (fab "+ Adicionar Tesouro").
    fireEvent.click(screen.getByText('EQUIPAMENTOS'))
    fireEvent.click(await screen.findByText(/\+ Adicionar Tesouro/))
    expect(await screen.findByText('ESCOLHER TESOURO')).toBeTruthy()
    expect(screen.getAllByText('Pulseira da Potência').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Anel da Resistência').length).toBeGreaterThan(0)
    // Tesouro fora da whitelist não é opção pro CA (existe na vault:
    // Equipamentos de Perícia/Luvas do Ladrão).
    expect(screen.queryByText('Luvas do Ladrão')).toBeNull()
  })

  it('controle Heroi: CONSUMÍVEIS, Moedas e ARMADURA/ESCUDO presentes', async () => {
    renderFicha(MERA_ID, 'inventario')
    // Strip + PanelLabel — pro herói a sub-aba existe e o painel monta.
    expect((await screen.findAllByText('CONSUMÍVEIS')).length).toBeGreaterThan(0)
    expect(screen.getByTitle('Moedas')).toBeTruthy()
    expect(screen.getByText('ARMADURA')).toBeTruthy()
    expect(screen.getByText('ESCUDO')).toBeTruthy()
  })
})

describe('ABAS por família (plugin mount-interativa.ts:897 — CA sem Anotações)', () => {
  function renderShell(id: string) {
    return render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id)]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }
  const sidebarLabels = (container: HTMLElement) => {
    const group = container.querySelector('.sidebar .nav-group') as HTMLElement
    return [...group.querySelectorAll('button')].map((b) => b.textContent ?? '')
  }

  it('sidebar do CA sem ANOTAÇÕES; a do herói com', async () => {
    const ca = renderShell(METIS_ID)
    await screen.findByText('TUTOR')
    const caLabels = sidebarLabels(ca.container).join('|')
    expect(caLabels).toContain('BIOGRAFIA')
    expect(caLabels).toContain('COMBATE')
    expect(caLabels).not.toContain('ANOTAÇÕES')
    cleanup()

    const heroi = renderShell(MERA_ID)
    await screen.findByText(/AVENTUREIRO CLASSE/)
    expect(sidebarLabels(heroi.container).join('|')).toContain('ANOTAÇÕES')
  })

  it('rota direta ?tab=anotacoes no CA cai no PERFIL', async () => {
    renderFicha(METIS_ID, 'anotacoes')
    expect(await screen.findByText('TUTOR')).toBeTruthy()
    expect(screen.queryByText('// ANOTAÇÕES DE CAMPANHA')).toBeNull()
  })
})

describe('CA LOCAL (issue #46 → #201): criado no app, ganha o MESMO delta', () => {
  it('ficha de CA local mostra TUTOR e esconde MAGIAS/PASSADO', async () => {
    const id = createLocalEntity(
      'CompanheiroAnimal',
      'Novo Companheiro',
      emptyCompanheiroFrontmatter('Novo Companheiro'),
    )
    try {
      renderFicha(id)
      expect(await screen.findByText('TUTOR')).toBeTruthy()
      expect(screen.queryByText(/AVENTUREIRO CLASSE/)).toBeNull()
      expect(screen.queryByText(/PASSADO/)).toBeNull()
      cleanup()

      renderFicha(id, 'habilidades')
      expect(await screen.findByText('⚖️ ATRIBUTOS')).toBeTruthy()
      expect(screen.queryByText('MAGIAS')).toBeNull()
    } finally {
      removeLocalEntity(id)
    }
  })
})
