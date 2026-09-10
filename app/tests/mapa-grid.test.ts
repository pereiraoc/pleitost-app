// MAPA DE MESA COM GRID (2026-09-10): o item de `**Mapas de mesa:**` pode
// trazer, além do embed (o que a tela mostra), um LINK simples de imagem — a
// versão com grid, que só o papel usa. A escala física vem do próprio PNG
// (chunk pHYs): é ela que faz 1 quadrado sair com 25 mm no A3.
import { describe, expect, it } from 'vitest'
import { figurasDoCampo } from '../src/aventura/parse-aventura'
import { tamanhoFisicoPng } from '../src/print/escala-fisica'

describe('figurasDoCampo — versão com grid no item do mapa', () => {
  it('embed = mapa de tela; link simples de imagem no mesmo item = grid', () => {
    const valor = [
      '- ![[07 — térreo.png|Térreo]] · [[07 — térreo — grid 25 mm.png|grid 25 mm]]',
      '- ![[10 — boteco.png|Boteco]]',
    ].join('\n')
    expect(figurasDoCampo(valor)).toEqual([
      { target: '07 — térreo.png', legenda: 'Térreo', grid: { target: '07 — térreo — grid 25 mm.png', legenda: 'grid 25 mm' } },
      { target: '10 — boteco.png', legenda: 'Boteco' },
    ])
  })

  it('link que não é imagem não vira grid; item só com link (sem embed) não é mapa', () => {
    expect(figurasDoCampo('- ![[a.png|A]] · [[Rua Sertório]]')).toEqual([{ target: 'a.png', legenda: 'A' }])
    expect(figurasDoCampo('- [[a — grid.png|grid]]')).toEqual([])
  })
})

/** PNG mínimo: assinatura + IHDR + (pHYs) + IDAT vazio + IEND, CRC zerado. */
function png(w: number, h: number, phys: { ppm: number; unit: number } | null, physDepoisDoIdat = false): Uint8Array {
  const chunk = (tipo: string, dados: number[]) => {
    const len = dados.length
    return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...tipo].map((c) => c.charCodeAt(0)), ...dados, 0, 0, 0, 0]
  }
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  const ihdr = chunk('IHDR', [...u32(w), ...u32(h), 8, 2, 0, 0, 0])
  const p = phys ? chunk('pHYs', [...u32(phys.ppm), ...u32(phys.ppm), phys.unit]) : []
  const idat = chunk('IDAT', [])
  const iend = chunk('IEND', [])
  const corpo = physDepoisDoIdat ? [...ihdr, ...idat, ...p, ...iend] : [...ihdr, ...p, ...idat, ...iend]
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...corpo])
}

describe('tamanhoFisicoPng — escala física gravada no PNG', () => {
  it('pHYs em pixels por metro → largura/altura em mm', () => {
    const t = tamanhoFisicoPng(png(1513, 1040, { ppm: 4035, unit: 1 }))
    expect(t!.larguraMm).toBeCloseTo((1513 / 4035) * 1000, 6)
    expect(t!.alturaMm).toBeCloseTo((1040 / 4035) * 1000, 6)
  })

  it('sem escala física utilizável → null (o papel ajusta à folha)', () => {
    expect(tamanhoFisicoPng(png(1513, 1040, null))).toBeNull()
    expect(tamanhoFisicoPng(png(1513, 1040, { ppm: 4035, unit: 0 }))).toBeNull() // só proporção, sem metro
    expect(tamanhoFisicoPng(png(1513, 1040, { ppm: 4035, unit: 1 }, true))).toBeNull() // pHYs depois do IDAT não vale
    expect(tamanhoFisicoPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull()
  })
})
