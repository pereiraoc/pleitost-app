// @vitest-environment jsdom
// REVIEW das transições PASSADO⇄FUTURO do Planejamento (pedido 2026-08-26):
// a classe de bugs recorrente era informação errada/perdida quando algo
// cruzava a fronteira do nível atual. Cada teste fixa um contrato:
//   1. DESCER nível desfaz o real (técnica/perícia/espec) SEM perder registro
//   2. SUBIR de volta re-materializa tudo do registro
//   3. magia planejada materializa ao subir e desfaz ao descer
//   4. escolha real com gate acima do novo nível vira snapshot no plano
//   5. gasto do passado removido/trocado POR FORA não volta — a ficha é a
//      verdade no passado sincronizado (contrato invertido no report 95b2e420)
//   6. abrir a aba é IDEMPOTENTE (segunda abertura não muda gastosSlots)
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  getLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage?.clear?.()
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

function renderBiografia(id: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirPlanejamento() {
  fireEvent.click(await screen.findByText('PLANEJAMENTO'))
  await waitFor(() => expect(document.querySelector('[data-nivel="1"]')).toBeTruthy(), {
    timeout: 20000,
  })
}

const fmDe = (id: string) => getLocalEntity(id)!.frontmatter as Record<string, unknown>
const regsDe = (id: string) =>
  ((fmDe(id)['Planejamento'] as Record<string, unknown>)?.['gastosSlots'] ?? []) as Array<
    Record<string, unknown>
  >
const tecnicasDe = (id: string) =>
  (((fmDe(id)['Tecnicas'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
    Record<string, unknown>
  >).flatMap((r) => Object.keys(r))
const atletismoDe = (id: string) => {
  const rows = ((fmDe(id)['Pericias'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
    Record<string, unknown>
  >
  return rows.find((r) => r['Nome'] === 'Atletismo')
}
const magiasAnimaDe = (id: string) => {
  const escolas = ((fmDe(id)['Magias'] as Record<string, unknown>)?.['Lista'] ?? []) as Array<
    Record<string, unknown>
  >
  const anima = escolas.find((e) => e['Nome'] === 'Anima')
  return (Array.isArray(anima?.['Lista']) ? (anima['Lista'] as Array<Record<string, unknown>>) : []).flatMap(
    (r) => Object.keys(r),
  )
}

const guerreiroN4 = () =>
  createLocalEntity('Heroi', 'Transitor', {
    ...(emptyHeroFrontmatter() as Record<string, unknown>),
    Classe: '[[Guerreiro]]',
    'Nível': 4,
    Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    Tecnicas: {
      Lista: [{ '[[Ataque Poderoso]]': 'Slot.A' }, { '[[Ataque Brutal]]': 'Slot.E' }],
    },
    Pericias: {
      Lista: [
        {
          Nome: 'Atletismo',
          Atributo: 'FOR',
          Proficiencia: 'E',
          Bonus_Item: 0,
          Bonus_Especial: 0,
          Especializacao: '[[Impulso]]',
          Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
        },
      ],
    },
    Planejamento: {
      gastosSlots: [
        { nivel: 1, tipo: 'tecnica', rank: 'A', alvo: '[[Ataque Poderoso]]' },
        { nivel: 4, tipo: 'tecnica', rank: 'E', alvo: '[[Ataque Brutal]]' },
        { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Atletismo' },
        { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Atletismo' },
        { nivel: 4, tipo: 'especialidade', alvo: '[[Impulso]]', contexto: 'Atletismo' },
      ],
    },
  })

describe('transições de nível — DESCER desfaz sem perder, SUBIR re-materializa', () => {
  it('técnica/perícia/espec do N4: descer pro N3 desfaz o real e preserva registros; subir traz tudo de volta', async () => {
    const id = guerreiroN4()
    renderBiografia(id)
    await abrirPlanejamento()
    expect(tecnicasDe(id)).toContain('[[Ataque Brutal]]')

    // DESCE pro N3 — os gastos do N4 saem do REAL
    cleanup()
    setLocalEntityFm(id, 'Nível', 3)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => {
        expect(tecnicasDe(id)).not.toContain('[[Ataque Brutal]]')
        const atl = atletismoDe(id)!
        expect(JSON.stringify(atl['Incrementos'])).not.toContain('"E"')
        expect(String(atl['Especializacao'] ?? '')).toBe('')
      },
      { timeout: 20000 },
    )
    // NADA se perde: os 5 registros seguem no plano; o N1 fica intacto
    expect(regsDe(id)).toHaveLength(5)
    expect(tecnicasDe(id)).toContain('[[Ataque Poderoso]]')
    expect(JSON.stringify(atletismoDe(id)!['Incrementos'])).toContain('"A"')

    // SOBE de volta pro N4 — re-materializa do registro
    cleanup()
    setLocalEntityFm(id, 'Nível', 4)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => {
        expect(tecnicasDe(id)).toContain('[[Ataque Brutal]]')
        const atl = atletismoDe(id)!
        expect(JSON.stringify(atl['Incrementos'])).toContain('"E"')
        expect(String(atl['Especializacao'] ?? '')).toContain('Impulso')
      },
      { timeout: 20000 },
    )
    expect(regsDe(id)).toHaveLength(5)
  }, 120000)

  it('magia planejada (Enraizar@4 do Leonel N3) materializa ao subir e desfaz ao descer', async () => {
    const base = JSON.parse(
      fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
    ).frontmatter as Record<string, unknown>
    const id = createLocalEntity('Heroi', 'Leonel Magia', {
      ...base,
      Planejamento: {
        gastosSlots: [{ nivel: 4, tipo: 'magia', rank: 'A', alvo: '[[Enraizar]]', contexto: 'Anima' }],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    // N3: planejada — NÃO entra na escola real
    expect(magiasAnimaDe(id)).not.toContain('[[Enraizar]]')

    cleanup()
    setLocalEntityFm(id, 'Nível', 4)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(() => expect(magiasAnimaDe(id)).toContain('[[Enraizar]]'), { timeout: 20000 })

    cleanup()
    setLocalEntityFm(id, 'Nível', 3)
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(() => expect(magiasAnimaDe(id)).not.toContain('[[Enraizar]]'), { timeout: 20000 })
    // o registro sobrevive ao ciclo inteiro
    expect(regsDe(id).some((r) => String(r['alvo']).includes('Enraizar'))).toBe(true)
  }, 120000)

  it('escolha REAL com gate acima do novo nível vira snapshot no plano ao descer', async () => {
    const base = JSON.parse(
      fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
    ).frontmatter as Record<string, unknown>
    const habs = (base['Habilidades'] as { Lista: Array<Record<string, unknown>> }).Lista
    const id = createLocalEntity('Heroi', 'Leonel Snapshot', {
      ...base,
      Habilidades: {
        ...(base['Habilidades'] as Record<string, unknown>),
        Lista: [
          ...habs,
          // terceira essência escolhida DE VERDADE (gate N3 = nível atual)
          { '[[Essência Hidratante Adepta]]': 'Escolha.03.[[Círculo do Oceano (Água e Terra)]]' },
        ],
      },
    })
    renderBiografia(id)
    await abrirPlanejamento()
    cleanup()
    setLocalEntityFm(id, 'Nível', 2)
    renderBiografia(id)
    await abrirPlanejamento()
    // o pick não pode EVAPORAR: vai pro plano enquanto o gate está acima
    await waitFor(
      () => {
        const picks = ((fmDe(id)['Planejamento'] as Record<string, unknown>)?.['picks'] ?? {}) as Record<
          string,
          string
        >
        expect(Object.values(picks).some((v) => v.includes('Hidratante'))).toBe(true)
      },
      { timeout: 20000 },
    )
  }, 120000)

  // CONTRATO INVERTIDO (report 95b2e420, 2026-10-15, @thallesagm): "toda vez
  // que o Samuel abre o planejamento, as perícias ficam incorretas e o aviso
  // de quantidades incorretas aparece". O jogador trocou perícias na FICHA e
  // o plano reaplicava as antigas a cada abertura. No passado já sincronizado
  // a FICHA é a verdade: o que saiu por fora fica fora e o registro velho cai.
  it('gasto do passado removido por fora (Competências) NÃO volta ao abrir — o registro cai', async () => {
    const id = guerreiroN4()
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(() => expect(fmDe(id)['Planejamento']).toMatchObject({ nivelSincronizado: 4 }), { timeout: 20000 })
    cleanup()
    // simula remoção por FORA do planejamento (aba Competências)
    setLocalEntityFm(id, 'Tecnicas.Lista', [{ '[[Ataque Brutal]]': 'Slot.E' }])
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => expect(regsDe(id).some((r) => String(r['alvo']).includes('Ataque Poderoso'))).toBe(false),
      { timeout: 20000 },
    )
    expect(tecnicasDe(id)).not.toContain('[[Ataque Poderoso]]')
    expect(tecnicasDe(id)).toContain('[[Ataque Brutal]]')
  }, 120000)

  it('perícia TROCADA na ficha (Atletismo → Acrobacia) não volta, e o plano passa a registrar a nova', async () => {
    const id = guerreiroN4()
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(() => expect(fmDe(id)['Planejamento']).toMatchObject({ nivelSincronizado: 4 }), { timeout: 20000 })
    cleanup()
    // na ficha: o A/E saem do Atletismo e vão pra Acrobacia (especialização junto)
    setLocalEntityFm(id, 'Pericias.Lista', [
      { Nome: 'Atletismo', Atributo: 'FOR', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Especializacao: '', Incrementos: [] },
      { Nome: 'Acrobacia', Atributo: 'AGI', Proficiencia: 'E', Bonus_Item: 0, Bonus_Especial: 0, Especializacao: '', Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }] },
    ])
    renderBiografia(id)
    await abrirPlanejamento()
    await waitFor(
      () => {
        const regs = regsDe(id)
        expect(regs.some((r) => r['alvo'] === 'Atletismo')).toBe(false)
        expect(regs.some((r) => r['alvo'] === 'Acrobacia' && r['rank'] === 'A')).toBe(true)
        expect(regs.some((r) => r['alvo'] === 'Acrobacia' && r['rank'] === 'E')).toBe(true)
      },
      { timeout: 20000 },
    )
    // a ficha ficou como o jogador deixou
    const atl = atletismoDe(id)!
    expect(atl['Incrementos']).toEqual([])
    expect(String(atl['Especializacao'] ?? '')).toBe('')
  }, 120000)

  it('abrir a aba é idempotente: a segunda abertura não muda gastosSlots', async () => {
    const base = JSON.parse(
      fs.readFileSync(path.join(appDir, 'tests/fixtures/heroes/Leonel Bravolla.json'), 'utf8'),
    ).frontmatter as Record<string, unknown>
    const id = createLocalEntity('Heroi', 'Leonel Idem', base)
    renderBiografia(id)
    await abrirPlanejamento()
    // espera o seed/heal ESTABILIZAR (duas leituras consecutivas iguais)
    let ultimo = ''
    await waitFor(
      () => {
        const cur = JSON.stringify(regsDe(id))
        expect(regsDe(id).length).toBeGreaterThan(0)
        if (cur !== ultimo) {
          ultimo = cur
          throw new Error('seed ainda assentando')
        }
      },
      { timeout: 30000, interval: 400 },
    )
    const primeira = ultimo
    cleanup()
    renderBiografia(id)
    await abrirPlanejamento()
    let ultimo2 = ''
    await waitFor(
      () => {
        const cur = JSON.stringify(regsDe(id))
        if (cur !== ultimo2) {
          ultimo2 = cur
          throw new Error('ainda assentando')
        }
      },
      { timeout: 30000, interval: 400 },
    )
    expect(ultimo2).toBe(primeira)
  }, 120000)
})
