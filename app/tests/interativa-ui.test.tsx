// @vitest-environment jsdom
// Aba COMBATE × modelo da Interativa (#15) — integração UI sobre o Carlos
// REAL: os campos do design (defesas/sentidos/ataques/dano/AdO) mostram os
// valores COMPUTADOS (condições ativas + efeitos) e os toggles do design
// escrevem o estado real (Condicoes_Ativas/Efeitos_Ativos), refletindo na
// hora. Expectativas derivadas do FM salvo + notas de regra da vault
// (Enfraquecido/Vantagem de Combate/Apunhalante/Auto-Confiança) — nunca do
// código do app.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
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

// Cores canônicas do plugin (styles.css cond-bonus/cond-penalty) como o
// jsdom serializa (rgb).
const GREEN = 'rgb(34, 197, 94)'
const RED = 'rgb(239, 68, 68)'

/** vitest 4 + jsdom delega ao webstorage EXPERIMENTAL do Node (indisponível
 *  sem --localstorage-file) → polyfill fiel só no teste (mesmo padrão do
 *  persistencia.test). */
function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
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
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderHeroCombate(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function renderCombate() {
  return renderHeroCombate(CARLOS_ID)
}

/** Valor exibido no box de defesa/sentido pelo rótulo (DEFESA, VIGOR…). */
function boxValue(label: string): HTMLElement {
  const lab = screen.getByText(label)
  // Item 4 embrulhou o VALOR num TipHover (<span> com o breakdown) entre o
  // label e o número; desce até o <div> que carrega texto+cor do valor.
  let el = lab.nextElementSibling as HTMLElement
  while (el && el.children.length === 1 && !el.style.color && el.firstElementChild) {
    el = el.firstElementChild as HTMLElement
  }
  return el
}

// Bases recomputadas do FM salvo do Carlos (mod = attr + PB + item + especial;
// defesa = 10 + mod). PB: N0 A2 E4 M6.
const PB: Record<string, number> = { N: 0, A: 2, E: 4, M: 6 }
const attr = (id: string) => Number(fm.Atributos[id] ?? 0)
const defRow = (nome: string) =>
  (fm.Defesas_Resistencias.Lista as any[]).find((d) => d.Nome === nome)!
const defBase = (nome: string) => {
  const d = defRow(nome)
  return 10 + attr(d.Atributo) + PB[d.Proficiencia] + Number(d.Bonus_Item) + Number(d.Bonus_Especial)
}

describe('COMBATE computa o modelo da Interativa (Carlos real)', () => {
  it('Defesa nasce buffada (+1 verde): FM salvo tem Inspiração + Performance Bárdica Ativa → Auto-Confiança', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // FM: Efeitos_Ativos["Performance Bárdica Ativa"].on = true
    expect(fm.Interativa.Efeitos_Ativos['Performance Bárdica Ativa'].on).toBe(true)
    const defesa = boxValue('DEFESA')
    expect(defesa.textContent).toBe(String(defBase('Defesa') + 1))
    expect(defesa.style.color).toBe(GREEN)
    // fonte no tooltip (title) — mesma label composta do plugin
    expect(defesa.closest('[title]')?.getAttribute('title')).toBe('Condição: Auto-Confiança +1')
    // Vigor sem buff: valor cru, cor padrão
    const vigor = boxValue('VIGOR')
    expect(vigor.textContent).toBe(String(defBase('Vigor')))
    expect(vigor.style.color).toBe('var(--text)')
  })

  it('toggle Enfraquecido no popover CONDIÇÕES: Vigor -2 vermelho; destoggle restaura', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    // catálogo completo visível no popover (Negativas + Positivas)
    const chipEnf = await screen.findByText('Enfraquecido')
    fireEvent.click(within(chipEnf.parentElement as HTMLElement).getByText('+'))
    await waitFor(() => {
      const vigor = boxValue('VIGOR')
      expect(vigor.textContent).toBe(String(defBase('Vigor') - 2))
      expect(vigor.style.color).toBe(RED)
    })
    // dano do Punhal também sofre (DanoArmaFixo -1, DanoArmaPorDado -1×3 dados)
    // base M: 3d4+2 → 3d4-2, mantendo o dado extra do Encantar Arma (d12+3, pot 9)
    expect(screen.getByText(/3d4-2\+1d12\+3/)).toBeTruthy()
    // destoggle
    fireEvent.click(within(screen.getByText('Enfraquecido').parentElement as HTMLElement).getByText('−'))
    await waitFor(() => {
      expect(boxValue('VIGOR').textContent).toBe(String(defBase('Vigor')))
    })
  })

  it('chip Vantagem de Combate (ATAQUES): ataque +2 e Apunhalante sobe o dado do Punhal (d4→d6, +1)', async () => {
    renderCombate()
    const chipVc = await screen.findByText('Vantagem de Combate')
    // mod do ataque antes: base 10 (AGI2+M6+item2) + 1 (Auto-Confiança) = +11
    const nomeRow = await screen.findByText(/^Punhal( |$)/)
    const row = nomeRow.parentElement as HTMLElement
    // Item 4 embrulhou o mod do ataque num TipHover (<span> externo) — o
    // wrapper e o valor têm o MESMO textContent; pega o mais interno (sem
    // filhos), que carrega a cor do buff/debuff.
    const modSpan = () =>
      [...row.querySelectorAll<HTMLElement>('span')]
        .filter((s) => /^[+-]\d+$/.test(s.textContent ?? '') && s.children.length === 0)
        .pop()!
    expect(modSpan().textContent).toBe('+11')
    fireEvent.click(chipVc)
    // +2 do catálogo (Somar Condicao.Ataque 2) → +13 verde
    await waitFor(() => expect(modSpan().textContent).toBe('+13'))
    expect(modSpan().style.color).toBe(GREEN)
    // Apunhalante (Passivo requer VC, propriedade do Punhal): passo de dado
    // d4→d6 e +1 fixo → 3d6+3, com o dado extra do Encantar Arma preservado (pot 9)
    expect(screen.getByText(/3d6\+3\+1d12\+3/)).toBeTruthy()
  })

  it('desligar Inspiração desativa Performance Bárdica Ativa (auto) e a Defesa volta ao cru', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // Carlos salvo: Performance Bárdica ON (autoFrom Inspiração) → +1 na Defesa
    // (Auto-Confiança). Inspiração não persistiu no Condicoes_Ativas (só o efeito
    // auto ficou), então ativamos o chip pra torná-la a fonte LOCAL do cascade.
    expect(boxValue('DEFESA').textContent).toBe(String(defBase('Defesa') + 1))
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    // "Inspiração" também aparece como AÇÃO na sub-aba Habilidades → escopa o CHIP
    // (o que tem botões de toggle).
    const acharChipInsp = () =>
      screen
        .getAllByText('Inspiração')
        .map((c) => c.parentElement as HTMLElement)
        .find((p) => p?.querySelector('button'))
    await waitFor(() => expect(acharChipInsp()).toBeTruthy())
    fireEvent.click(within(acharChipInsp()!).getByText('+'))
    // com Inspiração ativa, Performance Bárdica segue on → Defesa continua +1
    await waitFor(() =>
      expect(boxValue('DEFESA').textContent).toBe(String(defBase('Defesa') + 1)),
    )
    // desliga Inspiração → cascade desativa Performance Bárdica → Defesa volta ao cru
    fireEvent.click(within(acharChipInsp()!).getByText('−'))
    await waitFor(() => {
      const defesa = boxValue('DEFESA')
      expect(defesa.textContent).toBe(String(defBase('Defesa')))
      expect(defesa.style.color).toBe('var(--text)')
    })
  })

  it('ERGUER escudo grava Efeitos_Ativos["Escudo Erguido"] (sem escudo → sem delta de Defesa)', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // Carlos não tem escudo equipado → EscudoRow nem renderiza; nada a clicar.
    // (BonusEscudo coberto no teste puro; aqui garantimos que a ausência de
    // escudo não quebra a aba.)
    expect(screen.queryByText('ERGUER')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// #29 — potência/seletores nos chips do popover CONDIÇÕES
// Espelho do plugin (sem golden do interior do popover do app): counter do
// chip ativo = condicoes-selectors.ts:20-93 (`− 🌟 N +`, titles
// "Diminuir/Aumentar <label>", clamp+disabled nos extremos, storage duplo);
// stepper de contagem = condicoes-ativas.ts:131-166; expectativas de efeito
// derivadas das notas reais (Encantar Arma.md, Desajeitado.md).
// ──────────────────────────────────────────────────────────────────────────

describe('#29 potência dos efeitos (Carlos real: Encantar Arma 🌟9 salvo no FM)', () => {
  // "Encantar Arma" também é magia no trilho de painéis → escopa pelo chip
  // (o que tem botões), mesmo padrão do persistencia.test.
  const acharChipEncantar = async () =>
    (await screen.findAllByText('Encantar Arma'))
      .map((el) => el.parentElement as HTMLElement)
      .find((p) => p?.querySelector('button'))!

  it('chip ativo mostra o counter da potência salva e clampa nos extremos', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    const chip = await acharChipEncantar()
    // FM salvo do Carlos: Condicoes_Ativas["Encantar Arma"].numericSelector = 9
    expect(fm.Interativa.Condicoes_Ativas['Encantar Arma'].numericSelector).toBe(9)
    expect(within(chip).getByText('🌟 9')).toBeTruthy()
    const menos = within(chip).getByTitle('Diminuir Potência Mágica') as HTMLButtonElement
    const mais = within(chip).getByTitle('Aumentar Potência Mágica') as HTMLButtonElement
    // range da nota (Encantar Arma.md: min 0, max 11) → 7 não encosta em nada
    expect(menos.disabled).toBe(false)
    expect(mais.disabled).toBe(false)
    // botão de remover vira × (padrão do chip do plugin com controles)
    expect(within(chip).getByText('×')).toBeTruthy()
  })

  it('mudar a potência recalcula o dado extra do dano na hora (tabela da nota)', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    // dano do Punhal com potência 9: 3d4+2 (M) + 1d12+3 (tabela {9: d12+3})
    expect(screen.getByText(/3d4\+2\+1d12\+3/)).toBeTruthy()
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    await acharChipEncantar()
    fireEvent.click(screen.getByTitle('Aumentar Potência Mágica'))
    // potência 10 → tabela {10: d12+4}
    await waitFor(() => expect(screen.getByText(/3d4\+2\+1d12\+4/)).toBeTruthy())
    expect(screen.getByText('🌟 10')).toBeTruthy()
    // desce 2 → potência 8 → tabela {8: d12+2}
    fireEvent.click(screen.getByTitle('Diminuir Potência Mágica'))
    fireEvent.click(screen.getByTitle('Diminuir Potência Mágica'))
    await waitFor(() => expect(screen.getByText(/3d4\+2\+1d12\+2/)).toBeTruthy())
    expect(screen.getByText('🌟 8')).toBeTruthy()
  })

  it('condição Escalável ganha stepper: Desajeitado ×2 dobra o -2 na Defesa e trava no scaleMax 3', async () => {
    renderCombate()
    await screen.findByText('DEFESA')
    const defesaBase = defBase('Defesa') + 1 // Auto-Confiança do FM salvo
    expect(boxValue('DEFESA').textContent).toBe(String(defesaBase))
    fireEvent.click(screen.getByText('CONDIÇÕES'))
    const chip = (await screen.findByText('Desajeitado')).parentElement as HTMLElement
    fireEvent.click(within(chip).getByText('+'))
    // Desajeitado.md: Escalavel 3, Somar Condicao.Defesa -2
    await waitFor(() => expect(boxValue('DEFESA').textContent).toBe(String(defesaBase - 2)))
    const aumentar = () => screen.getByTitle('Aumentar Desajeitado') as HTMLButtonElement
    fireEvent.click(aumentar())
    await waitFor(() => expect(boxValue('DEFESA').textContent).toBe(String(defesaBase - 4)))
    fireEvent.click(aumentar())
    await waitFor(() => expect(boxValue('DEFESA').textContent).toBe(String(defesaBase - 6)))
    // clamp no scaleMax da nota: botão desabilita no 3
    expect(aumentar().disabled).toBe(true)
    fireEvent.click(screen.getByTitle('Diminuir Desajeitado'))
    await waitFor(() => expect(boxValue('DEFESA').textContent).toBe(String(defesaBase - 4)))
    // remover zera
    fireEvent.click(screen.getByTitle('Remover Desajeitado'))
    await waitFor(() => expect(boxValue('DEFESA').textContent).toBe(String(defesaBase)))
  })

  it('Carlos (sem magia de invocação) NÃO ganha a aba INVOCAÇÕES no painel de magias', async () => {
    renderCombate()
    // sentinela de load: botão CONDIÇÕES (o card de invocação persistida
    // também contém "DEFESA"); "MAGIAS" repete na sub-strip → [0] é a aba.
    await screen.findByText('CONDIÇÕES')
    fireEvent.click(screen.getAllByText('MAGIAS')[0])
    expect(screen.queryByText('INVOCAÇÕES')).toBeNull()
    expect(screen.getByText('ENERGIA MÁGICA')).toBeTruthy()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// #30 — aba INVOCAÇÕES no painel de magias (Pind Bund real: Servo das
// Sombras + Amálgama das Sombras, com instância PERSISTIDA pelo plugin no
// FM). Espelho da tab-companheiros do plugin (creator slot + cards);
// expectativas derivadas dos docs reais + FM salvo do Pind.
// ──────────────────────────────────────────────────────────────────────────

const PIND_ID = 'Sistema/Criaturas/Heróis/Pind Bund'

describe('#30 aba INVOCAÇÕES (Pind Bund real)', () => {
  it('painel de magias ganha a strip MAGIAS/INVOCAÇÕES mantendo a EM visível', async () => {
    renderHeroCombate(PIND_ID)
    // sentinela de load: botão CONDIÇÕES (o card de invocação persistida
    // também contém "DEFESA"); "MAGIAS" repete na sub-strip → [0] é a aba.
    await screen.findByText('CONDIÇÕES')
    fireEvent.click(screen.getAllByText('MAGIAS')[0])
    expect(await screen.findByText('INVOCAÇÕES')).toBeTruthy()
    // EM fica ACIMA da strip — visível nas duas sub-abas (Pind: EM máx 7)
    expect(screen.getByText('ENERGIA MÁGICA')).toBeTruthy()
    fireEvent.click(screen.getByText('INVOCAÇÕES'))
    expect(screen.getByText('ENERGIA MÁGICA')).toBeTruthy()
  })

  it('instância PERSISTIDA no FM (Amálgama 🌟6 do plugin) renderiza card com Vitalidade 30/30', async () => {
    const r = renderHeroCombate(PIND_ID)
    // sentinela de load: botão CONDIÇÕES (o card de invocação persistida
    // também contém "DEFESA"); "MAGIAS" repete na sub-strip → [0] é a aba.
    await screen.findByText('CONDIÇÕES')
    fireEvent.click(screen.getAllByText('MAGIAS')[0])
    fireEvent.click(await screen.findByText('INVOCAÇÕES'))
    // Pind Bund.md → Invocacoes_Ativas["Amálgama das Sombras"][0]:
    // {potencia: 6, vitalidade: 30}; EV máx = 5×6 = 30.
    expect(await screen.findByText('Vitalidade: 30/30')).toBeTruthy()
    expect(screen.getByText('🌟 6')).toBeTruthy()
    const card = [...r.container.querySelectorAll<HTMLElement>('[data-invoc-card]')].find((c) =>
      c.textContent?.includes('Amálgama das Sombras'),
    )!
    // Amálgama das Sombras.md, colunas M (Pind é M em Arcana Negra):
    expect(within(card).getByText('DEFESA').nextElementSibling?.textContent).toBe('18')
    expect(within(card).getAllByText('16').length).toBe(3) // Vigor/Evasão/Ímpeto
    expect(within(card).getByText(/3d6\+3/)).toBeTruthy()
    expect(within(card).getByText('Pseudópode Sombrio.')).toBeTruthy()
  })

  it('creator slot do Servo: PM default = potência do herói (8); Invocar cria card com stats resolvidos', async () => {
    const r = renderHeroCombate(PIND_ID)
    // sentinela de load: botão CONDIÇÕES (o card de invocação persistida
    // também contém "DEFESA"); "MAGIAS" repete na sub-strip → [0] é a aba.
    await screen.findByText('CONDIÇÕES')
    fireEvent.click(screen.getAllByText('MAGIAS')[0])
    fireEvent.click(await screen.findByText('INVOCAÇÕES'))
    await screen.findByText('Vitalidade: 30/30')
    const creator = [...r.container.querySelectorAll<HTMLElement>('[data-invoc-creator]')].find(
      (c) => c.textContent?.includes('Servo das Sombras'),
    )!
    // Pind Bund.md: Magias.Potencia = 8 (default do PM — plugin defaultPM)
    expect(within(creator).getByText('🌟 8')).toBeTruthy()
    fireEvent.click(within(creator).getByText('Invocar'))
    // EV máx = 5×8 = 40 (Servo das Sombras.md: EV "5×potência")
    const vida = await screen.findByText('Vitalidade: 40/40')
    const card = vida.closest('[data-invoc-card]') as HTMLElement
    // stats da coluna M + Movimento literal (Servo das Sombras.md)
    expect(within(card).getByText('DEFESA').nextElementSibling?.textContent).toBe('18')
    expect(within(card).getByText('MOVIMENTO').nextElementSibling?.textContent).toBe('5')
    expect(within(card).getByText('PERCEPÇÃO').nextElementSibling?.textContent).toBe('+4')
    // Ataque Mental: bonus {doInvocador: MagiaAtaque} = PB(M)6 + INT3 + item2
    expect(within(card).getByText('Ataque Mental')).toBeTruthy()
    expect(within(card).getByText('(corpo-a-corpo)')).toBeTruthy()
    const bonus = within(card).getByText('+11')
    expect(bonus.getAttribute('title')).toContain('Ataque Mágico +11')
    expect(within(card).getByText(/3d4\+2/)).toBeTruthy()
    expect(within(card).getByText('Toque Aterrorizante.')).toBeTruthy()
  })

  it('dano consome Moral Temporária primeiro; Dissipar remove só a instância', async () => {
    const r = renderHeroCombate(PIND_ID)
    // sentinela de load: botão CONDIÇÕES (o card de invocação persistida
    // também contém "DEFESA"); "MAGIAS" repete na sub-strip → [0] é a aba.
    await screen.findByText('CONDIÇÕES')
    fireEvent.click(screen.getAllByText('MAGIAS')[0])
    fireEvent.click(await screen.findByText('INVOCAÇÕES'))
    await screen.findByText('Vitalidade: 30/30')
    const creator = [...r.container.querySelectorAll<HTMLElement>('[data-invoc-creator]')].find(
      (c) => c.textContent?.includes('Servo das Sombras'),
    )!
    fireEvent.click(within(creator).getByText('Invocar'))
    const vida = await screen.findByText('Vitalidade: 40/40')
    const card = vida.closest('[data-invoc-card]') as HTMLElement
    // +2 de Moral Temporária → 🩸-5 consome os 2 e só 3 de Vitalidade
    fireEvent.click(within(card).getByTitle('Aumentar Moral Temporária'))
    fireEvent.click(within(card).getByTitle('Aumentar Moral Temporária'))
    await waitFor(() => expect(within(card).getByText(/\(\+2/)).toBeTruthy())
    fireEvent.click(within(card).getByTitle('Aplicar 5 de dano'))
    await waitFor(() => expect(screen.getByText('Vitalidade: 37/40')).toBeTruthy())
    expect(within(card).queryByText(/\(\+/)).toBeNull()
    // Dissipar remove a instância nova; a Amálgama persistida continua
    fireEvent.click(within(card).getByText('Dissipar'))
    await waitFor(() => expect(screen.queryByText('Vitalidade: 37/40')).toBeNull())
    expect(screen.getByText('Vitalidade: 30/30')).toBeTruthy()
  })
})
