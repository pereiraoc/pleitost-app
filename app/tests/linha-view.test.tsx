// @vitest-environment jsdom
// LinhaView (2026-09-08): nota de Linha da malha de transportes no compêndio —
// campos do FM em blocos, paradas em lista numerada NA ORDEM da nota, acesso
// como link pro plano, qualidade em estrelas; nada de template cru nem #Linha.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { parseLinha } from '../src/transporte/parse-linha'
import { estrelas } from '../src/components/compendium/LinhaView'
import { markerGlyph } from '../src/map/leaflet-local'
import { PESSOA_HERO_STYLE } from '../src/components/compendium/PessoaView'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
// Acha a nota da linha pelo BASENAME (index.json) — a pasta da malha já mudou
// de lugar uma vez e um caminho fixo aqui deixa o describe passando VAZIO.
const idxFile = path.join(cyberDir, 'index.json')
const docFile = (() => {
  if (!fs.existsSync(idxFile)) return null
  const m = JSON.parse(fs.readFileSync(idxFile, 'utf8')) as IndexManifest
  const achado = m.docs.find((d) => d.basename === '343 BEIRA-RIO')
  return achado ? path.join(cyberDir, `${achado.id}.json`) : null
})()
const tem = !!docFile && fs.existsSync(docFile)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(() => {
  cleanup()
  setActiveContexto(null)
})

describe('parseLinha', () => {
  it('lê modo, plano de acesso (wikilink) ou texto livre, tarifa, paradas em ordem', () => {
    const base = { id: 'x', basename: 'T9', type: 'Linha', subtype: 'Ônibus', body: '', images: [], links: [] } as unknown as VaultDoc
    const a = parseLinha({ ...base, frontmatter: { subcategoria: 'Ônibus', Acesso: '[[TRI Popular]]', Tarifa: '[[Passagem de Ônibus]]', Qualidade: 2, Paradas: ['[[A]]', '[[B|Estação B]]', '[[C]]'], Circular: true } })!
    expect(a.modo).toBe('Ônibus')
    expect(a.acessoPlano).toBe('TRI Popular')
    expect(a.tarifa).toBe('Passagem de Ônibus')
    expect(a.qualidade).toBe(2)
    expect(a.circular).toBe(true)
    expect(a.paradas).toEqual(['A', 'B', 'C'])
    const b = parseLinha({ ...base, frontmatter: { Acesso: 'dinheiro na mão', Qualidade: 9 } })!
    expect(b.acessoPlano).toBeNull()
    expect(b.acesso).toBe('dinheiro na mão')
    expect(b.qualidade).toBe(5)
    expect(parseLinha({ ...base, type: 'Recurso', frontmatter: {} })).toBeNull()
    expect(estrelas(2)).toBe('★★☆☆☆')
  })
})

describe('LinhaView (343 BEIRA-RIO real)', () => {
  it('blocos do FM, paradas numeradas na ordem, sem template cru', () => {
    if (!tem) return
    const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
    const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
    setActiveContexto(def)
    const catalog = { ...buildCatalog(manifest), contextoDef: def }
    const doc = JSON.parse(fs.readFileSync(docFile, 'utf8')) as VaultDoc
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <DocView doc={doc} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(screen.queryByText(/= this\./)).toBeNull()
    expect(screen.queryByText(/#Linha/)).toBeNull()
    expect(screen.getByText('Linha · Ônibus')).toBeTruthy()
    expect(screen.getByText('ACESSO')).toBeTruthy()
    expect(screen.getByText('TRI Prata')).toBeTruthy()
    expect(container.querySelector('[data-qualidade="2"]')?.textContent).toBe('★★☆☆☆')
    const paradas = Array.from(container.querySelectorAll('ol[data-paradas] li')).map((li) => li.textContent?.trim())
    expect(paradas).toEqual(['Estação Central', 'Estação Cidade Baixa', 'Estação Férrea de Belas', 'Estação Estádios', 'Mercado de Frutos do Mar'])
    expect(screen.getByText('APARÊNCIA')).toBeTruthy()
    // FIGURA (2026-09-10): a arte entregue pras linhas é o HERO do topo — o
    // embed do corpo sai da prosa (como na RecursoView) e vira `doc.images[0]`.
    // (O <img> em si depende do índice de assets, que este teste não carrega.)
    expect(doc.images[0]?.target).toContain('343 BEIRA-RIO')
    expect(container.textContent).not.toContain('![[')
  })
})

describe('registros centrais tocados pela malha', () => {
  it('marker "Estação" tem glifo próprio (não cai no pin genérico)', () => {
    expect(markerGlyph('Estação')).not.toEqual(markerGlyph('tipo-que-não-existe'))
  })
  it('retrato ancora no terço superior por UM token (Pessoa, hero e figura de aventura)', () => {
    // report 2026-09-08: a miniatura da figura de campanha cortava a cara no
    // meio. O enquadramento é um token só — quem recorta gente usa ele.
    const css = fs.readFileSync(path.join(appDir, 'src', 'styles', 'app.css'), 'utf8')
    expect(/--enquadramento-retrato:\s*center 18%/.test(css)).toBe(true)
    expect(PESSOA_HERO_STYLE.objectFit).toBe('cover')
    expect(PESSOA_HERO_STYLE.objectPosition).toBe('var(--enquadramento-retrato)')
    for (const regra of ['.hero-portrait', '.av-figura-img']) {
      const bloco = css.slice(css.indexOf(regra + ' {'))
      expect(bloco.slice(0, bloco.indexOf('}'))).toContain('var(--enquadramento-retrato)')
    }
  })
})
