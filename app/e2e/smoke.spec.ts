// Smoke E2E de TELA (plano-mestre F2): browser real contra o build servido
// pelo `vite preview` (webServer do playwright.config.ts). Tudo aqui é lido
// DA TELA (texto/ARIA), nunca de estado interno — DoD do plano-mestre.
import { expect, test } from '@playwright/test'
import { criarHeroiPelaTela, resetEstadoLocal } from './helpers'

test.describe('smoke de tela', () => {
  test('criar herói pela tela e ver o nome refletir na topbar', async ({ page }) => {
    await resetEstadoLocal(page)
    await criarHeroiPelaTela(page)

    // Digita o NOME no PERFIL (campo aria-label="Nome", fonte FM `nome` —
    // PerfilTab.tsx). O valor nasce "Novo Herói" (basename da entidade local).
    const nome = page.getByLabel('Nome', { exact: true })
    await expect(nome).toHaveValue('Novo Herói')
    await nome.fill('Zaltar Brumado')

    // REFLEXO NA TOPBAR: o nome do herói aparece na topbar pelo avatar do
    // seletor rápido (TopbarFicha → AvatarBox), que sem retrato renderiza as
    // INICIAIS de heroNome(doc) — FM `nome` recém-digitado. "Zaltar Brumado"
    // → "ZB" (initials() de CreaturesPages). É a projeção do nome que a
    // topbar renderiza como texto; lida da tela, cruzando Perfil → topbar.
    await expect(page.getByTestId('topbar-avatar')).toContainText('ZB')

    // O campo segue com o valor digitado (write-through no store local).
    await expect(nome).toHaveValue('Zaltar Brumado')
  })

  test('compêndio lista as seções com contagem', async ({ page }) => {
    await resetEstadoLocal(page)
    await page.goto('/compendio')

    // Raiz do compêndio: cards das seções registradas (sections.ts). O card
    // "Sistema" existe e mostra a contagem de docs (type-card-count) — um
    // inteiro > 0 lido da tela (a vault extraída nunca vem vazia).
    const cardSistema = page.locator('.type-card', { hasText: 'Sistema' })
    await expect(cardSistema).toBeVisible()
    const contagem = await cardSistema.locator('.type-card-count').innerText()
    expect(Number(contagem)).toBeGreaterThan(0)
  })
})
