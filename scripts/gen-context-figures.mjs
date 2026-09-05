#!/usr/bin/env node
// Gera as imagens do MUNDO (reskin #519) a partir do material da vault:
//
//  - Figura:        cartas de item — referência = arte da fantasia, nome do
//                    mundo via reskin, fundo TRANSPARENTE. O arquivo salvo é o
//                    ORIGINAL gerado (tamanho cheio, arquivo único — thumbnail,
//                    se precisar, é problema do app; decisão 2026-09-04).
//  - Classes:       retratos das 10 classes — referência = Imagens/Classes/
//                    (fantasia), nome do mundo, quadrado, opaco.
//  - Companheiros:  os 4 tipos de Empregado — referência = Imagens/
//                    Companheiros Animais/ (no mundo são pessoas/drone).
//  - Contexto Atual: uma ilustração por nota-folha de Contexto/Histórias/
//                    Contexto Atual (hubs de tema são índices — pulados).
//  - Organizações:  uma imagem de identidade por nota de Contexto/Organizações.
//  - Locais:        uma imagem por nota de Atlas/Porto Alegre — aparência
//                    REAL de Porto Alegre de época + toques do mundo, opaca.
//
// Prompts são GROUNDED no conteúdo real das notas (FM + corpo limpo);
// callouts [!gm] são removidos antes (segredo de mestre não vaza pra arte).
// Fonte dos nomes: vault-data-cyberpunk/contexto.json + porte fiel de
// reskinName/reskinText de app/src/data/reskin.ts (manter em sincronia).
//
// Uso:
//   node scripts/gen-context-figures.mjs --plan          # só imprime o mapa
//   node scripts/gen-context-figures.mjs --chatgpt       # doc de prompts pra
//                                        gerar à mão no ChatGPT (Rascunhos/)
//   node scripts/gen-context-figures.mjs --manifest      # _inbox/manifest.json
//                                        pra agente externo (Codex) iterar
//   node scripts/gen-context-figures.mjs --ingest        # valida/normaliza o
//                                        que caiu em _inbox/ e arquiva
//   node scripts/gen-context-figures.mjs                 # gera via API o que falta
//   node scripts/gen-context-figures.mjs --force --only "Figura/Adaga" --quality high
//
// Credencial (só pro caminho API): OPENAI_API_KEY ou ~/.secrets/openai.key.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir } from 'node:os'
import sharp from 'sharp'

const VAULT = process.env.PLEITOST_VAULT_ROOT ?? '/data/vaults/POA 1987'
const CONTEXTO = JSON.parse(readFileSync(new URL('../vault-data-cyberpunk/contexto.json', import.meta.url), 'utf8'))
const CONTEXTO_MD = readFileSync(join(VAULT, 'Recursos e Mídia/Configurações de Contextos/Contexto POA 1987.md'), 'utf8')
const IMAGENS = join(VAULT, 'Recursos e Mídia/Imagens')
const SRC_FIG = join(IMAGENS, 'Cartas/Figura')
// Layout FINAL é FLAT: Recursos de Contextos/<Categoria>/<Nome>.png — é o
// que a vault commitou (embeds nas notas) e o app lê (creature-image.ts,
// #548). O inbox em Rascunhos/ é só zona de entrega; o --ingest sobrescreve
// o final. Regeração é dirigida por Inbox de Imagens/regerar.json (lista de
// chaves) — o ingest remove da lista o que entra.
const CTX_ROOT = join(VAULT, 'Recursos e Mídia/Recursos de Contextos')
// O inbox é só zona de ENTREGA (recriado sob demanda pelo --chatgpt/--manifest
// e apagável depois do ingest — r13); o controle da geração vive junto do
// resultado, em Recursos de Contextos/_geracao.
const INBOX = join(VAULT, 'Recursos e Mídia/Rascunhos/Inbox de Imagens')
const GERACAO = join(CTX_ROOT, '_geracao')
const REGERAR_PATH = join(GERACAO, 'regerar.json')
const REGERAR = new Set(existsSync(REGERAR_PATH) ? JSON.parse(readFileSync(REGERAR_PATH, 'utf8')) : [])
// Chaves SEM arte própria DE PROPÓSITO (decisão 2026-09-03: armas naturais/
// especiais seguem com a Figura da fantasia por fallback) — fora do pendente.
const MANTER_FANTASIA_PATH = join(GERACAO, 'manter-fantasia.json')
const MANTER_FANTASIA = new Set(existsSync(MANTER_FANTASIA_PATH) ? JSON.parse(readFileSync(MANTER_FANTASIA_PATH, 'utf8')) : [])
const SUBS_FIG = ['Armas', 'Consumíveis', 'Equipamentos', 'Implementos', 'Imbuições e Têmperas']

const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const PLAN = flag('--plan')
const CHATGPT = flag('--chatgpt')
const MANIFEST = flag('--manifest')
const INGEST = flag('--ingest')
const FORCE = flag('--force')
const ONLY = opt('--only', null)
const QUALITY = opt('--quality', 'medium')

// ---- porte de app/src/data/reskin.ts (manter em sincronia) ----------------
const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const notas = new Map(Object.entries({ ...CONTEXTO.reskin.notas, ...(CONTEXTO.reskin.notasFuturas ?? {}) }))
const mapa = new Map([...notas, ...Object.entries(CONTEXTO.reskin.termos)])
const chaves = [...mapa.keys()].sort((a, b) => b.length - a.length)
const regex = chaves.length
  ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${chaves.map(escRx).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  : null
const excecoes = [...CONTEXTO.reskin.excecoes].sort((a, b) => b.length - a.length)

function reskinText(texto) {
  if (!regex || !texto) return texto
  let s = texto
  const guardadas = []
  for (const ex of excecoes) {
    if (!s.includes(ex)) continue
    s = s.split(ex).join('\u0000' + guardadas.length + '\u0000')
    guardadas.push(ex)
  }
  s = s.replace(regex, (m) => mapa.get(m) ?? m)
  for (let i = guardadas.length - 1; i >= 0; i--) {
    s = s.split('\u0000' + i + '\u0000').join(guardadas[i])
  }
  return s
}
const reskinName = (nome) => notas.get(nome) ?? reskinText(nome)
// ---------------------------------------------------------------------------

const INDISPONIVEIS = new Set(CONTEXTO.disponibilidade?.indisponiveis ?? [])
const RESTRITOS = CONTEXTO.disponibilidade?.restritos ?? {}

// ---- grounding: leitura e limpeza de notas da vault -----------------------
function lerNota(path) {
  const raw = readFileSync(path, 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const fm = {}
  if (m) {
    for (const linha of m[1].split('\n')) {
      const kv = linha.match(/^([A-Za-zÀ-ú_]+):\s*"?(.*?)"?\s*$/)
      if (kv && kv[2]) fm[kv[1]] = kv[2].replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    }
  }
  return { fm, corpo: m ? m[2] : raw }
}

function limpar(md) {
  let s = md
  // linha-tag do Obsidian (#Pessoa/#Local) — remover INTEIRA antes do strip de
  // chars, senão vira a palavra solta "Pessoa" no excerto do prompt
  s = md.replace(/^ *#[^\s#]\S*(?: +#[^\s#]\S*)* *$/gm, ' ')
  s = s.replace(/%%[\s\S]*?%%/g, ' ')
  s = s.replace(/```[\s\S]*?```/g, ' ')
  // callouts de GM inteiros (a linha [!gm] e as linhas citadas seguintes)
  s = s.replace(/^ *> *\[!gm\][^\n]*\n(?: *>[^\n]*\n?)*/gim, ' ')
  s = s.replace(/^.*`= this[^`\n]*`.*$/gm, ' ')
  s = s.replace(/`[^`\n]*`/g, ' ')
  s = s.replace(/^ *> *\[![^\]]*\][^\n]*$/gm, ' ')
  s = s.replace(/!\[\[[^\]]*\]\]/g, ' ')
  s = s.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
  s = s.replace(/[>#*_]/g, ' ')
  s = s.replace(/[\p{Extended_Pictographic}️]/gu, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

const cap = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…')

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name)))
    else if (e.name.endsWith('.md')) out.push(join(dir, e.name))
  }
  return out.sort()
}

// ---- direção de arte + prompts por categoria ------------------------------
const MUNDO = 'no mundo "Porto Alegre 1987" — Brasil dos anos 80, cyberpunk analógico-tropical sob regime militar'

const HINT_FIG = {
  'Armas': 'Decreto das Armas Frias: não existem armas de fogo civis — a rua luta com lâminas Tramontina, ferramentas de obra, pressão de ar e dardos. Materiais honestos de 1987: aço carbono, cabo de madeira ou borracha, fita isolante.',
  'Consumíveis': 'Selênicos são fármacos de 1987 vendidos em farmácia (estética Panvel): injetores, ampolas e frascos com tarja — nunca frascos de poção mágica.',
  'Equipamentos': 'Tecnologia analógico-futurista de 1987 que se VESTE ou se USA no corpo: implantes, visores, luvas, cintos e comunicadores com plástico bege/cinza, LEDs, botões físicos e cabos espiralados.',
  'Implementos': 'Focos são válvulas selênicas da Gradiente: peças de vidro termiônico que se espetam no soquete do adaptador do operador.',
  'Imbuições e Têmperas': 'Cristais e peças selênicas de fabricação (oficial Gradiente ou pirata do Quarto Distrito); itens Premium são a linha industrial de luxo da Tramontina.',
}

