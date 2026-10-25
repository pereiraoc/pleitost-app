// Helpers compartilhados das notas de CONTEXTO (Atual/Histórico) — usados
// pela HistoriaView (nota única) e pelo ContextoLeafView (folha/linha do
// tempo). Fonte de verdade única pro strip do template da vault.
import type { VaultDoc } from '../../data/types'

/** FM `Assunto` (Contexto Atual) — string não-vazia ou null. */
export function fmAssunto(doc: VaultDoc | undefined): string | null {
  const raw = doc?.frontmatter['Assunto']
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/** FM `Data` (Contexto Histórico) — string não-vazia ou null. */
export function fmData(doc: VaultDoc | undefined): string | null {
  const raw = doc?.frontmatter['Data']
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/** Chave numérica do FM `Data` pra ordenar a linha do tempo: ISO da POA
 *  ('1968-12-13') e anos da fantasia ('Ano 55', 'c. 250 a.G.' = antes da
 *  Guerra, negativo). Fora desses padrões → NaN (quem ordena cai no texto). */
export function ordemData(data: string): number {
  const iso = /^(-?\d{1,4})-(\d{2})-(\d{2})/.exec(data)
  if (iso) return Number(iso[1]) + (Number(iso[2]) - 1) / 12 + (Number(iso[3]) - 1) / 372
  const ag = /(\d+)\s*a\.\s*G\./i.exec(data)
  if (ag) return -Number(ag[1])
  const ano = /^(?:c\.\s*)?(?:Ano\s+)?(-?\d+)/i.exec(data.trim())
  return ano ? Number(ano[1]) : NaN
}

/** '1968-12-13' → '13/12/1968' (só FORMATA o FM `Data`; datas fora do padrão
 *  ISO aparecem como estão — nada é inventado). */
export function dataDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Remove da nota de Contexto o TEMPLATE da vault que só re-declara o FM: a
 *  linha-tag `#Contexto` (tag do Obsidian, viraria heading), o heading
 *  dinâmico `### \`= this.file.name\`` e o callout `> [!quote] Contexto …`
 *  cujas linhas de conteúdo são só referências `= this.X` — título, Assunto e
 *  Data já são o frame da view. Prosa REAL (quotes/bullets/headings próprios)
 *  fica intacta. */
export function semTemplate(body: string): string {
  const lines = body.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (/^#[^\s#]\S*\s*$/.test(line)) {
      i++
      continue
    }
    if (/^#{1,6}\s+`= this\.file\.name`\s*$/.test(line)) {
      i++
      continue
    }
    if (/^>\s*\[!quote\]\s*Contexto/i.test(line)) {
      let j = i + 1
      let soTemplate = true
      while (j < lines.length && /^>/.test(lines[j]!)) {
        const conteudo = lines[j]!.replace(/^>\s*/, '').trim()
        if (conteudo !== '' && !conteudo.includes('= this.')) {
          soTemplate = false
          break
        }
        j++
      }
      if (soTemplate) {
        i = j
        continue
      }
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

/** Corpo SEM os embeds de imagem soltos (linhas que são só `![[figura.png]]`).
 *  O card da tela CONTEXTO já mostra a figura à direita — repeti-la dentro do
 *  corpo aberto só empurra o texto pra baixo (pedido 2026-09-09). */
export function semFiguras(body: string): string {
  return String(body ?? '')
    .split('\n')
    .filter((l) => !/^!\[\[[^\]]+\.(png|jpe?g|gif|webp|svg|avif|bmp)(\|[^\]]*)?\]\]\s*$/i.test(l.trim()))
    .join('\n')
}

/** Corpo exibido de uma nota de Contexto: a prosa REAL (sem o template),
 *  senão a `Descrição` do FM (wikilinks resolvem no markdown), senão vazio —
 *  título/data/assunto já são o frame. */
export function corpoContexto(doc: VaultDoc): string {
  const corpo = semTemplate(doc.body).trim()
  if (corpo !== '') return corpo
  const desc = doc.frontmatter['Descrição']
  return typeof desc === 'string' ? desc.trim() : ''
}
