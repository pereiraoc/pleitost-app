// @vitest-environment jsdom
// FORMATO DE AVENTURA (F1.5/F2/F4) — sobre a Pós Grenal REAL (fixture .md
// congelada, cifrada pelo extractor de verdade): (1) trancada → só chamada +
// campos da lista, senha errada/certa, dev destrava; (2) grade: card trancado
// SEM o título do bounty; (3) destravada → página por seção com registros,
// chips que expandem o registro ali mesmo, cenas com combates; (4) PREPARAR
// cria um encounter `prepared` na sessão InMemory com sourceNotePath por cena,
// sem duplicar; (5) Iniciar na sessão grava state.aventura e marcar cena.
import { useEffect } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { cifrarDoc } from '../../extractor/cifra-doc.mjs'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocPage } from '../src/components/compendium/DocPage'
import { FolderView } from '../src/components/compendium/FolderView'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession, getLiveSession } from '../src/data/session-repo/live-session'
import { prepsFromEntries, startEncounterFromRoster } from '../src/data/session-repo/encounter-actions'
import { __resetDocLocksForTests, setDevSenha, unlockWithSenha } from '../src/data/doc-lock'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetSettingsForTests, useSettings } from '../src/settings'
import { compendiumFolderPath } from '../src/paths'
import type { IndexDocEntry, IndexManifest, VaultDoc } from '../src/data/types'
import '../src/components/compendium/register-doc-views'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest

// A Pós Grenal (POA) entra no catálogo de teste como se fosse da vault-data
// fantasia — o parser/render não sabem de mundo; o que importa é o formato.
const ID = 'Campanhas/Aventuras/Pós Grenal'
const raw = fs.readFileSync(path.join(appDir, 'tests', 'fixtures', 'aventuras', 'Pós Grenal.md'), 'utf8')
const { frontmatter, body } = parseFrontmatter(raw) as { frontmatter: Record<string, unknown>; body: string }
const record = {
  id: ID,
  path: `${ID}.md`,
  basename: 'Pós Grenal',
  type: 'Aventura',
  subtype: String(frontmatter['subcategoria']),
  grupo: null,
  frontmatter,
  inlineFields: {},
  ruleElements: [],
  links: [],
  images: [],
  headings: [],
  body,
}
const CAMPOS = ['Chamada', 'rank', 'Formato', 'Duração', 'Jogadores', 'Tom']
const CIFRADO = cifrarDoc(record, { camposPublicos: CAMPOS, senhaDev: 'dev-teste' }) as unknown as VaultDoc
const entry: IndexDocEntry = { id: ID, path: `${ID}.md`, kind: 'content', basename: 'Pós Grenal', type: 'Aventura', subtype: null, protegido: true }
const catalog = buildCatalog({ ...manifest, docs: [...manifest.docs, entry] })

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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    if (rel === `${ID}.json`) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(CIFRADO)) }
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  __resetLocalStoreForTests()
  __resetDocLocksForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function mestreOn() {
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
}
function DevOn() {
  const { setDesenvolvedor } = useSettings()
  useEffect(() => setDesenvolvedor(true), [setDesenvolvedor])
  return null
}

function renderDoc(opts: { repo?: InMemorySessionRepo; dev?: boolean } = {}) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={opts.repo ?? null} user={opts.repo ? { id: 'gm-1', nome: 'Mestre' } : null}>
        <MemoryRouter initialEntries={[`/doc/${ID}`]}>
          {opts.dev ? <DevOn /> : null}
          <Routes>
            <Route path="/doc/*" element={<DocPage />} />
          </Routes>
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

async function destravar() {
  const input = await screen.findByLabelText('Senha da aventura')
  fireEvent.change(input, { target: { value: 'poa1987grenal' } })
  fireEvent.click(screen.getByRole('button', { name: 'DESTRAVAR' }))
  await waitFor(() => expect(document.querySelector('[data-av-formato]')).toBeTruthy())
}

