// @vitest-environment jsdom
// FICHA DO HERÓI (/heroi/<id>?tab=): telas do design renderizando o modelo
// salvo REAL da vault (Carlos Facão de Andradas); fetch stubado lê os JSONs
// do disco. Expectativas recomputadas AQUI a partir do JSON (independentes
// do código da ficha).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { heroPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>

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

function renderFicha(tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

// Expectativas independentes, direto do JSON do Carlos.
const wikiLabel = (v: string) => /\[\[[^\]|]+\|([^\]]+)\]\]/.exec(v)?.[1] ?? v.replace(/^\[\[|\]\]$/g, '')
const classeReal = wikiLabel(String(fm.Classe)) // "Trovador Inspirador de Luta Artística"
const nivelReal = Number(fm['Nível'])

describe('heroPath', () => {
  it('monta a rota da ficha com aba opcional', () => {
    expect(heroPath('a/b c')).toBe('/heroi/a/b%20c')
    expect(heroPath('a/b', 'combate')).toBe('/heroi/a/b?tab=combate')
  })
})

describe('FichaPage (Carlos, modelo salvo real)', () => {
  it('PERFIL: nome, Classe e Nível reais do frontmatter — sem header inventado', async () => {
    const { container } = renderFicha()
    // campo NOME do PERFIL, agora input editável (#7): valor real = basename
    // (FM não tem `nome`)
    expect(
      (await screen.findAllByDisplayValue('Carlos Facão de Andradas')).length,
    ).toBeGreaterThan(0)
    expect((await screen.findAllByText(classeReal)).length).toBeGreaterThan(0)
    // selo NVL do retrato (PERFIL)
    expect(screen.getByText(`NVL ${nivelReal}`)).toBeTruthy()
    // o design NÃO tem card de herói em cima das telas da ficha
    expect(container.querySelector('.hero-card')).toBeNull()
    // slot APELIDO do design existe (dado ausente na fonte → vazio)
    expect(screen.getByText('APELIDO')).toBeTruthy()
    // classe de aventureiro recomputada aqui: nível 7-9 → A
    const classeAvent = nivelReal <= 3 ? 'C' : nivelReal <= 6 ? 'B' : nivelReal <= 9 ? 'A' : 'S'
    expect(screen.getByText(`AVENTUREIRO CLASSE ${classeAvent}`)).toBeTruthy()
    // biografia real na aba IDENTIDADE — Motivação é input editável (#38)
    expect(screen.getByDisplayValue(String(fm.Biografia.Motivacao))).toBeTruthy()
  })

  it('COMBATE: vida corrente da Interativa sobre o máximo do modelo', async () => {
    renderFicha('combate')
    const vitCur = Number(fm.Interativa.Recursos_Restantes.Vitalidade)
    const vitMax = Number(fm.Vida.Vitalidade)
    expect(await screen.findByText(`${vitCur} / ${vitMax}`)).toBeTruthy()
    expect(screen.getByText('VITALIDADE')).toBeTruthy()
    // arma real equipada na sub-aba ATAQUES
    expect(await screen.findByText(/Punhal Relampejante/)).toBeTruthy()
    // chip de AdO (design): dano base da arma + modelo da Interativa (#15) —
    // Mestre soma 1 dado (d4+2 → 1d4+2) e o FM salvo do Carlos tem Encantar
    // Arma ATIVO no Punhal (Potência Mágica 7 → OportunidadeFixo +4): 1d4+6.
    // AdO agora abre tooltip por hover/tap (TipHover), sem title nativo:
    // localiza o chip pelo próprio texto.
    const adoChip = await screen.findByText(/AdO 1d4\+6/)
    expect(adoChip.textContent).toContain('AdO 1d4+6')
    // dano exibido = calcDanoArma (prof M = +2 dados: 3d4+2) + dado extra do
    // Encantar Arma (tabela potência 7 → d12+1): 3d4+2+1d12+1.
    expect(screen.getByText(/3d4\+2\+1d12\+1/)).toBeTruthy()
    // AÇÕES por perícia (catálogo real: Cambalhota → Acrobacia)
    expect((await screen.findAllByText('AÇÕES')).length).toBeGreaterThan(0)
    expect(screen.getByText('Cambalhota')).toBeTruthy()
  })

  it('INVENTÁRIO: arma, imbuição e ouro reais', async () => {
    renderFicha('inventario')
    expect(await screen.findByText('Punhal')).toBeTruthy()
    expect(await screen.findByText('Relampejante')).toBeTruthy()
    // moedas = Inventario.Ouro (dentro do botão desenhado de moedas)
    const coinsBtn = screen.getByTitle('Moedas')
    expect(coinsBtn.textContent).toContain(String(fm.Inventario.Ouro))
    // consumível real agrupado
    fireEvent.click(screen.getByRole('button', { name: 'CONSUMÍVEIS' }))
    expect(screen.getByText('Poção de Cura')).toBeTruthy()
    // CATÁLOGO completo: consumível fora do FM aparece com contadores zerados
    expect(screen.getByText('Poção da Velocidade')).toBeTruthy()
    const linhaVelocidade = screen.getByText('Poção da Velocidade').closest('div') as HTMLElement
    expect(linhaVelocidade.textContent).toContain('0A')
    expect(linhaVelocidade.textContent).toContain('0E')
    expect(linhaVelocidade.textContent).toContain('0M')
  })

  it('COMPETÊNCIAS: atributos no PERFIL, técnica aprendida e recursos mágicos reais', async () => {
    renderFicha('habilidades')
    expect(await screen.findByText('⚖️ ATRIBUTOS')).toBeTruthy()
    // atributo principal real
    expect(screen.getAllByText(String(fm.Atributos.Principal)).length).toBeGreaterThan(0)
    // fim do profData recuperado: coluna VALOR nos stacks com modKind
    // (Defesas/Sentidos/Movimentos; Combate fica vazio) e larguras verbatim
    expect(screen.getAllByText('VALOR').length).toBe(3)
    const defHead = screen.getAllByText('Defesas')[0].parentElement as HTMLElement
    expect(defHead.style.gridTemplateColumns).toBe('1.25fr 0.6fr 0.7fr')
    // enrichStk: Sentidos são std10 (10 + attr + PB + item + especial)
    const percep = (fm.Sentidos.Lista as any[]).find((r) => r.Nome === 'Percepcao' || r.Nome === 'Percepção')
    if (percep) {
      const pb: Record<string, number> = { N: 0, A: 2, E: 4, M: 6 }
      const esperado = String(
        10 +
          fm.Atributos[percep.Atributo] +
          (pb[percep.Proficiencia] ?? 0) +
          (Number(percep.Bonus_Item) || 0) +
          (Number(percep.Bonus_Especial) || 0),
      )
      expect(screen.getAllByText(esperado).length).toBeGreaterThan(0)
    }
    fireEvent.click(screen.getByText('HABILIDADES'))
    // técnica real aprendida (Tecnicas.Lista)
    expect(await screen.findByText('Entrada Dramática')).toBeTruthy()
    fireEvent.click(screen.getByText('MAGIAS'))
    expect(screen.getByText('Potência Mágica')).toBeTruthy()
    expect(screen.getByText(String(fm.Magias.Potencia))).toBeTruthy()
    // magia real aprendida
    expect(screen.getByText('Avivar')).toBeTruthy()
  })

  it('ANOTAÇÕES: blocos verbatim do design', async () => {
    renderFicha('anotacoes')
    expect(await screen.findByText('// TESOUROS ESPECIAIS')).toBeTruthy()
    expect(screen.getByText('// ANOTAÇÕES DE CAMPANHA')).toBeTruthy()
    expect(
      screen.getByPlaceholderText('// Registre suas anotações de campanha aqui...'),
    ).toBeTruthy()
  })

  it('GRUPO: renderiza a ficha de grupo dos grupos do FM `grupo`', async () => {
    renderFicha('grupos')
    // Carlos pertence a 2 grupos reais; ambos resolvem e renderizam
    expect((await screen.findAllByText(/Carlos, Dante, Mera, Pind, Thoren/)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Baitaca, Carlos, Drauzio/)).length).toBeGreaterThan(0)
  })
})

