// Sugestão 5130ef72 (2026-10-09, @pereiraoc): o botão de mostrar a barra
// lateral direita usava "⧉", que lê como COPIAR. Agora é um SVG de janela com
// o painel da direita destacado — trava contra o glifo voltar.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/components/layout/AppShell.tsx'),
  'utf8',
)
describe('ícone do toggle da barra lateral direita', () => {
  it('é o desenho de painel direito, não o glifo de copiar', () => {
    const botao = src.slice(src.indexOf('className="right-toggle"'), src.indexOf('</button>', src.indexOf('className="right-toggle"')))
    expect(botao).toContain('data-icon="painel-direito"')
    expect(botao.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')).not.toContain('⧉')
  })
})
