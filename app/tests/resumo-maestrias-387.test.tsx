// @vitest-environment jsdom
// #387: ficha RESUMO não mostrava Especializações nem Maestrias. Os picks
// vivem SALVOS no FM (Pericias.Lista[].Especializacao/Maestria — escolhas do
// usuário persistidas, fonte de regra e não saída de cascata), e o resumo não
// tinha NENHUMA seção pra eles — o modo Leitura do plugin lista num bloco
// próprio (leitura/sections/especializacoes-block.ts: "Perícia: Especialização
// X · Maestria Y"); o resumo do app é a superfície read-only equivalente e
// precisa do mesmo bloco. Expectativas recomputadas AQUI a partir do JSON do
// Carlos (frozen fixture — mesma fonte que o render lê), nunca inventadas.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveVaultFile } from './fixtures/frozen-heroes'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { ResumoDetail } from '../src/components/detail/ResumoDetail'
import { linkLabel } from '../src/markdown/dataview-value'
import { displayName, slugify } from '../src/components/ficha/registry'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(
  fs.readFileSync(resolveVaultFile(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = resolveVaultFile(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
afterEach(() => {
  cleanup()
  window.localStorage?.clear()
})

async function renderResumo() {
  const utils = render(
    <CatalogProvider catalog={catalog}>
      <ResumoDetail id={CARLOS_ID} />
    </CatalogProvider>,
  )
  // corpo carregado (o chip de movimento só existe com o doc na tela)
  await screen.findByText('6q')
  return utils
}

// Expectativas independentes, direto do FM do Carlos: perícias com pick salvo.
type Row = { Nome?: string; Especializacao?: string; Maestria?: string }
const rows = ((carlos.frontmatter as Record<string, any>).Pericias?.Lista ?? []) as Row[]
const comPick = rows.filter((r) => r.Especializacao || r.Maestria)
const espEsperadas = comPick.filter((r) => r.Especializacao).map((r) => linkLabel(String(r.Especializacao)))
const maeEsperadas = comPick.filter((r) => r.Maestria).map((r) => linkLabel(String(r.Maestria)))

describe('#387 resumo — especializações e maestrias', () => {
  it('o fixture do Carlos TEM picks (senão o teste não prova nada)', () => {
    // Carlos real: Estabilidade (Acrobacia E), Negociação (Diplomacia E),
    // Distração + Fascinante (Enganação M). Se o fixture drifar pra zero picks,
    // falha aqui em vez de passar vazio.
    expect(espEsperadas.length).toBeGreaterThanOrEqual(3)
    expect(maeEsperadas.length).toBeGreaterThanOrEqual(1)
    expect(espEsperadas).toContain('Distração')
    expect(maeEsperadas).toContain('Fascinante')
  })

  it('TODA especialização e maestria salva no FM aparece no resumo', async () => {
    await renderResumo()
    for (const esp of espEsperadas) {
      expect(screen.getAllByText(esp).length, `especialização ${esp} visível`).toBeGreaterThan(0)
    }
    for (const mae of maeEsperadas) {
      expect(screen.getAllByText(mae).length, `maestria ${mae} visível`).toBeGreaterThan(0)
    }
  })

  it('cada pick fica associado à sua perícia, com os rótulos do bloco do plugin', async () => {
    const { container } = await renderResumo()
    const sec = container.querySelector('[data-resumo-section="// ESPECIALIZAÇÕES & MAESTRIAS"]')
    expect(sec, 'seção // ESPECIALIZAÇÕES & MAESTRIAS presente').toBeTruthy()
    const txt = sec!.textContent ?? ''
    for (const r of comPick) {
      const pericia = displayName(slugify(String(r.Nome)))
      expect(txt, `linha da perícia ${pericia}`).toContain(`${pericia}:`)
      // formato do especializacoes-block do modo Leitura do plugin:
      // "Perícia: Especialização X · Maestria Y" (rótulos verbatim de lá)
      if (r.Especializacao) {
        expect(txt).toContain(`Especialização ${linkLabel(String(r.Especializacao))}`)
      }
      if (r.Maestria) {
        expect(txt).toContain(`Maestria ${linkLabel(String(r.Maestria))}`)
      }
    }
    // esp E maestria da MESMA perícia (Enganação) ficam na MESMA linha
    const enganacao = comPick.find((r) => r.Especializacao && r.Maestria)
    if (enganacao) {
      const linha = [...sec!.querySelectorAll<HTMLElement>('[data-resumo-espmae-row]')].find((el) =>
        (el.textContent ?? '').includes(displayName(slugify(String(enganacao.Nome)))),
      )
      expect(linha, 'linha da perícia com esp+maestria').toBeTruthy()
      expect(linha!.textContent).toContain(linkLabel(String(enganacao.Especializacao)))
      expect(linha!.textContent).toContain(linkLabel(String(enganacao.Maestria)))
    }
  })
})
