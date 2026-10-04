// TIRA DE FIGURAS de um registro/cena da aventura: os embeds de imagem da nota
// (`![[01 — Nico.png|Nico]]`) mostrados como miniaturas com legenda, ampliáveis
// no clique (o mesmo lightbox do resto do compêndio). Numa aventura TRANCADA
// os bytes vêm cifrados e o VaultImage só acha a figura depois de destravar —
// nada aqui sabe de senha. O mestre da sessão viva tem o 📌 MURAL por figura.
import type { Figura } from '../../../aventura/types'
import { VaultImage } from '../VaultImage'
import { BotaoMural } from '../../sessao/BotaoMural'

export function FiguraStrip({ figuras }: { figuras: readonly Figura[] }) {
  if (!figuras.length) return null
  return (
    <div className="av-figuras" data-av-figuras={figuras.length}>
      {figuras.map((f, i) => (
        <figure key={`${f.target}-${i}`} className="av-figura" data-av-figura={f.target}>
          <VaultImage target={f.target} className="av-figura-img" zoom thumb legenda={f.legenda ?? undefined} />
          {f.legenda ? <figcaption className="av-figura-legenda">{f.legenda}</figcaption> : null}
          {/* só o MESTRE da sessão viva vê (BotaoMural decide) */}
          <BotaoMural target={f.target} legenda={f.legenda ?? undefined} />
        </figure>
      ))}
    </div>
  )
}
