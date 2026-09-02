// Report 40e680f8 ("text box muito estreito... em monitores muito horizontais"):
// a coluna DETALHES/SESSÃO era fixa em 320px em QUALQUER desktop ≥1100px —
// num ultrawide, ler regra/magia nos DETALHES ficava num tubinho. A largura
// vira responsiva (clamp com vw, mínimo os mesmos 320px de sempre, teto pra
// não virar um paredão) via var --sidebar-right-w, e os FABs ancorados à
// esquerda do painel (create-fab/inv-fab, #258/#63) acompanham por calc()
// em vez do 346px hardcoded (320+26).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const css = fs.readFileSync(path.join(appDir, 'src/styles/app.css'), 'utf8')

describe('sidebar direita responsiva em monitores largos (report 40e680f8)', () => {
  it('na coluna fixa (≥1100px) a largura é a var --sidebar-right-w (clamp com vw)', () => {
    // var definida com clamp: mínimo 320px (comportamento antigo preservado
    // em telas ~1100-1300px) e um teto em px
    expect(css).toMatch(/--sidebar-right-w:\s*clamp\(320px,\s*[\d.]+vw,\s*\d+px\)/)
    // .sidebar-right consome a var dentro do @media da coluna fixa
    const fixa = css.match(/@media \(min-width: 1100px\)\s*\{[^@]*?\.sidebar-right\s*\{[^}]*width:\s*var\(--sidebar-right-w\)/)
    expect(fixa).toBeTruthy()
  })

  it('os FABs recuam pela MESMA var (calc), sem 346px hardcoded', () => {
    expect(css).toMatch(/\.create-fab\s*\{[^}]*right:\s*calc\(var\(--sidebar-right-w\) \+ 26px\)/)
    expect(css).toMatch(/\.inv-fab\s*\{[^}]*right:\s*calc\(var\(--sidebar-right-w\) \+ 26px\)/)
    expect(css).not.toMatch(/right:\s*346px/)
  })
})
