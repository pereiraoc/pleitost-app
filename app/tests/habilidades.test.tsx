// @vitest-environment jsdom
// Sub-aba HABILIDADES da ficha (HabilidadesTab §HabilidadesArvorePanel):
//   Item 2 — bucketização por rank em 2 colunas (esquerda=Adepta,
//     direita=Experiente+Mestre). O rank vem do inline `rank::` do body da nota
//     alvo, lido via refs.refDoc; enquanto as refs carregam NÃO se classifica
//     (senão Experientes/Mestres cairiam na coluna 'Adepta' — bug do Trovador).
//   Item 1 — habilidades que pedem `Escolha_Habilidades` renderizam um dropdown
//     indentado sob elas (mesmo SelectBox da subclasse).
// Dados REAIS da vault (Carlos = Trovador Experiente; Drauzio = Explorador Nato
// com escolha de Técnica). Espelho de src/render/groups/habilidades-card.ts.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const DRAUZIO_ID = 'Sistema/Criaturas/Heróis/Drauzio Variola'

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) as VaultDoc,
    }
  }) as typeof fetch
})

afterEach(cleanup)

function renderHabilidades(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** Rótulo do grupo de rank (Básica/Adepta/Experiente/Mestre) da COLUNA que
 *  contém `text` — sobe do texto até achar o cabeçalho itálico do grupo. */
function rankGroupOf(text: HTMLElement): string {
  const RANKS = ['Básica', 'Adepta', 'Experiente', 'Mestre']
  let node: HTMLElement | null = text
  for (let i = 0; i < 8 && node; i++) {
    const label = node.querySelector(':scope > div')?.textContent?.trim()
    if (label && RANKS.includes(label)) return label
    node = node.parentElement
  }
  return ''
}

describe('HABILIDADES — bucketização por rank (Item 2)', () => {
  it('Trovador (rank:: Experiente) cai na coluna Experiente, NÃO Adepta', async () => {
    renderHabilidades(CARLOS_ID)
    fireEvent.click(await screen.findByText('HABILIDADES'))
    await screen.findByText('Trovador')
    // Regressão do bug: com refs indefinidas o fallback classificava tudo como
    // 'Adepta' (coluna esquerda). O rank real do doc é Experiente. A classificação
    // depende do ref doc (async) — espera ela assentar (evita corrida sob carga).
    await waitFor(() => expect(rankGroupOf(screen.getByText('Trovador'))).toBe('Experiente'))
  })

  it('Conhecimento Arcano Adepto (rank Adepto→Adepta) fica na coluna Adepta', async () => {
    renderHabilidades(CARLOS_ID)
    fireEvent.click(await screen.findByText('HABILIDADES'))
    await screen.findByText('Conhecimento Arcano Adepto')
    await waitFor(() =>
      expect(rankGroupOf(screen.getByText('Conhecimento Arcano Adepto'))).toBe('Adepta'),
    )
  })
})

describe('HABILIDADES — magias ESSENCIAIS pra aprender (#286)', () => {
  it('Arcanista vê as magias Essenciais nas não-aprendidas, não só Negra/Branca', async () => {
    // Carlos: Arcana Branca/E, Negra/N — slots B2 A4 E1. As magias ESSENCIAIS
    // (pasta /Magia Arcana Essencial/, sem escola própria na ficha) não casavam
    // nenhuma escola proficiente e sumiam; agora entram na escola Arcana destino.
    renderHabilidades(CARLOS_ID)
    fireEvent.click(await screen.findByText('HABILIDADES'))
    // painel "Magias" (título exato) → o EditToggle irmão liga o modo Alterar.
    const magiasTitle = await screen.findByText('Magias')
    fireEvent.click(within(magiasTitle.parentElement as HTMLElement).getByText('✎ Alterar'))
    // "Alarme" é Essencial (Adepta) — só aparece pra aprender com o fix do #286
    // (os docs das magias carregam async ao entrar no Alterar).
    expect(await screen.findByText('Alarme', undefined, { timeout: 8000 })).toBeTruthy()
  })
})

describe('HABILIDADES — dropdown de Escolha_Habilidades (Item 1)', () => {
  it('Explorador Nato: pick read-only por padrão; dropdown só ao Alterar', async () => {
    renderHabilidades(DRAUZIO_ID)
    fireEvent.click(await screen.findByText('HABILIDADES'))
    // A habilidade-pai aparece na árvore...
    await screen.findByText('Explorador Nato')
    // ...e FORA do modo Alterar a escolha aparece SUTIL (o pick, não um dropdown).
    expect((await screen.findAllByText('Especialista em Caçada')).length).toBeGreaterThan(0)
    // Ao Alterar (toggle no cabeçalho da árvore de Habilidades) → vira dropdown.
    const habHeader = (await screen.findByText('Habilidades')).parentElement as HTMLElement
    fireEvent.click(within(habHeader).getByText('✎ Alterar'))
    const select = (await screen.findByLabelText('Técnica')) as HTMLSelectElement
    const opts = Array.from(select.options).map((o) => o.textContent)
    // Opções da rule (Selecionar([[Ambidestria]], [[Treinamento com Escudo]],
    // [[Especialista em Caçada]])).
    expect(opts).toContain('Ambidestria')
    expect(opts).toContain('Treinamento com Escudo')
    expect(opts).toContain('Especialista em Caçada')
    // Pick atual inferido do estado (Drauzio aprendeu Especialista em Caçada).
    expect(select.value).toBe('[[Especialista em Caçada]]')
  })
})
