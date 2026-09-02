// Report 2026-09-02 ("Aliança dos Fundadores com formato errado"): 24 notas
// POA tinham YAML inválido no FM (valor com ": " sem aspas) — o parser falha,
// o doc sai com frontmatter VAZIO e type null, e o app cai na view GENÉRICA
// (template cru, callouts amassados) em vez de OrgView/PessoaView. As notas
// foram corrigidas na vault e o extractor agora AVISA e conta no sumário
// (counts.frontmatterErrors). Este teste trava a integridade dos datasets
// publicados: nenhum doc pode sair sem FM parseado.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoDir = path.dirname(appDir)

describe('integridade de frontmatter dos datasets', () => {
  for (const dir of ['vault-data', 'vault-data-cyberpunk']) {
    it(`${dir}: zero docs com FM inválido`, () => {
      const index = JSON.parse(
        fs.readFileSync(path.join(repoDir, dir, 'index.json'), 'utf8'),
      ) as { counts?: { frontmatterErrors?: number } }
      expect(index.counts?.frontmatterErrors ?? 0).toBe(0)
    })
  }
})
