// Bloco "🔊 Ler pra mesa" — o callout [!quote] do formato de aventura, em
// destaque fora do fluxo (registros de Personagem/Local). Texto sensorial que
// o mestre lê; o markdown interno passa pelo MarkdownBody (wikilinks/itálico).
import type { VaultDoc } from '../../../data/types'
import { MarkdownBody } from '../../../markdown/MarkdownBody'
import type { Leitura } from '../../../aventura/types'

export function LeituraBlock({ leitura, doc }: { leitura: Leitura; doc: VaultDoc }) {
  return (
    <div className="av-leitura" data-av-leitura="">
      <div className="av-leitura-titulo">{leitura.titulo}</div>
      <div className="av-leitura-texto">
        <MarkdownBody doc={{ ...doc, body: leitura.texto }} />
      </div>
    </div>
  )
}

/** Bloco `[!gm]` reconstruído com o MESMO estilo do callout de segredo. */
export function SegredoBlock({ segredo, doc }: { segredo: string; doc: VaultDoc }) {
  return (
    <div className="callout callout-gm av-segredo" data-av-segredo="">
      <MarkdownBody doc={{ ...doc, body: segredo }} />
    </div>
  )
}