// r3: um CONCEITO por equipamento — fabricante/canal e forma próprios da
// lógica do Contexto (a referência da fantasia vale só pelo ESTILO; anel
// virou implante, broche virou beltpack…). Chave = nome do MUNDO sem tier.
const CONCEITO_EQUIP = {
  'Amplificador Audiovisual': { desc: 'visor transparente que cobre os olhos + fone de UMA orelha, cabo espiralado descendo até uma caixinha de cinto com knobs e LEDs. Eletrônica oficial Gradiente: plástico bege/cinza, logotipo REAL da Gradiente na caixinha.' },
  'Amplificador de Palco': { desc: 'microfone de LAPELA robusto anos 80 com amplificador EMBUTIDO no próprio corpo (unidade única, sem caixa separada): grade metálica, mini-knobs de equalização e clipe de fixação; marcas de palco. Equipamento Gradiente usado no circuito de bares.' },
  'Botas Hidráulicas': { desc: 'botas de couro com pistões/amortecedores hidráulicos aparentes no calcanhar e mangueirinhas de fluido azulado subindo pelo cano; remendos de borracha. Segunda mão do Camelódromo: desgaste honesto.' },
  'Bracelete de Reagentes': { desc: 'bracelete de pulso com CARTUCHOS de reagentes lênicos coloridos encaixados em torno de todo o punho e um acesso venoso fino na face interna (o reagente certo entra direto na veia do braço). Artesanato de bancada lênica: arame, solda aparente, fivelas.' },
  'Braceletes de Polímero': { desc: 'par de munhequeiras industriais de polímero preto denso com placas rígidas e fivelas — cara de EPI pesado de fábrica, cantos gastos de uso.' },
  'Capa Discreta': { desc: 'poncho/capa de chuva cinza-fosco de tecido emborrachado que não faz ruído, forro acolchoado acústico visível na borda, capuz fundo. Brechó do Bom Fim: remendos de qualidade.' },
  'Cinto de Campo': { desc: 'cinto militar surplus com bolsos fechados, cantil, canivete, lanterna de dínamo e isqueiro de campanha pendurados. Sobra da Brigada vendida no Camelódromo: cinza-azulado, numeração estampada meio apagada.' },
  'Comunicador de Pulso': { desc: 'rádio de PULSO anos 80 — walkie-talkie de munhequeira com antena curta de borracha, display de 7 segmentos e botão lateral de falar. Importado japonês de segunda mão do Camelódromo: marca lixada, fita isolante.' },
  'Diapasão Lênico': { desc: 'diapasão de metal com as duas hastes banhadas em resina selênica iridescente, montado num suporte de lapela de arame soldado. Artesanato de bancada lênica.' },
  'Estabilizador Vestibular': {
    desc: 'IMPLANTE de ouvido interno avulso, pronto pra cirurgia (estilo implante coclear dos anos 80): disco retroauricular de titânio com micro-giroscópio visível, eletrodo espiral fino e pinos de fixação óssea — leitura claramente MÉDICA/invasiva',
    tiers: {
      Adepto: 'versão pirata de clínica clandestina — carcaça remendada e fita isolante',
      Experiente: 'linha Gradiente bege com LED de status',
      Mestre: 'grau cirúrgico polido, junção quase invisível',
    },
  },
  'HUD Tático': { desc: 'monóculo militar com retículo verde-fósforo aceso, preso num headset de tiras, cabo até processador de bolso cinza-azulado com numeração estampada. Surplus da Brigada/contrabando: uso pesado.' },
  'Implante Subdérmico': {
    desc: 'MALHA POLIMÉRICA SUBDÉRMICA avulsa, pronta pra cirurgia: tela anatômica flexível e translúcida no formato do antebraço, com trama hexagonal, portas de injeção e bordas de sutura — leitura claramente MÉDICA/invasiva, de peça que vai SOB a pele',
    tiers: {
      Adepto: 'placa única curta, acabamento de clínica clandestina',
      Experiente: 'placa dupla com portas de injeção, acabamento Gradiente',
      Mestre: 'conjunto completo polido de grau cirúrgico',
    },
  },
  'Luva do Tecnologista': { desc: 'luva de trabalho reforçada com SOQUETES de válvula selênica sobre os nós dos dedos e fiação costurada até um manômetro de pulso — a ferramenta do operador trônico. Linha oficial Gradiente: logotipo REAL da Gradiente no punho.' },
  'Luvas Assépticas': { desc: 'par de luvas cirúrgicas de polímero AUTOESTERILIZANTE — brilho úmido de sempre-limpas, imaculadas — sobre a embalagem farmacêutica lacrada delas. Farmacêutico Panvel: branco/verde asséptico, logotipo REAL da Panvel na embalagem.' },
  'Luvas do Punguista': { desc: 'luvas de pelica finas e justas, pretas, com gazuas e ferramentas de precisão costuradas na face interna do punho. Feitio do Quarto Distrito: costura irregular, couro macio de uso.' },
  'Modulador de Voz': { desc: 'MODULADOR DE GARGANTA: banda/colar que envolve a laringe com o módulo modulador sobre a garganta e UM cartucho de idioma pequeno encaixado nele (slot visível, cartucho rotulado por cor). Linha executiva Gradiente: plástico bege, logotipo REAL da Gradiente.' },
  'Projetor de Presença': { desc: 'PROJETOR VESTÍVEL DE PRESENÇA (arco de cabeça/ombros): luz de recorte vermelha que projeta a sombra do usuário maior, mini-subgraves gêmeos e um difusor químico de feromônio agressivo com reservatório visível. Feitio pirata do Quarto Distrito: solda exposta, carcaça remendada, luz acesa e dura.' },
  'Sensor Canário': { desc: 'SENSOR DE LAPELA de áudio da linha Gradiente (r12): caixinha compacta de clipe de lapela em plástico bege/cinza com grade metálica de mini alto-falante direcional, microfone de leitura ambiente, seletor mecânico de trilhas sonoras e mini medidor VU de agulha — o aparelho lê o ambiente e emite sons calibrados pra tranquilizar ou distrair. Um CANÁRIO amarelo PINTADO em serigrafia na carcaça é a marca da linha (homenagem ao canário de mina). NÃO é gaiola: NENHUM pássaro vivo, NENHUMA gaiola, nada de latão/steampunk — eletrônica de 1987 com o logotipo REAL da Gradiente.' },
  'Sensor Trônico': { desc: 'varinha-detector de sinais trônicos com galvanômetro de agulha (VU) no cabo, fone único de ouvido e cabo espiralado. Instrumento de bancada Gradiente: bege/cinza, logotipo REAL da Gradiente.' },
  'Servo-atuador de Pulso': { desc: 'IMPLANTE de punho avulso, pronto pra cirurgia: braçadeira interna de titânio com servo-atuadores e eletrodos de sincronização muscular, pinos de ancoragem e um ALOJAMENTO vazio pra enxerto de módulo no dorso — leitura claramente MÉDICA/invasiva. Linha Gradiente: acabamento bege/cinza cirúrgico.' },
}

// Marcas/organizações com identidade REAL: o mundo é fantasia, mas as marcas
// verdadeiras aparecem com seus logotipos atuais — senão o contexto confunde.
const LOGOS = {
  'Gradiente': 'o logotipo REAL da Gradiente (marca brasileira de eletrônicos)',
  'Panvel': 'o logotipo REAL da Panvel (rede de farmácias gaúcha)',
  'Tramontina': 'o logotipo REAL da Tramontina',
  'Zaffari': 'o logotipo REAL do Zaffari, incluindo o mascote ESQUILO da marca',
  'Renner': 'o logotipo REAL das Lojas Renner',
  'Marcopolo': 'o logotipo REAL da Marcopolo (fabricante de ônibus)',
  'Gurgel': 'o logotipo REAL da Gurgel Motores',
  'Embratel': 'o logotipo REAL da Embratel',
  'Mercur': 'o logotipo REAL da Mercur (borrachas, RS)',
  'Charrua': 'o logotipo REAL da erva-mate Charrua (ervateira gaúcha)',
  'Fruki': 'o logotipo REAL da Fruki (refrigerantes gaúchos do Vale do Taquari)',
  'Polar': 'o logotipo REAL da cerveja Polar (a cerveja do Rio Grande do Sul)',
  'Federação Gaúcha de Futebol': 'o escudo REAL da Federação Gaúcha de Futebol',
  'Sport Club Internacional': 'o escudo REAL do Sport Club Internacional (vermelho e branco)',
  'Grêmio Foot-Ball Porto Alegrense': 'o escudo REAL do Grêmio (tricolor azul, preto e branco)',
  'Camisa 12': 'o escudo REAL do Sport Club Internacional nas faixas, camisas e bandeiras da torcida',
  'Geral do Grêmio': 'o escudo REAL do Grêmio nas faixas, camisas e bandeiras da torcida',
  'Brigada Militar Metropolitana': 'a insígnia e o brasão REAIS da Brigada Militar do Rio Grande do Sul',
  'Companhia Estadual de Energia Elétrica': 'o logotipo REAL da CEEE',
  'Prefeitura de Porto Alegre': 'o brasão REAL do município de Porto Alegre',
  'Governo Militar Brasileiro': 'a bandeira do Brasil e o brasão REAL da República',
  'Governo Americano': 'a bandeira dos Estados Unidos e o selo REAL do governo americano',
  'Partido Comunista Soviético': 'a bandeira REAL da União Soviética (foice e martelo)',
  'Partido Comunista Chinês': 'a bandeira REAL da China e do Partido Comunista Chinês',
}

// Estética por fornecedor — inferida do texto de `restritos` do Contexto.
const MARCAS = [
  ['Gradiente', 'Estética Gradiente (eletrônica nacional): carcaça de plástico bege/cinza, LEDs, knobs e botões físicos, display de 7 segmentos. Estampe o logotipo REAL da Gradiente na carcaça.'],
  ['Panvel', 'Estética farmacêutica Panvel: branco/verde asséptico, lacre, tarja de controle, embalagem de farmácia. Estampe o logotipo REAL da Panvel na embalagem.'],
  ['Tramontina', 'Estética industrial Tramontina: aço escovado, rebites, cabo emborrachado vermelho ou preto. Estampe o logotipo REAL da Tramontina no item.'],
  ['Zaffari', 'Estética de equipamento de campo Zaffari: lona resistente, fivelas metálicas, verde institucional. Estampe o logotipo REAL do Zaffari (com o mascote esquilo).'],
  ['bancada lênica', 'Estética de bancada lênica artesanal: vidro soprado, mangueirinhas, braçadeiras, solda aparente, reagentes coloridos.'],
  ['Camelódromo', 'Estética de importado japonês de segunda mão do Camelódromo: carcaça com desgaste de uso, marca lixada, fita isolante.'],
  ['brechós', 'Estética de segunda mão dos brechós do Bom Fim: desgaste honesto de uso, remendos de qualidade.'],
  ['Brigada', 'Estética de equipamento policial da Brigada Militar: cinza-azulado, numeração estampada, marcas de uso pesado.'],
  ['Sete Portos', 'Estética de contrabando asiático do Clube dos Sete Portos: acabamento fino, motivos japoneses discretos.'],
  ['Quarto Distrito', 'Acabamento pirata do Quarto Distrito: solda exposta, carcaça remendada.'],
]
const semTier = (n) => n.replace(/ (Adept[ao]|Experiente|Mestre)$/, '')
const restritoDe = (orig) => RESTRITOS[orig] ?? RESTRITOS[semTier(orig)]
function esteticaDe(orig) {
  const r = restritoDe(orig)
  if (!r) return ''
  for (const [k, v] of MARCAS) if (r.includes(k)) return ` ${v}`
  return ''
}

