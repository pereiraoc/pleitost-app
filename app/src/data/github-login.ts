// LOGIN DO GITHUB de quem está logado (2026-10-08) — só IDENTIDADE: o login
// pede o escopo padrão do GitHub (sem `public_repo`; o pedido de "ler e
// escrever todos os repositórios públicos" assustava). Serve pra ATRIBUIR o
// report (contexto.reporter na tabela bug_reports); a issue é aberta na
// triagem. Guardado em sessionStorage pra sobreviver a um reload da aba.

const LOGIN_KEY = 'pleitost.gh.login'

let login: string | null = null

function readStash(): void {
  if (login) return
  try {
    login = sessionStorage.getItem(LOGIN_KEY)
  } catch {
    /* sem sessionStorage */
  }
}

/** Guarda o login assim que a sessão o expõe; null não apaga (só o logout). */
export function setGitHubLogin(ghLogin: string | null | undefined): void {
  if (!ghLogin) return
  login = ghLogin
  try {
    sessionStorage.setItem(LOGIN_KEY, ghLogin)
  } catch {
    /* sem sessionStorage */
  }
}

/** Esquece o login (logout). */
export function clearGitHubLogin(): void {
  login = null
  try {
    sessionStorage.removeItem(LOGIN_KEY)
    // token do canal antigo (issue direta), caso tenha ficado na aba
    sessionStorage.removeItem('pleitost.gh.provider_token')
  } catch {
    /* sem sessionStorage */
  }
}

/** Login GitHub de quem está logado, se conhecido. */
export function gitHubLogin(): string | null {
  readStash()
  return login
}
