// @vitest-environment jsdom
// GUARDA DE RESKIN (#519, report 2026-08-30): no modo cyberpunk NENHUM nome
// de fantasia pode aparecer nas superfícies de display. Três camadas:
//  1. varredura DATA-LEVEL de todos os basenames do Sistema herdado pelo
//     reskin real do mundo (pega buraco no mapa do Contexto-Def);
//  2. render do bloco ```class-roles``` da página de Classes (o vazamento
//     reportado: builds com papéis/estrelinhas em nome de fantasia);
//  3. navLabel (cards de pasta + breadcrumb do compêndio).
// Skip quando vault-data-cyberpunk não foi extraído (gitignored, como o C9).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setActiveContexto, reskinName, reskinText } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import { ClassRolesFence } from '../src/markdown/class-roles/ClassRolesFence'
import { navLabel } from '../src/components/compendium/compendio-registry'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fantasiaDir = path.join(path.dirname(appDir), 'vault-data')
const cybContexto = path.join(path.dirname(appDir), 'vault-data-cyberpunk', 'contexto.json')

// Vocabulário que NÃO pode vazar em display no POA 1987. Só termos DECIDIDOS
// no Contexto-Def (pendências como a leva caçada→meta entram quando o mapa
// ganhar as chaves).
const PROIBIDOS = [
  'Animista', 'Arcanista', 'Bardo', 'Caçador', 'Comandante', 'Druida',
  'Guerreiro', 'Ladino', 'Mago', 'Monge',
  'Elementalista', 'Arcanologista', 'Grão-Arcanista', 'Trovador', 'Menestrel',
  'Desbravador', 'Sentinela', 'Senhor-da-Guerra', 'Hierofante', 'Arquidruida',
  'Entropista', 'Teurgo', 'Bruxo', 'Espiritualista', 'Domador', 'Rastreador',
  'Companheiro Animal', 'Poção', 'Magia', 'Magias', 'Mágica', 'Mágico',
  'Feral', 'Ferais', 'Imbuição', 'Pergaminho',
  // leva caçada→meta do Executivo (aprovada 2026-08-30). 'Presa'/'Presas'
  // ficam FORA de propósito: são vocabulário legítimo nos dois mundos
  // (Presas = arma natural/dentes; Abater/Esmagar Presa = registro de
  // predador do Nóia em Forma Mutante — a leva meta é só do Executivo).
  'Caçada', 'Emboscada', 'Conjuração',
  // armas (proposta aprovada 2026-09-01 — Decreto das Armas Frias). 'Lança',
  // 'Machado', 'Arco' ficam FORA: sobrevivem em nomes mantidos (Lança de
  // Andaime, Machado de Bombeiro, Arco de Caça).
  'Espada', 'Adaga', 'Besta', 'Bestas', 'Rapieira', 'Montante',
  'Alabarda', 'Azagaia', 'Alfange', 'Bordão', 'Manopla', 'Tacape', 'Broquel',
  'Malho', 'Funda', 'Obra-prima',
  // #540 — A Caixinha: o freelancer do POA é Contratado.
  'Aventureiro', 'Aventureiros',
]
const RE_PROIBIDO = new RegExp(
  `(?<![\\p{L}\\p{N}])(${PROIBIDOS.join('|')})(?![\\p{L}\\p{N}])`,
  'u',
)

describe.skipIf(!fs.existsSync(cybContexto))('guarda de reskin — modo cyberpunk', () => {
  beforeAll(() => {
    const def = JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef
    setActiveContexto(def)
  })
  afterAll(() => setActiveContexto(null))

  it('nenhum basename do Sistema herdado exibe vocabulário de fantasia', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(fantasiaDir, 'index.json'), 'utf8'))
    const def = JSON.parse(fs.readFileSync(cybContexto, 'utf8')) as ContextoDef
    // itens INDISPONÍVEIS no mundo nunca exibem (fora do catálogo) — ex.:
    // Garras do Rei-Mago, cuja exceção de cascata preserva o nome canônico.
    const fora = new Set(def.disponibilidade.indisponiveis)
    const vazados: string[] = []
    for (const d of idx.docs) {
      if (d.kind !== 'content' || !d.basename) continue
      if (fora.has(d.basename)) continue
      if (!d.id.startsWith('Sistema/')) continue // conteúdo de mundo não herda
      const shown = reskinName(d.basename)
      const hit = shown.match(RE_PROIBIDO)
      if (hit) vazados.push(`${d.id} → "${shown}" (${hit[1]})`)
    }
    expect(vazados).toEqual([])
  })

  it('class-roles (página de Classes) reskina os builds com papéis/estrelinhas', () => {
    // Linhas REAIS de Sistema/Criação de Personagem/Classes/Classes.md.
    const code = [
      '["Arcanista Espiritualista", { "Líder": 3 }],',
      '["Bardo Luta Artística Inspirador", { "Abatedor": 1, "Líder": 2 }],',
      '["Druida Xamã", { "Vanguarda": 1, "Controlador": 2 }],',
      '["Caçador Domador", { "Abatedor": 2, "Líder": 1 }],',
    ].join('\n')
    const { container } = render(<ClassRolesFence code={code} node={undefined} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Tecnologista Programador')
    expect(texto).toContain('Nóia Xamã')
    expect(texto).toContain('Executivo Gestor')
    expect(texto).not.toMatch(RE_PROIBIDO)
  })

  it('navLabel reskina pastas do compêndio (Companheiros Animais → Empregados)', () => {
    expect(navLabel('Sistema/Criaturas/Companheiros Animais')).toBe('Empregados')
    expect(reskinText('Magias Arcanas')).not.toMatch(RE_PROIBIDO)
  })
})

describe('guarda de reskin — fantasia é identidade', () => {
  it('sem contexto ativo, reskinName/navLabel não alteram nada', () => {
    setActiveContexto(null)
    expect(reskinName('Arcanista')).toBe('Arcanista')
    expect(navLabel('Sistema/Criaturas/Companheiros Animais')).toBe('Companheiros Animais')
  })
})
