// @vitest-environment jsdom
// Report 2026-08-29: OrgView lê os campos literais do callout (prosa no corpo,
// FM vazio). Corte mestre×jogador (2026-08-31): o dataset PÚBLICO só carrega a
// whitelist (Resumo/Descrição/Líder) — Objetivos/Influência vivem no espelho
// gm.json e só o mestre os vê.
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
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const manifest = JSON.parse(
  fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

const renner = readDoc('Contexto/Organizações/Empresas/Renner')
const gmBundle = JSON.parse(fs.readFileSync(path.join(cyberDir, 'gm.json'), 'utf8')) as {
  docs: Record<string, VaultDoc>
}
const rennerMestre = gmBundle.docs['Contexto/Organizações/Empresas/Renner']!

beforeAll(() => {
  globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as typeof fetch
})

afterEach(cleanup)

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('OrgView lê os campos literais do callout (template POA)', () => {
  it('sanidade: o PÚBLICO não carrega objetivos; o espelho gm sim', () => {
    expect(renner.type).toBe('Organização')
    expect(renner.body).not.toContain('Objetivo de Longo Prazo')
    expect(rennerMestre.body).toContain('**Objetivo de Longo Prazo:** Exportar equipamentos táticos.')
  })

  it('JOGADOR: só a whitelist (Resumo/Líder/Descrição) — sem objetivos', () => {
    renderDoc(renner)
    expect(screen.getByText('Especialista em vestuário industrial e uniformes.')).toBeTruthy()
    expect(screen.getByText('Eduardo Renner')).toBeTruthy()
    expect(screen.getByText(/Produz tecidos anti-perfuração/)).toBeTruthy()
    // segredos do mestre NÃO renderizam pro jogador
    expect(screen.queryByText('OBJETIVO DE LONGO PRAZO')).toBeNull()
    expect(screen.queryByText(/Exportar equipamentos táticos/)).toBeNull()
    expect(screen.queryByText(/Fornece fardas a escolas técnicas/)).toBeNull()
    // nada de template cru nem empty state
    expect(screen.queryByText(/= this\./)).toBeNull()
    expect(screen.queryByText('// ORGANIZAÇÃO SEM INFORMAÇÕES REGISTRADAS')).toBeNull()
  })

  it('MESTRE (doc do espelho gm): objetivos e influência completos', () => {
    renderDoc(rennerMestre)
    expect(screen.getByText('OBJETIVO DE LONGO PRAZO')).toBeTruthy()
    expect(screen.getByText('Exportar equipamentos táticos.')).toBeTruthy()
    expect(screen.getByText('OBJETIVO IMEDIATO')).toBeTruthy()
    expect(screen.getByText('INFLUÊNCIA')).toBeTruthy()
    expect(screen.getByText(/Fornece fardas a escolas técnicas/)).toBeTruthy()
  })

  it('não duplica campo que o FM já forneceu (Resumo aparece uma vez)', () => {
    renderDoc(renner)
    expect(screen.getAllByText(/Especialista em vestuário industrial/).length).toBe(1)
  })

  it('layout de LEITURA: blocos empilhados no estilo da Localização, não grade de cards', () => {
    const { container } = renderDoc(rennerMestre)
    // mesmo vocabulário visual dos Detalhes da Localização (label mono + prosa)
    expect(container.querySelectorAll('.local-field-label').length).toBeGreaterThanOrEqual(4)
  })

  it('aventura com fence bounty mostra o CORPO da one-shot abaixo do card', async () => {
    const posGrenal = readDoc('Campanhas/Aventuras/Pós Grenal')
    expect(posGrenal.body).toContain('```bounty')
    renderDoc(posGrenal)
    // o card do bounty segue
    expect(screen.getByText(/Recuperação de Carga do Consórcio das Bandeiras/)).toBeTruthy()
    // e o roteiro da one-shot aparece (antes era descartado — report 2026-08-29)
    expect(screen.getByText(/Gre-Nal de Sangue Frio/)).toBeTruthy()
    expect(screen.getByText(/Casa da Drenagem/)).toBeTruthy()
    // o fence bounty NÃO vaza como <pre> cru
    expect(screen.queryByText(/Titulo: Recuperação/)).toBeNull()
  })
})
