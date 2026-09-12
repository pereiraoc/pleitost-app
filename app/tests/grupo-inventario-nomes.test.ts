// @vitest-environment node
// INVENTÁRIO DA FICHA DE GRUPO (report 2026-09-12: "a ficha de grupo tem
// coisas erradas de nomes na parte de Inventário"). O painel só existe na
// MESA de uma sessão, então a régua aqui é a peça pura: o nome de cada item
// do pool sai no idioma do mundo, e dinheiro sai no símbolo do mundo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { itemNome } from '../src/grupo/PanelInventario'
import { reskinName, setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { GroupInventoryItem } from '../src/data/session-repo/contract'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyb = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')
const temMundo = fs.existsSync(cyb)
const item = (o: object) => o as unknown as GroupInventoryItem

describe.skipIf(!temMundo)('nomes do inventário do grupo', () => {
  const def = JSON.parse(fs.readFileSync(cyb, 'utf8')) as ContextoDef
  afterEach(() => setActiveContexto(null))

  it('o item do pool usa o nome do mundo ativo', () => {
    const adaga = item({ id: 'i1', docId: 'Sistema/Equipamento/Armas/Armas Simples/Adaga', nome: 'Adaga' })
    setActiveContexto(null)
    expect(itemNome(adaga)).toBe('Adaga')
    setActiveContexto(def)
    expect(itemNome(adaga)).toBe(reskinName('Adaga'))
    expect(itemNome(adaga)).not.toBe('Adaga')
  })

  it('armadura e escudo do pool idem', () => {
    setActiveContexto(def)
    const armadura = item({ id: 'i2', kind: 'armadura', nome: 'Armadura Leve' })
    expect(itemNome(armadura)).toBe(reskinName('Armadura Leve'))
  })

  it('dinheiro sai no símbolo do mundo (Cz$, não PO)', () => {
    setActiveContexto(def)
    const ouro = item({ id: 'i3', kind: 'ouro', qtd: 3 })
    expect(itemNome(ouro)).toContain('Cz$')
    expect(itemNome(ouro)).not.toContain('PO')
  })
})
