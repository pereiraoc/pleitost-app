// N4 — REPORT VIRA ISSUE ABERTA PELO PRÓPRIO AUTOR (opção OAuth escolhida pelo
// usuário). Quando o reporter está logado com GitHub, o `provider_token` da
// sessão Supabase (escopo public_repo) permite criar a issue DIRETO na API do
// GitHub, como a conta dele. Quem entrou como convidado (sem GitHub) cai no
// canal anônimo atual (INSERT em bug_reports) — sem regressão.
//
// O provider_token só vem na sessão no SIGNED_IN/refresh e o Supabase não o
// persiste — então o auth-state captura aqui assim que aparece, e guardamos
// também em sessionStorage pra sobreviver a um reload da aba.

const REPO = 'pereiraoc/pleitost-app'
const TOKEN_KEY = 'pleitost.gh.provider_token'
const LOGIN_KEY = 'pleitost.gh.login'

let token: string | null = null
let login: string | null = null

function readStash(): void {
  if (token) return
  try {
    token = sessionStorage.getItem(TOKEN_KEY)
    login = sessionStorage.getItem(LOGIN_KEY)
  } catch {
    /* sem sessionStorage */
  }
}

/** Guarda o provider_token + login do GitHub assim que a sessão os expõe
 *  (chamado pelo auth-state no onAuthStateChange). null limpa (logout). */
export function setGitHubToken(next: string | null, ghLogin?: string | null): void {
  // O Supabase manda provider_token só no evento inicial; num TOKEN_REFRESHED
  // ele vem null. Não sobrescreve um token bom por null — só o logout limpa.
  if (next) {
    token = next
    if (ghLogin) login = ghLogin
    try {
      sessionStorage.setItem(TOKEN_KEY, next)
      if (ghLogin) sessionStorage.setItem(LOGIN_KEY, ghLogin)
    } catch {
      /* sem sessionStorage */
    }
  }
}

/** Esquece o token (logout). */
export function clearGitHubToken(): void {
  token = null
  login = null
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(LOGIN_KEY)
  } catch {
    /* sem sessionStorage */
  }
}

/** O reporter pode abrir a issue como ele mesmo? (logado com GitHub + token.) */
export function canOpenGitHubIssue(): boolean {
  readStash()
  return !!token
}

/** Login GitHub do autor, se conhecido (pra UI: "aberta como @fulano"). */
export function gitHubLogin(): string | null {
  readStash()
  return login
}

export interface IssueCriada {
  number: number
  url: string
}

/** Cria a issue no repo COMO o autor (provider_token). Lança em erro de rede/
 *  escopo/permissão — o chamador faz fallback pro canal anônimo.
 *  `labels`: o GitHub SÓ aplica labels de quem tem push no repo (pra jogador
 *  comum ele descarta silenciosamente) — por isso o corpo também leva o marcador
 *  `pleitost:tipo=...` e um workflow do repo aplica a label por ele. */
export async function openGitHubIssue(title: string, body: string, labels?: string[]): Promise<IssueCriada> {
  readStash()
  if (!token) throw new Error('sem token do GitHub')
  const resp = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body, ...(labels?.length ? { labels } : {}) }),
  })
  if (!resp.ok) {
    // 403/404 costumam ser escopo public_repo faltando; 401 token expirado.
    const txt = await resp.text().catch(() => '')
    throw new Error(`GitHub ${resp.status}: ${txt.slice(0, 200)}`)
  }
  const data = (await resp.json()) as { number: number; html_url: string }
  return { number: data.number, url: data.html_url }
}