describe('aventura TRANCADA (senha por aventura)', () => {
  it('mostra só chamada + campos da lista trancada; nada do bounty/roteiro', async () => {
    mestreOn()
    const { container } = renderDoc()
    expect(await screen.findByText(/Uma noite de Gre-Nal em Porto Alegre/)).toBeTruthy()
    const txt = container.textContent ?? ''
    expect(txt).toContain('One-Shot')
    expect(txt).toContain('3h a 4h30')
    expect(txt).not.toContain('Recuperação de Carga') // título do bounty = spoiler
    expect(txt).not.toContain('Cápsula-Matriz')
    expect(txt).not.toContain('Brum')
    expect(document.querySelector('[data-doc-lock]')).toBeTruthy()
  })

  it('senha errada avisa; senha certa abre a página por seção', async () => {
    mestreOn()
    renderDoc()
    const input = await screen.findByLabelText('Senha da aventura')
    fireEvent.change(input, { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'DESTRAVAR' }))
    expect((await screen.findByRole('alert')).textContent).toContain('senha incorreta')
    await destravar()
    expect(screen.getByRole('heading', { level: 1, name: 'Pós Grenal' })).toBeTruthy()
    expect(await screen.findByText('Recuperação de Carga do Consórcio das Bandeiras')).toBeTruthy()
    // lembrado neste aparelho → chave persistida
    expect(JSON.parse(window.localStorage.getItem('pleitost.docLocks')!)).toHaveProperty(ID)
  })

  it('Modo Desenvolvedor destrava sem senha (chave do dev guardada no Config)', async () => {
    mestreOn()
    await setDevSenha('dev-teste')
    renderDoc({ dev: true })
    await waitFor(() => expect(document.querySelector('[data-av-formato]')).toBeTruthy())
    expect(document.querySelector('[data-doc-lock]')).toBeNull()
  })

  it('a grade mostra a aventura como card TRANCADO, sem título do bounty', async () => {
    mestreOn()
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[compendiumFolderPath('Campanhas/Aventuras')]}>
          <Routes>
            <Route path="/compendio/*" element={<FolderView />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const card = await waitFor(() => {
      const el = document.querySelector('[data-aventura-trancada]') as HTMLElement
      expect(el).toBeTruthy()
      return el
    })
    expect(card.textContent).toContain('Pós Grenal')
    expect(card.textContent).toContain('🔒')
    expect(card.textContent).toContain('Uma noite de Gre-Nal')
    expect(card.textContent).not.toContain('Recuperação de Carga')
    // as da fantasia seguem como carta de bounty normal
    expect(await screen.findByText('Neutralização de Fenda Negra')).toBeTruthy()
  })
})

