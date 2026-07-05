// @vitest-environment jsdom
// INVENTÁRIO editável + GRUPO ATIVO (issues #6/#8/#12/#13/#14): integração
// sobre o modelo salvo REAL da vault (Carlos Facão de Andradas), no padrão do
// repo — fetch stubado lê os JSONs do disco e as expectativas são recomputadas
// AQUI a partir dos JSONs (independentes do código da ficha). Os comportamentos
// esperados espelham os setters do Editável do plugin pleitost-autosheet
// (extract/apply-armas-edit.ts, apply-equipamentos-edit.ts,
// apply-tesouros-edit.ts), citados em cada teste.
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
const STORE_KEY = `pleitost.heroEdits.${CARLOS_ID}`
const readJson = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${rel}.json`), 'utf8')) as VaultDoc
const carlos = readJson(CARLOS_ID)
const fm = carlos.frontmatter as Record<string, any>

// ===== expectativas independentes, direto dos JSONs =====
const wikiTargetOf = (v: string) => /\[\[([^\]|]+)/.exec(v)?.[1]?.trim() ?? v
const armaFm = fm.Inventario.Armas.Lista[0] // Punhal (Experiente, Relampejante)
const armaBase = wikiTargetOf(String(armaFm.Nome))
const tesourosFm = fm.Inventario.Tesouros as string[]
const parseAlias = (raw: string) => {
  const label = /\|([^\]]+)\]\]$/.exec(raw)?.[1] ?? raw.replace(/^\[\[|\]\]$/g, '')
  const nome = label.replace(/\s*\((Adepto|Adepta|Experiente|Mestre)\)\s*$/, '').trim()
  return nome
}
const armaEntries = manifest.docs.filter(
  (d) => d.id.startsWith('Sistema/Equipamento/Armas/') && d.subtype === 'Arma',
)
const tesouroEntries = manifest.docs.filter(
  (d) =>
    d.id.startsWith('Sistema/Equipamento/Tesouros/') &&
    d.subtype === 'Tesouro' &&
    !d.id.startsWith('Sistema/Equipamento/Tesouros/Consumíveis/') &&
    !d.id.startsWith('Sistema/Equipamento/Tesouros/Imbuições e Qualidade/'),
)

/** vitest 4 + jsdom sem webstorage do Node — polyfill fiel só no teste. */
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

function overlaySalvo(): Record<string, any> {
  const raw = window.localStorage.getItem(STORE_KEY)
  expect(raw).toBeTruthy()
  return JSON.parse(raw!)
}

/** "Reload da página": desmonta e zera SÓ a memória do store. */
function simulaReload(r: ReturnType<typeof render>) {
  r.unmount()
  __resetHeroStoreMemoryForTests()
}

/** Botão A/E/M dos TierBtns pelo tamanho (armas 26px · gear 24px · tesouros 22px). */
function tierBtn(scope: HTMLElement, letter: string, size: number): HTMLElement {
  const hit = [...scope.querySelectorAll<HTMLElement>('span')].find(
    (s) => s.textContent === letter && s.style.width === `${size}px`,
  )
  expect(hit, `botão ${letter} (${size}px)`).toBeTruthy()
  return hit!
}

/** Item do popup do AddFab pelo nome EXATO (evita "Besta" casar "Besta Pesada"). */
async function fabItem(nome: string): Promise<HTMLElement> {
  const alvo = await waitFor(() => {
    const span = [...document.querySelectorAll<HTMLElement>('button span')].find(
      (s) => s.textContent === nome,
    )
    expect(span, `item "${nome}" do popup`).toBeTruthy()
    return span!.closest('button')!
  })
  return alvo
}

describe('#6: track deslizante compartilhado (clip sem vazamento)', () => {
  it('inventário usa o PanelTrack: clip overflow hidden + painéis border-box', async () => {
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    const tracks = container.querySelectorAll<HTMLElement>('[data-track]')
    expect(tracks.length).toBe(1)
    for (const track of tracks) {
      // clip do design (Companion App.dc.html:424)
      expect(track.parentElement!.style.overflow).toBe('hidden')
      const panels = track.querySelectorAll<HTMLElement>(':scope > [data-panel]')
      expect(panels.length).toBe(3)
      for (const p of panels) {
        // critério único anti-vazamento: *{box-sizing:border-box} do design
        // (dc.html:15) aplicado no painel — flex-basis 100% + padding lateral
        // não pode passar da largura do track
        expect(p.style.boxSizing).toBe('border-box')
        expect(p.style.flex).toContain('0 0 100%')
      }
    }
  })

  it('aba GRUPO também renderiza o track compartilhado', async () => {
    const { container } = renderFicha('grupos')
    await screen.findAllByText(/integrantes/)
    const track = container.querySelector<HTMLElement>('[data-track]')!
    expect(track).toBeTruthy()
    expect(track.parentElement!.style.overflow).toBe('hidden')
    for (const p of track.querySelectorAll<HTMLElement>(':scope > [data-panel]')) {
      expect(p.style.boxSizing).toBe('border-box')
    }
  })
})

describe('#8: aba GRUPO mostra só o Grupo Ativo, com seletor persistido', () => {
  // grupos reais do FM `grupo` do Carlos (2 grupos)
  const groupIds = (fm.grupo ?? carlos.grupo) as unknown
  const ids = (Array.isArray(carlos.grupo) ? carlos.grupo : [carlos.grupo])
    .map((v) => wikiTargetOf(String(v)))
    .map((t) => manifest.docs.find((d) => d.basename === t)?.id ?? t)
  void groupIds

  it('herói em 2 grupos → UMA ficha de grupo por vez; troca + reload persistem', async () => {
    expect(ids.length).toBe(2)
    const r = renderFicha('grupos')
    const select = (await screen.findByLabelText('Grupo Ativo')) as HTMLSelectElement
    // por padrão o primeiro grupo do FM é o ativo
    expect(select.value).toBe(ids[0])
    await screen.findAllByText(/integrantes/)
    // apenas UMA ficha de grupo montada
    expect(screen.getAllByText(/integrantes/).length).toBe(1)
    // (fora do <select> — o nome também é texto de <option>)
    const visiveis = (nome: string) =>
      screen.queryAllByText(nome).filter((el) => el.tagName !== 'OPTION')
    const nome0 = manifest.docs.find((d) => d.id === ids[0])!.basename!
    expect(visiveis(nome0).length).toBe(1)

    // trocar pelo seletor → mostra o outro grupo e grava session no overlay
    fireEvent.change(select, { target: { value: ids[1] } })
    const nome1 = manifest.docs.find((d) => d.id === ids[1])!.basename!
    await waitFor(() => expect(visiveis(nome1).length).toBe(1))
    expect(screen.getAllByText(/integrantes/).length).toBe(1)
    expect(visiveis(nome0).length).toBe(0)
    expect(overlaySalvo().session['grupos.ativo']).toBe(ids[1])

    // sobrevive a reload
    simulaReload(r)
    renderFicha('grupos')
    const select2 = (await screen.findByLabelText('Grupo Ativo')) as HTMLSelectElement
    expect(select2.value).toBe(ids[1])
    await waitFor(() => expect(visiveis(nome1).length).toBe(1))
    expect(visiveis(nome0).length).toBe(0)
  })
})

describe('#12: imagem real da arma no slot do inventário', () => {
  it('slot 96px mostra a figura da carta da arma (doc sem embed → Figura/Armas)', async () => {
    // expectativa independente: o doc da arma NÃO tem embed; a figura da
    // carta existe nos assets (convenção do pleitost-views:
    // Figura/Armas/<basename>.png — armas-render.ts:39/131)
    const armaEntry = armaEntries.find((d) => d.basename === armaBase)!
    const armaDoc = readJson(armaEntry.id)
    expect(armaDoc.images).toEqual([])
    const assets = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8'))
    const figPath = `Recursos e Mídia/Imagens/Cartas/Figura/Armas/${armaBase}.png`
    expect(assets.assets.some((a: any) => a.path === figPath)).toBe(true)

    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    await waitFor(() => {
      const slot = [...container.querySelectorAll<HTMLElement>('span')].find(
        (s) => s.style.width === '96px' && s.style.backgroundImage,
      )
      expect(slot, 'slot da arma com imagem').toBeTruthy()
      expect(decodeURIComponent(slot!.style.backgroundImage)).toContain(figPath)
    })
  })
})

describe('#13: qualidade (A/E/M) recalcula o bônus como o plugin', () => {
  it('arma: tier novo seta Categoria + Bonus_Item do tier (setArmaRank), mantendo a imbuição', async () => {
    // FM real: Punhal Experiente (+2) com Imbuição Relampejante
    expect(String(armaFm.Categoria)).toBe('[[Experiente]]')
    expect(Number(armaFm.Bonus_Item)).toBe(2)
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')

    fireEvent.click(tierBtn(container, 'M', 26))
    // RANK_BONUS_ITEM do plugin (apply-armas-edit.ts:31): M → +3
    const lista = overlaySalvo().fm['Inventario.Armas.Lista']
    expect(lista[0].Categoria).toBe('[[Mestre]]')
    expect(lista[0].Bonus_Item).toBe(3)
    // propriedade existente é mantida (apply-armas-edit.ts:138 "mantém propriedade")
    expect(lista[0].Propriedade).toBe(String(armaFm.Propriedade))

    // coluna ITEM BÔNUS reflete: 3 bolinhas douradas acesas no card da arma
    const mBtn = tierBtn(container, 'M', 26)
    const row = mBtn.parentElement!.parentElement!.parentElement! as HTMLElement
    await waitFor(() => {
      const acesas = [...row.querySelectorAll<HTMLElement>('span')].filter(
        (s) => s.style.width === '11px' && s.style.background === 'var(--gold)',
      )
      expect(acesas.length).toBe(3)
    })
  })

  it('arma: clicar no tier ATIVO desseleciona e zera o bônus; Obra-prima automática some', async () => {
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    // FM: Punhal está Experiente → clicar E desseleciona (setArmaRank(null))
    fireEvent.click(tierBtn(container, 'E', 26))
    const lista = overlaySalvo().fm['Inventario.Armas.Lista']
    expect(lista[0].Categoria).toBe('')
    expect(lista[0].Bonus_Item).toBe(0)
    // imbuição NÃO é Obra-prima → permanece (apply-armas-edit.ts:149-151)
    expect(lista[0].Propriedade).toBe(String(armaFm.Propriedade))

    // re-selecionar com propriedade vazia → Obra-prima automática
    fireEvent.click(tierBtn(container, 'E', 26)) // re-seleciona (imbuição ainda existe)
    let l2 = overlaySalvo().fm['Inventario.Armas.Lista']
    expect(l2[0].Propriedade).toBe(String(armaFm.Propriedade))
    fireEvent.click(tierBtn(container, 'E', 26)) // desseleciona de novo
    // limpa a propriedade manualmente pra exercitar o ramo auto-Obra-prima
    fireEvent.change(screen.getByLabelText('Propriedade da arma'), { target: { value: '' } })
    fireEvent.click(tierBtn(container, 'A', 26))
    l2 = overlaySalvo().fm['Inventario.Armas.Lista']
    expect(l2[0].Categoria).toBe('[[Adepto]]')
    expect(l2[0].Bonus_Item).toBe(1)
    expect(l2[0].Propriedade).toBe('[[Arma Obra-prima|Obra-prima]]')
    // desselecionar agora TAMBÉM remove a Obra-prima automática (:149-151)
    fireEvent.click(tierBtn(container, 'A', 26))
    l2 = overlaySalvo().fm['Inventario.Armas.Lista']
    expect(l2[0].Categoria).toBe('')
    expect(l2[0].Bonus_Item).toBe(0)
    expect(l2[0].Propriedade).toBe('')
  })

  it('o bônus recalculado propaga pro mod de ataque do COMBATE', async () => {
    // mod exibido do Punhal ANTES (dado renderizado, não só o nome)
    const r1 = renderFicha('combate')
    const nomeRow = await screen.findByText(/^Punhal( |$)/)
    const row1 = nomeRow.parentElement! as HTMLElement
    const modDe = (row: HTMLElement) => {
      const span = [...row.querySelectorAll<HTMLElement>('span')].find((s) =>
        /^[+-]\d+$/.test(s.textContent ?? ''),
      )
      expect(span, 'mod do ataque').toBeTruthy()
      return Number(span!.textContent)
    }
    const antes = modDe(row1)
    r1.unmount()

    // E (+2) → M (+3) no INVENTÁRIO
    const r2 = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    fireEvent.click(tierBtn(r2.container, 'M', 26))
    r2.unmount()

    renderFicha('combate')
    const nomeRow2 = await screen.findByText(/^Punhal( |$)/)
    await waitFor(() => expect(modDe(nomeRow2.parentElement! as HTMLElement)).toBe(antes + 1))
  })

  it('armadura/escudo: tier seta a Obra-prima automática; trocar a base limpa tudo', async () => {
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    const cardArmadura = screen.getByText('ARMADURA').closest('div')!.parentElement! as HTMLElement
    // FM real: Armadura Leve Experiente + Obra-prima → clicar A muda o tier
    fireEvent.click(tierBtn(cardArmadura, 'A', 24))
    let armadura = overlaySalvo().fm['Inventario.Armadura']
    expect(armadura.Categoria).toBe('[[Adepto]]')
    // setArmaduraRank (apply-equipamentos-edit.ts:79-81): Obra-prima automática
    expect(armadura.Propriedade).toBe('[[Armadura Obra-prima|Obra-prima]]')
    expect(within(cardArmadura).getByText('Obra-prima (A)')).toBeTruthy()

    // clicar no ATIVO desseleciona categoria + propriedade (:73-77)
    fireEvent.click(tierBtn(cardArmadura, 'A', 24))
    armadura = overlaySalvo().fm['Inventario.Armadura']
    expect(armadura.Categoria).toBe('')
    expect(armadura.Propriedade).toBe('')

    // ESCUDO: FM real sem escudo → sem botões A/E/M (design showAem)
    const cardEscudo = screen.getByText('ESCUDO').closest('div')!.parentElement! as HTMLElement
    expect(
      [...cardEscudo.querySelectorAll<HTMLElement>('span')].some(
        (s) => s.textContent === 'A' && s.style.width === '24px',
      ),
    ).toBe(false)
    // escolher uma base habilita o tier; tier → Escudo Obra-prima (:123-125)
    fireEvent.change(within(cardEscudo).getByRole('combobox'), {
      target: { value: 'Escudo Leve' },
    })
    let escudo = overlaySalvo().fm['Inventario.Escudo']
    expect(escudo.Categoria).toBe('')
    expect(escudo.Propriedade).toBe('')
    fireEvent.click(tierBtn(cardEscudo, 'E', 24))
    escudo = overlaySalvo().fm['Inventario.Escudo']
    expect(escudo.Categoria).toBe('[[Experiente]]')
    expect(escudo.Propriedade).toBe('[[Escudo Obra-prima|Obra-prima]]')
  })

  it('tesouro: trocar a qualidade reescreve o alias e a coluna ITEM BÔNUS segue o bonus_<tier> do doc', async () => {
    // tesouro real com bonus_<tier> (Anel da Resistência, 1º do FM)
    const alvo = parseAlias(tesourosFm[0])
    const tDoc = readJson(tesouroEntries.find((d) => d.basename === alvo)!.id)
    const bonusM = parseInt(String(tDoc.inlineFields['bonus_mestre']).replace('+', ''), 10)
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    const nomeEl = [...container.querySelectorAll<HTMLElement>('span')].find(
      (s) => s.textContent === alvo,
    )!
    const row = nomeEl.closest('div[style*="grid"]')! as HTMLElement
    fireEvent.click(tierBtn(row, 'M', 22))
    // setTesouroTier (apply-tesouros-edit.ts:73-77): alias reescrito
    const tesouros = overlaySalvo().fm['Inventario.Tesouros']
    expect(tesouros[0]).toBe(`[[${alvo}|${alvo} (Mestre)]]`)
    // bolinhas = bonus_mestre:: do doc (bonusPorTier)
    await waitFor(() => {
      const rowDepois = [...container.querySelectorAll<HTMLElement>('span')]
        .find((s) => s.textContent === alvo)!
        .closest('div[style*="grid"]')! as HTMLElement
      const acesas = [...rowDepois.querySelectorAll<HTMLElement>('span')].filter(
        (s) => s.style.width === '11px' && s.style.background === 'var(--gold)',
      )
      expect(acesas.length).toBe(bonusM)
    })
  })
})

describe('#14: edição completa do inventário (espelho do Editável)', () => {
  it('trocar a arma grava wikilink basename + atributo derivado (batch do Editável)', async () => {
    // arma de DISTÂNCIA real → atributo derivado AGI (deriveArmaAtributo,
    // apply-armas-edit.ts:49-50: "d-marcial ou d-simples usa AGI")
    const dist = armaEntries.find((d) => d.grupo === 'd-marcial' || d.grupo === 'd-simples')!
    renderFicha('inventario')
    const select = (await screen.findByLabelText('Arma')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: dist.id } })
    await waitFor(() => {
      const lista = overlaySalvo().fm['Inventario.Armas.Lista']
      expect(lista[0].Nome).toBe(`[[${dist.basename}]]`)
      expect(lista[0].Atributo).toBe('AGI')
      // o resto da linha não é tocado (só nome+atributo, como o batch do plugin)
      expect(lista[0].Bonus_Item).toBe(Number(armaFm.Bonus_Item))
      expect(lista[0].Fonte).toBe(String(armaFm.Fonte))
    })
  })

  it('trocar a propriedade grava wikilink basename; vazio limpa (setArmaPropriedade)', async () => {
    renderFicha('inventario')
    await screen.findByLabelText('Arma')
    const select = screen.getByLabelText('Propriedade da arma') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Imbuição Flamejante' } })
    expect(overlaySalvo().fm['Inventario.Armas.Lista'][0].Propriedade).toBe(
      '[[Imbuição Flamejante]]',
    )
    fireEvent.change(select, { target: { value: '' } })
    expect(overlaySalvo().fm['Inventario.Armas.Lista'][0].Propriedade).toBe('')
  })

  it('adicionar arma do catálogo real → linha completa na lista do FM (addArma+pickArma)', async () => {
    // arma de distância: atributo derivado = AGI, determinístico
    const alvo = armaEntries.find((d) => d.grupo === 'd-simples')!
    const r = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar Arma/ }))
    fireEvent.click(await fabItem(alvo.basename!))
    await waitFor(() => {
      const lista = overlaySalvo().fm['Inventario.Armas.Lista']
      expect(lista.length).toBe(fm.Inventario.Armas.Lista.length + 1)
      // linha nova = emptyArma do plugin (apply-armas-edit.ts:64-74) + nome/atributo
      expect(lista[lista.length - 1]).toEqual({
        Nome: `[[${alvo.basename}]]`,
        Atributo: 'AGI',
        Bonus_Item: 0,
        Bonus_Especial: 0,
        Categoria: '',
        Propriedade: '',
        Fonte: 'Manual',
      })
    })
    // vira um card COMPLETO na lista (design: allArmas = armas + adicionadas)
    await waitFor(() => expect(screen.getAllByLabelText('Arma').length).toBe(2))

    // remover a arma adicionada volta ao FM original (removeArma :84-87)
    const trashes = screen.getAllByText('🗑️').filter((el) => el.tagName === 'BUTTON')
    fireEvent.click(trashes[trashes.length - 1])
    expect(overlaySalvo().fm['Inventario.Armas.Lista']).toEqual(fm.Inventario.Armas.Lista)

    // persiste no reload
    simulaReload(r)
    renderFicha('inventario')
    await screen.findByLabelText('Arma')
    expect(screen.getAllByLabelText('Arma').length).toBe(1)
  })

  it('adicionar tesouro → alias (Adepto) na lista; duplicado é no-op (addTesouro)', async () => {
    const nomesFm = new Set(tesourosFm.map(parseAlias))
    const alvo = tesouroEntries.find((d) => !nomesFm.has(d.basename!))!
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar Tesouro/ }))
    fireEvent.click(await fabItem(alvo.basename!))
    // alias tier A default — apply-tesouros-edit.ts:44-46
    let tesouros = overlaySalvo().fm['Inventario.Tesouros']
    expect(tesouros[tesouros.length - 1]).toBe(`[[${alvo.basename}|${alvo.basename} (Adepto)]]`)
    expect(tesouros.length).toBe(tesourosFm.length + 1)
    // linha aparece com qualidade A selecionada
    await waitFor(() => {
      const nomeEl = [...container.querySelectorAll<HTMLElement>('span')].find(
        (s) => s.textContent === alvo.basename,
      )
      expect(nomeEl).toBeTruthy()
    })

    // duplicado: "já tem" → no-op (apply-tesouros-edit.ts:40)
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar Tesouro/ }))
    fireEvent.click(await fabItem(alvo.basename!))
    tesouros = overlaySalvo().fm['Inventario.Tesouros']
    expect(tesouros.length).toBe(tesourosFm.length + 1)
  })

  it('remover tesouro persiste a lista filtrada', async () => {
    const alvo = parseAlias(tesourosFm[0])
    const { container } = renderFicha('inventario')
    await screen.findByLabelText('Arma')
    const nomeEl = [...container.querySelectorAll<HTMLElement>('span')].find(
      (s) => s.textContent === alvo,
    )!
    const row = nomeEl.closest('div[style*="grid"]')! as HTMLElement
    fireEvent.click(within(row).getByText('🗑️'))
    const tesouros = overlaySalvo().fm['Inventario.Tesouros']
    expect(tesouros.length).toBe(tesourosFm.length - 1)
    expect(tesouros.map(parseAlias)).not.toContain(alvo)
  })
})
