// SIDEBAR DIREITA — contexto de DETALHES (#87). Componentes empurram um alvo
// (doc do compêndio, local do mapa, comércio) que a RightSidebar renderiza na
// face DETALHES, SEM sair da tela atual. Pilha simples pra "voltar". Modelo do
// TipCtx (contexto local via Provider), não um store global.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/** Alvo de detalhe: um doc do compêndio, um LOCAL do mapa, o COMÉRCIO dele,
 *  ou a ficha RESUMO de um personagem (#180 — modo Resumo do autosheet). */
export interface DetailTarget {
  kind: 'doc' | 'local' | 'comercio' | 'resumo' | 'resumo-sessao'
  id: string
}

export interface DetailCtl {
  target: DetailTarget | null
  open: (t: DetailTarget) => void
  close: () => void
  back: () => void
  canBack: boolean
}

const DetailContext = createContext<DetailCtl | null>(null)

export function DetailProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DetailTarget[]>([])

  const open = useCallback((t: DetailTarget) => {
    setStack((s) => {
      const top = s[s.length - 1]
      if (top && top.kind === t.kind && top.id === t.id) return s // já é o topo
      return [...s, t]
    })
  }, [])
  const close = useCallback(() => setStack([]), [])
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), [])

  const ctl = useMemo<DetailCtl>(
    () => ({
      target: stack[stack.length - 1] ?? null,
      open,
      close,
      back,
      canBack: stack.length > 1,
    }),
    [stack, open, close, back],
  )
  return <DetailContext.Provider value={ctl}>{children}</DetailContext.Provider>
}

/** null quando fora do provider (ex.: link no compêndio sem sidebar) —
 *  o caller cai no comportamento de navegar (<Link>). */
export function useDetail(): DetailCtl | null {
  return useContext(DetailContext)
}