describe('navegação da ficha', () => {
  it('card de herói navega pra /heroi/<id> e sidebar troca a ?tab=', async () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/herois']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/herois" element={<HeroisPage />} />
              <Route path="/heroi/*" element={<FichaPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // clica no card do Carlos (tela HERÓIS)
    const card = await screen.findByRole('button', { name: /Carlos Facão de Andradas/ })
    fireEvent.click(card)
    // ficha aberta: PERFIL (sem card/header inventado sobre a tela)
    await waitFor(() => expect(screen.getAllByText(classeReal).length).toBeGreaterThan(0))
    expect(container.querySelector('.hero-card')).toBeNull()
    // CHAR_TABS da sidebar ficam ativas: COMBATE troca a aba da ficha
    fireEvent.click(screen.getByRole('button', { name: 'COMBATE' }))
    expect(await screen.findByText('VITALIDADE')).toBeTruthy()
    // topbar título = TITLES da aba ativa
    expect(screen.getAllByText('COMBATE').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'BIOGRAFIA' }))
    await waitFor(() =>
      expect(screen.getByDisplayValue(String(fm.Biografia.Motivacao))).toBeTruthy(),
    )
  })

  it('topbar contextual do design: chips, vida/moedas por aba e apelido', async () => {
    // jsdom default: innerWidth 1024 → showChips (>=620) e showApelido (>=720)
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(CARLOS_ID)]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // chip NVL na aba PERFIL (chipsFor do design)
    expect(await screen.findByText(`NVL ${nivelReal}`, { selector: 'header span span' })).toBeTruthy()
    // slot do apelido existe mesmo sem dado no FM (Biografia.Apelido ausente)
    const apelido = screen.getByTestId('topbar-apelido')
    expect(apelido.textContent).toBe(String(fm.Biografia.Apelido ?? ''))
    // aba COMBATE: chip de vida (vit+moral+temp)/(vitMax+moralMax) com painel
    fireEvent.click(screen.getByRole('button', { name: 'COMBATE' }))
    const r = fm.Interativa.Recursos_Restantes
    const soma = Number(r.Vitalidade) + Number(r.Moral) + Number(r.Moral_Temporaria || 0)
    const teto = Number(fm.Vida.Vitalidade) + Number(fm.Vida.Moral)
    const vidaBtn = await screen.findByTitle('Vida')
    expect(vidaBtn.textContent).toContain(`${soma}/${teto}`)
    fireEvent.click(vidaBtn)
    expect(screen.getAllByText('MORAL TEMPORÁRIA').length).toBeGreaterThan(0)
    // aba INVENTÁRIO: chip de moedas na topbar (além do botão da própria aba)
    fireEvent.click(screen.getByRole('button', { name: 'INVENTÁRIO' }))
    await waitFor(() =>
      expect(
        screen.getAllByTitle('Moedas').some((el) => el.textContent?.includes(String(fm.Inventario.Ouro))),
      ).toBe(true),
    )
    expect(screen.getAllByTitle('Moedas').length).toBe(2)
  })
})
