// BOTÃO 📌 MURAL (2026-10-04): o MESTRE da sessão viva põe a imagem que está
// vendo no mural da sessão. Mora em cada figura da aventura (FiguraStrip) e no
// Lightbox do VaultImage. Imagem PÚBLICA (está no manifesto) vai só como alvo;
// imagem CIFRADA (aventura trancada — jogador não tem a chave) é comprimida
// (~1600px JPEG) e sobe pro bucket `mural`. Fora de sessão, sem servidor ou
// pra jogador: não renderiza nada.
import { useState } from 'react'
import { resolveAsset, useAssetIndex } from '../../data/assets'
import { useIsSessionMestre } from '../../data/session-mestre'
import { useSessionRepo } from '../../data/session-repo/provider'
import { getLiveSession, useLiveSelector } from '../../data/session-repo/live-session'
import { MuralBucketAusenteError } from '../../data/session-repo/contract'
import { adicionarAoMural, noMural } from '../../data/session-repo/mural-actions'
import { comprimirImagemBlob } from '../../data/comprimir-imagem'
import { useUrlCheia } from '../compendium/VaultImage'

/** Lado maior da figura cifrada que sobe pro mural. */
const MURAL_MAX_PX = 1600

export function BotaoMural({ target, legenda }: { target: string; legenda?: string }) {
  const { roleMestre } = useIsSessionMestre()
  const repo = useSessionRepo()
  const temSala = useLiveSelector((l) => !!l?.sessionId)
  if (!roleMestre || !repo || !temSala) return null
  return <BotaoMuralAtivo target={target} legenda={legenda} />
}

function BotaoMuralAtivo({ target, legenda }: { target: string; legenda?: string }) {
  const repo = useSessionRepo()!
  const index = useAssetIndex()
  const urlCheia = useUrlCheia(target)
  const mural = useLiveSelector((l) => l?.state?.mural)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const ja = noMural(mural, { target })
  const publica = !!index && !!resolveAsset(index, target)

  const por = async () => {
    const live = getLiveSession()
    if (!live) return
    setErro(null)
    setEnviando(true)
    try {
      if (publica) {
        await adicionarAoMural(repo, live, { target, legenda })
      } else {
        if (!urlCheia) throw new Error('a imagem ainda não carregou')
        const imagem = await comprimirImagemBlob(urlCheia, MURAL_MAX_PX)
        await adicionarAoMural(repo, live, { target, legenda, imagem })
      }
    } catch (err) {
      setErro(err instanceof MuralBucketAusenteError ? err.message : `não deu pra pôr no mural: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnviando(false)
    }
  }

  // imagem cifrada sem bytes ainda (ou índice carregando) → espera
  const pronto = publica || !!urlCheia
  return (
    <span className="mural-botao-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="mural-botao"
        data-mural-botao={ja ? 'no-mural' : 'por'}
        disabled={ja || enviando || !pronto}
        title={ja ? 'Esta imagem já está no mural da sessão' : 'Mostrar esta imagem no mural da sessão'}
        onClick={(e) => {
          e.stopPropagation()
          void por()
        }}
      >
        {ja ? '✓ NO MURAL' : enviando ? '📌 …' : '📌 MURAL'}
      </button>
      {erro ? (
        <span className="mural-botao-erro" role="alert">
          {erro}
        </span>
      ) : null}
    </span>
  )
}
