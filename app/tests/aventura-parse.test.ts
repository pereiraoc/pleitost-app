// FORMATO DE AVENTURA (F1) — parser puro sobre a Pós Grenal REAL (fixture
// congelada: a vault-data cyberpunk sai CIFRADA, então o texto em claro vive
// em tests/fixtures/aventuras) + aventura só-bounty da fantasia (legado) +
// paridade do parser de leaflet com o do extractor.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../../extractor/parse-frontmatter.mjs'
import { parseLocationBody } from '../../extractor/parse-location-body.mjs'
import { parseAventura, campo, itensDe, refsDe } from '../src/aventura/parse-aventura'
import { aventuraConfig, AVENTURA_CONFIG_DEFAULT } from '../src/aventura/config'
import { parseLeafletBlock } from '../src/map/parse-leaflet'
import type { VaultDoc } from '../src/data/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const vaultDataDir = path.join(path.dirname(here), '..', 'vault-data')

function docFromMd(id: string, file: string): Pick<VaultDoc, 'id' | 'body' | 'frontmatter'> {
  const raw = fs.readFileSync(file, 'utf8')
  const { frontmatter, body } = parseFrontmatter(raw) as { frontmatter: Record<string, unknown>; body: string }
  return { id, body, frontmatter }
}

const POS_GRENAL = docFromMd('Campanhas/Aventuras/Pós Grenal', path.join(here, 'fixtures', 'aventuras', 'Pós Grenal.md'))

