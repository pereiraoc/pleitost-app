#!/usr/bin/env node
// Prompts das imagens de MUNDO da FANTASIA (vault pleitost) — o par do
// gen-context-figures.mjs (POA 1987), no mesmo fluxo: um doc de prompts pra
// gerar à mão no ChatGPT, um item por imagem que falta.
//
//  - Organizações:   uma imagem de identidade por nota COMPLETA de
//                    Contexto/Organizações (placeholders sem texto são pulados).
//  - Contexto Atual: uma ilustração por nota-folha (subcategoria Atualidade).
//  - Locais:         Localizações do Atlas sem imagem — no MESMO estilo dos
//                    mapas ilustrados que já existem (Imagens/Mapas).
//
// Prompts são GROUNDED no conteúdo real das notas; callouts [!gm] saem antes
// (segredo de mestre não vaza pra arte). Item que já tem arte não entra.
//
// Uso: node scripts/gen-fantasia-figures.mjs [--plan]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, basename, relative } from 'node:path'

const VAULT = process.env.PLEITOST_VAULT_ROOT ?? '/data/vaults/pleitost'
const IMAGENS = join(VAULT, 'Recursos e Mídia/Imagens')
const INBOX = join(VAULT, 'Recursos e Mídia/Rascunhos/Inbox de Imagens')
const DOC = join(VAULT, 'Recursos e Mídia/Rascunhos/Prompts — Figuras Fantasia.md')
const PLAN = process.argv.includes('--plan')

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

// Toda arte da vault, por basename — embed do Obsidian resolve por nome.
const ARTE = new Set(walk(join(VAULT, 'Recursos e Mídia')).map((p) => basename(p)))
const temArte = (nome) => ['png', 'jpg', 'jpeg', 'webp'].some((e) => ARTE.has(`${nome}.${e}`))

function lerNota(path) {
  const raw = readFileSync(path, 'utf8')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  const fm = {}
  for (const l of (m?.[1] ?? '').split('\n')) {
    const kv = /^([^\s:][^:]*):\s?(.*)$/.exec(l)
    if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^"(.*)"$/, '$1')
  }
  return { fm, body: m ? raw.slice(m[0].length) : raw }
}

