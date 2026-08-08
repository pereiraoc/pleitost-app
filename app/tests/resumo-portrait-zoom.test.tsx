// @vitest-environment jsdom
// Pedido do mestre: a imagem da ficha RESUMO nos Detalhes não abria maior ao
// clicar, como em outros lugares. Agora o retrato é clicável → Lightbox.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ZoomPortrait } from '../src/components/detail/ResumoDetail'

afterEach(cleanup)

describe('ZoomPortrait — retrato do resumo amplia no clique', () => {
  it('com imagem cheia: clicar abre o Lightbox; fechar remove', () => {
    render(
      <ZoomPortrait
        thumb="/vault-data/assets/thumb.png"
        full="/vault-data/assets/full.png"
        alt="Carlos"
        frame={{ width: 52, height: 52 }}
      />,
    )
    // clicável (role button + aria-label)
    const port = screen.getByRole('button', { name: /Ampliar imagem de Carlos/ })
    expect(document.querySelector('[data-lightbox]')).toBeNull()
    fireEvent.click(port)
    // abriu o lightbox com a imagem CHEIA
    const lb = document.querySelector('[data-lightbox]') as HTMLElement
    expect(lb).toBeTruthy()
    expect((lb.querySelector('img') as HTMLImageElement).src).toContain('full.png')
    // clicar no overlay fecha
    fireEvent.click(lb)
    expect(document.querySelector('[data-lightbox]')).toBeNull()
  })

  it('sem imagem cheia (só thumb/local): NÃO é clicável (sem role button)', () => {
    render(<ZoomPortrait thumb="/t.png" full={null} frame={{ width: 52, height: 52 }} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('[data-resumo-portrait]')).toBeTruthy()
  })
})