describe('parseAventura — Pós Grenal (formato completo)', () => {
  const m = parseAventura(POS_GRENAL)

  it('reconhece o esqueleto e as seções de topo', () => {
    expect(m.temFormato).toBe(true)
    expect(m.resumo.texto).toContain('Gre-Nal de Sangue Frio')
    expect(m.resumo.comoLer).toContain('Ler pra mesa')
    expect(m.resumo.roteiro).toMatch(/^1\. \*\*\[\[#Cena 1 — Saída do Gre-Nal\]\]\*\*/)
    // Estrutura: os `= this.X` são do FM e NÃO viram campo; a regra da casa sim
    expect(m.resumo.estruturaExtra.map((c) => c.label)).toEqual(['Regra da casa desta noite'])
    expect(m.contextoAventura).toContain('### Premissa do grupo')
    expect(m.contextoAventura).toContain('[!gm]')
    expect(m.notasMestre).toContain('### Papéis e objetivos')
  })

  it('2.3 Personagens: 7 registros com campos, frases, leitura e segredo', () => {
    expect(m.personagens.map((p) => p.nome)).toEqual([
      'Nico “Faixa Preta” Ferraz',
      'Arlindo “Bomba” Fagundes',
      'Sargento Valdir Brum',
      'Juninho “Isopor”',
      'Ademar “Cardã” Lemos',
      'Dr. Heitor Pacheco',
      'Dona Zilá',
    ])
    const arlindo = m.personagens[1]!
    expect(arlindo.slug).toBe('arlindo-bomba-fagundes')
    expect(campo(arlindo.campos, 'Papel')).toContain('Patrão relutante')
    expect(campo(arlindo.campos, 'Organização')).toContain('[[Consórcio das Bandeiras]]')
    expect(itensDe(campo(arlindo.campos, 'Frases'))).toHaveLength(3)
    expect(arlindo.leituras).toHaveLength(1)
    expect(arlindo.leituras[0]!.titulo).toBe('🔊 Como descrever')
    expect(arlindo.leituras[0]!.texto).toMatch(/^Ele fala baixo/)
    expect(arlindo.segredos).toHaveLength(1)
    expect(arlindo.segredos[0]).toContain('dois autoinjetores')
    // campo LIVRE (só desta história) entra como campo comum
    const juninho = m.personagens[3]!
    expect(campo(juninho.campos, 'Onde ele está (escolha uma, casada com a opção de Brum)')).toContain('(A)')
    // Entrada aponta pra cena por ref interna
    expect(refsDe(campo(arlindo.campos, 'Entrada'))).toEqual([
      { alvo: 'Cena 3 — Casa da Drenagem', label: 'Cena 3 — Casa da Drenagem', interno: true },
    ])
  })

  it('2.4 Locais: 9 registros (o Mapa NÃO é registro) + leaflet com os markers', () => {
    expect(m.locais.map((l) => l.nome)).toEqual([
      'Estádio Beira-Rio e entorno',
      'Usina do Gasômetro',
      'Galeria dos diques e Estação Férrea de Belas',
      'Casa da Drenagem',
      "Travessia até o Passo D'Areia",
      'Rua Sertório',
      'Retífica Sertório',
      'Boteco da Rua Sertório',
      'Praça das Nogueiras',
    ])
    const casa = m.locais[3]!
    expect(refsDe(campo(casa.campos, 'Atlas'))).toEqual([{ alvo: 'Praia de Belas', label: 'Praia de Belas', interno: false }])
    expect(campo(casa.campos, 'Influências')).toContain('[[Embratel]]')
    expect(m.locais[4]!.leituras).toHaveLength(3) // travessia: 3 blocos 🔊
    expect(m.locais[6]!.leituras.map((l) => l.titulo)).toEqual([
      '🔊 Como descrever (a frente)',
      '🔊 Como descrever (o galpão)',
    ])
    expect(m.mapa).not.toBeNull()
    expect(m.mapa!.image).toBe('Mapa de Porto Alegre RPG.png')
    expect(m.mapa!.markers).toHaveLength(11)
    expect(m.mapa!.markers.filter((k) => k.tipo === 'Local').map((k) => k.nome)).toContain('Retífica Sertório')
    expect(m.mapa!.markers.find((k) => k.nome === 'Praia de Belas')!.maxZoom).toBe(-0.1)
  })

  it('3. Cenas: abertura com campos, 6 cenas numeradas, desfecho com leitura', () => {
    expect(m.abertura!.campos.map((c) => c.label)).toEqual(['Situação', 'Gancho', 'Contrato', 'Início'])
    expect(m.abertura!.corpo).toContain('### Contexto do incidente')
    expect(m.cenas.map((c) => [c.n, c.titulo])).toEqual([
      [1, 'Saída do Gre-Nal'],
      [2, 'Fuga subterrânea'],
      [3, 'Casa da Drenagem'],
      [4, 'Investigação'],
      [5, 'Interlúdio'],
      [6, 'Retífica Sertório'],
    ])
    const c1 = m.cenas[0]!
    expect(c1.slug).toBe('saida-do-gre-nal')
    expect(c1.tipo).toBe('Social')
    expect(c1.locais).toEqual([{ alvo: 'Estádio Beira-Rio e entorno', label: 'Estádio Beira-Rio e entorno', interno: true }])
    expect(c1.personagens.map((p) => p.alvo)).toEqual([
      'Juninho “Isopor”',
      'Sargento Valdir Brum',
      'Nico “Faixa Preta” Ferraz',
      'Dona Zilá',
    ])
    expect(c1.leituras.map((l) => l.titulo)).toEqual(['🔊 Ler pra mesa — a caixa'])
    // o [!info] Cena sai do markdown; o resto fica no fluxo
    const md1 = c1.segmentos.filter((s) => s.kind === 'md').map((s) => (s as { md: string }).md).join('\n')
    expect(md1).not.toContain('[!info] Cena')
    expect(md1).toContain('#### Menu de mini-cenas')
    expect(md1).toContain('[!quote] 🔊 Ler pra mesa — a caixa')
    expect(m.desfecho!.campos.map((c) => c.label)).toEqual(['Decide'])
    expect(m.desfecho!.leituras).toHaveLength(1)
    expect(m.desfecho!.corpo).toContain('### Ganchos')
  })

  it('Cena 6: dois combates com roster real e encounterPath por cena', () => {
    const c6 = m.cenas[5]!
    const combates = c6.segmentos.filter((s) => s.kind === 'combate')
    expect(combates).toHaveLength(2)
    const [f1, f2] = combates as Extract<(typeof combates)[number], { kind: 'combate' }>[]
    expect(f1!.titulo).toBe('Combate — Fase 1: Capangas e operadores')
    expect(f1!.roster.entries).toEqual([
      { sourcePath: 'Arruaceiro', label: 'Arruaceiro', qty: 4 },
      { sourcePath: 'Guarda', label: 'Guarda', qty: 1 },
    ])
    expect(f2!.titulo).toBe('Combate — Fase 2: Chega o mais forte')
    expect(f2!.roster.entries.map((e) => e.label)).toEqual(['Guarda Oficial', 'Guarda'])
    expect(f1!.encounterPath).toBe('Campanhas/Aventuras/Pós Grenal#retifica-sertorio#1')
    expect(f2!.encounterPath).toBe('Campanhas/Aventuras/Pós Grenal#retifica-sertorio#2')
    // markdown entre os fences preservado, em ordem
    const kinds = c6.segmentos.map((s) => s.kind)
    expect(kinds).toEqual(['md', 'combate', 'md', 'combate', 'md'])
    expect(m.combatesSoltos).toHaveLength(0)
  })

  it('nomes de seção vêm do contexto.json quando declarados', () => {
    const cfg = aventuraConfig({
      base: { sempreDisponiveis: [], aventura: { secoes: { ...AVENTURA_CONFIG_DEFAULT.secoes, cenas: '3. Atos' }, tiposDeCena: [], camposListaTrancada: [] } },
    } as never)
    expect(cfg.secoes.cenas).toBe('3. Atos')
    expect(cfg.tiposDeCena).toEqual(AVENTURA_CONFIG_DEFAULT.tiposDeCena)
    expect(parseAventura(POS_GRENAL, cfg).cenas).toHaveLength(0) // "3. Cenas" não é mais a seção
    expect(parseAventura(POS_GRENAL, cfg).temFormato).toBe(true) // "1. Resumo" ainda é
  })
})

describe('parseAventura — notas sem o esqueleto (fantasia, legado)', () => {
  const readJson = (id: string): VaultDoc =>
    JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

  it('aventura só-bounty → temFormato false e tudo vazio', () => {
    const m = parseAventura(readJson('Campanhas/Aventuras/Covil dos Orcs (Safira)'))
    expect(m.temFormato).toBe(false)
    expect(m.cenas).toEqual([])
    expect(m.personagens).toEqual([])
    expect(m.combatesSoltos).toEqual([])
  })

  it('nota com fence solto (Encontro) → combatesSoltos', () => {
    const m = parseAventura(readJson('Campanhas/Aventuras/Emboscada de Goblins (Exemplo Sync)'))
    expect(m.temFormato).toBe(false)
    expect(m.combatesSoltos).toHaveLength(1)
    expect(m.combatesSoltos[0]!.roster.entries.map((e) => `${e.qty}× ${e.label}`)).toEqual(['3× Goblin Soldado', '1× Goblin Piromante'])
    expect(m.combatesSoltos[0]!.encounterPath).toBe('Campanhas/Aventuras/Emboscada de Goblins (Exemplo Sync)#nota#1')
  })
})

describe('parse-leaflet — paridade com o extractor', () => {
  it('o bloco da Pós Grenal parseia igual nos dois lados', () => {
    const app = parseLeafletBlock(POS_GRENAL.body)
    const ext = (parseLocationBody(POS_GRENAL.body, null) as { leaflet: unknown }).leaflet
    expect(app).toEqual(ext)
  })
})
