// @vitest-environment jsdom
// REDIRECT DO LOGIN GITHUB (#208) — no GitHub Pages de projeto o app vive em
// /pleitost-app/, e `window.location.origin` sozinho mandava o retorno do
// OAuth pra raiz do domínio (404 fora do app). O redirect é origin + BASE do
// Vite, com barra final garantida.
import { describe, expect, it } from 'vitest'
import { oauthRedirectUrl } from '../src/data/session-repo/supabase'

const origin = window.location.origin

describe('oauthRedirectUrl (#208)', () => {
  it('Pages de projeto: origin + /pleitost-app/', () => {
    expect(oauthRedirectUrl('/pleitost-app/')).toBe(`${origin}/pleitost-app/`)
  })

  it('raiz (dev/preview): origin + /', () => {
    expect(oauthRedirectUrl('/')).toBe(`${origin}/`)
  })

  it('base sem barra final ganha a barra', () => {
    expect(oauthRedirectUrl('/pleitost-app')).toBe(`${origin}/pleitost-app/`)
  })

  it('default usa a BASE do build (jsdom: /)', () => {
    expect(oauthRedirectUrl()).toBe(`${origin}/`)
  })
})
