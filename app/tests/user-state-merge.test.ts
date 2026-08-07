// @vitest-environment jsdom
// SYNC ENTRE DISPOSITIVOS das COLEÇÕES (report do usuário: "importei heróis no
// tablet e no celular eles não estavam na lista"). Raiz: o espelho por conta
// (user_state) sincroniza POR CHAVE com fill-only-missing nos DOIS sentidos —
// mas os heróis vivem num BLOB ÚNICO (pleitost.localEntities), então qualquer
// device com a chave presente nunca recebia (nem subia) os itens do outro.
// Fix: chaves de COLEÇÃO ganham MERGE POR ENTRADA (união; local vence conflito
// do mesmo id) na hidratação do login — os dois sentidos destravam e o flush
// não apaga mais os itens do outro device da conta.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  connectUserStateSync,
  __resetPersistForTests,
  __setUserStateOpsForTests,
} from '../src/data/remote-persist'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

/** "Servidor" user_state em memória com a MESMA semântica do Supabase ops. */
function fakeServer(initial: Record<string, string> = {}) {
  const rows = new Map<string, Record<string, string>>()
  rows.set('u1', { ...initial })
  return {
    rows,
    ops: {
      async get(userId: string) {
        return rows.get(userId) ?? null
      },
      async put(userId: string, patch: Record<string, string | null>) {
        const cur = { ...(rows.get(userId) ?? {}) }
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete cur[k]
          else cur[k] = v
        }
        rows.set(userId, cur)
      },
    },
  }
}

const ENT = 'pleitost.localEntities'
const heroi = (id: string) => ({ id, kind: 'Heroi', basename: id, frontmatter: { subcategoria: 'Heroi' } })

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  __resetPersistForTests()
})
afterEach(() => {
  __resetPersistForTests()
})

describe('espelho por conta: merge POR ENTRADA das coleções', () => {
  it('REPRO: herói do tablet (servidor) chega no celular que JÁ tem o blob local', async () => {
    // conta tem o herói importado no TABLET
    const srv = fakeServer({
      [ENT]: JSON.stringify({ 'local:Heroi:tablet1': heroi('local:Heroi:tablet1') }),
    })
    __setUserStateOpsForTests(srv.ops)
    // o CELULAR já tem entidade própria → a chave EXISTE localmente (o caso do bug)
    window.localStorage.setItem(ENT, JSON.stringify({ 'local:Heroi:cel1': heroi('local:Heroi:cel1') }))

    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))

    // celular vê a UNIÃO (antes: fill-only-missing pulava e o herói nunca chegava)
    const local = JSON.parse(window.localStorage.getItem(ENT)!)
    expect(Object.keys(local).sort()).toEqual(['local:Heroi:cel1', 'local:Heroi:tablet1'])
    expect(added).toContain(ENT) // onHydrated sabe que chegou coisa nova (reload)
    // e a CONTA recebe a união (o herói do celular sobe sem apagar o do tablet)
    const server = JSON.parse(srv.rows.get('u1')![ENT]!)
    expect(Object.keys(server).sort()).toEqual(['local:Heroi:cel1', 'local:Heroi:tablet1'])
  })

  it('conflito do MESMO id: o LOCAL vence (nunca perde o que está na mão)', async () => {
    const srv = fakeServer({
      [ENT]: JSON.stringify({ 'local:Heroi:x': { ...heroi('local:Heroi:x'), basename: 'Versão Remota' } }),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      ENT,
      JSON.stringify({ 'local:Heroi:x': { ...heroi('local:Heroi:x'), basename: 'Versão Local' } }),
    )
    await connectUserStateSync('u1', () => {})
    const local = JSON.parse(window.localStorage.getItem(ENT)!)
    expect(local['local:Heroi:x'].basename).toBe('Versão Local')
    // o servidor converge pro vencedor local
    const server = JSON.parse(srv.rows.get('u1')![ENT]!)
    expect(server['local:Heroi:x'].basename).toBe('Versão Local')
  })

  it('chave só no SERVIDOR continua hidratando (fill preservado)', async () => {
    const srv = fakeServer({
      [ENT]: JSON.stringify({ 'local:Heroi:t': heroi('local:Heroi:t') }),
      'pleitost.settings.mestre': 'true',
    })
    __setUserStateOpsForTests(srv.ops)
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    expect(JSON.parse(window.localStorage.getItem(ENT)!)['local:Heroi:t']).toBeTruthy()
    expect(window.localStorage.getItem('pleitost.settings.mestre')).toBe('true')
    expect(added.sort()).toEqual([ENT, 'pleitost.settings.mestre'])
  })

  it('pleitost.sessoes (ARRAY): união por código — mesa do tablet aparece no celular', async () => {
    const srv = fakeServer({
      'pleitost.sessoes': JSON.stringify([{ codigo: 'TAB123', nome: 'Mesa Tablet' }]),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      'pleitost.sessoes',
      JSON.stringify([{ codigo: 'CEL456', nome: 'Mesa Celular' }]),
    )
    await connectUserStateSync('u1', () => {})
    const local = JSON.parse(window.localStorage.getItem('pleitost.sessoes')!) as { codigo: string }[]
    expect(local.map((s) => s.codigo).sort()).toEqual(['CEL456', 'TAB123'])
  })

  it('escalares seguem fill-only-missing (local presente NÃO é sobrescrito)', async () => {
    const srv = fakeServer({ 'pleitost.settings.mestre': 'true' })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem('pleitost.settings.mestre', 'false')
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    expect(window.localStorage.getItem('pleitost.settings.mestre')).toBe('false')
    expect(added).toEqual([])
  })
})

