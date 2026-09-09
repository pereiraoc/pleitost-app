// Carrega a IMAGEM do mapa num canvas e indexa as áreas de bairro por cor
// (map/bairros-cor.ts). Fica separado do módulo puro porque só isto depende de
// DOM/canvas: o índice em si é testável sobre um buffer.
//
// O canvas é temporário (só pra ler os px) e o índice fica em cache por
// imagem+sementes — a leitura de ~1 Mpx roda uma vez por mapa, não por render.
// Ambiente sem canvas (jsdom dos testes) ou imagem de outra origem (o
// getImageData falha em canvas contaminado) devolvem null: aí o mapa segue
// funcionando só com os pinos.
import { useEffect, useState } from 'react'
import { indexarBairros, type IndiceBairros, type SementeBairro } from './bairros-cor'

const cache = new Map<string, Promise<IndiceBairros | null>>()

function chave(url: string, sementes: readonly SementeBairro[]): string {
  return `${url}|${sementes.map((s) => `${s.nome}@${s.fx.toFixed(5)},${s.fy.toFixed(5)}`).join(';')}`
}

async function carregar(
  url: string,
  sementes: readonly SementeBairro[],
): Promise<IndiceBairros | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const img = new Image()
  await new Promise<void>((ok, erro) => {
    img.onload = () => ok()
    img.onerror = () => erro(new Error(`mapa não carregou: ${url}`))
    img.src = url
  })
  const largura = img.naturalWidth
  const altura = img.naturalHeight
  if (!largura || !altura) return null
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const dados = ctx.getImageData(0, 0, largura, altura)
  return indexarBairros(dados.data, largura, altura, sementes)
}

/** Índice das áreas de bairro do mapa, ou null (carregando / indisponível). */
export function useIndiceBairros(
  url: string | null,
  sementes: readonly SementeBairro[],
): IndiceBairros | null {
  const id = url && sementes.length ? chave(url, sementes) : null
  const [idx, setIdx] = useState<IndiceBairros | null>(null)
  useEffect(() => {
    setIdx(null)
    if (!id || !url) return
    let vivo = true
    let p = cache.get(id)
    if (!p) {
      p = carregar(url, sementes).catch(() => null)
      cache.set(id, p)
    }
    p.then((r) => {
      if (vivo) setIdx(r)
    })
    return () => {
      vivo = false
    }
    // `sementes` vem de useMemo no chamador; `id` já resume o conteúdo dela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, url])
  return idx
}

/** SÓ testes. */
export function __resetIndiceBairrosCache(): void {
  cache.clear()
}
