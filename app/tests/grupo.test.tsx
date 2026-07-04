// @vitest-environment jsdom
// Ficha de grupo: lógica espelhada do plugin validada sobre os dados REAIS
// da vault + render da tela desenhada (§GRUPOS) com um grupo real.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { GrupoView } from '../src/grupo/GrupoView'
import {
  BAL_CAPTION,
  groupMembers,
  groupTotals,
  papelValues,
  rankLetter,
  tierFromLevel,
} from '../src/grupo/party'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

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

describe('party.ts (espelho do plugin) sobre dados reais', () => {
  it('membros = criaturas cujo FM.grupo resolve pro doc do grupo', () => {
    const members = groupMembers(catalog, GROUP_ID)
    // expectativa independente: varre o índice cru
    const expected = manifest.docs.filter((d) => {
      if (d.kind !== 'content' || d.type !== 'Criatura' || !d.grupo) return false
      const list = Array.isArray(d.grupo) ? d.grupo : [d.grupo]
      return list.some((g) => g.includes('[[Adriann, Carlos, Kenji, Zuko]]'))
    })
    expect(members.map((m) => m.id).sort()).toEqual(expected.map((d) => d.id).sort())
    expect(members.length).toBeGreaterThan(0)
  })

  it('papelValues espelha FM.Papel (Adriann real)', () => {
    const adriann = readDoc('Sistema/Criaturas/Heróis/Adriann')
    expect(papelValues(adriann)).toEqual(adriann.frontmatter['Papel'])
  })

  it('tierFromLevel e rankLetter seguem o plugin', () => {
    expect([1, 3, 4, 6, 7, 9, 10, 15].map(tierFromLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
    expect(rankLetter({}, 1)).toBe('C')
    expect(rankLetter({}, 3)).toBe('A')
    expect(rankLetter({}, 4)).toBe('S')
    // regra do plugin: primeiro [SABCD] da string ("Classe B" daria 'C')
    expect(rankLetter({ rank: 'B' }, 4)).toBe('B')
    expect(rankLetter({ rank: 'Classe B' }, 4)).toBe('C')
  })

  it('linha Grupo soma os papéis dos membros', () => {
    const members = groupMembers(catalog, GROUP_ID)
    const values = members.map((m) => papelValues(readDoc(m.id)))
    const totals = groupTotals(values)
    for (const papel of ['Lider', 'Controlador', 'Abatedor', 'Vanguarda'] as const) {
      expect(totals[papel]).toBe(values.reduce((s, v) => s + v[papel], 0))
    }
  })
})

describe('GrupoView (tela do design com dados reais)', () => {
  it('header + tabela de balanceamento + nota verbatim', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    const members = groupMembers(catalog, GROUP_ID)
    // header: nomes do grupo + contagem real
    expect(screen.getByText('Adriann, Carlos, Kenji, Zuko')).toBeTruthy()
    expect(screen.getByText(`${members.length} integrantes`)).toBeTruthy()
    // linha do Adriann usa a classe real (Mago) após o load
    expect(await screen.findByText('Mago')).toBeTruthy()
    // linha Grupo + nota do plugin
    expect(screen.getByText('Grupo')).toBeTruthy()
    expect(screen.getByText(BAL_CAPTION)).toBeTruthy()
    // colunas dos papéis
    for (const col of ['LID', 'CON', 'ABT', 'VAN', 'TIR']) {
      expect(screen.getByText(col)).toBeTruthy()
    }
  })
})