describe('mapas/caminhos versionados: NEWER-WINS por updatedAt (report c85c98cf)', () => {
  const MAPA = 'pleitost.hexMap.mapa:mundo'
  const GRP = 'pleitost.groupState.Grupo Teste'
  const blob = (cells: unknown, updatedAt: string) => JSON.stringify({ cells, updatedAt })

  it('conta tem marcações MAIS NOVAS → o device com versão velha ADOTA (e recarrega)', async () => {
    const srv = fakeServer({
      [MAPA]: blob([{ col: 46, row: 16, localId: 'X' }], '2026-08-07T10:00:00.000Z'),
    })
    __setUserStateOpsForTests(srv.ops)
    // device tem uma versão ANTIGA (sem a marcação nova)
    window.localStorage.setItem(MAPA, blob([], '2026-08-01T00:00:00.000Z'))
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    // adotou a mais nova (a última atualização vale) e sinalizou reload
    expect(JSON.parse(window.localStorage.getItem(MAPA)!).cells).toHaveLength(1)
    expect(added).toContain(MAPA)
  })

  it('device tem a versão MAIS NOVA → mantém local e SOBE (conta converge)', async () => {
    const srv = fakeServer({
      [MAPA]: blob([], '2026-08-01T00:00:00.000Z'),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      MAPA,
      blob([{ col: 46, row: 16, localId: 'X' }], '2026-08-07T10:00:00.000Z'),
    )
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    // local intacto (não regride) e nada de reload
    expect(JSON.parse(window.localStorage.getItem(MAPA)!).cells).toHaveLength(1)
    expect(added).not.toContain(MAPA)
    // a conta recebe a versão nova
    expect(JSON.parse(srv.rows.get('u1')![MAPA]!).cells).toHaveLength(1)
  })

  it('groupState segue a mesma política newer-wins', async () => {
    const srv = fakeServer({
      [GRP]: JSON.stringify({ hexes: [{ id: 'a', col: 46, row: 16 }], updatedAt: '2026-08-07T10:00:00.000Z' }),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      GRP,
      JSON.stringify({ hexes: [], updatedAt: '2026-08-01T00:00:00.000Z' }),
    )
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    expect(JSON.parse(window.localStorage.getItem(GRP)!).hexes).toHaveLength(1)
    expect(added).toContain(GRP)
  })

  it('chave de mapa só no SERVIDOR hidrata (fill preservado)', async () => {
    const srv = fakeServer({ [MAPA]: blob([{ col: 1, row: 1, localId: 'Y' }], '2026-08-07T10:00:00.000Z') })
    __setUserStateOpsForTests(srv.ops)
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    expect(JSON.parse(window.localStorage.getItem(MAPA)!).cells).toHaveLength(1)
    expect(added).toContain(MAPA)
  })

  it('EMPATE sem carimbo (transição): NINGUÉM clobbera — mantém local, não sobe', async () => {
    // regressão do data-loss: dois blobs SEM updatedAt (ambos 0) e conteúdo
    // distinto não podem sobrescrever um ao outro no login.
    const srv = fakeServer({ [MAPA]: JSON.stringify({ cells: [{ col: 9, row: 9 }] }) }) // sem updatedAt
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(MAPA, JSON.stringify({ cells: [{ col: 1, row: 1, localId: 'MEU' }] })) // sem updatedAt
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    // local intacto (não adotou o remoto) e NÃO subiu (não clobberou a conta)
    expect(JSON.parse(window.localStorage.getItem(MAPA)!).cells[0].localId).toBe('MEU')
    expect(added).not.toContain(MAPA)
    expect(JSON.parse(srv.rows.get('u1')![MAPA]!).cells[0]).toMatchObject({ col: 9, row: 9 })
  })

  it('pleitost.mapaAtlas (regiões) segue newer-wins — conta mais nova é adotada', async () => {
    const ATLAS = 'pleitost.mapaAtlas'
    const atlasBlob = (nomes: string[], updatedAt: string) =>
      JSON.stringify({ regioes: nomes.map((n, i) => ({ id: 'r' + i, nome: n })), pins: [], habilitadas: {}, updatedAt })
    const srv = fakeServer({
      [ATLAS]: atlasBlob(['Magna Pátria', 'Pátria Aurora', 'Mundo Livre'], '2026-08-07T10:00:00.000Z'),
    })
    __setUserStateOpsForTests(srv.ops)
    // celular com regiões ANTIGAS
    window.localStorage.setItem(ATLAS, atlasBlob(['Velha'], '2026-08-01T00:00:00.000Z'))
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    const local = JSON.parse(window.localStorage.getItem(ATLAS)!)
    expect(local.regioes.map((r: { nome: string }) => r.nome)).toEqual([
      'Magna Pátria',
      'Pátria Aurora',
      'Mundo Livre',
    ])
    expect(added).toContain(ATLAS)
  })
})

describe('tombstones: deleção PROPAGA e não ressuscita (report "eles voltam")', () => {
  const T = '__tombstones__'

  it('deletei no celular: a conta ainda tem → NÃO volta local e a remoção SOBE', async () => {
    const srv = fakeServer({
      [ENT]: JSON.stringify({
        'local:Heroi:dup': heroi('local:Heroi:dup'),
        'local:Heroi:fica': heroi('local:Heroi:fica'),
      }),
    })
    __setUserStateOpsForTests(srv.ops)
    // celular já deletou a duplicata (blob sem ela + tombstone)
    window.localStorage.setItem(
      ENT,
      JSON.stringify({
        'local:Heroi:fica': heroi('local:Heroi:fica'),
        [T]: { 'local:Heroi:dup': '2026-07-21T20:00:00.000Z' },
      }),
    )
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    // local segue SEM a duplicata (nada ressuscitou → sem reload)
    const local = JSON.parse(window.localStorage.getItem(ENT)!)
    expect(local['local:Heroi:dup']).toBeUndefined()
    expect(local['local:Heroi:fica']).toBeTruthy()
    // e a CONTA perde a duplicata (deleção propagada) mantendo o tombstone
    const server = JSON.parse(srv.rows.get('u1')![ENT]!)
    expect(server['local:Heroi:dup']).toBeUndefined()
    expect(server[T]['local:Heroi:dup']).toBeTruthy()
  })

  it('deletei no tablet (tombstone na conta): o celular que ainda tem REMOVE ao logar', async () => {
    const srv = fakeServer({
      [ENT]: JSON.stringify({
        'local:Heroi:fica': heroi('local:Heroi:fica'),
        [T]: { 'local:Heroi:dup': '2026-07-21T20:00:00.000Z' },
      }),
    })
    __setUserStateOpsForTests(srv.ops)
    window.localStorage.setItem(
      ENT,
      JSON.stringify({
        'local:Heroi:dup': heroi('local:Heroi:dup'),
        'local:Heroi:fica': heroi('local:Heroi:fica'),
      }),
    )
    const added: string[] = []
    await connectUserStateSync('u1', (a) => added.push(...a))
    // a duplicata some LOCALMENTE (mudou → reload via added)
    const local = JSON.parse(window.localStorage.getItem(ENT)!)
    expect(local['local:Heroi:dup']).toBeUndefined()
    expect(added).toContain(ENT)
    // e NÃO ressuscita na conta
    const server = JSON.parse(srv.rows.get('u1')![ENT]!)
    expect(server['local:Heroi:dup']).toBeUndefined()
  })
})
