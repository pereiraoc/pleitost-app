// @vitest-environment jsdom
// Issue #236: Companheiro Animal na ficha de GRUPO — fora do balanceamento
// de papéis e das linhas de riqueza; os tesouros do CA somam na linha do
// TUTOR (FM.Tutor wikilink, resolvido por basename entre os membros). O
// plugin não trata o caso na party sheet — o pedido do usuário é a spec.
// Cenário real: grupo da vault + Metis, a Graxaim (Tutor [[Mera]], tesouros
// com preço real) adicionada via a mesma API do editor de integrantes (#44).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { GrupoView } from '../src/grupo/GrupoView'
import {
  __resetLocalStoreForTests,
  groupBaseMemberIds,
  setGroupMember,
} from '../src/data/local-entities'
import { groupMembers } from '../src/grupo/party'
import { wikilinkBasename } from '../src/rules/rule-applier'
import {
  computeMemberWealthParts,
  expectedWealthForLevel,
  precoPO,
} from '../src/grupo/wealth'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Carlos, Dante, Mera, Pind, Thoren'
const CA_ID = 'Sistema/Criaturas/Companheiros Animais/Metis, a Graxaim'
const TUTOR_ID = 'Sistema/Criaturas/Heróis/Mera'

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const priceOf = (target: string): number => {
  const res = catalog.resolve(target)
  return res.kind === 'doc' ? precoPO(readDoc(res.id)) : 0
}

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

beforeEach(() => {
  // Neste jsdom não há localStorage (storage() do local-entities é no-op
  // guardado) — o reset da memória basta, como no compendium.test.tsx.
  __resetLocalStoreForTests()
  // Grupo real da vault + o CA real via membership (mesma API do editor #44).
  setGroupMember(GROUP_ID, CA_ID, true, groupBaseMemberIds(catalog, GROUP_ID))
})
afterEach(cleanup)

const renderGroup = () =>
  render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <GrupoView groupId={GROUP_ID} />
      </MemoryRouter>
    </CatalogProvider>,
  )

describe('issue #236: Companheiro Animal na ficha de grupo (dados reais)', () => {
  // Guardas do cenário real: Metis é CA, tem tesouros com preço real e o
  // Tutor dela ([[Mera]]) é membro do grupo da vault.
  const ca = readDoc(CA_ID)
  const tutor = readDoc(TUTOR_ID)

  it('guarda do cenário: CA real com tutor no grupo e tesouros precificáveis', () => {
    expect(ca.subtype).toBe('Companheiro Animal')
    expect(wikilinkBasename(String(ca.frontmatter['Tutor']))).toBe('Mera')
    expect(groupMembers(catalog, GROUP_ID).some((m) => m.id === TUTOR_ID)).toBe(true)
    // tesouros do CA valem > 0 PO — senão o merge no tutor seria vácuo
    const parts = computeMemberWealthParts(ca.frontmatter, priceOf)
    expect(parts.itensSemConsumiveis).toBeGreaterThan(0)
  })

  it('PAPÉIS: o CA não vira linha do balanceamento', async () => {
    const { container } = renderGroup()
    const papelPanel = container.querySelectorAll('[data-panel]')[2] as HTMLElement
    // espera o load dos docs (classe real da tutora aparece na linha dela)
    await waitFor(() =>
      expect(within(papelPanel).queryByText('Sentinela Domador')).toBeTruthy(),
    )
    // linhas = membros não-CA + linha Grupo (célula "Tier N" identifica linha)
    const membros = groupMembers(catalog, GROUP_ID)
    const tierCells = [...papelPanel.querySelectorAll<HTMLElement>('div')].filter((el) =>
      /^Tier \d$/.test(el.textContent ?? ''),
    )
    expect(tierCells.length).toBe(membros.length + 1)
    // nem o rótulo de classe do CA ("Canino Médio") nem o basename aparecem
    expect(within(papelPanel).queryByText('Canino Médio')).toBeNull()
    expect(within(papelPanel).queryByText('Metis, a Graxaim')).toBeNull()
  })

  it('RIQUEZA: sem linha do CA; a linha do tutor soma os tesouros dele', async () => {
    // expectativa independente: partes recomputadas no teste dos FMs crus
    const tutorParts = computeMemberWealthParts(tutor.frontmatter, priceOf)
    const caParts = computeMemberWealthParts(ca.frontmatter, priceOf)
    const tsr = Math.round(tutorParts.itensSemConsumiveis + caParts.itensSemConsumiveis)
    const oro = Math.round(tutorParts.ouro + caParts.ouro)
    const cns = Math.round(tutorParts.consumiveis + caParts.consumiveis)
    const esperado = expectedWealthForLevel(Number(tutor.frontmatter['Nível']) || 1)
    const delta =
      tutorParts.ouro +
      caParts.ouro +
      tutorParts.itensSemConsumiveis +
      caParts.itensSemConsumiveis -
      esperado
    // o merge muda a célula TSR da tutora (senão o teste seria vácuo)
    expect(tsr).not.toBe(Math.round(tutorParts.itensSemConsumiveis))

    const { container } = renderGroup()
    const riqPanel = container.querySelectorAll('[data-panel]')[4] as HTMLElement
    // espera os PREÇOS carregarem: TSR da tutora com a soma do CA
    await waitFor(() => {
      const cell = within(riqPanel).queryByText('Mera')?.parentElement?.parentElement
        ?.children[4] as HTMLElement | undefined
      expect(cell?.textContent).toBe(`${tsr} PO`)
    })
    const row = within(riqPanel).getByText('Mera').parentElement!.parentElement!
    expect((row.children[1] as HTMLElement).textContent).toBe(
      String(Number(tutor.frontmatter['Nível'])),
    )
    expect((row.children[2] as HTMLElement).textContent).toBe(`${cns} PO`)
    expect((row.children[3] as HTMLElement).textContent).toBe(`${oro} PO`)
    expect((row.children[5] as HTMLElement).textContent).toBe(
      `${delta >= 0 ? '+' : ''}${Math.round(delta)} PO`,
    )
    // o CA não tem linha na riqueza
    expect(within(riqPanel).queryByText('Metis, a Graxaim')).toBeNull()
  })
})
