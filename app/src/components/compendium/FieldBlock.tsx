import type { ReactNode } from 'react'

/** Bloco de campo em LEITURA (report 2026-08-29): label mono em cima, prosa
 *  embaixo, empilhado de cima pra baixo — o mesmo vocabulário visual dos
 *  Detalhes da Localização (que o usuário aprovou), reusado por Organização e
 *  Pessoa. Grade de cardzinhos lado a lado quebrava a leitura (e ficava ilegível
 *  na sidebar de DETALHES). */
export function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="local-field local-field-col">
      <span className="local-field-label">{label.toUpperCase()}</span>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </section>
  )
}
