// Traços Elementais EM DESENVOLVIMENTO (pedido 2026-08-15): o corpo dos docs
// "Traço Elemental d? X" renderiza só até a barra horizontal — a tabela
// dataview dos traços fica oculta até o sistema existir. Integração sobre o
// doc REAL da database (fixture viva: vault-data).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { truncarCorpoEmDesenvolvimento } from '../src/markdown/em-desenvolvimento'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultData = path.join(path.dirname(appDir), 'vault-data')
const load = (rel: string) => JSON.parse(fs.readFileSync(path.join(vaultData, rel), 'utf8'))

describe('Traços Elementais em desenvolvimento — corpo até a barra horizontal', () => {
  it('Traço Elemental do Vento: mantém o texto de personalidade, esconde a tabela', () => {
    const doc = load(
      'Sistema/Criação de Personagem/Sintonia/Traços Elementais/Traço Elemental do Vento/Traço Elemental do Vento.json',
    )
    const corpo = truncarCorpoEmDesenvolvimento(doc, doc.body)
    expect(corpo).toContain('gregários, amigáveis e compreensivos')
    expect(corpo).not.toContain('dataview')
    expect(corpo).not.toContain('Traços Elemental')
  })

  it('cobre os quatro elementos', () => {
    for (const el of ['da Água', 'da Terra', 'do Fogo', 'do Vento']) {
      const doc = load(
        `Sistema/Criação de Personagem/Sintonia/Traços Elementais/Traço Elemental ${el}/Traço Elemental ${el}.json`,
      )
      expect(truncarCorpoEmDesenvolvimento(doc, doc.body)).not.toContain('dataview')
    }
  })

  it('NÃO mexe em outros docs (folder-note Traços Elementais e docs comuns)', () => {
    const folder = load('Sistema/Criação de Personagem/Sintonia/Traços Elementais/Traços Elementais.json')
    expect(truncarCorpoEmDesenvolvimento(folder, folder.body)).toBe(folder.body)
    const outro = { type: 'Regra', basename: 'Qualquer' }
    const corpo = 'texto\n\n---\n\ndepois da barra'
    expect(truncarCorpoEmDesenvolvimento(outro, corpo)).toBe(corpo)
  })
})
