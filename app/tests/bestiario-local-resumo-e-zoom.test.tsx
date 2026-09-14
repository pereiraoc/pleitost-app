// @vitest-environment jsdom
// REPORT DO MESTRE (2026-09-14), duas partes na aba BESTIÁRIO do lugar:
//   1. "a ficha resumo do bestiário não parece estar abrindo corretamente nos
//      detalhes quando eu vou em Atlas/Bestiário e clico em um nome de uma
//      criatura, só quando eu abro um combate e depois clico no nome".
//      A aba abria `kind:'doc'` (o corpo cru da nota) enquanto TODO o resto do
//      app — CombatMarkerBlock, CriadorCombate e a página de Criaturas — abre
//      `kind:'resumo'`, que é a ficha resumo do autosheet (ResumoDetail).
//   2. "não to conseguindo clicar na imagem deles pra ver maior tipo como
//      fizemos no resto". A figura era decoração (`aria-hidden`, sem handler).
//
// O href continua sendo `/doc/<id>` — isso é o que o bestiario-local-link
// guarda (abrir em nova aba/compartilhar) e não pode regredir.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider, useDetail, type DetailTarget } from '../src/data/detail-context'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { BestiarioTab } from '../src/components/compendium/BestiarioTab'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const CIDADE = 'Atlas/Porto Alegre/Porto Alegre'
const temDataset = fs.existsSync(path.join(cyberDir, `${CIDADE}.json`))
const ler = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(cyberDir, `${id}.json`), 'utf8')) as VaultDoc

let catalog: ReturnType<typeof buildCatalog>

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
    const file = path.join(cyberDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
  if (!temDataset) return
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  catalog = { ...buildCatalog(manifest), contextoDef: def }
  setActiveContexto(def)
})
afterEach(() => cleanup())

/** Espia o alvo que a aba empurrou pros DETALHES. */
let visto: DetailTarget | null = null
function Espia() {
  visto = useDetail()?.target ?? null
  return null
}

const montar = () =>
  render(
    <MemoryRouter initialEntries={[`/compendio/${CIDADE}`]}>
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <Espia />
          <BestiarioTab doc={ler(CIDADE)} />
        </DetailProvider>
      </CatalogProvider>
    </MemoryRouter>,
  )

describe.skipIf(!temDataset)('aba BESTIÁRIO do lugar — ficha resumo e zoom', () => {
  it('clicar no nome da criatura abre a FICHA RESUMO, não o doc cru', async () => {
    const { container } = montar()
    await waitFor(() => expect(container.querySelectorAll('[data-criatura]').length).toBeGreaterThan(0))
    const linha = container.querySelector('[data-criatura]')!
    const nome = linha.querySelector('a')!
    // o href segue absoluto e apontando pro doc (nova aba / compartilhar)
    expect(decodeURIComponent(nome.getAttribute('href') ?? '')).toMatch(/^\/doc\//)

    visto = null
    fireEvent.click(nome)
    await waitFor(() => expect(visto).not.toBeNull())
    expect(visto!.kind).toBe('resumo')
    expect(visto!.id).toBe(linha.getAttribute('data-criatura-id'))
  })

  it('o ENCONTRO continua abrindo o doc — só criatura tem ficha resumo', async () => {
    const { container } = montar()
    const alvo = await screen.findByText('Batida Grande')
    visto = null
    fireEvent.click(alvo)
    await waitFor(() => expect(visto).not.toBeNull())
    expect(visto!.kind).toBe('doc')
    expect(container).toBeTruthy()
  })

  it('clicar na figura da criatura amplia num lightbox', async () => {
    const { container } = montar()
    await waitFor(() => expect(container.querySelectorAll('[data-criatura]').length).toBeGreaterThan(0))
    // a primeira linha cuja figura é IMAGEM (as sem arte mostram emoji)
    const fig = [...container.querySelectorAll('[data-criatura-figura="img"]')][0]
    expect(fig, 'nenhuma criatura com figura na aba').toBeTruthy()
    expect(document.querySelector('[data-lightbox]')).toBeNull()
    fireEvent.click(fig!)
    await waitFor(() => expect(document.querySelector('[data-lightbox]')).not.toBeNull())
  })

  it('a figura sem arte (emoji) não vira botão de zoom', async () => {
    const { container } = montar()
    await waitFor(() => expect(container.querySelectorAll('[data-criatura]').length).toBeGreaterThan(0))
    for (const emoji of container.querySelectorAll('[data-criatura-figura="emoji"]')) {
      expect(emoji.getAttribute('role')).not.toBe('button')
    }
  })
})
