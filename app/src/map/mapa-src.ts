import { useCallback, useState } from 'react'
import { assetUrl, medioUrl, preferThumb } from '../data/assets'
import type { AssetEntry } from '../data/types'

// Qual imagem o viewer de mapa mostra (#572 "pinch lerdo"): o mapa do Mundo
// Livre tem 4352×5888 px (26 Mpx) — acima do limite de textura de GPU de
// celular (4096 px), e o navegador re-decodifica/re-rasteriza um bitmap desse
// tamanho a cada escala nova da pinça. Imagem GIGANTE usa SÓ a versão MÉDIA
// (lado maior 4000 px, gerada no deploy), sempre — sem trocar de src no gesto
// e sem camada de detalhe por cima: no trace do site publicado (Pixel 7,
// CPU 4×) cada variante com a cheia entrando/saindo custava um buraco de
// 0,3–0,9 s sem quadros exatamente na fronteira do gesto, e a cheia só rende
// mais resolução que a média a partir de ~2,4× no celular (e nem isso no
// desktop). Sem médio (dev, ou imagem que não é gigante → 404 → onError) a
// cheia é a imagem, e fica.
export function srcDoMapa(args: { cheia: string; medio: string | null; medioFalhou: boolean; prod: boolean }): string {
  const { cheia, medio, medioFalhou, prod } = args
  return !prod || !medio || medioFalhou ? cheia : medio
}

/** Src da imagem de mapa + fallback: a MÉDIA quando existe (produção, imagem
 *  gigante), senão a cheia; o onError do médio (404 = imagem sem versão média)
 *  cai na cheia e fica. Um hook por imagem (mapa e overlay têm o seu). */
export function useSrcDoMapa(entry: AssetEntry | null): { src: string | null; onError: () => void } {
  const [medioFalhou, setMedioFalhou] = useState(false)
  const src = entry
    ? srcDoMapa({ cheia: assetUrl(entry), medio: medioUrl(entry), medioFalhou, prod: preferThumb })
    : null
  const onError = useCallback(() => {
    // só o MÉDIO cai pro cheio; a cheia falhando não tem pra onde ir
    if (entry && !medioFalhou && preferThumb) setMedioFalhou(true)
  }, [entry, medioFalhou])
  return { src, onError }
}
