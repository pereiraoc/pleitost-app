// REFERÊNCIA INTERNA `[[#Alvo]]` (2026-09-10) — wikilink pra uma âncora da
// PRÓPRIA nota. O resolver do catálogo não acha doc com esse nome, então até
// aqui ela caía em texto puro: na aventura, onde os registros de Personagem e
// Local vivem dentro da nota, cada `[[#Nico “Faixa Preta” Ferraz]]` da prosa
// era palavra morta (report 2026-09-10 — "tu fala de um NPC mas não coloca um
// link pra clicar e ver mais sobre ele").
//
// Quem sabe o que fazer com a âncora é a TELA (só a aventura sabe onde está o
// registro), então ela instala um handler por contexto. Sem handler, o link
// volta a ser texto — nenhuma outra nota muda de comportamento.
import { createContext, useContext, type ReactNode } from 'react'

/** Renderiza a referência interna; devolver null cai no texto puro. */
export type RefInternaRender = (alvo: string, label: string) => ReactNode

const Ctx = createContext<RefInternaRender | null>(null)

export function RefInternaProvider({
  render,
  children,
}: {
  render: RefInternaRender
  children: ReactNode
}) {
  return <Ctx.Provider value={render}>{children}</Ctx.Provider>
}

export function useRefInterna(): RefInternaRender | null {
  return useContext(Ctx)
}
