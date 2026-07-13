// REPORTAR BUG (#220) — req do usuário: "Quero que qualquer um consiga
// fazer". Canal aberto SEM login: INSERT na tabela bug_reports do Supabase
// com a chave publishable (RLS: anon/authenticated só INSEREM; ninguém lê
// pela API — os reportes são lidos no dashboard). Schema em
// supabase/bug-reports.sql (aplicar no SQL editor do projeto).
import { supabaseClient } from './session-repo/supabase'
import { APP_VERSION } from '../pwa-update'

export interface BugReport {
  texto: string
  /** Contexto automático que ajuda a reproduzir (rota, versão, navegador). */
  contexto: { pagina: string; versao: string; userAgent: string }
}

type Sender = (r: BugReport) => Promise<void>
// Injeção pros testes (o InMemory não tem tabela) — produção usa o Supabase.
let sender: Sender | null = null
export function __setBugSenderForTests(s: Sender | null): void {
  sender = s
}

export async function enviarBugReport(texto: string): Promise<void> {
  const limpo = texto.trim()
  if (!limpo) throw new Error('Escreva o que aconteceu antes de enviar.')
  const report: BugReport = {
    texto: limpo,
    contexto: {
      pagina: window.location.pathname,
      versao: APP_VERSION,
      userAgent: navigator.userAgent,
    },
  }
  if (sender) return sender(report)
  const sb = supabaseClient()
  if (!sb) throw new Error('Servidor de reportes indisponível — tenta de novo mais tarde.')
  const { error } = await sb.from('bug_reports').insert({
    texto: report.texto,
    contexto: report.contexto,
  })
  if (error) throw new Error(`Não deu pra enviar (${error.message}) — tenta de novo.`)
}
