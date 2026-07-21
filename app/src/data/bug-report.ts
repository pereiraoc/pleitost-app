// REPORTAR BUG (#220) — req do usuário: "Quero que qualquer um consiga
// fazer". Dois canais:
//  • autor logado com GitHub (N4) → a issue é aberta DIRETO no repo, COMO ele,
//    via provider_token (github-issue.ts);
//  • convidado / GitHub indisponível → INSERT anônimo na tabela bug_reports do
//    Supabase (RLS: anon/authenticated só INSEREM; leitura só no dashboard).
// Schema em supabase/bug-reports.sql.
import { supabaseClient } from './session-repo/supabase'
import { APP_VERSION } from '../pwa-update'
import { getLogs, isDebugOn, type DebugEntry } from './debug-log'
import { canOpenGitHubIssue, gitHubLogin, openGitHubIssue } from './github-issue'

/** Tipo do report — escolhido pelo autor no modal. Vira a label da issue
 *  (bug/enhancement), pra priorizar bugs primeiro. */
export type TipoReport = 'bug' | 'sugestao'

export interface BugReport {
  texto: string
  tipo: TipoReport
  /** Contexto automático que ajuda a reproduzir (rota, versão, navegador).
   *  `logs` só vem preenchido quando o modo debug estava ligado — o rastro dos
   *  pontos instrumentados antes do bug, pra entrar junto na issue. */
  contexto: { pagina: string; versao: string; userAgent: string; tipo: TipoReport; logs?: DebugEntry[] }
}

/** O que aconteceu com o report — a UI usa pra dar o retorno certo. */
export type ResultadoReport =
  | { canal: 'github'; url: string; number: number }
  | { canal: 'anon' }

type Sender = (r: BugReport) => Promise<void>
// Injeção pros testes (o InMemory não tem tabela) — produção usa o Supabase.
let sender: Sender | null = null
export function __setBugSenderForTests(s: Sender | null): void {
  sender = s
}

/** Título da issue = 1ª linha não-vazia do texto, enxuta. */
function tituloDe(texto: string): string {
  const primeira = texto.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Report do app'
  return primeira.length > 90 ? primeira.slice(0, 87) + '…' : primeira
}

/** Corpo markdown da issue: texto + contexto + logs (se houver). O marcador
 *  `pleitost:tipo=...` (comentário invisível) é o que o workflow do repo lê pra
 *  aplicar a label — o param `labels` da API é descartado pra quem não tem push. */
function corpoIssue(report: BugReport): string {
  const c = report.contexto
  const partes = [
    report.texto,
    '',
    '---',
    `**Tipo:** ${report.tipo === 'bug' ? '🐞 Bug' : '💡 Sugestão'}`,
    `**Página:** \`${c.pagina}\``,
    `**Versão:** \`${c.versao}\``,
    `**Navegador:** \`${c.userAgent}\``,
  ]
  if (c.logs?.length) {
    const linhas = c.logs.map((l) => `${new Date(l.t).toISOString()} [${l.tag}] ${l.msg}`).join('\n')
    partes.push('', '<details><summary>Logs do modo debug</summary>', '', '```', linhas, '```', '</details>')
  }
  partes.push('', `<!-- pleitost:tipo=${report.tipo} -->`, '', '_Aberta pelo autor via Reportar Bug do app._')
  return partes.join('\n')
}

/** Redige padrões de credencial (JWT, tokens GitHub, Bearer, api keys) — os
 *  logs viajam pro corpo PÚBLICO da issue e pro jsonb do Supabase. */
const SECRET_RX =
  /(Bearer\s+[A-Za-z0-9._~+/=-]{8,})|(gh[pousr]_[A-Za-z0-9]{16,})|(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,})|((?:api[_-]?key|access_token|provider_token|refresh_token)["':=\s]+[A-Za-z0-9._~+/=-]{8,})/gi
function redactSecrets(s: string): string {
  return s.replace(SECRET_RX, '[REDACTED]')
}

async function inserirAnon(report: BugReport): Promise<void> {
  const sb = supabaseClient()
  if (!sb) throw new Error('Servidor de reportes indisponível — tenta de novo mais tarde.')
  const { error } = await sb.from('bug_reports').insert({
    texto: report.texto,
    contexto: report.contexto,
  })
  if (error) throw new Error(`Não deu pra enviar (${error.message}) — tenta de novo.`)
}

export async function enviarBugReport(texto: string, tipo: TipoReport = 'bug'): Promise<ResultadoReport> {
  const limpo = texto.trim()
  if (!limpo) throw new Error('Escreva o que aconteceu antes de enviar.')
  // Anexa os logs SÓ se o modo debug estava ligado (senão o buffer está vazio).
  // Corta pra não estourar o limite de texto/linha do report. Review: os logs
  // capturam console.warn/error de SDKs (Supabase renova token via console em
  // alguns fluxos) e o corpo da issue no GitHub é PÚBLICO — redige qualquer
  // coisa com cara de credencial antes de anexar.
  const logs = isDebugOn()
    ? getLogs()
        .slice(-200)
        .map((l) => ({ ...l, msg: redactSecrets(l.msg) }))
    : []
  const report: BugReport = {
    texto: limpo,
    tipo,
    contexto: {
      pagina: window.location.pathname,
      versao: APP_VERSION,
      userAgent: navigator.userAgent,
      tipo,
      ...(logs.length ? { logs } : {}),
    },
  }
  if (sender) {
    await sender(report)
    return { canal: 'anon' }
  }
  // N4: autor logado com GitHub → abre a issue COMO ele. Se falhar (escopo/rede/
  // token expirado), NÃO perde o report: cai no canal anônimo.
  if (canOpenGitHubIssue()) {
    try {
      // Labels padrão do GitHub: bug / enhancement. Só aplicam pra quem tem push;
      // pros demais o workflow label-reports.yml lê o marcador do corpo.
      const labels = tipo === 'bug' ? ['bug'] : ['enhancement']
      const issue = await openGitHubIssue(tituloDe(limpo), corpoIssue(report), labels)
      // Espelha no Supabase já triado (github_issue), pra o dashboard bater —
      // best-effort, um erro aqui não invalida a issue já criada.
      try {
        const sb = supabaseClient()
        await sb?.from('bug_reports').insert({
          texto: report.texto,
          contexto: { ...report.contexto, reporter: gitHubLogin() ?? undefined },
          github_issue: issue.number,
        })
      } catch {
        /* espelho é opcional */
      }
      return { canal: 'github', url: issue.url, number: issue.number }
    } catch {
      // fallback silencioso pro canal anônimo (o report não pode se perder)
    }
  }
  await inserirAnon(report)
  return { canal: 'anon' }
}
