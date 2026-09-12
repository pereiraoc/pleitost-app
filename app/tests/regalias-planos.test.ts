// Report do mestre (2026-09-12): a ficha oferecia "TRI Cruzados" — o termo
// `Ouro → Cruzados` (o dinheiro do mundo) comia o nome do PLANO "TRI Ouro", que
// não existe em lugar nenhum. Duas guardas, as duas sobre o dataset real:
//  1. nenhum nome de nota de Recurso é reescrito pela cascata do mundo (o
//     produto não é vocabulário — quando for, entra em `reskin.excecoes`);
//  2. todo wikilink da nota de Regalias de Classe resolve, porque é de lá que
//     sai o que o jogador vai procurar pra marcar na ficha.
import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setActiveContexto, reskinName } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyberDir, 'contexto.json'))
const REGALIAS_ID = 'Contexto/Histórias/Contexto Atual/Economia e Sobrevivência/Regalias de Classe'

describe.skipIf(!temDataset)('planos concedidos pelas regalias', () => {
  let manifest: IndexManifest
  let def: ContextoDef
  beforeAll(() => {
    manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
    def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
    setActiveContexto(def)
  })
  afterAll(() => setActiveContexto(null))

  it('a cascata do mundo não reescreve nome de nota de Recurso', () => {
    const mexidos = manifest.docs
      .filter((d) => d.type === 'Recurso' && d.basename)
      .map((d) => [d.basename!, reskinName(d.basename!)] as const)
      .filter(([nome, exibido]) => nome !== exibido)
      .map(([nome, exibido]) => `${nome} → ${exibido}`)
    expect(mexidos).toEqual([])
  })

  it('todo wikilink das Regalias de Classe aponta pra uma nota que existe', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(cyberDir, `${REGALIAS_ID}.json`), 'utf8')) as {
      body?: string
      content?: string
    }
    const corpo = doc.body ?? doc.content ?? ''
    expect(corpo.length).toBeGreaterThan(0)
    const nomes = new Set(manifest.docs.map((d) => d.basename).filter(Boolean) as string[])
    const quebrados = new Set<string>()
    for (const m of corpo.matchAll(/\[\[([^\]|#]+)/g)) {
      // a tabela escapa o pipe do alias (`[[Caçador\|Executivo]]`)
      const alvo = m[1]!.replace(/\\$/, '').trim()
      if (!alvo || alvo.endsWith('.png')) continue
      if (!nomes.has(alvo)) quebrados.add(alvo)
    }
    expect([...quebrados]).toEqual([])
  })

  it('todo plano do mês citado nas regalias é Estilo de Vida (escolhível na ficha)', () => {
    // Os nomes que a nota cita como plano concedido — um por eixo e degrau.
    const CONCEDIDOS = [
      'Kitnet', 'TRI Ouro', 'Carro com Motorista',
      'Cantina', 'Lancheria', 'Churrascaria',
      'Barraco', 'Quarto', 'Marmita',
      'TRI Bronze', 'TRI Platina', 'Apartamento', 'Sem Endereço',
    ]
    const porNome = new Map(manifest.docs.filter((d) => d.basename).map((d) => [d.basename!, d]))
    const naoSelecionavel: string[] = []
    for (const nome of CONCEDIDOS) {
      const entrada = porNome.get(nome)
      if (!entrada) {
        naoSelecionavel.push(`${nome}: nota não existe`)
        continue
      }
      const fm = (JSON.parse(fs.readFileSync(path.join(cyberDir, `${entrada.id}.json`), 'utf8')) as {
        frontmatter?: Record<string, unknown>
      }).frontmatter
      const tipo = String(fm?.['Tipo'] ?? '')
      if (tipo !== def.recursos!.tipos.estilo) naoSelecionavel.push(`${nome}: Tipo "${tipo}"`)
    }
    expect(naoSelecionavel).toEqual([])
  })
})
