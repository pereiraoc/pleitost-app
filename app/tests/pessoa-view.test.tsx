// @vitest-environment jsdom
// Report 2026-08-29 (Pessoa/Emílio Garrastazu Médici): o markdown genérico
// vazava a tag "#Pessoa" como texto e amassava o callout-template numa linha
// só ("Organização: … Função: …"), com rótulos de campos VAZIOS soltos
// ("Personalidade: Aparência:"). Fix em duas frentes:
//   - PessoaView dedicada (padrão OrgView/#247): campos do FM como cards,
//     rótulos declarados no schema da view, vazios omitidos, empty state.
//   - linhas SÓ-TAG (#Pessoa/#Contexto…) saem do render markdown centralmente
//     (MarkdownBody) — a tag é metadado do Obsidian, não conteúdo.
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

const medici = readDoc('Contexto/Pessoas/Emílio Garrastazu Médici')

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

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('PessoaView (doc real da POA)', () => {
  it('sanidade: Médici é type Pessoa com template puro', () => {
    expect(medici.type).toBe('Pessoa')
    expect(medici.body).toContain('#Pessoa')
    expect(medici.frontmatter['Função']).toBe('Presidente do Brasil')
  })

  it('sem tag #Pessoa nem template cru; campos preenchidos viram cards', () => {
    renderDoc(medici)
    expect(screen.queryByText(/#Pessoa/)).toBeNull()
    expect(screen.queryByText(/= this\./)).toBeNull()
    // campos PREENCHIDOS: rótulo + valor, cada um no seu card
    expect(screen.getByText('Organização')).toBeTruthy()
    expect(screen.getByText('Governo Militar Brasileiro')).toBeTruthy()
    expect(screen.getAllByText('Presidente do Brasil').length).toBeGreaterThan(0)
  })

  it('campos VAZIOS não mostram rótulos soltos', () => {
    renderDoc(medici)
    // Personalidade/Aparência/Objetivos estão vazios no FM do Médici
    expect(screen.queryByText('Personalidade')).toBeNull()
    expect(screen.queryByText('Aparência')).toBeNull()
    expect(screen.queryByText(/Objetivo de Longo Prazo/)).toBeNull()
  })

  it('pessoa sem nada preenchido mostra empty state honesto', () => {
    const vazio: VaultDoc = {
      ...medici,
      frontmatter: { categoria: 'Pessoa' },
    }
    renderDoc(vazio)
    expect(screen.getByText('// PESSOA SEM INFORMAÇÕES REGISTRADAS')).toBeTruthy()
  })
})

describe('linhas só-tag não vazam no markdown (central)', () => {
  it('HistoriaView de nota com "#Contexto" no topo não mostra a tag', () => {
    const chernobyl = readDoc('Contexto/Histórias/Contexto Histórico/Acidente de Chernobyl')
    expect(chernobyl.body.startsWith('#Contexto')).toBe(true)
    renderDoc(chernobyl)
    expect(screen.queryByText(/#Contexto/)).toBeNull()
  })
})