// Base real dos selênicos (§5 do Contexto): família → base farmacológica.
const BASE_REAL = new Map()
{
  const sec = CONTEXTO_MD.split('## 5.')[1]?.split(/\n## /)[0] ?? ''
  for (const m of sec.matchAll(/^\| (Poção[^|]+) \| [^|]+ \| ([^|]+) \|$/gm)) BASE_REAL.set(m[1].trim(), m[2].trim())
}

// Índice do Sistema/ pra dizer no prompt o que o item é/faz (reskinado).
const SISTEMA = new Map()
for (const p of walk(join(VAULT, 'Sistema'))) SISTEMA.set(basename(p, '.md'), p)
function descItem(orig) {
  const p = SISTEMA.get(orig) ?? SISTEMA.get(semTier(orig))
  if (!p) return ''
  // Só a parte descritiva — o texto mecânico começa nos blocos de tier.
  const corpo = limpar(lerNota(p).corpo).split(/\b(?:Adept[oa]|Experiente|Mestre):/)[0]
  const d = cap(reskinText(corpo.trim()), 320)
  return d ? ` O que o item é/faz: ${d}` : ''
}

const TIER_COR = { Adepta: 'bronze', Experiente: 'prata', Mestre: 'dourado' }
// Formato canônico da GEMA por tier (conferido nos originais da fantasia,
// ex. Imbuição Flamejante): losango → retângulo facetado → oval.
const GEMA_TIER = {
  Adepta: 'LOSANGO facetado (formato diamante)',
  Experiente: 'RETÂNGULO facetado (lapidação esmeralda)',
  Mestre: 'OVAL lisa (cabochão)',
}
// Tarja farmacêutica por TIER (r9) — classificação canônica de "Tipos de
// Substâncias e Legalidade": quanto mais forte a dose, mais pesada a tarja.
const TARJA_TIER = {
  Adepta: 'TARJA AMARELA — venda liberada sem receita, com alerta de segurança',
  Experiente: 'TARJA VERMELHA — "VENDA SOB PRESCRIÇÃO MÉDICA", uso só com liberação médica',
  Mestre: 'TARJA PRETA — venda restrita: receita de especialista com retenção e cadastro biométrico do comprador',
}
// Identidade das linhas de selênico (r7): FORMA física por produto + tarja
// canônica ("Tipos de Substâncias e Legalidade" × disponibilidade) + rótulo.
const CONSUMIVEL = {
  'Cicatrilênico': {
    forma: 'um AUTOINJETOR/seringa de campo com a ampola do líquido visível',
    nome: 'Cicatrilênico',
    rotulo: 'o logotipo REAL da Panvel e o símbolo próprio da linha (sutura/cruz estilizada) em VERDE',
    tarja: 'faixa VERDE de VENDA LIVRE',
  },
  'Adrenalênico': {
    forma: 'um AUTOINJETOR/seringa de campo com a ampola do líquido visível',
    nome: 'Adrenalênico',
    rotulo: 'o logotipo REAL da Panvel e o símbolo próprio da linha (coração acelerado estilizado) em VERMELHO',
    tarja: 'TARJA VERMELHA de remédio controlado (uso só com liberação médica)',
  },
  'Vitalênico': {
    forma: 'uma CARTELA/blister de DOSE ÚNICA — um ÚNICO comprimido grande na cartela (é remédio de uma dose só); NADA de seringa e NADA de cartela cheia de comprimidos',
    nome: 'Vitalênico',
    rotulo: 'o logotipo REAL da Panvel e o símbolo próprio da linha (sol/espiga estilizado) em AZUL',
  },
  'Taurilênico': {
    forma: 'uma LATA (ou garrafinha) de refrigerante ULTRACONCENTRADO — energético de taurina selênica com ERVA-MATE',
    nome: 'Mate Touro',
    rotulo: 'co-branding com os logotipos REAIS de Panvel e da erva-mate Charrua (o da Charrua é o wordmark CHARRUA amarelo de contorno preto com "ERVA-MATE" em cima e duas folhas verdes — exatamente como na referência anexada); a CABEÇA DE TOURO própria da marca Mate Touro como símbolo central (sem copiar marca real de energético) e folhas de erva-mate no rótulo',
  },
}
// Identidade Mate Touro (r9): mesma cabeça de touro em todas as versões; o
// nome no rótulo é a COR da versão (casa com a tarja) e a brabeza escala.
const TOURO_TIER = {
  Adepta: { nome: 'MATE TOURO AMARELO', cara: 'touro sereno, traço limpo de logomarca' },
  Experiente: { nome: 'MATE TOURO VERMELHO', cara: 'touro BRAVO — sobrancelha fechada, narinas soltando vapor' },
  Mestre: { nome: 'MATE TOURO PRETO', cara: 'touro FURIOSO — olhos em chamas e faíscas de energia, respeitando o traço da marca' },
}

// AplicavelA das imbuições (FM do Sistema/) → direção visual do módulo:
// a forma/pictograma tem que indicar EM QUE ARMA o módulo se acopla.
const APLICAVEL = new Map()
for (const p of walk(join(VAULT, 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade/Imbuições'))) {
  const m = readFileSync(p, 'utf8').match(/AplicavelA ([^\n]+)/)
  if (m) APLICAVEL.set(basename(p, '.md'), m[1].trim())
}
// A amostra HOSPEDEIRA do enxerto segue o alvo real do módulo — lâmina só
// quando o módulo é de arma de corte.
function amostraModulo(familia) {
  const regra = APLICAVEL.get(familia)
  if (!regra) return 'um segmento curto de LÂMINA genérica'
  const cac = /cac-marcial|cac-simples/.test(regra)
  const dist = /d-marcial|d-simples/.test(regra)
  const arremesso = /Arremesso/.test(regra)
  const tipos = (regra.match(/Tipo,([^ ]+)/)?.[1] ?? '').split('|').filter(Boolean)
  const duasMaos = /Duas-mãos|Maos,2/.test(regra)
  // Hospedeiras validadas contra o ROSTER real de armas do mundo (FM de
  // Sistema/Equipamento/Armas): perfuração inclui facas (Navalha, Faca
  // Militar) — lâmina perfurante é legítima; contusão vai de Cassetete a
  // Pedaço de Trilho e Chave de Grifo — não é só marreta; nas de disparo o
  // enxerto vai na ESTRUTURA da arma (haste de arco/coronha), NUNCA na
  // munição.
  if (arremesso) return 'uma arma CURTA de ARREMESSO do mundo (vergalhão, machadinha ou punhal), com o módulo fundido no corpo/cabo dela — NADA de espada grande'
  if (dist && !cac) return 'a seção ESTRUTURAL de uma arma de DISPARO — trecho de coronha/cilindro de uma carabina de pressão ou braço (haste) de um arco — com o módulo fundido como um colar/bloco soldado envolvendo essa estrutura; o módulo fica na ARMA, então NADA de munição, dardos ou flechas na imagem, e NADA de lâmina'
  let host
  const caboGen =
    'uma seção de CABO/EMPUNHADURA genérica e CURTA (o módulo serve em armas de vários tipos — se instala no cabo) — NADA de lâmina'
  if (tipos.length >= 2) return caboGen // multi-tipo (corte|perfuração)
  if (cac && dist) return caboGen // serve em TODO grupo de arma
  if (tipos.includes('corte'))
    host =
      'apenas a PONTA — o terço final — de uma lâmina genérica CURTA, pequena e discreta no quadro (r11: a lâmina NÃO domina a imagem; o protagonista é o MÓDULO, a lâmina é só contexto de encaixe)'
  else if (tipos.includes('perfuração')) host = 'uma PONTA PERFURANTE — de arpão, vergalhão, picareta ou faca — com o destaque na PONTA, não no fio de corte; NADA de espada'
  else if (tipos.includes('contusão')) host = 'uma extremidade de IMPACTO em metal bruto — ponta de barra de ferro, cano pesado ou massa de martelo (as armas de contusão do mundo vão de cassetete a pedaço de trilho) — NADA de lâmina'
  else host = 'uma seção de CABO/EMPUNHADURA genérica (o módulo serve em QUALQUER arma corpo-a-corpo, se instala no cabo) — NADA de lâmina'
  if (duasMaos) host += ', com perfil um pouco mais robusto (arma de duas mãos) mas ainda SÓ a ponta'
  if (cac && dist) host += ' (serve em armas corpo-a-corpo e de disparo)'
  return host
}
const RODAPE_T =
  ' Objeto único isolado, sem personagens, sem moldura, sem texto legível além dos logotipos de marca pedidos no prompt. Fundo 100% transparente.' +
  ' O objeto em si é 100% SÓLIDO e opaco — transparência SÓ no fundo, NUNCA dentro do objeto (nada de furos falsos de recorte).' +
  ' O objeto INTEIRO dentro do quadro, centralizado, com FOLGA generosa em todas as bordas — nunca encostando nem cortado pelas bordas (nada de zoom cortado: a silhueta fecha completa no meio da imagem).' +
  ' Gere em PNG, proporção paisagem 3:2 (1536×1024), com fundo transparente de verdade (canal alfa).'

// r6: imagens APROVADAS pelo user viram MODELO — os tiers irmãos seguem a
// MESMA lógica visual, trocando só cor/acabamento. r13: o modelo é o PRÓPRIO
// arquivo final em Recursos de Contextos (o snapshot _estilo era duplicata).
const ESTILO = join(CTX_ROOT, 'Imbuições e Têmperas')
const MODELO_SELO = {
  Arma: { icone: 'um FACÃO dentro do emblema — o símbolo do governo para armas, IDÊNTICO nos três tiers' },
  Armadura: { icone: 'o MESMO colete/peitoral blindado do modelo, IDÊNTICO nos três tiers' },
  Escudo: { icone: 'o MESMO escudo central do modelo, IDÊNTICO nos três tiers' },
  Ferramenta: { icone: 'o MESMO ícone do modelo — a chave de fenda cruzada com o martelo — IDÊNTICO nos três tiers' },
  // Broquel não gera: os selos do Escudo de Choque são copiados no ingest.
}
const MODELO_MODULO = {
  'Imbuição Incendiária': 'Módulo Incendiário Experiente.png',
  'Imbuição Relampejante': 'Módulo Relampejante Experiente.png',
}
// Correções a aplicar SOBRE o modelo aprovado (r9/r10). ATENÇÃO comum: o
// modelo é sempre o tier Experiente (gema retangular) — o formato da gema
// NÃO se copia do modelo, segue o tier da entrada.
const MODELO_AJUSTE = {
  'Imbuição Relampejante':
    ' Corrija em relação ao modelo: NENHUM link físico entre as peças — a conexão é um arco magnético-relampejante saltando pelo AR, com o vão bem visível entre elas; e no lugar de uma arma inteira, mostre apenas um CABO DE FACA PEQUENA como peça pareada da luva (o link vale pra facas, machadinhas e afins de arremesso — a imagem tem que valer pra todas).' +
    ' A cor da runa/gema é VERDE — exatamente o mesmo verde do modelo; NÃO mude a cor.' +
    ' NÃO copie o FORMATO da gema do modelo (que é o retângulo do Experiente): use o formato do tier desta entrada.',
  'Imbuição Incendiária':
    ' ATENÇÃO: o modelo anexado é o tier Experiente e a gema dele é RETANGULAR — NÃO copie esse formato: a gema desta entrada segue o formato canônico do SEU tier (veja abaixo), mantendo material, cor e efeito iguais aos do modelo.',
}
// Referência de imagem trocada pelo MODELO aprovado (não a arte fantasia).
const REF_ESTILO = {
  'Arma Obra-prima': 'Arma Premium Mestre.png',
  'Armadura Obra-prima': 'Armadura Premium Adepta.png',
  'Escudo Obra-prima': 'Escudo de Choque Premium Experiente.png',
  'Ferramenta Obra-prima': 'Ferramenta Premium Mestre.png',
  'Imbuição Incendiária': MODELO_MODULO['Imbuição Incendiária'],
  'Imbuição Relampejante': MODELO_MODULO['Imbuição Relampejante'],
}
// Conceitos próprios (r6, decididos pelo user) pros alvos onde o enxerto
// simples não comunicava o uso.
// r9: os três viraram o MESMO conceito compacto — módulo fundido num cabo
// curto genérico (a munição é comum; quem carrega o efeito é a ARMA).
const CABO_COMPACTO =
  'um MÓDULO COMPACTO fundido num CABO CURTO e genérico de arma: o cabo é PEQUENO (curto o bastante pra valer por faca, lança, besta ou arco), deitado na HORIZONTAL ocupando a base da imagem, com a placa/gomo do módulo soldada nele e o NÚCLEO na janela de resina por cima. SOMENTE o cabo com o módulo: sem lâmina, sem ponteira, sem munição e sem arma inteira. A orientação é padronizada — igual nos três tiers.'
const CONCEITO_MODULO = {
  'Imbuição Explosiva': CABO_COMPACTO,
  'Imbuição Enraizante': CABO_COMPACTO,
  'Imbuição Hidratante': CABO_COMPACTO,
  // r11 (report 2026-09-04): módulo que serve em vários tipos/grupos de arma
  // não pode morar numa lâmina — vai pro CABO genérico como os de cima.
  'Imbuição Congelante': CABO_COMPACTO, // todo grupo (cac e distância)
  'Imbuição Torrencial': CABO_COMPACTO, // corte OU perfuração
  // r12 (validação 2026-09-04): a tentativa de "ponta de lâmina" pros
  // corte-only não convenceu — TODA família sem modelo aprovado vai de CABO,
  // mesma lógica do resto.
  'Imbuição Ciclonal': CABO_COMPACTO,
  'Imbuição da Ventania': CABO_COMPACTO,
  'Imbuição Flamejante': CABO_COMPACTO,
  'Imbuição Mineral': CABO_COMPACTO,
}
const RODAPE_PECAS = RODAPE_T.replace('Objeto único isolado', 'Somente as peças descritas, isoladas')

// r12: logotipos REAIS baixados (Inbox de Imagens/_logos) viram REFERÊNCIA
// ADICIONAL anexada sempre que o prompt pede o logotipo real da marca — o
// gerador não conhece as marcas gaúchas de cor (report 2026-09-04: Charrua
// e Panvel saíram inventados).
const LOGOS_DIR = join(GERACAO, 'logos')
// Arquivos prefixados com "logo-" pra NUNCA colidirem por basename com as
// imagens das organizações homônimas (Charrua.png etc. — r13).
const LOGO_FILES = ['Charrua', 'Gradiente', 'Panvel', 'Tramontina']
function logosDoPrompt(prompt) {
  if (!/logotipos? REA/i.test(prompt)) return []
  return LOGO_FILES.filter((n) => prompt.includes(n)).map((n) => join(LOGOS_DIR, `logo-${n}.png`)).filter(existsSync)
}

function promptFigura(sub, orig, novo) {
  const obtencao = restritoDe(orig) ? ` Contexto de obtenção: ${restritoDe(orig)}.` : ''
  const cabecalho = `Ilustração de item para carta de RPG, ${MUNDO}.`

  // Linha Premium (ex-Obra-prima): selo de certificação governamental.
  const premium = orig.match(/^(Arma|Armadura|Escudo|Broquel|Ferramenta) Obra-prima (Adepta|Experiente|Mestre)$/)
  if (premium) {
    const cfg = MODELO_SELO[premium[1]]
    if (cfg) {
      const tier = premium[2]
      return (
        `${cabecalho} A imagem anexada é o SELO APROVADO que serve de MODELO da linha Premium.` +
        ` Recrie o selo "${novo}" com EXATAMENTE a mesma lógica visual do modelo: mesma moldura de etiqueta metalizada com aro serrilhado, o logotipo REAL do INMETRO na MESMA posição, e o identificador de série na MESMA posição na base — com os números TODOS ZERO (000000: é o selo-padrão, não uma unidade numerada).` +
        ` Pictograma central: ${cfg.icone}.` +
        ` UMA cor metálica domina o selo inteiro: ${TIER_COR[tier]} (tier ${tier}).` +
        (tier === 'Mestre'
          ? ` Inclua a FAIXA HOLOGRÁFICA de autenticidade furta-cor (reflexos metálicos de arco-íris, como selo de autenticidade) — marca exclusiva do tier Mestre.`
          : ` SEM faixa holográfica furta-cor — ela é exclusiva do tier Mestre.`) +
        ` NENHUMA marca comercial no selo — quem certifica é o ESTADO (INMETRO).${RODAPE_T}`
      )
    }
    const picto = {
      Arma: 'uma lâmina de facão', Armadura: 'um colete/peitoral', Escudo: 'um escudo retangular',
      Broquel: 'um escudo redondo pequeno', Ferramenta: 'uma chave de fenda e um martelo cruzados',
    }[premium[1]]
    return (
      `${cabecalho} A imagem anexada é o selo "${orig}" da versão fantasia; recrie na mesma composição como o selo da linha Premium, com a cara INCONFUNDÍVEL do selo do INMETRO brasileiro:` +
      ` uma ETIQUETA ADESIVA DE CERTIFICAÇÃO como as coladas em produtos certificados — moldura de etiqueta metalizada com aro serrilhado, o logotipo REAL do INMETRO em destaque, microtexto circular, numeração de série e brilho holográfico de autenticidade —` +
      ` com ${picto} como pictograma central da categoria certificada.` +
      ` UMA cor metálica principal domina o selo inteiro: ${TIER_COR[premium[2]]} (tier ${premium[2]}).` +
      // sem `obtencao` de propósito: o restritos menciona a marca da linha e o
      // modelo desenhava o logotipo no selo — certificação é ESTATAL (r3);
      // INMETRO é órgão do Estado, então o logotipo dele PODE (r4).
      ` NENHUMA marca comercial no selo — quem certifica é o ESTADO (INMETRO), não uma empresa.${RODAPE_T}`
    )
  }

  // Módulos (ex-imbuições): enxerto PERMANENTE de oficina — a imbuição é
  // fundida na arma e não sai mais (r3: cartucho parecia removível).
  if (sub === 'Imbuições e Têmperas' && novo.startsWith('Módulo')) {
    const fam = semTier(orig)
    const tierMod = novo.match(/(Adepta|Experiente|Mestre)$/)?.[1]
    const acabamento = {
      Adepta: 'instalação PIRATA do Quarto Distrito: solda grossa e irregular, respingos, fita isolante segurando a fiação',
      Experiente: 'instalação de oficina competente: solda limpa, chapa escovada, rebites alinhados',
      Mestre: 'instalação de FÁBRICA Gradiente: enxerto perfeitamente rente à lâmina (flush), acabamento polido, junção quase invisível',
    }[tierMod]
    const gema = GEMA_TIER[tierMod] ? ` A GEMA/núcleo segue o formato canônico do tier: ${GEMA_TIER[tierMod]}.` : ''
    if (MODELO_MODULO[fam]) {
      return (
        `${cabecalho} A imagem anexada é o MÓDULO APROVADO da MESMA família (tier Experiente), usado como MODELO.` +
        ` Recrie exatamente o mesmo conceito, composição, hospedeira e estilo para "${novo}", mudando o acabamento pro tier ${tierMod}: ${acabamento}.` +
        (MODELO_AJUSTE[fam] ?? '') + gema + RODAPE_T
      )
    }
    const conceito = CONCEITO_MODULO[fam]
    if (conceito) {
      return (
        `${cabecalho} A imagem anexada é "${orig}" da versão fantasia — o material/efeito elemental puro (a GEMA/núcleo). Recrie como "${novo}": ${conceito}` +
        ` O núcleo/gema preserva exatamente o material/efeito da imagem de referência, com o polimento da original.` + gema +
        `${acabamento ? ` Acabamento do tier: ${acabamento}.` : ''}${obtencao}${RODAPE_PECAS}`
      )
    }
    return (
      `${cabecalho} A imagem anexada é "${orig}" da versão fantasia — o material/efeito elemental puro. Recrie como "${novo}", um ENXERTO DE OFICINA PERMANENTE:` +
      ` mostre ${amostraModulo(semTier(orig))} (amostra de balcão de oficina, como um mostruário) com o módulo já FUNDIDO —` +
      ` uma placa/gomo de aço soldada e rebitada no corpo da amostra, com o NÚCLEO embutido numa janela de resina: exatamente o material/efeito da imagem de referência, preservando o polimento da original.` +
      ` Fiação curta enrolada e terminada no próprio enxerto — NADA de encaixe, trava, contato ou pegador: a peça é IRREVERSÍVEL, não sai mais da arma.` +
      ` Na imagem aparecem SOMENTE a amostra descrita e o módulo — nenhuma outra peça, arma, ferramenta ou fundo de cenário.` +
      `${acabamento ? ` Acabamento do tier: ${acabamento}.` : ''} Sem logotipo estampado — a origem aparece no acabamento.${obtencao}${RODAPE_T}`
    )
  }

  // Armas naturais mantidas (bestiário): seguem orgânicas, nunca fabricadas.
  if (novo === orig && /^(Mandíbula|Garras|Presas|Cauda|Chifres)( |$)/.test(orig)) {
    return (
      `${cabecalho} A imagem anexada é a arma natural "${orig}" — garra/presa/mandíbula/cauda/chifre de criatura do bestiário.` +
      ` Recrie a MESMA composição e estilo de pintura digital, mantendo o item como ARMA NATURAL ORGÂNICA de criatura MUTANTE do mundo (mutação urbana por selênicos): tecido, queratina e osso, com leitura tóxico-industrial dos anos 80.` +
      ` NÃO transformar em objeto fabricado, ferramenta nem arma manufaturada.${RODAPE_T}`
    )
  }

  // Consumíveis: drogas farmacêuticas de verdade, com marca e tarja.
  if (sub === 'Consumíveis') {
    const base = BASE_REAL.get(semTier(orig))
    const tier = orig.match(/(Adepta|Experiente|Mestre)$/)?.[1]
    const apresentacao = {
      Adepta: 'embalagem simples de balcão', Experiente: 'linha reforçada, embalagem mais robusta',
      Mestre: 'dose máxima, lacre metálico e embalagem premium',
    }[tier]
    const c = CONSUMIVEL[semTier(novo)]
    const touro = semTier(novo) === 'Taurilênico' ? TOURO_TIER[tier] : null
    const nome = touro?.nome ?? c.nome
    return (
      `${cabecalho} A imagem anexada é "${orig}" da versão fantasia (uma poção); recrie na mesma composição como "${novo}", um SELÊNICO — droga farmacêutica brasileira de 1987${base ? ` (base real: ${base})` : ''}.` +
      ` FORMA do produto: ${c.forma}. Nunca um frasco de poção.` +
      ` Rótulo: ${c.rotulo} — tem que dar pra reconhecer de longe QUAL produto é.` +
      (touro ? ` A cabeça de touro é a MESMA em todas as versões (identidade da marca Mate Touro), mudando só a expressão neste tier: ${touro.cara}.` : '') +
      ` A TARJA é por FORÇA DA DOSE e tem que ficar CLARAMENTE visível — uma faixa retangular horizontal IMPRESSA na embalagem, como nos remédios brasileiros de verdade, com o texto de classificação sugerido dentro da faixa. Nesta versão: ${TARJA_TIER[tier] ?? 'faixa de identidade da linha'}. Batendo o olho tem que dar pra saber a classificação.` +
      ` O nome "${nome}" pode aparecer escrito no rótulo; nenhum outro texto legível além disso e da tarja.` +
      ` A ARTE na mesma linguagem de pintura digital das demais cartas de item do sistema (nada de render de produto destoante).` +
      `${tier ? ` Tier ${tier}: ${apresentacao}.` : ''}${obtencao}${RODAPE_T}`
    )
  }

  // Implementos: os Focos são válvulas selênicas (peça encaixável ≠ cartucho).
  if (sub === 'Implementos') {
    return (
      `${cabecalho} A imagem anexada é "${orig}" da versão fantasia; recrie na mesma composição como a versão de 1987:` +
      ` uma VÁLVULA SELÊNICA da Gradiente — válvula termiônica de vidro (como as de amplificador valvulado), com o cristal/filamento selênico brilhando dentro e base metálica de pinos pra espetar no soquete do adaptador do operador.` +
      ` NÃO é um cartucho: é uma válvula de vidro, com o logotipo REAL da Gradiente gravado na base metálica.${descItem(orig)}${esteticaDe(orig)}${obtencao}${RODAPE_T}`
    )
  }

  // Overrides pontuais de arte (escudos).
  if (orig === 'Escudo') {
    return (
      `${cabecalho} A imagem anexada é o escudo da versão fantasia; recrie na mesma composição como "Escudo de Choque":` +
      ` o escudo de TROPA DE CHOQUE em 1987 — retangular, policarbonato/acrílico translúcido com armação e rebites metálicos, janela de visão, alças de antebraço e marcas reais de uso.` +
      ` Fabricação civil registrada: estampe o logotipo REAL da Tramontina discreto na face inferior do escudo. NENHUM emblema, brasão, insígnia ou símbolo inventado (r12: o emblema de capacete espartano da versão anterior não existe no mundo).${obtencao}${RODAPE_T}`
    )
  }
  if (orig === 'Broquel') {
    return (
      `${cabecalho} A imagem anexada é o broquel da versão fantasia (um escudo PEQUENO); recrie na mesma composição como "Escudo de Braço":` +
      ` placa compacta redonda/oval de uns 40 cm, aço com borda de borracha, com DUAS correias de antebraço bem visíveis por trás — as correias e as proporções deixam claro que é um escudo pequeno de ANTEBRAÇO, não um escudo de corpo.${obtencao}${RODAPE_T}`
    )
  }

  // Equipamentos (r3): conceito dedicado por item — a referência da fantasia
  // vale só pelo ESTILO de pintura; a forma nova é a do conceito.
  if (sub === 'Equipamentos') {
    const conceito = CONCEITO_EQUIP[semTier(novo)]
    if (conceito) {
      const tierEq = novo.match(/(Adept[ao]|Experiente|Mestre)$/)?.[1]
      const tierTxt = conceito.tiers?.[tierEq] ? ` Tier ${tierEq}: ${conceito.tiers[tierEq]}.` : ''
      return (
        `${cabecalho} Use a imagem anexada SÓ como referência de estilo de pintura digital — a FORMA do item é nova, componha livremente o enquadramento que melhor apresenta o objeto.` +
        ` "${novo}": ${conceito.desc}${tierTxt}${descItem(orig)}${obtencao}${RODAPE_T}`
      )
    }
  }

  const renomeado = novo !== orig
  const extra = sub === 'Equipamentos'
    ? `${descItem(orig)} Tem que ficar ÓBVIO como e onde o item se veste/usa/equipa no corpo.${esteticaDe(orig)}`
    : ''
  return (
    `${cabecalho} A imagem anexada é o item "${orig}" da versão fantasia medieval do jogo; recrie A MESMA composição, enquadramento, iluminação e estilo de pintura digital, ` +
    (renomeado
      ? `substituindo o item pela sua contraparte de 1987: "${novo}".`
      : `reinterpretando o item "${orig}" com materiais e leitura coerentes com 1987.`) +
    ` ${HINT_FIG[sub]}${extra}${obtencao}${RODAPE_T}`
  )
}

// §2.2 Identidades: "**Químico (Animista).** parágrafo…" (só o 1º parágrafo,
// sem o *Guia:* mecânico). §2.1: arsenal típico por classe do mundo.
const IDENTIDADES = new Map()
for (const m of CONTEXTO_MD.matchAll(/\*\*([^*(\n]+) \(([^)\n]+)\)\.\*\*\s*([^\n][\s\S]*?)(?=\n\s*\n)/g)) {
  IDENTIDADES.set(m[2].trim(), { mundo: m[1].trim(), texto: limpar(m[3]) })
}
const ARSENAL = new Map()
{
  const sec = CONTEXTO_MD.split('### 2.1')[1]?.split('###')[0] ?? ''
  for (const m of sec.matchAll(/^\| ([^|—-][^|]*) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)) {
    if (m[1].trim() === 'Classe') continue
    ARSENAL.set(m[1].trim(), `Armas típicas: ${m[2].trim()}; proteção: ${m[3].trim()}; onde se arma: ${m[4].trim()}`)
  }
}

function promptClasse(fantasia, mundo) {
  const id = IDENTIDADES.get(fantasia)
  const arsenal = ARSENAL.get(mundo)
  return (
    `Retrato de arquétipo de personagem para o RPG, ${MUNDO}.` +
    ` A imagem anexada é a classe "${fantasia}" da versão fantasia medieval; recrie a MESMA composição, pose, clima e estilo de pintura digital, substituindo o personagem pelo equivalente de 1987: "${mundo}".` +
    (id ? ` Identidade: ${cap(id.texto, 500)}` : '') +
    (arsenal ? ` ${arsenal}.` : '') +
    ` O personagem é um ARQUÉTIPO da classe, não um indivíduo: o rosto NÃO fica em destaque nem identificável (ângulo, sombra, capuz, óculos, contraluz).` +
    ` O fundo é Porto Alegre em 1987, urbano e reconhecível (Centro, orla do Guaíba, bairro coerente com a classe) — nunca campo, floresta, igreja ou cenário genérico.` +
    ` PROIBIDO qualquer coisa que pareça arma de fogo (Decreto das Armas Frias): equipamento de alcance é besta, pressão de ar ou lançador de dardos, com visual claramente distinto de arma de fogo.` +
    ` Figurino, cabelo e objetos de cena verossímeis do Brasil de 1987 (nada medieval). Sem texto, formato quadrado 1024×1024.`
  )
}

// §3: os tipos de Empregado ("| … Canino | Segurança | perfil |").
const EMPREGADOS = new Map()
for (const m of CONTEXTO_MD.matchAll(/^\| … ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)) {
  EMPREGADOS.set(m[1].trim(), { mundo: m[2].trim(), perfil: limpar(m[3]) })
}

function promptCompanheiro(tipo, mundo, perfil) {
  return (
    `Retrato de arquétipo para o RPG, ${MUNDO}.` +
    ` A imagem anexada é o "Companheiro Animal ${tipo}" da versão fantasia medieval (um animal); no mundo de 1987 essa função é exercida por "${mundo}" — NÃO é um animal: ${perfil}.` +
    ` Recrie o retrato com a MESMA composição vertical, clima e estilo de pintura digital, mostrando ${mundo === 'Zangão'
      ? 'o drone em voo: um QUADRICÓPTERO de 1987 com EXATAMENTE 4 hélices simétricas, todas visíveis e completas (nenhuma faltando ou cortada), design analógico-futurista em fibra, com câmera e antena'
      : `essa pessoa empregada no Brasil de 1987 como ARQUÉTIPO ANÔNIMO — o rosto NÃO pode ser identificável: enquadrar de costas, em meio-perfil distante ou com o rosto encoberto (boné, capacete, óculos escuros, sombra); figurino e atitude coerentes com o perfil`}.` +
    ` O fundo é Porto Alegre em 1987, reconhecível (arcos do Mercado Público, orla do Guaíba, prédios do Centro, palafitas — o que combinar com a função).` +
    ` Sem texto, formato retrato 1024×1536.`
  )
}

// r3: cena fotográfica escrita à mão por nota — UM lugar real de POA, UM
// momento, como um fotógrafo de 1987 esperando o instante que conta a
// história. Mata a lista de logos no prompt (era o que enchia toda imagem de
// megacorporação) — marca só quando a própria cena pede, no máximo uma.
const CENA_CONTEXTO = {
  'Adaptações Urbanas': 'rua de bairro baixo FORA do Centro (Azenha/Menino Deus), alagada na altura da canela; moradores atravessam numa passarela improvisada de tábuas e caixotes; "gatos" de fios elétricos cruzam de poste a poste; sacos de areia empilhados nas portas das lojas.',
  'Degradação Ambiental': 'orla do Guaíba ao entardecer: céu laranja-fuligem, espuma química na beira, um pescador parado olhando a rede vazia; chaminés fumegando na silhueta da margem oposta.',
  'Desastres Ignorados': 'num bairro alagadiço FORA do Centro, família toma chimarrão no segundo andar de um sobrado com o térreo alagado, móveis empilhados; na rua, um ônibus passa abrindo marola e ninguém se espanta.',
  'Escassez de Recursos': 'fila diante de uma loja de componentes de esquina; prateleiras quase vazias vistas pela vitrine; um técnico sai carregando uma única válvula embrulhada em jornal como se fosse ouro.',
  'Comércio Ilegal e Experimentação Química': 'porão de casarão do Bom Fim: bancada de laboratório improvisada, vidraria borbulhando líquido iridescente, um químico de avental anotando; escada ao fundo com um vigia.',
  'Impactos na Saúde e Estratégias de Controle': 'corredor de posto de saúde lotado sob luz fluorescente; um homem com tremor nas mãos segura a senha; cartaz desbotado de campanha na parede descascada.',
  'Reatividade Selênica e Tipagem': 'balcão de farmácia: a atendente carimba o RG de um jovem; fila atrás esperando o exame de sangue, expressões tensas; luz fria de balcão.',
  'Tipos de Substâncias e Legalidade': 'vitrine de farmácia à noite: caixas de remédio com tarjas coloridas organizadas por linha (verde, amarela, vermelha, azul) atrás do vidro gradeado; neon refletido na vitrine.',
  'Uso Cotidiano e Normalização Social': 'parada de ônibus de manhã cedo: trabalhadores de macacão aplicam autoinjetores no antebraço com a naturalidade de quem toma café; um deles lê jornal enquanto pressiona o injetor.',
  'Acesso a Recursos Básicos': 'fila do caminhão-pipa numa vila: mulheres e crianças com baldes e galões; um soldado marca os galões com giz; sol forte, sombras longas.',
  'Divisão de Classes': 'muro alto com concertina separando dois mundos: de um lado torres envidraçadas de Moinhos de Vento, do outro telhados de zinco e palafitas; uma criança olha pelo vão do portão de serviço.',
  'Mercado de Trabalho': 'mural de classificados numa EMPENA junto ao calçadão do novo piso flutuante do Centro: dezenas de pessoas apinhadas na passarela de tábuas lendo papéis pregados, água escura visível sob o deck; um homem de terno gasto copia um número num caderninho. NENHUMA rua seca, NENHUM carro ou ônibus.',
  'Moeda e Sistemas de Troca': 'banca do Camelódromo sobre o DECK de tábuas do novo piso flutuante do Centro — a água escura aparece entre as tábuas e ao fundo, com barcos amarrados: um relógio de pulso passa de mão em troca de um maço de cruzeiros amarrotados E duas ampolas; o vendedor confere a nota contra a luz. NENHUMA praça seca, NENHUM carro.',
  'Energia e Saneamento': 'apagão no bairro à noite: o quarteirão inteiro escuro com UMA janela iluminada a gerador; ao fundo, a usina a carvão com as chaminés acesas trabalhando.',
  'Moradia e Ocupação': 'palafitas sobre a água na beira do Guaíba ao amanhecer: passarelas de tábua ligando as casas, roupa no varal, antena de TV improvisada em cada telhado.',
  'Redes de Comunicação': 'telhado noturno no Bom Fim: dois jovens ajustam uma antena pirata caseira apontada pro Centro; abaixo, a cidade acesa; um deles segura um rádio de mão remendado com fita isolante.',
  'Transporte e Mobilidade': 'o Aeromóvel passando no trilho elevado, moderno e vazio; embaixo, na sombra do trilho, uma lotação apinhada com gente pendurada na porta.',
  'Governo e Influência Corporativa': 'salão oficial: militares de farda e executivos de terno lado a lado posando para foto sob um retrato gigante do Marechal; aperto de mão ao centro.',
  'Propaganda e Controle da Informação': 'banca de revista de esquina: todas as capas de jornal com a MESMA manchete e a MESMA foto oficial; o jornaleiro entrega por baixo um pasquim dobrado a um cliente que olha por cima do ombro.',
  'Sistema Legal': 'tribunal militar: réu de macacão diante de uma bancada de juízes fardados; o advogado civil minúsculo no canto do quadro; bandeira e brasão dominando a parede.',
  'Vigilância e Mecanismos de Repressão': 'rua residencial banal ao entardecer; acima dos telhados, um drone militar de quatro hélices paira com a lente refletindo o sol; embaixo, uma senhora recolhe roupa do varal sem olhar pra cima.',
  'Crimes Cotidianos': 'beco depois do assalto: homem sentado no meio-fio com o braço enfaixado onde ERA a prótese; um curioso espia; ao fundo o ladrão some na esquina com algo embrulhado.',
  'Criminalidade Organizada': 'mesa de bar nos fundos: treze cadeiras, homens de idades e estilos diferentes jogando cartas com maços de dinheiro e um mapa da cidade riscado a caneta sobre a mesa.',
  'Policiamento': 'blitz noturna: fila de pessoas contra a parede sob a luz dura do farol da viatura; um soldado da Brigada confere o documento de um jovem com uma lanterna.',
  'Sistema Penal': 'pátio de presídio-fábrica: detentos de uniforme montando placas de circuito em bancadas enfileiradas sob o olhar de guardas numa passarela elevada; relógio de ponto na parede.',
  'Educação e Conhecimento': 'aula clandestina num galpão: vinte pessoas sentadas em caixotes ao redor de um professor com um retroprojetor ligado num gerador; janelas tapadas com jornal.',
  'Entretenimento e Escapismo': 'show punk num galpão do Quarto Distrito: banda no palco improvisado de pallets, plateia em roda de pogo sob UMA lâmpada pendurada, suor e fumaça no ar.',
  'Expressão Artística': 'madrugada no Centro afundado: de cima de um barco a remo, um grafiteiro encapuzado termina um mural gigante na parte EMERSA de uma fachada colonial — a linha d`água corta o prédio no meio do segundo andar e o reflexo do mural treme na água escura; o parceiro vigia de uma passarela flutuante. NENHUMA rua seca.',
  'Subculturas e Grupos Marginalizados': 'tarde no Parcão: roda de punks trocando fitas cassete sob as árvores, jaquetas de couro pintadas à mão, um radinho no meio da roda; ao longe, um casal engomadinho observa desconfiado.',
  'Acesso a Tecnologia': 'vitrine de revenda de eletrônicos em Moinhos de Vento: um executivo experimenta um visor novo atendido por vendedor de gravata; do lado de fora, dois guris colados no vidro olhando.',
  'Hacking e Guerra Digital': 'quarto escuro atulhado: um jovem de fone diante de três monitores de fósforo verde empilhados, modem acústico com o telefone acoplado, paredes forradas de anotações; a única luz vem das telas.',
  'Modificações Corporais': 'oficina de fundo de loja: um técnico de lupa frontal ajusta o implante no antebraço aberto de um cliente sentado em cadeira de barbeiro; bandeja com ferramentas; o cliente olha pro lado, tranquilo.',
  'Trônica e Lênica': 'bancada dividida ao meio numa oficina: à esquerda válvulas, chips e ferro de solda; à direita vidraria, reagentes coloridos e bico de Bunsen; duas pessoas trabalhando de costas uma pra outra.',
}

function promptContextoAtual(nome, assunto, excerto) {
  const cena = CENA_CONTEXTO[nome]
  return (
    `Fotografia de época para o RPG, ${MUNDO}.` +
    (cena
      ? ` A cena, como um fotógrafo de 1987 esperando o momento exato que conta a história: ${cena}`
      : ` Tema: "${nome}"${assunto ? ` — ${assunto}` : ''}. Componha UMA cena forte que sintetize o tema a partir deste contexto do mundo: ${excerto}`) +
    ` O lugar é Porto Alegre de verdade — arquitetura, clima e atmosfera reconhecíveis da cidade.` +
    ` UMA cena, UM momento: não encher o quadro de elementos; SOMENTE os elementos descritos na cena — NÃO invente extras; NO MÁXIMO UMA marca/logotipo real, e só se a própria cena pedir — nada de vitrines cheias de megacorporações.` +
    ` Estilo: pintura digital cinematográfica SEMIRREALISTA — o MESMO estilo das demais ilustrações do sistema (não é foto realista) — com leve textura de época: grão de filme, cores anos 80, luz natural.` +
    ` Nenhum texto legível. Proporção paisagem 3:2 (1536×1024).`
  )
}

function promptOrganizacao(nome, sub, excerto) {
  const logo = LOGOS[nome]
  return (
    `Imagem de identidade visual da organização "${nome}" (${sub || 'organização'}) para o RPG, ${MUNDO}.` +
    ` Uma cena emblemática que comunique de imediato quem é essa organização, baseada neste contexto do mundo: ${excerto}` +
    (logo
      ? ` USE ${logo} — o logotipo/escudo VERDADEIRO, como é conhecido hoje, aplicado com destaque à cena de 1987 (fachada, uniforme, frota, letreiro, bandeira). O mundo é fantasia, mas as marcas reais aparecem como são. Nenhum texto legível além do logotipo/escudo da marca.`
      : ` Se marcas reais do mundo aparecerem na cena (Gradiente, Panvel, Tramontina, Zaffari com o esquilo, Embratel, CEEE…), use seus logotipos verdadeiros; fora isso, sem texto legível.`) +
    ` Estilo: pintura digital cinematográfica, estética brasileira dos anos 80.` +
    ` Proporção paisagem 3:2 (1536×1024).`
  )
}

// r11 (report 2026-09-04): o nível d'água canônico não estava segurando só
// pelo excerto da nota — o Centro Histórico foi SEPULTADO pela enchente de
// 1986 (1,5–2 andares de água) e um novo piso flutuante foi inaugurado em
// 1987 POR CIMA. Cena escrita à mão pros locais onde isso é estrutural.
const AGUA_CENTRO =
  'NÍVEL DA ÁGUA CANÔNICO: o centro antigo está afundado — a água cobre TODO o térreo e chega ao meio do segundo andar dos prédios antigos (1,5 a 2 andares); NENHUMA rua seca, NENHUM carro ou ônibus circulando: a circulação é por passarela, deck e barco.'
const CENA_LOCAL = {
  'Centro Histórico':
    `${AGUA_CENTRO} A cena: o "novo piso" flutuante inaugurado em 1987 sobre o centro afundado — calçadões e passarelas de madeira tratada sobre pontões de metal, seções de piso de VIDRO deixando ver as arcadas coloniais e letreiros submersos lá embaixo, postes com néon discreto, guarda-corpos de correntes navais; edificações novas sobre estacas; ao fundo, os prédios antigos emergindo da água só dos andares altos pra cima.`,
  'Mercado Público':
    `${AGUA_CENTRO} A cena: o Mercado Público ERGUIDO SOBRE BASES ELEVADAS acima da água — os arcos e pavilhões históricos preservados no alto de uma plataforma de fundações reforçadas; a água escura cobre a antiga praça em volta; rampas e escadarias de madeira descem a decks flutuantes onde barcos e canoas atracam pra descarregar; bancas visíveis sob o telhado, gente subindo com caixas; NENHUM táxi, ônibus ou rua de pedra seca.`,
  'Duque de Caxias':
    `NÍVEL DA ÁGUA CANÔNICO: bairro PARCIALMENTE inundado — a água cobre o térreo dos palacetes (1 a 2 metros), sem rua seca visível. A cena: palacetes coloniais de pedra e mármore desgastados pela água, barcos amarrados em antigas garagens e sacadas, passarelas de madeira ligando varandas, varandas adaptadas em guaritas de milícia armada, casas flutuantes de luxo ao fundo; circulação SÓ por barco e passarela.`,
  'Camelódromo':
    `${AGUA_CENTRO} A cena: a feira de sucata tecnológica ocupando um DECK/pontão do novo piso flutuante do Centro — lonas escuras, bancas improvisadas de eletrônica usada, fumaça de solda, fios pendurados; a água escura aparece entre as tábuas e nas bordas do deck, com barcos de carga amarrados descarregando caixotes; NENHUM carro ou ônibus.`,
  'Viaduto da Borges':
    `${AGUA_CENTRO} A cena: o viaduto emergindo da água como PASSARELA entre duas "ilhas" de prédios — a estrutura metálica corroída, tábuas soltas remendando o tabuleiro, pedestres e bancas ocupando a pista morta; embaixo, onde era a avenida, água escura com barcos passando entre os pilares; NENHUM carro.`,
  'Salgado Filho':
    `${AGUA_CENTRO} A cena: a avenida virou CANAL — os prédios ecléticos e o casario emergem da água escura só do segundo andar pra cima; barcos a remo e uma lancha de carga navegam onde era a pista; passarelas de tábua ligam sacadas de um lado ao outro; roupa no varal numa janela alta.`,
  'Galeria Malcom':
    `${AGUA_CENTRO} A cena: a entrada da galeria comercial vista de uma passarela de tábuas — o TÉRREO original está submerso (vitrines afundadas visíveis sob a água escura na base) e o comércio migrou pro MEZANINO e andares altos, iluminados e funcionando; uma escada de madeira improvisada sobe da passarela flutuante direto pro segundo piso.`,
  'Galeria do Rosário':
    `${AGUA_CENTRO} A cena: o espaço expositivo REMONTADO num pavilhão do novo piso flutuante — salão de paredes brancas com trilhos de iluminação e painéis de madeira reaproveitada pendurados por cabos de aço, aberto pra um deck de tábuas; pela abertura vê-se a água escura e os prédios afundados do Centro; um ou dois visitantes olhando as obras.`,
}
// Filhos do Centro Histórico SEM cena própria ainda ganham o nível d'água
// canônico automaticamente (a pasta do Atlas diz o bairro).
const AGUA_POR_PASTA = { 'Centro Histórico': AGUA_CENTRO }

// Pessoas do Contexto (retratos de NPC): grounded SÓ no público — Função/
// Organização/Aparência do FM + corpo limpo (o `limpar` já corta [!gm];
// Personalidade/Objetivos são campos de MESTRE e ficam fora do prompt).
// Rosto VISÍVEL de propósito: são NPCs nomeados (≠ Empregados anônimos).
function promptPessoa(nome, fm, excerto) {
  const jaCitada = fm['Organização'] && (fm['Função'] ?? '').includes(fm['Organização'])
  const org = fm['Organização'] && !jaCitada ? ` — ligada a ${fm['Organização']}` : ''
  return (
    `Retrato de personagem (NPC) para o RPG, ${MUNDO}.` +
    ` "${nome}"${fm['Função'] ? `: ${fm['Função']}` : ''}${org}.` +
    (fm['Aparência'] ? ` Aparência: ${fm['Aparência']}` : '') +
    (excerto ? ` Contexto do personagem: ${excerto}` : '') +
    ` Meio-corpo, rosto visível e expressivo, pose e cenário que contam a função — Porto Alegre reconhecível ao fundo quando couber.` +
    ` Figurino, cabelo e objetos verossímeis do Brasil de 1987 (nada medieval).` +
    ` Estilo: pintura digital cinematográfica SEMIRREALISTA — o MESMO estilo das demais ilustrações do sistema.` +
    ` Sem texto legível. Formato retrato 1024×1536.`
  )
}

function promptLocal(nome, sub, bairro, excerto, pasta) {
  const cena = CENA_LOCAL[nome]
  if (cena)
    return (
      `Imagem do local "${nome}" (${sub || 'local'} de Porto Alegre) como era em 1987 no RPG "Porto Alegre 1987" — Brasil sob regime militar, cyberpunk analógico-tropical.` +
      ` Baseie-se na aparência REAL de Porto Alegre da época — arquitetura e atmosfera verdadeiras do lugar — e componha a cena canônica: ${cena}` +
      ` A cena contém SOMENTE os elementos descritos — NÃO invente elementos extras (nenhum personagem, veículo, embarcação, letreiro ou construção além dos citados); detalhe de época entra só como textura discreta de fundo.` +
      ` Estilo: fotografia de época, filme colorido granulado dos anos 80, luz natural, enquadramento de rua.` +
      ` Fundo completo (SEM transparência), sem texto legível, proporção paisagem 3:2 (1536×1024).`
    )
  const onde = bairro && bairro !== nome ? `, em ${bairro}` : ''
  const agua = nome !== pasta && AGUA_POR_PASTA[pasta] ? ` ${AGUA_POR_PASTA[pasta]}` : ''
  return (
    `Imagem do local "${nome}" (${sub || 'local'} de Porto Alegre${onde}) como era em 1987 no RPG "Porto Alegre 1987" — Brasil sob regime militar, cyberpunk analógico-tropical.` +
    ` Baseie-se na aparência REAL de Porto Alegre da época — arquitetura, ruas e atmosfera verdadeiras do lugar, como em fotografias antigas da cidade — e aplique o contexto do mundo: ${excerto}${agua}` +
    ` Estilo: fotografia de época, filme colorido granulado dos anos 80, luz natural, enquadramento de rua.` +
    ` Fundo completo (SEM transparência), sem texto legível, proporção paisagem 3:2 (1536×1024).`
  )
}

// ---- monta o trabalho -----------------------------------------------------
const trabalho = []
const alvos = new Map()
function add(item) {
  const extras = logosDoPrompt(item.prompt)
  if (extras.length) {
    item.refsExtra = extras
    item.prompt += ` ANEXADOS como referência adicional: os logotipos REAIS de ${extras
      .map((f) => basename(f, '.png').replace(/^logo-/, ''))
      .join(' e ')} — reproduza cada logotipo FIELMENTE como na referência, sem redesenhar nem estilizar.`
  }
  const alvo = item.out
  if (alvos.has(alvo)) throw new Error(`colisão de alvo: ${alvos.get(alvo)} e ${item.base} → ${alvo}`)
  alvos.set(alvo, item.base)
  if (ONLY && !item.chave.includes(ONLY)) return
  trabalho.push(item)
}

// Figura (cartas de item)
for (const sub of SUBS_FIG) {
  for (const f of readdirSync(join(SRC_FIG, sub)).filter((f) => f.endsWith('.png')).sort()) {
    const base = f.slice(0, -4)
    if (INDISPONIVEIS.has(base)) { console.log(`skip (indisponível no mundo): ${sub}/${base}`); continue }
    const novo = base === 'default' ? 'default' : reskinName(base)
    add({
      cat: 'Figura', sub, chave: `Figura/${sub}/${base}`, base, novo,
      ref: REF_ESTILO[semTier(base)] ? join(ESTILO, REF_ESTILO[semTier(base)]) : join(SRC_FIG, sub, f),
      inbox: join(INBOX, sub, `${novo}.png`),
      out: join(CTX_ROOT, sub, `${novo}.png`),
      // r4: TODAS as cartas transparentes de novo (o fundo preto dos
      // consumíveis destoava do resto — revertido a pedido do user).
      size: '1536x1024', transparente: true,
      prompt: promptFigura(sub, base, novo),
    })
  }
}

// Classes
const acharRef = (dir, base) => ['png', 'jpeg', 'jpg'].map((e) => join(dir, `${base}.${e}`)).find(existsSync)
for (const f of readdirSync(join(IMAGENS, 'Classes')).sort()) {
  const base = f.replace(/\.(png|jpe?g)$/i, '')
  const novo = reskinName(base)
  add({
    cat: 'Classes', sub: 'Classes', chave: `Classes/${base}`, base, novo,
    ref: acharRef(join(IMAGENS, 'Classes'), base),
    inbox: join(INBOX, 'Classes', `${novo}.png`),
    out: join(CTX_ROOT, 'Classes', `${novo}.png`),
    size: '1024x1024', transparente: false,
    prompt: promptClasse(base, novo),
  })
}

// Companheiros (Empregados)
for (const [tipo, e] of EMPREGADOS) {
  const base = `Companheiro Animal ${tipo}`
  const ref = acharRef(join(IMAGENS, 'Companheiros Animais'), base)
  if (!ref) { console.error(`sem referência: ${base}`); continue }
  add({
    cat: 'Companheiros', sub: 'Companheiros', chave: `Companheiros/${base}`, base, novo: e.mundo,
    ref,
    inbox: join(INBOX, 'Companheiros', `${e.mundo}.png`),
    out: join(CTX_ROOT, 'Companheiros', `${e.mundo}.png`),
    size: '1024x1536', transparente: false,
    prompt: promptCompanheiro(tipo, e.mundo, e.perfil),
  })
}

// Contexto Atual (notas-folha; hubs cujo basename == pasta são índices)
for (const path of walk(join(VAULT, 'Contexto/Histórias/Contexto Atual'))) {
  const base = basename(path, '.md')
  if (base === basename(dirname(path))) continue
  const { fm, corpo } = lerNota(path)
  add({
    cat: 'Contexto Atual', sub: 'Contexto Atual', chave: `Contexto Atual/${base}`, base, novo: base,
    ref: null,
    inbox: join(INBOX, 'Contexto Atual', `${base}.png`),
    out: join(CTX_ROOT, 'Contexto Atual', `${base}.png`),
    size: '1536x1024', transparente: false,
    prompt: promptContextoAtual(base, fm.Assunto ?? '', cap(limpar(corpo), 700)),
  })
}

// Organizações
for (const path of walk(join(VAULT, 'Contexto/Organizações'))) {
  const base = basename(path, '.md')
  const { fm, corpo } = lerNota(path)
  const excerto = cap([fm.Resumo, limpar(corpo)].filter(Boolean).join(' '), 650)
  add({
    cat: 'Organizações', sub: 'Organizações', chave: `Organizações/${base}`, base, novo: base,
    ref: null,
    inbox: join(INBOX, 'Organizações', `${base}.png`),
    out: join(CTX_ROOT, 'Organizações', `${base}.png`),
    size: '1536x1024', transparente: false,
    prompt: promptOrganizacao(base, fm.subcategoria, excerto),
  })
}

// Pessoas (Contexto/Pessoas) — nomes já são do mundo (notas nativas da POA)
for (const path of walk(join(VAULT, 'Contexto/Pessoas'))) {
  const base = basename(path, '.md')
  if (base === basename(dirname(path))) continue
  const { fm, corpo } = lerNota(path)
  add({
    cat: 'Pessoas', sub: 'Pessoas', chave: `Pessoas/${base}`, base, novo: base,
    ref: null,
    inbox: join(INBOX, 'Pessoas', `${base}.png`),
    out: join(CTX_ROOT, 'Pessoas', `${base}.png`),
    size: '1024x1536', transparente: false,
    prompt: promptPessoa(base, fm, cap(limpar(corpo), 450)),
  })
}

// Locais (Atlas/Porto Alegre)
for (const path of walk(join(VAULT, 'Atlas/Porto Alegre'))) {
  const base = basename(path, '.md')
  const { fm, corpo } = lerNota(path)
  add({
    cat: 'Locais', sub: 'Locais', chave: `Locais/${base}`, base, novo: base,
    ref: null,
    inbox: join(INBOX, 'Locais', `${base}.png`),
    out: join(CTX_ROOT, 'Locais', `${base}.png`),
    size: '1536x1024', transparente: false,
    prompt: promptLocal(base, fm.subcategoria, fm.Geolocalização, cap(limpar(corpo), 650), basename(dirname(path))),
  })
}

const CATS = [...new Set(trabalho.map((t) => t.cat))]
const inboxDirDe = (t) => dirname(t.inbox)

if (PLAN) {
  for (const t of trabalho) console.log(`${t.chave}  →  ${t.novo}${t.base !== t.novo ? '' : '  (mantém)'}${t.ref ? '' : '  [sem ref]'}`)
  for (const c of CATS) console.log(`${c}: ${trabalho.filter((t) => t.cat === c).length}`)
  console.log(`total: ${trabalho.length} · destino: ${CTX_ROOT}`)
  process.exit(0)
}

if (CHATGPT) {
  const doc = join(VAULT, 'Recursos e Mídia/Rascunhos/Prompts — Figuras POA 1987.md')
  const linhas = [
    '# Prompts — Imagens POA 1987',
    '',
    'Gerado por `pleitost-app/scripts/gen-context-figures.mjs --chatgpt` — não editar à mão.',
    '',
    '## Como usar (ChatGPT, uma imagem por mensagem)',
    '',
    '1. Se o item indica **Referência**, anexa esse arquivo; se diz *(sem anexo)*, só cola o prompt.',
    '2. **Cola** o prompt do bloco de código (botão de copiar no cantinho do bloco).',
    '3. Baixa o resultado e **salva com o nome exato** indicado em `→ salvar como`, dentro de',
    '   `Recursos e Mídia/Rascunhos/Inbox de Imagens/<pasta indicada na seção>/`.',
    '4. Quando tiver um lote pronto, me pede o **ingest**: eu valido nomes e transparência,',
    '   normalizo os tamanhos e arquivo em `Recursos de Contextos/<categoria>/` (layout flat que o app lê).',
    '',
    '> [!tip] Tiers (Adepta/Experiente/Mestre)',
    '> Se quiser usar a MESMA arte pros três tiers de uma família, gera só uma e me avisa — eu replico',
    '> pros outros nomes no ingest.',
    '',
  ]
  const grupos = [...new Set(trabalho.map((t) => (t.cat === 'Figura' ? `Figura — ${t.sub}` : t.cat)))]
  for (const g of grupos) {
    const itens = trabalho.filter((t) => (t.cat === 'Figura' ? `Figura — ${t.sub}` : t.cat) === g)
    const pastaInbox = basename(inboxDirDe(itens[0]))
    linhas.push(`## ${g} (${itens.length})`, '', `Salvar em \`Rascunhos/Inbox de Imagens/${pastaInbox}/\``, '')
    for (const t of itens) {
      const ref = t.ref ? `Referência: \`${t.ref.replace(VAULT + '/', '')}\`` : '*(sem anexo)*'
      linhas.push(
        `- [ ] **${t.base}** → salvar como \`${t.novo}.png\`${t.base === t.novo ? '' : ''} — ${ref}`,
        '',
        '```text',
        t.prompt,
        '```',
        '',
      )
    }
  }
  for (const t of trabalho) mkdirSync(inboxDirDe(t), { recursive: true })
  writeFileSync(doc, linhas.join('\n'))
  console.log(`${trabalho.length} prompts → ${doc}`)
  process.exit(0)
}

// Pendente = marcado pra regerar OU sem arquivo final no layout flat.
const pendente = (t) => !MANTER_FANTASIA.has(t.chave) && (REGERAR.has(t.chave) || !existsSync(t.out))

if (MANIFEST) {
  const entradas = trabalho.filter(pendente).map((t) => ({
    categoria: t.cat,
    sub: t.sub,
    origem: t.base,
    novo: t.novo,
    referencia: t.ref,
    referencias_extras: t.refsExtra ?? [],
    destino: t.inbox,
    tamanho: t.size,
    transparente: t.transparente,
    prompt: t.prompt,
  }))
  for (const t of trabalho) mkdirSync(inboxDirDe(t), { recursive: true })
  const out = join(INBOX, 'manifest.json')
  writeFileSync(out, JSON.stringify(entradas, null, 2))
  console.log(`${entradas.length} entradas PENDENTES (de ${trabalho.length}) → ${out}`)
  process.exit(0)
}

if (INGEST) {
  const avisos = []
  let ok = 0, desconhecidos = 0
  const porDir = new Map()
  for (const t of trabalho) {
    const dir = inboxDirDe(t)
    if (!porDir.has(dir)) porDir.set(dir, [])
    porDir.get(dir).push(t)
  }
  for (const [dir, itens] of porDir) {
    if (!existsSync(dir)) continue
    const porNome = new Map(itens.map((t) => [t.novo, t]))
    for (const f of readdirSync(dir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f)).sort()) {
      const nome = f.replace(/\.(png|webp|jpe?g)$/i, '')
      const t = porNome.get(nome)
      if (!t) {
        console.error(`nome desconhecido (confere no doc de prompts): ${basename(dir)}/${f}`)
        desconhecidos++
        continue
      }
      const img = sharp(join(dir, f))
      const meta = await img.metadata()
      if (t.transparente && !meta.hasAlpha) avisos.push(`${t.chave}: SEM canal alfa — fundo provavelmente opaco, refazer?`)
      mkdirSync(dirname(t.out), { recursive: true })
      // ARQUIVO ÚNICO: o original gerado É o final (sem resize e sem cópia
      // arquivada — thumbnail é responsabilidade do app, decisão 2026-09-04).
      await img.png().toFile(t.out)
      unlinkSync(join(dir, f))
      REGERAR.delete(t.chave)
      console.log(`ok: ${t.chave} → ${t.novo}.png`)
      ok++
    }
  }
  if (existsSync(REGERAR_PATH)) writeFileSync(REGERAR_PATH, JSON.stringify([...REGERAR].sort(), null, 1))
  for (const a of avisos) console.warn(`AVISO ${a}`)
  const faltam = trabalho.filter(pendente)
  console.log(`\ningeridas: ${ok} · desconhecidas: ${desconhecidos} · pendentes ${faltam.length}/${trabalho.length}`)
  process.exit(desconhecidos ? 1 : 0)
}

// ---- geração via API (OpenAI gpt-image-1) ---------------------------------
function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const f = join(homedir(), '.secrets/openai.key')
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  console.error('Sem credencial: exporte OPENAI_API_KEY ou grave ~/.secrets/openai.key')
  process.exit(1)
}

async function gerar(key, t) {
  for (let tent = 1; ; tent++) {
    let res
    if (t.ref) {
      const fd = new FormData()
      fd.append('model', 'gpt-image-1')
      fd.append('image[]', new Blob([readFileSync(t.ref)], { type: 'image/png' }), 'ref.png')
      for (const [i, extra] of (t.refsExtra ?? []).entries())
        fd.append('image[]', new Blob([readFileSync(extra)], { type: 'image/png' }), `logo${i}.png`)
      fd.append('prompt', t.prompt)
      if (t.transparente) fd.append('background', 'transparent')
      fd.append('size', t.size)
      fd.append('quality', QUALITY)
      fd.append('output_format', 'png')
      res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
      })
    } else {
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: t.prompt, size: t.size, quality: QUALITY, output_format: 'png' }),
      })
    }
    if (res.ok) {
      const json = await res.json()
      return Buffer.from(json.data[0].b64_json, 'base64')
    }
    const corpo = await res.text()
    if ((res.status === 429 || res.status >= 500) && tent < 5) {
      const espera = Number(res.headers.get('retry-after')) || 15 * tent
      console.log(`  retry ${tent} em ${espera}s (${res.status}) — ${t.chave}`)
      await new Promise((r) => setTimeout(r, espera * 1000))
      continue
    }
    throw new Error(`${res.status} ${corpo.slice(0, 300)}`)
  }
}

