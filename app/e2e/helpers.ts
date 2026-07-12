// Helpers do E2E de tela (plano-mestre F2).
//
// RESTRIÇÃO central: os stores locais (local-entities/hero-store) são módulos
// DENTRO do bundle — não dá pra importá-los no processo do Playwright nem
// alcançá-los por `page.evaluate` (não são expostos em window). A forma
// robusta de "seed" aqui é interagir PELA TELA (ex.: botão "+ Criar Herói"),
// exatamente como o usuário — que é o que o E2E quer cobrir.
//
// ISOLAMENTO: o estado do usuário vive no localStorage E espelhado no arquivo
// app-state.json do servidor (#84, src/data/remote-persist.ts). Limpar só o
// localStorage não basta: o main.tsx re-hidrata do servidor ANTES do 1º
// render. O reset precisa então de dois passos: zerar o /app-state no server
// (PUT com null apaga chave a chave) e limpar o localStorage antes de
// qualquer script da página rodar (addInitScript).
import { expect, type Page } from '@playwright/test'

/** Zera o estado do app (server + browser). Chamar ANTES do 1º goto do teste:
 *  addInitScript só vale pra navegações futuras. */
export async function resetEstadoLocal(page: Page): Promise<void> {
  // 1) server-side: /app-state é um mapa {chave: valor}; PUT com valor null
  //    apaga a chave (contrato em vite/app-state.ts). Sem isso, heróis criados
  //    em rodadas anteriores re-hidratariam pro localStorage limpo.
  const res = await page.request.get('/app-state')
  const estado = (await res.json()) as Record<string, string>
  const limpa = Object.fromEntries(Object.keys(estado).map((k) => [k, null]))
  if (Object.keys(limpa).length > 0) {
    await page.request.put('/app-state', { data: limpa })
  }
  // 2) browser-side: roda antes dos scripts do app em CADA navegação.
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      /* storage indisponível (headless raro) — segue sem limpar */
    }
  })
}

/** Cria um herói local PELA TELA (fluxo real do usuário): HERÓIS → FAB
 *  "+ Criar Herói" → navega pra ficha (/heroi/local:...). Retorna com a ficha
 *  aberta no PERFIL (campo NOME visível). */
export async function criarHeroiPelaTela(page: Page): Promise<void> {
  await page.goto('/herois')
  await page.getByRole('button', { name: '+ Criar Herói' }).click()
  // createLocalEntity navega pra /heroi/<id local> — a ficha abre no PERFIL.
  await expect(page).toHaveURL(/\/heroi\/local/)
  await expect(page.getByLabel('Nome', { exact: true })).toBeVisible()
}
