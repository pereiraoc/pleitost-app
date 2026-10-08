// REPORTAR BUG (#220) — req do usuário: "Quero que qualquer um consiga
// fazer". Canal ÚNICO: INSERT na tabela bug_reports do Supabase (RLS:
// anon/authenticated só INSEREM; leitura só no dashboard), com o LOGIN do
// GitHub de quem mandou em contexto.reporter. A issue é aberta na triagem
// (2026-10-08: saiu a issue direta pela conta do autor — exigia o escopo
// public_repo no login). Schema em supabase/bug-reports.sql.
import { supabaseClient } from './session-repo/supabase'
import { APP_VERSION } from '../pwa-update'
import { getLogs, isDebugOn, type DebugEntry } from './debug-log'
import { gitHubLogin } from './github-login'

/** Tipo do report — escolhido pelo autor no modal. Vira a label da issue
 *  (bug/enhancement), pra priorizar bugs primeiro. */
export type TipoReport = 'bug' | 'sugestao'

export interface BugReport {
  texto: string
  tipo: TipoReport
  /** Contexto automático que ajuda a reproduzir (rota, versão, navegador).
   *  `logs` só vem preenchido quando o modo debug estava ligado — o rastro dos
   *  pontos instrumentados antes do bug, pra entrar junto na issue. */
  contexto: {
    pagina: string
    versao: string
    userAgent: string
    tipo: TipoReport
    /** Login do GitHub de quem mandou (ausente = convidado). */
    reporter?: string
    logs?: DebugEntry[]
  }
}

/** O que aconteceu com o report — a UI usa pra dar o retorno certo. */
export type ResultadoReport = { canal: 'anon' }

type Sender = (r: BugReport) => Promise<void>
// Injeção pros testes (o InMemory não tem tabela) — produção usa o Supabase.
let sender: Sender | null = null
export function __setBugSenderForTests(s: Sender | null): void {
  sender = s
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
  const { error } = await sb.from('bug_reports').insert({ texto: report.texto, contexto: report.contexto })
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
  const reporter = gitHubLogin()
  const report: BugReport = {
    texto: limpo,
    tipo,
    contexto: {
      pagina: window.location.pathname,
      versao: APP_VERSION,
      userAgent: navigator.userAgent,
      tipo,
      // Atribuição (pedido 2026-08-15): a triagem cita "Reportado por @fulano"
      ...(reporter ? { reporter } : {}),
      ...(logs.length ? { logs } : {}),
    },
  }
  if (sender) {
    await sender(report)
    return { canal: 'anon' }
  }
  await inserirAnon(report)
  return { canal: 'anon' }
}