const key = apiKey()
const fila = trabalho.filter((t) => FORCE || pendente(t))
console.log(`${fila.length} a gerar (${trabalho.length - fila.length} já existem) · quality=${QUALITY}`)

const erros = []
let feitos = 0
const CONC = 3
async function worker(lote) {
  for (const t of lote) {
    try {
      const png = await gerar(key, t)
      mkdirSync(dirname(t.out), { recursive: true })
      // ARQUIVO ÚNICO: original gerado direto no destino (sem resize).
      writeFileSync(t.out, png)
      console.log(`ok ${++feitos}/${fila.length}: ${t.chave}`)
    } catch (e) {
      erros.push({ chave: t.chave, erro: String(e) })
      console.error(`ERRO ${t.chave}: ${String(e).slice(0, 200)}`)
    }
  }
}
const lotes = Array.from({ length: CONC }, (_, i) => fila.filter((_, j) => j % CONC === i))
await Promise.all(lotes.map(worker))

if (erros.length) {
  const log = new URL('../gen-context-figures-erros.json', import.meta.url)
  writeFileSync(log, JSON.stringify(erros, null, 2))
  console.error(`\n${erros.length} falhas — ${log.pathname} (rodar de novo só refaz o que falta)`)
  process.exit(1)
}
console.log('\nConcluído.')
