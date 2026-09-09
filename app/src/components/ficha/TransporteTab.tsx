// Aba TRANSPORTE da FICHA (2026-09-08) — a malha de transportes como mapa de
// metrô, com o cartão TRI do herói. Tudo que o painel oferece (filtro,
// planejador, legenda, parada a parada) vive em transporte/MalhaPainel, que o
// Atlas reusa desenhando as mesmas linhas sobre o mapa real de Porto Alegre;
// aqui só se escolhe o MAPA (esquemático) e se entrega o plano do herói.
import { useMemo } from 'react'
import type { VaultDoc } from '../../data/types'
import { useHeroModel } from '../../data/useHeroModel'
import { recursosDoFm } from '../../recursos/hero-recursos'
import { MalhaPainel } from '../../transporte/MalhaPainel'
import { MalhaMap } from './MalhaMap'

export function TransporteTab({ doc }: { doc: VaultDoc }) {
  const model = useHeroModel(doc, 'transporte')
  const estado = useMemo(() => recursosDoFm(model.fm), [model.fm])
  return (
    <MalhaPainel
      heroi={{ nivel: 0, plano: estado.estilos.transporte }}
      mapa={(ctx) => (
        <MalhaMap
          desenho={ctx.desenho}
          bairros={ctx.bairros}
          selecionada={ctx.selecionada}
          destaque={ctx.destaque}
          bloqueadas={ctx.bloqueadas}
          onSelecionar={ctx.onSelecionar}
          onParada={ctx.onParada}
        />
      )}
    />
  )
}