describe('página por seção (formato de aventura)', () => {
  beforeEach(async () => {
    mestreOn()
    await unlockWithSenha(CIFRADO, 'poa1987grenal', false)
  })

  it('renderiza as 5 seções, estrutura do FM, registros e cenas com combates', async () => {
    const { container } = renderDoc()
    await waitFor(() => expect(container.querySelector('[data-av-formato]')).toBeTruthy())
    for (const id of ['av-resumo', 'av-contexto', 'av-personagens', 'av-locais', 'av-combates', 'av-cenas']) {
      expect(container.querySelector(`#${id}`), id).toBeTruthy()
    }
    // colapsadas de saída, menos o Resumo (pedido 2026-09-07)
    expect((container.querySelector('#av-resumo') as HTMLDetailsElement).open).toBe(true)
    expect((container.querySelector('#av-personagens') as HTMLDetailsElement).open).toBe(false)
    expect((container.querySelector('#av-cenas') as HTMLDetailsElement).open).toBe(false)
    // registros colapsados (details fechado), conteúdo no DOM
    expect((container.querySelector('[data-av-registro="Arlindo “Bomba” Fagundes"]') as HTMLDetailsElement).open).toBe(false)
    // 2.5 Combates: 2 registros com bloco de roster
    expect(container.querySelectorAll('#av-combates [data-av-combate-reg]').length).toBe(2)
    expect(container.querySelector('#av-combates [data-av-combate="fase-1-capangas-e-operadores"]')).toBeTruthy()
    // estrutura lida do FM + contagens derivadas
    const est = container.querySelector('[data-av-estrutura]') as HTMLElement
    expect(est.textContent).toContain('3h a 4h30')
    expect(est.textContent).toContain('JOGADORES4') // {min:4,max:4} → fmtAmount = "4"
    expect(container.querySelector('[data-av-totais]')!.textContent).toContain('6 cenas')
    expect(container.querySelector('[data-av-totais]')!.textContent).toContain('2 combates')
    // 7 personagens, 9 locais (o Mapa não é registro)
    expect(container.querySelectorAll('#av-personagens [data-av-registro]').length).toBe(7)
    expect(container.querySelectorAll('#av-locais [data-av-registro]').length).toBe(9)
    // registro do Arlindo: Papel como campo, Frases em balões, 🔊 e segredo
    const arlindo = container.querySelector('[data-av-registro="Arlindo “Bomba” Fagundes"]') as HTMLElement
    expect(within(arlindo).getByText('PAPEL')).toBeTruthy()
    expect(arlindo.querySelectorAll('[data-av-frases] .av-frase').length).toBe(3)
    expect(arlindo.querySelectorAll('[data-av-leitura]').length).toBe(1)
    expect(arlindo.querySelectorAll('[data-av-segredo]').length).toBe(1)
    // mapa e link de impressão
    expect(container.querySelector('[data-av-mapa]')).toBeTruthy()
    expect(container.querySelector('[data-av-imprimir-mapa]')?.getAttribute('href')).toContain('/papel/mapa/')
    // cenas: 6, a 1ª aberta por padrão; a 6ª fechada até clicar
    expect(container.querySelectorAll('[data-av-cena]').length).toBe(6)
    expect(container.querySelector('[data-av-cena="1"] .av-cena-body')).toBeTruthy()
    expect(container.querySelector('[data-av-cena="6"] .av-cena-body')).toBeNull()
    fireEvent.click(within(container.querySelector('[data-av-cena="6"]') as HTMLElement).getByRole('button', { name: /Retífica Sertório/ }))
    // a cena PUXA os dois combates referenciados de 2.5 (mesmo card)
    await waitFor(() => expect(container.querySelectorAll('[data-av-cena="6"] [data-av-combate-reg]').length).toBe(2))
    const f1 = container.querySelector('[data-av-cena="6"] [data-av-combate="fase-1-capangas-e-operadores"]') as HTMLElement
    expect(f1.textContent).toContain('Arruaceiro')
    // velocidades da nota aparecem no banner (Guarda rápido; Arruaceiro #4 lento)
    expect(f1.textContent).toContain('Rápido')
    expect(f1.textContent).toContain('Lento')
    expect(f1.textContent).toContain('Arruaceiro #4')
  })

  it('chip de Local/Personagem da cena expande o registro ali mesmo', async () => {
    const { container } = renderDoc()
    await waitFor(() => expect(container.querySelector('[data-av-cena="1"] .av-cena-body')).toBeTruthy())
    const cena1 = container.querySelector('[data-av-cena="1"]') as HTMLElement
    // o CHIP da linha de referências (a prosa da cena também cita o local, e
    // desde 2026-09-10 essa citação é um botão — daí a busca ser no chip)
    const chips = cena1.querySelector('[data-av-refrow="Local"]') as HTMLElement
    const local = within(chips).getByText('Estádio Beira-Rio e entorno')
    // fechado: o registro não está renderizado dentro da cena
    expect(cena1.querySelector('[data-av-registro="Estádio Beira-Rio e entorno"]')).toBeNull()
    fireEvent.click(local)
    await waitFor(() => expect(cena1.querySelector('[data-av-registro="Estádio Beira-Rio e entorno"]')).toBeTruthy())
    // e o 🔊 do local aparece dentro da cena
    expect(cena1.querySelector('[data-av-registro="Estádio Beira-Rio e entorno"] [data-av-leitura]')!.textContent).toContain('apito final')
    const pers = within(cena1.querySelector('[data-av-refrow="Personagens"]') as HTMLElement).getByText('Sargento Valdir Brum')
    fireEvent.click(pers)
    await waitFor(() => expect(cena1.querySelector('[data-av-registro="Sargento Valdir Brum"]')).toBeTruthy())
  })

  // Report 2026-09-10: "tu fala de um NPC mas não coloca um link pra clicar e
  // ver mais informações sobre ele". `[[#Alvo]]` na PROSA não resolvia doc
  // nenhum no catálogo e caía em texto puro — palavra morta.
  it('`[[#Alvo]]` na prosa da cena vira controle que abre o registro', async () => {
    const { container } = renderDoc()
    await waitFor(() => expect(container.querySelector('[data-av-cena="1"] .av-cena-body')).toBeTruthy())
    const refs = container.querySelectorAll('[data-av-ref]')
    expect(refs.length, 'a prosa cita registros e nenhum virou botão').toBeGreaterThan(5)
    // nenhum `[[#…]]` sobrou como texto cru na página
    expect(container.textContent).not.toContain('[[#')
    const brum = container.querySelector('[data-av-ref="Sargento Valdir Brum"]') as HTMLButtonElement
    expect(brum.tagName).toBe('BUTTON')
    fireEvent.click(brum)
    // a seção dos personagens abre e o registro fica em destaque, aberto
    await waitFor(() => {
      const card = container.querySelector('[data-av-registro="Sargento Valdir Brum"]') as HTMLDetailsElement
      expect(card.open).toBe(true)
      expect(card.parentElement?.className).toContain('is-destacado')
    })
  })

  it('campo de uma linha do registro mostra ênfase e referência, não a marcação crua', async () => {
    const { container } = renderDoc()
    await waitFor(() => expect(container.querySelector('[data-av-registro="Sargento Valdir Brum"]')).toBeTruthy())
    const card = container.querySelector('[data-av-registro="Sargento Valdir Brum"]') as HTMLElement
    // "um **revólver de serviço** no coldre" saía com os asteriscos na cara
    expect(card.textContent).not.toContain('**')
    expect(card.querySelector('strong')).not.toBeNull()
  })

  it('sem sessão viva não há botões de sessão; com mestre + sala, PREPARAR cria encounter por cena (idempotente)', async () => {
    const semSessao = renderDoc()
    await waitFor(() => expect(semSessao.container.querySelector('[data-av-formato]')).toBeTruthy())
    expect(semSessao.container.querySelector('[data-av-iniciar]')).toBeNull()
    cleanup()

    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC123' })
    setLiveSession({ sessionId: sess.id, state: sess.state, gmUserId: 'gm-1', characters: [], members: [], encounters: [] })
    const { container } = renderDoc({ repo })
    await waitFor(() => expect(container.querySelector('[data-av-iniciar]')).toBeTruthy())
    // abre a cena 6 e prepara a Fase 1
    fireEvent.click(within(container.querySelector('[data-av-cena="6"]') as HTMLElement).getByRole('button', { name: /Retífica Sertório/ }))
    const f1 = await waitFor(() => container.querySelector('[data-av-cena="6"] [data-av-combate="fase-1-capangas-e-operadores"]') as HTMLElement)
    // sem combate ativo, o outro botão é "adicionar à sessão"
    expect(within(f1).getByRole('button', { name: /\+ Adicionar à sessão/ })).toBeTruthy()
    fireEvent.click(within(f1).getByRole('button', { name: /Preparar na sessão/ }))
    await waitFor(async () => expect((await repo.listEncountersBySession(sess.id)).length).toBe(1))
    const [enc] = await repo.listEncountersBySession(sess.id)
    expect(enc!.status).toBe('prepared')
    expect(enc!.sourceNotePath).toBe(`${ID}#fase-1-capangas-e-operadores`)
    expect(enc!.name).toContain('Fase 1')
    expect(enc!.roster.entries.map((e) => `${e.qty}× ${e.label}`)).toEqual(['1× Guarda', '1× Arruaceiro', '3× Arruaceiro'])
    // as velocidades da nota viajam no roster e viram preps por instância
    expect(prepsFromEntries(enc!.roster.entries)!.map((p) => p.speed)).toEqual(['rapido', 'rapido', 'lento', 'lento', 'lento'])
    // de novo → não duplica
    fireEvent.click(within(f1).getByRole('button', { name: /Preparar na sessão/ }))
    await screen.findByText(/já estava preparado/)
    expect((await repo.listEncountersBySession(sess.id)).length).toBe(1)
    // ▶ INICIAR o preparado (mesmo caminho da Sessão, sem preps explícitos) → speeds do turno vêm da nota
    await startEncounterFromRoster(repo, catalog, enc!, 'gm-1')
    const [ativo] = await repo.listEncountersBySession(sess.id)
    expect(ativo!.status).toBe('active')
    const npcs = ativo!.turnState!.order
    expect(npcs.map((id) => ativo!.turnState!.speeds?.[id])).toEqual(['rapido', 'rapido', 'lento', 'lento', 'lento'])
    // com combate ATIVO na sala, o bloco da Fase 2 oferece "adicionar ao combate ativo"
    setLiveSession({ ...getLiveSession()!, encounters: [ativo!] })
    const f2 = await waitFor(() => container.querySelector('[data-av-cena="6"] [data-av-combate="fase-2-chega-o-mais-forte"]') as HTMLElement)
    await waitFor(() => expect(within(f2).getByRole('button', { name: /Adicionar ao combate ativo/ })).toBeTruthy())
  })

  it('Iniciar na sessão grava state.aventura; marcar cena atualiza cenaAtual', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC124' })
    setLiveSession({ sessionId: sess.id, state: sess.state, gmUserId: 'gm-1', characters: [], members: [], encounters: [] })
    const { container } = renderDoc({ repo })
    fireEvent.click(await screen.findByRole('button', { name: /Iniciar na sessão/ }))
    await waitFor(async () => expect((await repo.findSessionById(sess.id))!.state.aventura?.docId).toBe(ID))
    expect(getLiveSession()!.state!.aventura!.cenaAtual).toBeNull()
    expect(await screen.findByRole('button', { name: /encerrar aventura/ })).toBeTruthy()
    // marcar a cena 2 como atual
    const cena2 = container.querySelector('[data-av-cena="2"]') as HTMLElement
    fireEvent.click(within(cena2).getByRole('button', { name: /marcar atual/ }))
    await waitFor(async () => expect((await repo.findSessionById(sess.id))!.state.aventura?.cenaAtual).toBe('fuga-subterranea'))
    await waitFor(() => expect(container.querySelector('[data-av-cena="2"].is-atual')).toBeTruthy())
  })
})
