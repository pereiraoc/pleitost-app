// @vitest-environment jsdom
// Custos de ação (1/2/3 ações, reação, ação livre) viram ÍCONE (glifo vetorial
// com fill=currentColor) em vez do emoji 1️⃣/2️⃣/3️⃣/0️⃣/↩️/🆓 — em todo lugar:
// badges/linhas da ficha (CustoIcone) e ícone supercharged dos wikilinks
// (linkAcaoForEntry → <AcaoIcone> dentro do <a>).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { MarkdownBody } from '../src/markdown/MarkdownBody'
import { linkAcaoForEntry, linkIconForEntry } from '../src/markdown/link-icon'
import { AcaoIcone, CustoIcone } from '../src/components/AcaoIcone'
import { ACAO_ROTULO, custoAcaoTipo } from '../src/components/acao-custo'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

// emojis que o registro usava pros custos de ação (tokens.emojis.custo +
// emojiCostExtra) — nenhum pode sobrar no DOM onde o custo é de ação
const EMOJIS_ACAO = /1️⃣|2️⃣|3️⃣|0️⃣|↩️|🆓/u

function makeStorage(): Storage {
  const d = new Map<string, string>()
  return {
    get length() {
      return d.size
    },
    clear: () => d.clear(),
    getItem: (k: string) => (d.has(k) ? d.get(k)! : null),
    key: (i: number) => [...d.keys()][i] ?? null,
    removeItem: (k: string) => void d.delete(k),
    setItem: (k: string, v: string) => void d.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(cleanup)

describe('custoAcaoTipo — vocabulário do registro custo', () => {
  it('1A/2A/3A/L/R viram tipos de ação; P/Min/minutos não', () => {
    expect(custoAcaoTipo('1A')).toBe('1')
    expect(custoAcaoTipo(' 2A ')).toBe('2')
    expect(custoAcaoTipo('3A')).toBe('3')
    expect(custoAcaoTipo('R')).toBe('reacao')
    expect(custoAcaoTipo('L')).toBe('livre')
    expect(custoAcaoTipo('P')).toBeNull()
    expect(custoAcaoTipo('Min')).toBeNull()
    expect(custoAcaoTipo('1 Min')).toBeNull()
    expect(custoAcaoTipo(undefined)).toBeNull()
  })
})

describe('<AcaoIcone>/<CustoIcone>', () => {
  it('cada tipo desenha um svg com rótulo acessível e SEM texto (nem emoji)', () => {
    for (const tipo of ['1', '2', '3', 'reacao', 'livre'] as const) {
      const { container, unmount } = render(<AcaoIcone tipo={tipo} />)
      const el = container.querySelector('.acao-icone') as HTMLElement
      expect(el, tipo).toBeTruthy()
      expect(el.getAttribute('aria-label')).toBe(ACAO_ROTULO[tipo])
      expect(el.querySelector('svg path')?.getAttribute('d')).toBeTruthy()
      expect(el.textContent).toBe('')
      unmount()
    }
  })

  it('3 ações é mais larga que 1 ação (largura proporcional ao glifo)', () => {
    const w = (tipo: '1' | '3') => {
      const { container, unmount } = render(<AcaoIcone tipo={tipo} />)
      const v = parseFloat((container.querySelector('svg') as SVGElement).style.width)
      unmount()
      return v
    }
    expect(w('3')).toBeGreaterThan(w('1') * 1.8)
  })

  it('CustoIcone: custo de ação → ícone; outros custos seguem o emoji do registro', () => {
    const { container } = render(
      <div>
        <CustoIcone custo="2A" />
        <CustoIcone custo="R" />
        <CustoIcone custo="L" />
        <CustoIcone custo="Min" />
      </div>,
    )
    expect(container.querySelectorAll('.acao-icone')).toHaveLength(3)
    expect(container.textContent).not.toMatch(EMOJIS_ACAO)
    expect(container.textContent).toContain('⏲')
  })

  it('CustoIcone modo técnica: 1A segue o ▫️ do design; 2A/L/R viram ícone', () => {
    const { container } = render(
      <div>
        <CustoIcone custo="1A" modo="tecnica" />
        <CustoIcone custo="2A" modo="tecnica" />
        <CustoIcone custo="L" modo="tecnica" />
        <CustoIcone custo="R" modo="tecnica" />
      </div>,
    )
    expect(container.querySelectorAll('.acao-icone')).toHaveLength(3)
    expect(container.textContent).toBe('▫️')
  })

  it('CustoIcone modo badge: custo de ação → ícone; senão o dígito/sigla', () => {
    const { container } = render(
      <div>
        <CustoIcone custo="1A" modo="badge" />
        <CustoIcone custo="P" modo="badge" />
      </div>,
    )
    expect(container.querySelectorAll('.acao-icone')).toHaveLength(1)
    expect(container.textContent).toBe('P')
  })
})

describe('wikilink pra Ação: ícone de custo em vez do emoji supercharged', () => {
  it('linkAcaoForEntry acompanha o seletor custo vencedor', () => {
    const e = (custo: string) => ({ type: 'Regra', subtype: 'Ação', grupo: null, custo })
    expect(linkAcaoForEntry(e('1A'))).toBe('1')
    expect(linkAcaoForEntry(e('2A'))).toBe('2')
    expect(linkAcaoForEntry(e('3A'))).toBe('3')
    expect(linkAcaoForEntry(e('R'))).toBe('reacao')
    expect(linkAcaoForEntry(e('L'))).toBe('livre')
    expect(linkAcaoForEntry(e('P'))).toBeNull()
    // o emoji segue disponível pra quem precisa de texto puro
    expect(linkIconForEntry(e('P'))).toBe('🅿️')
  })

  it('MarkdownBody: [[Corrida]]/[[Ataque de Oportunidade]]/[[Soltar]] levam o svg e não o emoji', async () => {
    const doc = {
      id: 'x',
      path: 'x.md',
      basename: 'x',
      type: null,
      subtype: null,
      grupo: null,
      kind: 'content',
      frontmatter: {},
      body: 'Use [[Corrida]], [[Ataque de Oportunidade]], [[Soltar]], [[Atacar]] ou [[Preparar]].',
      inlineFields: {},
      ruleElements: [],
    } as unknown as VaultDoc
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <MemoryRouter>
            <MarkdownBody doc={doc} />
          </MemoryRouter>
        </DetailProvider>
      </CatalogProvider>,
    )
    const links = await waitFor(() => {
      const els = container.querySelectorAll('a')
      expect(els.length).toBe(5)
      return [...els]
    })
    const rotulos = links.map((a) => a.querySelector('.acao-icone')?.getAttribute('aria-label'))
    expect(rotulos).toEqual([
      ACAO_ROTULO['3'],
      ACAO_ROTULO.reacao,
      ACAO_ROTULO.livre,
      ACAO_ROTULO['1'],
      ACAO_ROTULO['2'],
    ])
    for (const a of links) {
      expect(a.getAttribute('data-link-icon') ?? '').not.toMatch(EMOJIS_ACAO)
    }
    expect(container.textContent).not.toMatch(EMOJIS_ACAO)
  })
})