// Corpo limpo pra prompt: sem [!gm], sem dataview, sem linhas-template
// (`= this.X`), sem marcas de callout/heading e sem colchetes de wikilink.
function limpar(md) {
  const out = []
  let gm = false
  let code = false
  for (const l of md.split('\n')) {
    if (/^```/.test(l)) { code = !code; continue }
    if (code) continue
    if (/^>\s*\[!gm\]/i.test(l)) { gm = true; continue }
    if (gm && /^>/.test(l)) continue
    gm = false
    if (/`=\s*this\./.test(l) || /^#\S/.test(l) || /^!\[\[/.test(l) || /^---\s*$/.test(l)) continue
    if (/^>\s*\[![^\]]+\]/.test(l)) continue
    if (/^>?\s*\S*\*\*[^*]+:\*\*\s*$/.test(l)) continue // rótulo sem conteúdo ("👥**População:** ")
    out.push(l.replace(/^>\s?/, '').replace(/^#+\s*/, ''))
  }
  return out
    .join(' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const cap = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…')

const MUNDO = 'o RPG de fantasia Pleitost (o Mundo Livre — fantasia medieval-renascentista, magia elemental e arcana)'
const ESTILO =
  ' Estilo: pintura digital cinematográfica SEMIRREALISTA de fantasia — o MESMO estilo dos retratos de Classe do sistema: pinceladas visíveis, luz dramática, cores ricas. Nada de foto, anime ou render 3D.'

function promptOrganizacao(nome, sub, excerto) {
  return (
    `Imagem de identidade visual da organização "${nome}" (${sub || 'organização'}) para ${MUNDO}.` +
    ` Uma cena emblemática que comunique de imediato quem é essa organização, baseada neste contexto do mundo: ${excerto}` +
    ` NÃO invente brasão, escudo nem emblema: a organização ainda não tem símbolo definido — identidade pelo figurino, pelos gestos e pelo lugar.` +
    ESTILO +
    ` Sem texto legível. Proporção paisagem 3:2 (1536×1024).`
  )
}

function promptContextoAtual(nome, assunto, excerto) {
  return (
    `Ilustração de dossiê de mundo para ${MUNDO}, no Ano 300.` +
    ` Tema: "${nome}"${assunto ? ` — ${assunto.replace(/\.$/, '')}` : ''}. Componha UMA cena forte que sintetize o tema a partir deste contexto do mundo: ${excerto}` +
    ` UMA cena, UM momento: SOMENTE elementos coerentes com o texto — não encha o quadro nem invente brasões, criaturas ou construções que o texto não cita.` +
    ESTILO +
    ` Sem texto legível. Proporção paisagem 3:2 (1536×1024).`
  )
}

function promptLocal(nome, sub, excerto) {
  const regiao = /Região|Nação/.test(sub)
  return (
    `Mapa ilustrado do local "${nome}" (${sub || 'local'}) para ${MUNDO}.` +
    ` MESMO estilo dos mapas que já existem no sistema (anexe um deles como referência, ex.: Riqueza.png): ` +
    (regiao
      ? 'mapa regional em perspectiva levemente aérea, desenhado à mão sobre pergaminho, relevo, rios, estradas e as cidades da região como pequenas vinhetas;'
      : 'vista isométrica/aérea desenhada à mão, rica em detalhes, casario, ruas e paisagem ao redor;') +
    ` cartela de título no canto superior esquerdo com o nome do local, legenda com numeração dos locais de interesse e faixas coloridas com os nomes dos distritos/sub-regiões, rosa dos ventos.` +
    ` Conteúdo, baseado nesta descrição do mundo: ${excerto}` +
    ` Os ÚNICOS textos permitidos são o nome do local e os nomes que constam na descrição.` +
    ` Proporção paisagem 4:3.`
  )
}

// O arquivo da arte é o que a nota EMBEDA (ex.: região → "Mapa de Pedra Fina",
// porque "Pedra Fina.png" já é sprite de emblema); sem embed, o nome da nota.
const embedDe = (body, nome) => /^!\[\[([^\]|]+)\.(?:png|jpe?g|webp)/m.exec(body)?.[1] ?? nome

const trabalho = []
const add = (cat, pasta, nome, prompt, ref) => {
  if (temArte(nome)) return
  trabalho.push({ cat, pasta, nome, prompt, ref })
}

for (const p of walk(join(VAULT, 'Contexto/Organizações')).filter((p) => p.endsWith('.md')).sort()) {
  const { fm, body } = lerNota(p)
  if (fm['categoria'] !== 'Organização') continue
  const excerto = limpar(body)
  if (!fm['Resumo'] && excerto.replace(/Objetivo de Longo Prazo:|Objetivo Imediato:|Influência:|Descrição:/g, '').trim() === '') continue
  add('Organizações', 'Organizações', embedDe(body, basename(p, '.md')), promptOrganizacao(basename(p, '.md'), fm['subcategoria'], cap(`${fm['Resumo'] ?? ''} ${excerto}`, 1100)))
}

for (const p of walk(join(VAULT, 'Contexto/Histórias/Contexto Atual')).filter((p) => p.endsWith('.md')).sort()) {
  const { fm, body } = lerNota(p)
  if (fm['subcategoria'] !== 'Atualidade') continue
  add('Contexto Atual', 'Contexto Atual', embedDe(body, basename(p, '.md')), promptContextoAtual(basename(p, '.md'), fm['Assunto'], cap(limpar(body), 1100)))
}

for (const p of walk(join(VAULT, 'Atlas')).filter((p) => p.endsWith('.md')).sort()) {
  const { fm, body } = lerNota(p)
  if (fm['categoria'] !== 'Localização') continue
  if (/^```leaflet/m.test(body)) continue // já tem o mapa interativo (Mapa do Mundo Livre)
  add('Locais', 'Mapas', embedDe(body, basename(p, '.md')), promptLocal(basename(p, '.md'), fm['subcategoria'], cap(limpar(body), 1300)), 'Recursos e Mídia/Imagens/Mapas/Riqueza.png')
}

const CATS = [...new Set(trabalho.map((t) => t.cat))]
if (PLAN) {
  for (const t of trabalho) console.log(`${t.cat}/${t.nome}`)
  for (const c of CATS) console.log(`${c}: ${trabalho.filter((t) => t.cat === c).length}`)
  process.exit(0)
}

const linhas = [
  '# Prompts — Imagens da Fantasia',
  '',
  'Gerado por `pleitost-app/scripts/gen-fantasia-figures.mjs` — não editar à mão. Só entram itens que ainda não têm arte.',
  '',
  '## Como usar (ChatGPT, uma imagem por mensagem)',
  '',
  '1. Se o item indica **Referência**, anexa esse arquivo; se diz *(sem anexo)*, só cola o prompt.',
  '2. **Cola** o prompt do bloco de código.',
  '3. Baixa o resultado e **salva com o nome exato** indicado em `→ salvar como`, dentro de',
  '   `Recursos e Mídia/Rascunhos/Inbox de Imagens/<pasta indicada na seção>/`.',
  '4. Com um lote pronto, me pede o **ingest**: confiro os nomes e movo pra `Recursos e Mídia/Imagens/<pasta>/`',
  '   — as notas já embedam `![[Nome.png]]`, então a imagem aparece sozinha.',
  '',
]
for (const c of CATS) {
  const itens = trabalho.filter((t) => t.cat === c)
  linhas.push(`## ${c} (${itens.length})`, '', `Salvar em \`Rascunhos/Inbox de Imagens/${itens[0].pasta}/\``, '')
  for (const t of itens) {
    mkdirSync(join(INBOX, t.pasta), { recursive: true })
    linhas.push(
      `- [ ] **${t.nome}** → salvar como \`${t.nome}.png\` — ${t.ref ? `Referência: \`${t.ref}\`` : '*(sem anexo)*'}`,
      '',
      '```text',
      t.prompt,
      '```',
      '',
    )
  }
}
writeFileSync(DOC, linhas.join('\n'))
console.log(`${trabalho.length} prompts → ${relative(VAULT, DOC)}`)
for (const c of CATS) console.log(`  ${c}: ${trabalho.filter((t) => t.cat === c).length}`)
