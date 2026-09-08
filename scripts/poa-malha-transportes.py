#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Malha de transportes de Porto Alegre 1987 (2026-09-07) — gerador IDEMPOTENTE
sobre a vault POA 1987. Integra o rascunho revisado ("Rascunho — Malha de
Transportes") nas notas de contexto:

  * uma nota por LINHA (`categoria: Linha`, subcategoria = modo) em
    Contexto/Malha de Transportes/<pasta>/…, com Paradas (wikilinks, em ordem),
    Acesso (plano TRI mínimo ou "na mão"), Tarifa avulsa, Qualidade, Horário,
    Aparência (pra imagem) — fonte única; as notas de contexto consultam;
  * estações do Aeromóvel e lugares que faltavam viram Ponto de Interesse;
  * toda parada ganha marcador no mapa da cidade (Porto Alegre.md, leaflet);
  * Transporte e Mobilidade / Custo de Vida / planos TRI apontam pra malha;
  * cobertura por bairro: PERNOITE (Recurso `Cobrança: noite` ofertado num
    estabelecimento) e SAÚDE (um lugar pra levar alguém urgentemente).

Roda de qualquer cwd:  python3 scripts/poa-malha-transportes.py
"""
import os, re, glob, json

ROOT = "/data/vaults/POA 1987"
ATLAS = os.path.join(ROOT, "Atlas", "Porto Alegre")
REC = os.path.join(ROOT, "Contexto", "Recursos")
MALHA = os.path.join(ROOT, "Contexto", "Malha de Transportes")
CTX_ATUAL = os.path.join(ROOT, "Contexto", "Histórias", "Contexto Atual")
W = lambda s: f"[[{s}]]"

def y(v):
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, int): return str(v)
    if isinstance(v, list): return "\n" + "\n".join(f'  - {json.dumps(x, ensure_ascii=False)}' for x in v)
    if v is None: return ""
    return json.dumps(v, ensure_ascii=False)

escritos = []
def escrever(path, texto):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(texto)
    escritos.append(path)

# ───────────────────────────── escritores ─────────────────────────────
def poi(pasta, nome, geo, dono, contexto, descricao, aparencia, influencias, acontecimento, servicos=()):
    fm = ["aliases: ", "categoria: Localização", "subcategoria: Ponto de Interesse", f'Geolocalização: "[[{geo}]]"', f"Dono: {y(dono)}",
          "Contexto: ", "Descrição: ", "Organizações_Influentes: ", "Acontecimento_Recente: ",
          "Serviços: " + ("\n" + "\n".join(f'  - "{s}"' for s in servicos) if servicos else ""), "Completo: true"]
    body = ["#Local",
        "> [!abstract] Contexto do `= this.subcategoria`: `= this.file.name`",
        "> 🗺️**Geolocalização:** `= this.Geolocalização`",
        f"> 📖**Contexto Histórico:** {contexto}", "",
        "> [!info] Informações do `= this.subcategoria`: `= this.file.name`",
        f"> ℹ️**Descrição:** {descricao}", "> ", "> 👤**Dono:** `= this.Dono`", "> ",
        f"> 👁️**Aparência do Local:** {aparencia}", "> ", "> 🛡️**Influências:**"] + [f"> - {x}" for x in influencias] + [
        "> ", f"> 📖**Acontecimento Recente:** {acontecimento}", ""]
    if servicos:
        body += ["> [!info] Serviços",
                 "> O que este estabelecimento vende ou aluga (aba **Serviços** do app; preço e marca vivem na nota de cada [[Recursos|Recurso]]):",
                 "> `= this.Serviços`", ""]
    escrever(os.path.join(ATLAS, pasta, f"{nome}.md"), "---\n" + "\n".join(fm) + "\n---\n" + "\n".join(body))

def noite(nome, marca, preco, nivel, onde, resumo, desc, espec):
    fm = ["aliases: ", "categoria: Recurso", "subcategoria: Moradia", 'Tipo: "Hotel"', f"Marca: {y(marca)}", f"Preço: {preco}", 'Cobrança: "noite"',
          f"Nível: {nivel}", f"Onde: {y(onde)}", f"Resumo: {y(resumo)}", "Completo: true"]
    header = ["#Recurso", "> [!info] `= this.Tipo`: `= this.file.name`", "> 🏷️**Marca:** `= this.Marca`", "> 💰**Preço:** Cz$ `= this.Preço` · `= this.Cobrança`",
              "> 📶**Nível:** `= this.Nível`", "> 📍**Onde:** `= this.Onde`", "> 📝**Resumo:** `= this.Resumo`"]
    body = "\n".join(header) + "\n\n" + desc.strip() + "\n\n> [!info] Especificação\n" + "\n".join(f"> **{k}:** {v}" for k, v in espec) + "\n"
    escrever(os.path.join(REC, "Moradia", f"{nome}.md"), "---\n" + "\n".join(fm) + "\n---\n" + body)

def linha(pasta, modo, nome, letreiro, operador, acesso, tarifa, qualidade, horario, paradas, resumo, desc, aparencia, circular=False, cor="#888888", fechada=False):
    fm = ["aliases: ", "categoria: Linha", f"subcategoria: {modo}", f"Letreiro: {y(letreiro)}", f"Operador: {y(operador)}",
          f"Acesso: {y(acesso)}", f"Tarifa: {y(tarifa)}", f"Qualidade: {qualidade}", f"Cor: {y(cor)}", f"Horário: {y(horario)}",
          f"Circular: {y(circular)}"] + (["Fechada: true"] if fechada else []) + [f"Paradas: {y([W(p) for p in paradas])}", f"Aparência: {y(aparencia)}", f"Resumo: {y(resumo)}", "Completo: true"]
    body = ["#Linha", "> [!info] `= this.subcategoria`: `= this.file.name`",
            "> 🪧**Letreiro:** `= this.Letreiro`", "> 🏢**Operador:** `= this.Operador`",
            "> 🎫**Acesso:** `= this.Acesso` · avulso: `= this.Tarifa`", "> ⭐**Qualidade:** `= this.Qualidade` de 5",
            "> 🕔**Horário:** `= this.Horário`", "> 📍**Paradas (em ordem):** `= this.Paradas`", "> 📝**Resumo:** `= this.Resumo`",
            "", desc.strip(), "", "> [!info] Aparência", "> `= this.Aparência`", ""]
    escrever(os.path.join(MALHA, pasta, f"{nome}.md"), "---\n" + "\n".join(fm) + "\n---\n" + "\n".join(body))

def patch_servicos(rel, extras):
    p = os.path.join(ATLAS, rel + ".md"); s = open(p, encoding="utf-8").read()
    m = re.search(r"\nServiços:[^\n]*\n((?:  - [^\n]*\n)*)", s)
    if not m: raise SystemExit(f"sem Serviços em {rel}")
    atuais = re.findall(r'  - "([^"]+)"', m.group(1))
    novos = [x for x in extras if x not in atuais]
    if novos:
        bloco = m.group(0).rstrip("\n") + "\n" + "".join(f'  - "{x}"\n' for x in novos)
        s = s.replace(m.group(0), bloco, 1)
        open(p, "w", encoding="utf-8").write(s)

# ═══════════════════════ 1. LUGARES DA MALHA (PoIs) ═══════════════════════
TRENSURB = "Trensurb (chefe de estação)"
poi("Centro Histórico", "Praça da Alfândega", "Centro Histórico", "[[Aliança dos Fundadores]] (pedágio das passarelas)",
    "A praça mais nobre do Centro afundou em abril de 1986; em 1987 é o cruzamento das passarelas flutuantes e o deck de vidro do Centro Corporativo — o único lugar onde o ônibus anfíbio, o barqueiro e a lancha executiva encostam no mesmo pedaço de água.",
    "Espelho d'água barrenta com as copas das árvores saindo do meio; passarelas de tábua com pedágio da Aliança dos Fundadores de um lado, deck de vidro com catraca de crachá do outro.",
    "Coreto afogado até o telhado, estátuas com água pelo pescoço, passarela de tábua rangendo, deck de vidro iluminado e guarda de terno; ao fundo o Mercado Público de pé.",
    ["[[Aliança dos Fundadores]] — cobra a passarela", "[[Gradiente]] — o deck de vidro é seu", "[[Brigada Militar Metropolitana]] — revista quem sobe do lado errado"],
    "A Aliança dobrou o pedágio depois que a lancha executiva passou a encostar do lado de vidro.")

ESTACOES = [
 # (pasta, nome, bairro, contexto, descricao, aparencia, influencias, acontecimento)
 ("Nova Sarandi", "Estação Zaffari", "Nova Sarandi", "Ponta norte da Linha 1 do Aeromóvel, colada ao Depósito Zaffari: a estação que a megacorp pediu pra embarcar o turno das cinco.",
  "Plataforma de concreto sobre o pátio do depósito; catraca de carteira PIRA, cabine da Brigada e o cheiro de arroz do armazém.",
  "Viaduto cinza saindo do meio dos galpões, plataforma lotada de macacão, letreiro 'L1 POPULAR NORTE', contêineres com o esquilo da Zaffari embaixo.",
  ["[[Zaffari]] — a estação é praticamente do depósito", "[[Brigada Militar Metropolitana]] — cabine na plataforma"], "Um fiscal da Zaffari passou a conferir crachá na catraca junto com a Brigada."),
 ("Nova Sarandi", "Estação Sarandi", "Nova Sarandi", "Estação da Linha 1 ao lado da Ferroviária Nacional: o operário desce do trem de carga da Zaffari e sobe no Aeromóvel.",
  "Plataforma elevada sobre o pátio de manobras; escada de ferro, catraca PIRA e a banca de mate do lado.",
  "Vagão branco e verde parado sobre trilhos de carga enferrujados, gente subindo escada de ferro com marmita, locomotiva da Zaffari fumaçando embaixo.",
  ["[[Zaffari]] — ferrovia própria embaixo", "[[Sindicato dos Catadores]] — cata o que cai do trem"], "O blecaute de março parou os vagões aqui por quatro horas; o turno da Tramontina desceu a pé."),
 ("Passo D'Areia", "Estação Passo D'Areia", "Passo D'Areia", "A estação original de 1978, da demonstração do projeto Coester, ao lado do Shopping Iguatemi: berço do Aeromóvel e vitrine da modernização.",
  "Estação de dois pisos com bilheteria, catraca dupla (carteira PIRA e cartão TRI), banca de jornal na entrada e o boteco embaixo da via.",
  "Estação de concreto com painel de azulejo comemorativo de 1978, plataforma coberta, vagão entrando, placa do Shopping Iguatemi atrás e fila na catraca.",
  ["[[Marcopolo]] — os técnicos moram do lado", "[[Companhia Estadual de Energia Elétrica]] — a subestação fica embaixo"], "Os testes de velocidade foram retomados depois do blecaute; o vagão de teste passa sem parar às três da tarde."),
 ("Passo D'Areia", "Estação Nogueiras", "Passo D'Areia", "Estação dos condomínios do Aeromóvel, na Praça das Nogueiras: a classe média possível desce aqui.",
  "Plataforma simples entre os prédios de kitnet; catraca, uma cabine e a padaria na praça.",
  "Viaduto passando entre prédios de janela pequena, plataforma com gente de crachá, praça de bancos de concreto embaixo, padaria acesa.",
  ["[[Tramontina]] — os kitnets são de técnico seu", "[[Brigada Militar Metropolitana]] — ronda a praça"], "Um cartaz da Resistência apareceu na plataforma e a Brigada fechou a estação por uma manhã."),
 ("Bom Fim", "Estação Independência", "Bom Fim", "Estação da Linha 1 no alto da Independência: onde o operário do norte cruza com o estudante e o professor do Bom Fim.",
  "Plataforma elevada sobre a avenida, escada que desce em frente ao Colégio Rosário; catraca vigiada e a farmácia do lado.",
  "Viaduto sobre casarões de 1900, plataforma cheia de estudante com livro embrulhado, brigadiano na escada, Redenção ao fundo.",
  ["[[Resistência Urbana Gaúcha]] — passa recado na escada", "[[Brigada Militar Metropolitana]] — revista mochila"], "A Brigada apreendeu uma sacola de livros na catraca; a fila da manhã ficou em silêncio."),
 ("Centro Histórico", "Estação Central", "Centro Histórico", "A estação-mãe do Aeromóvel, plataforma sobre a passarela do Mercado Público: as Linhas 1 e 2 se encontram aqui, em cima da água.",
  "Plataforma dupla sobre o Mercado; escada de ferro desce direto na passarela flutuante; catraca de crachá separa a Estação Centro Corporativo, do outro lado.",
  "Viaduto de concreto passando sobre o telhado do Mercado Público, plataforma lotada, água barrenta embaixo, passarela de tábua, cartaz 'PIRA — PRODUTIVIDADE É LIBERDADE'.",
  ["[[Brigada Militar Metropolitana]] — o maior posto da malha", "[[Aliança dos Fundadores]] — a passarela embaixo é sua"], "Uma briga por lugar no vagão das seis acabou com dois presos por 'subversão'."),
 ("Centro Histórico", "Estação Cidade Baixa", "Centro Histórico/Cidade Baixa", "Estação da Linha 2 erguida sobre o alagado da Cidade Baixa: a única ligação seca entre as palafitas e o resto da cidade.",
  "Plataforma elevada sobre a água com escada que desce pra passarela da Aliança das Palafitas; a Brigada fecha a escada quando quer.",
  "Estação de concreto no meio da água com palafitas de zinco em volta, barcos amarrados nos pilares, escada de madeira até a passarela, Brigada na plataforma.",
  ["[[Aliança Livre das Palafitas]] — a escada é sua", "[[Brigada Militar Metropolitana]] — fecha a estação em batida"], "A escada foi cortada numa batida e a Aliança rebocou passageiro de bote por três dias, cobrando."),
 ("Praia de Belas", "Estação Estádios", "Praia de Belas", "Estação da Linha 2 entre o Beira-Rio e o Olímpico: a estação do jogo, fechada uma hora antes e depois do apito em dia de Gre-Nal.",
  "Plataforma larga com grade anti-invasão e portões que a Brigada tranca; o Consórcio das Bandeiras vende ingresso na escada.",
  "Plataforma com grade alta, torcida de bandeira vermelha de um lado e azul do outro, cavalaria da Brigada embaixo, estádio ao fundo.",
  ["[[Consórcio das Bandeiras]] — ingresso na escada", "[[Brigada Militar Metropolitana]] — cavalaria em dia de jogo"], "Em setembro a estação ficou fechada o jogo inteiro; a torcida voltou a pé pela Belas."),
 ("Praia de Belas", "Estação Porto Novo", "Praia de Belas", "Estação da Linha 2 dentro do complexo do porto: carga da Zaffari embaixo, gente em cima.",
  "Plataforma sobre os armazéns; a escada dá no pátio de contêineres, com fiscal de prancheta na saída.",
  "Viaduto passando por cima de guindastes e contêineres, estivadores subindo com capacete, balsa encostando no cais atrás.",
  ["[[Zaffari]] — o porto é seu", "[[Brigada Militar Metropolitana]] — dobrou a guarda desde os ataques"], "Desde os ataques ao porto a Brigada revista todo mundo que desce, inclusive quem trabalha lá."),
 ("Jardim Botânico", "Estação Jardim Botânico", "Jardim Botânico", "Fim da Linha 2, na frente do parque: a estação da família de técnico e do domingo no Botânico.",
  "Plataforma coberta com jardineira e bancos inteiros; catraca com menos fila e uma padaria em frente.",
  "Viaduto terminando entre copas de árvore, plataforma limpa com família de domingo, estufa de vidro do parque ao fundo.",
  ["[[Panvel]] — o posto médico é vizinho", "[[Zaffari]] — o síndico dos prédios"], "A Brigada instalou uma câmera da Embratel na plataforma; o parque virou 'área monitorada'."),
 ("Moinhos de Vento", "Estação Moinhos", "Moinhos de Vento", "Ponta norte da Linha Executiva, ao lado do Parcão, com guarita da Gradiente: quem não tem crachá não sobe.",
  "Plataforma de mármore com carpete, catraca de crachá corporativo e segurança de terno; bilheteria só pra estrangeiro com dólar.",
  "Estação de mármore e vidro fumê entre árvores do Parcão, vagão preto com friso dourado, segurança de terno com radinho, executivo de pasta.",
  ["[[Gradiente]] — segurança privada", "[[Sociedade dos Jardins]] — quem manda no bairro"], "Um funcionário da Tramontina foi barrado com crachá vencido e fotografado pela segurança."),
 ("Moinhos de Vento", "Estação Concorde", "Moinhos de Vento", "Estação da Linha Executiva dentro do Edifício Concorde: o vagão para no mezanino dos conselhos corporativos.",
  "Plataforma interna, com carpete e ar-condicionado, entre o hall do prédio e as salas de reunião; catraca de crachá e detector de metal.",
  "Vagão preto parado dentro de um mezanino de mármore, executivos de terno, telão da Embratel, vidro dando pro trânsito lá embaixo.",
  ["[[Gradiente]] — dona do prédio", "[[Embratel]] — cada validação vira registro"], "Uma reunião inter-executiva fechou a estação por uma tarde inteira; o vagão passou direto."),
 ("Centro Histórico", "Estação Centro Corporativo", "Centro Histórico", "Deck de vidro sobre a Praça da Alfândega alagada: a estação executiva do Centro, separada da Estação Central por uma catraca de crachá.",
  "Plataforma envidraçada sobre a água, com carpete, telefone Embratel e segurança de terno; do outro lado da catraca, a Estação Central lotada.",
  "Deck de vidro iluminado sobre água barrenta, vagão preto parado, executivo de óculos escuros, e do outro lado da grade a plataforma popular abarrotada.",
  ["[[Gradiente]] — o deck é seu", "[[Aliança dos Fundadores]] — a passarela por baixo"], "Quem entrou sem crachá pagou Cz$ 1.000, foi fotografado e saiu do outro lado da grade."),
 ("Praia de Belas", "Estação Praia de Belas", "Praia de Belas", "Estação da Linha Executiva com acesso direto ao Porto Novo administrativo: o executivo desce no escritório do porto sem pisar no cais.",
  "Plataforma fechada, passarela envidraçada até o prédio administrativo do porto; guarita e catraca de crachá.",
  "Viaduto com passarela de vidro entrando num prédio de escritório, guindastes ao fundo, vagão preto e um único executivo na plataforma.",
  ["[[Zaffari]] — o escritório do porto", "[[Gradiente]] — a segurança"], "A lotação VIP Sul passou a parar embaixo; o porteiro anota quem desce de qual."),
 ("Ipanema", "Estação Ipanema", "Ipanema", "Fim da Linha Executiva, na porta dos condomínios e do Resort Nova Porto Alegre: a estação mais vazia e mais vigiada da cidade.",
  "Plataforma ajardinada com guarita, cancela e segurança da Gradiente; de lá, carrinho elétrico até o resort.",
  "Estação de vidro entre palmeiras, cancela de condomínio, segurança de terno, vagão preto vazio, o lago azul ao fundo.",
  ["[[Gradiente]] — segurança", "[[Sociedade dos Jardins]] — os condomínios"], "Um jornalista tentou descer sem convite e voltou no mesmo vagão, escoltado."),
 ("Costa e Silva", "Estação Quartel", "Costa e Silva", "Ponta do Ramal Costa e Silva, no portão do Quartel-General: construída pra tropa, fechada ao público desde 1985.",
  "Plataforma com arame farpado nas escadas e sentinela; só vagão verde-oliva, sem horário e sem catraca.",
  "Viaduto cercado de arame farpado, vagão verde-oliva sem janela, sentinela de fuzil na plataforma, muro do quartel com torre de comunicação.",
  ["[[Governo Militar Brasileiro]] — Exército", "[[Brigada Militar Metropolitana]] — não entra"], "Um vagão verde-oliva saiu do quartel às três da manhã com as luzes apagadas; ninguém sabe pra onde."),
]
EXECUTIVAS = {"Estação Moinhos", "Estação Concorde", "Estação Centro Corporativo", "Estação Praia de Belas", "Estação Ipanema"}
DONO_ESTACAO = {"Estação Quartel": "[[Governo Militar Brasileiro|Exército]] (sentinela do QG)"}
for pasta, nome, geo, ctx, desc, apar, infl, acont in ESTACOES:
    dono = DONO_ESTACAO.get(nome) or ("Trensurb + segurança [[Gradiente]]" if nome in EXECUTIVAS else TRENSURB)
    poi(pasta, nome, geo.split("/")[-1], dono, ctx, desc, apar, infl, acont)

# ═══════════════════════ 2. PERNOITE POR BAIRRO ═══════════════════════
# Recurso `Cobrança: noite` ofertado num estabelecimento de cada bairro.
noite("Noite na Pensão Farroupilha", "[[Pensão Farroupilha]]", 250, 3, [W("Bom Fim"), W("Pensão Farroupilha")],
      "Quarto por uma noite na pensão de estudante do Bom Fim: lençol limpo, café às sete e a dona que finge não ver o livro.",
      "A [[Pensão Farroupilha]] aluga o quarto vago por noite pra quem perdeu o último ônibus na [[Redenção]] ou chegou de fora pra ver alguém do [[Colégio Rosário]]. Registro no caderno, sem sobrenome; a dona conhece a Brigada e avisa da batida.",
      [("Quarto", "solteiro, lençol limpo, banheiro no corredor"), ("Inclui", "café às sete, recado anotado"), ("Regra", "porta fecha às onze; visita só na sala"), ("Nível", "3 — Classe Média Baixa")])
noite("Noite na Pensão do Cais", "[[Pensão do Cais]]", 200, 3, [W("Praia de Belas"), W("Pensão do Cais")],
      "Uma noite na pensão de frente pro Porto Novo: janta às sete, chave de verdade e o barulho do guindaste até de manhã.",
      "Pra quem chegou de balsa ou de barco sem saber onde dormir, Dona Neusa tem sempre um quarto por noite na [[Pensão do Cais]]. Estivador, marinheiro e viajante dividem a mesa da janta; ninguém pergunta o sobrenome.",
      [("Quarto", "solteiro ou duplo, janela pro cais"), ("Inclui", "janta às sete, café às cinco"), ("Regra", "porta fecha à meia-noite"), ("Nível", "3 — Classe Média Baixa")])
noite("Noite na Pensão da Vila Militar", "[[Pensão da Vila Militar]]", 200, 3, [W("Costa e Silva"), W("Pensão da Vila Militar")],
      "Uma noite na pensão da Dona Zulmira: café às cinco, luz apagada às dez e o quartel do outro lado da rua.",
      "A [[Pensão da Vila Militar]] recebe por noite parente de soldado, fornecedor do quartel e quem precisa dormir perto de quem manda. Regras de quartel e a certeza de que o sargento da esquina sabe quem entrou.",
      [("Quarto", "solteiro, armário, banheiro no corredor"), ("Inclui", "café das cinco"), ("Regra", "luz apagada às dez; visita nunca"), ("Nível", "3 — Classe Média Baixa")])
noite("Noite na Palafita", "[[Aliança Livre das Palafitas]]", 100, 1, [W("Cidade Baixa"), W("Trapiche da Aliança")],
      "Uma noite numa palafita da Cidade Baixa, combinada no Trapiche da Aliança: colchão, lona, água embaixo e o pedágio já pago.",
      "No [[Trapiche da Aliança]] se combina cama por noite numa das palafitas: colchão no chão de tábua, lona no teto, o Guaíba batendo embaixo. Paga-se na mão; a [[Aliança Livre das Palafitas]] garante que ninguém entra, nem a Brigada.",
      [("Quarto", "colchão em palafita de tábua e zinco"), ("Inclui", "pedágio da passarela, bote até o Centro de manhã"), ("Regra", "quem faz barulho vai pra água"), ("Nível", "1 — Miserável")])
noite("Noite no Barraco do Clã", "[[Clã da Ferrugem]]", 50, 1, [W("Zona Deserta"), W("Barraco de Aluguel do Clã")],
      "Uma noite num barraco de chapa da Zona Deserta, com a bênção do Clã da Ferrugem: cinquenta cruzados ou sucata equivalente.",
      "O [[Barraco de Aluguel do Clã]] cede um barraco vazio por noite a quem ficou na Zona Deserta depois do caminhão das cinco. Chão de terra, lona, e a palavra do [[Clã da Ferrugem]] de que ninguém mexe.",
      [("Barraco", "chapa e lona, chão de terra"), ("Pagamento", "Cz$ 50 ou sucata"), ("Regra", "sai antes do caminhão das cinco"), ("Nível", "1 — Miserável")])
noite("Noite na Pensão do Itu", "[[Pensão do Itu]]", 150, 2, [W("Jardim Itu"), W("Pensão do Itu")],
      "Quarto por noite na pensão dos operários da Itú Química: cheiro de éter, beliche e café com pão.",
      "A [[Pensão do Itu]] aluga beliche por noite pra quem chegou pro turno sem casa e pra quem foi demitido da vila da fábrica. Cheiro de éter no corredor, rádio ligado e a dona que anota o nome no caderno da Itú.",
      [("Quarto", "beliche em quarto de quatro"), ("Inclui", "café com pão às cinco"), ("Regra", "a fábrica sabe quem dorme aqui"), ("Nível", "2 — Classe Baixa")])
noite("Noite na Pensão da Ferroviária", "[[Pensão da Ferroviária]]", 150, 2, [W("Nova Sarandi"), W("Pensão da Ferroviária")],
      "Uma noite na pensão do pátio de manobras: cama de ferro, apito de trem e o turno das cinco batendo na porta.",
      "A [[Pensão da Ferroviária]] é o dormitório de quem chega de trem de carga da Zaffari ou perdeu o Aeromóvel: cama de ferro, cobertor de lã e um apito a cada meia hora. Sem registro; a Brigada bate na sexta.",
      [("Quarto", "cama de ferro em quarto de seis"), ("Inclui", "chimarrão às quatro e meia"), ("Regra", "quem não sai pro turno paga o dobro"), ("Nível", "2 — Classe Baixa")])
noite("Noite na Pensão da Bento", "[[Pensão da Bento]]", 300, 3, [W("Petrópolis"), W("Pensão da Bento")],
      "Quarto por noite na pensão de família da Bento Gonçalves: chave, toalha e a fofoca da Tramontina no café.",
      "A [[Pensão da Bento]] hospeda técnico em treinamento na Tramontina, parente de funcionário e o viajante que quer dormir num bairro inteiro. Quarto com chave, toalha limpa e café de mesa posta.",
      [("Quarto", "solteiro com chave, banheiro no corredor"), ("Inclui", "café de mesa posta, roupa lavada na sexta"), ("Regra", "silêncio depois das dez"), ("Nível", "3 — Classe Média Baixa")])
noite("Noite na Hospedaria do Jardim", "[[Hospedaria do Jardim]]", 500, 4, [W("Jardim Botânico"), W("Hospedaria do Jardim")],
      "Diária numa hospedaria de família com vista pro parque: quarto com banheiro, café de padaria e portão com interfone.",
      "A [[Hospedaria do Jardim]] é a casa grande de 1960 que virou hospedaria: quarto com banheiro, café da [[Padaria do Jardim]] e o portão que só abre pelo interfone. Hospeda técnico de fora, família em visita e quem paga pra dormir num bairro monitorado.",
      [("Quarto", "duplo com banheiro, janela pro parque"), ("Inclui", "café da padaria, telefone na sala"), ("Regra", "registro com documento — a Embratel ouve o interfone"), ("Nível", "4 — Classe Média")])
noite("Diária no Hotel Padre Chagas", "[[Hotel Padre Chagas]]", 1500, 5, [W("Moinhos de Vento"), W("Hotel Padre Chagas")],
      "Diária num hotel de charme da Padre Chagas: suíte, bar de piano, garagem vigiada e a certeza de que a Gradiente sabe o nome de quem dormiu.",
      "O [[Hotel Padre Chagas]] hospeda o executivo em trânsito, o médico de congresso e o estrangeiro do Mercosul que não quis o Plaza. Suíte com telefone Embratel, bar de piano e segurança da Gradiente na porta.",
      [("Quarto", "suíte com telefone, ar-condicionado e frigobar"), ("Inclui", "café servido, garagem vigiada, jornal censurado na porta"), ("Regra", "registro com passaporte ou crachá"), ("Nível", "5 — Classe Média Alta")])
noite("Noite na Pousada da Balsa", "[[Pousada da Balsa]]", 100, 1, [W("Restinga"), W("Pousada da Balsa")],
      "Rede ou colchão por noite no sobrado do Bar da Balsa, na Restinga: sem pergunta, sem registro, sem Brigada.",
      "A [[Pousada da Balsa]] é o andar de cima do bar: rede, colchão e uma chave de cadeado pra quem chegou de balsa ou vai sair de bote de madrugada. O enclave não registra ninguém — e cobra em dinheiro, dólar ou peixe.",
      [("Quarto", "rede ou colchão em salão comum"), ("Inclui", "café do bar de manhã"), ("Regra", "briga resolve na rua"), ("Nível", "1 — Miserável")])
noite("Noite na Pensão da Vila", "[[Pensão da Vila]]", 120, 2, [W("Zona Leste"), W("Pensão da Vila")],
      "Quarto por noite na pensão da vila, Zona Leste: parede de tijolo à vista, rádio da Camisa 12 e cachorro no portão.",
      "A [[Pensão da Vila]] aluga quarto por noite a quem ficou na Zona Leste depois do toque: parede sem reboco, cadeado, e o rádio da vizinhança tocando hino. A dona é tia de meio time da [[Camisa 12]].",
      [("Quarto", "solteiro, cadeado próprio"), ("Inclui", "café às seis"), ("Regra", "colorado dorme de graça em dia de vitória"), ("Nível", "2 — Classe Baixa")])

PENSOES = [
 ("Jardim Itu", "Pensão do Itu", "Jardim Itu", "Dona Cleusa Bortolini", "Pensão de operário aberta em 1971 com a segunda expansão da Itú Química: beliche, éter e o apito da fábrica como despertador.",
  "Beliche por noite ou quarto por mês pra operário sem vila e demitido sem casa; café com pão às cinco e o caderno de nomes que a fábrica consulta.",
  "Sobrado de reboco descascado ao lado do muro da fábrica, beliches de ferro, varal na frente, cheiro de éter no corredor.",
  ["[[Fábrica Itú Química]] — consulta o caderno", "[[Comando Itu-Química]] — dorme aqui quando some"], "Dois operários demitidos ficaram um mês na pensão sem pagar; a dona cobrou da fábrica.", [W("Noite na Pensão do Itu")]),
 ("Nova Sarandi", "Pensão da Ferroviária", "Nova Sarandi", "Seu Osvaldo Pacheco (ex-ferroviário)", "Dormitório do pátio de manobras desde os anos 50; quando a Zaffari comprou a ferrovia, virou pensão de quem chega de trem de carga.",
  "Cama de ferro por noite, chimarrão às quatro e meia e a porta na cara de quem não sai pro turno; sem registro, batida na sexta.",
  "Casarão de madeira encostado no pátio de manobras, cama de ferro em fila, cobertor de lã, locomotiva apitando na janela.",
  ["[[Zaffari]] — dona da ferrovia", "[[Sindicato dos Catadores]] — dorme aqui quando o caminhão quebra"], "A Brigada levou três hóspedes sem carteira na batida de sexta; Seu Osvaldo pagou a propina de segunda.", [W("Noite na Pensão da Ferroviária")]),
 ("Petrópolis", "Pensão da Bento", "Petrópolis", "Dona Ivone Marchesan", "Pensão de família na Bento Gonçalves desde 1962, hospedando técnico da Tramontina em treinamento e parente de funcionário.",
  "Quarto por noite com chave e toalha, café de mesa posta e a fofoca de toda a Tramontina; silêncio depois das dez.",
  "Casa de 1960 com jardim na frente, sala com toalha de crochê, quadro do Papa e uma mesa de café posta pra oito.",
  ["[[Tramontina]] — os hóspedes", "[[Brigada Militar Metropolitana]] — o sargento janta aqui às quintas"], "Um técnico em treinamento sumiu no meio da noite; a mala continua no quarto.", [W("Noite na Pensão da Bento")]),
 ("Jardim Botânico", "Hospedaria do Jardim", "Jardim Botânico", "Família Weber (Dona Gisela)", "Casa grande de 1960 que virou hospedaria quando os prédios chegaram: quarto com banheiro, portão com interfone e vista pro parque.",
  "Diária pra técnico de fora, família em visita e quem paga pra dormir em bairro monitorado; registro com documento, café da padaria.",
  "Casa de dois andares com jardim cercado, interfone no portão, varanda com cadeira de vime, a copa do parque por cima do muro.",
  ["[[Zaffari]] — o síndico indica", "[[Embratel]] — ouve o interfone"], "A Embratel instalou 'linha nova' no interfone; a dona passou a atender só de dia.", [W("Noite na Hospedaria do Jardim")]),
 ("Moinhos de Vento", "Hotel Padre Chagas", "Moinhos de Vento", "Grupo hoteleiro da [[Gradiente]] (gerente Sr. Renato Ely)", "Hotel de charme aberto em 1984 na Padre Chagas pra executivo que não quer o Plaza: suíte, bar de piano e segurança da Gradiente.",
  "Diária de suíte com telefone Embratel, garagem vigiada e jornal na porta; registro com passaporte ou crachá — a Gradiente sabe quem dormiu.",
  "Fachada de tijolo à vista e vidro fumê entre restaurantes, porteiro de luva, Gurgel Carajás preto na porta, bar de piano aceso.",
  ["[[Gradiente]] — dona do hotel", "[[Sociedade dos Jardins]] — o bar é ponto de reunião"], "Um estrangeiro do Mercosul deixou uma pasta no cofre e não voltou.", [W("Diária no Hotel Padre Chagas")]),
 ("Restinga", "Pousada da Balsa", "Restinga", "Nego Ari (dono do [[Bar da Balsa]])", "O andar de cima do Bar da Balsa virou dormitório em 1984, quando a balsa da Zaffari passou a deixar gente na Restinga de noite.",
  "Rede ou colchão por noite, cadeado próprio, café do bar; sem registro e sem Brigada, cobra em dinheiro, dólar ou peixe.",
  "Sobrado de zinco e tábua sobre o bar, redes penduradas em salão comum, lampião, o lago escuro pela janela sem vidro.",
  ["[[Aliança Livre das Palafitas]] — os barqueiros dormem aqui", "[[Clã da Ferrugem]] — compra o que os hóspedes deixam"], "Um hóspede saiu de bote de madrugada e o bote voltou vazio.", [W("Noite na Pousada da Balsa")]),
 ("Zona Leste", "Pensão da Vila", "Zona Leste", "Dona Terezinha 'Tia Tê' Farias", "Pensão da vila desde 1975, tia de meio time da Camisa 12: quarto por noite pra quem ficou na Zona Leste depois do toque.",
  "Quarto com cadeado, café às seis, rádio tocando hino; colorado dorme de graça em dia de vitória.",
  "Casa de tijolo sem reboco com portão de grade, cachorro na frente, bandeira do Inter na janela, varal de camisa vermelha.",
  ["[[Camisa 12]] — família", "[[Sindicato dos Catadores]] — o caminhão passa às cinco"], "Depois do Gre-Nal a pensão virou enfermaria de torcedor por uma noite.", [W("Noite na Pensão da Vila")]),
]
for pasta, nome, geo, dono, ctx, desc, apar, infl, acont, servs in PENSOES:
    poi(pasta, nome, geo, dono, ctx, desc, apar, infl, acont, servs)
patch_servicos("Bom Fim/Pensão Farroupilha", [W("Noite na Pensão Farroupilha")])
patch_servicos("Praia de Belas/Pensão do Cais", [W("Noite na Pensão do Cais")])
patch_servicos("Costa e Silva/Pensão da Vila Militar", [W("Noite na Pensão da Vila Militar")])
patch_servicos("Centro Histórico/Cidade Baixa/Trapiche da Aliança", [W("Noite na Palafita")])
patch_servicos("Zona Deserta/Barraco de Aluguel do Clã", [W("Noite no Barraco do Clã")])

# ═══════════════════════ 3. SAÚDE POR BAIRRO ═══════════════════════
SAUDE = [
 ("Bom Fim", "Hospital de Clínicas", "Bom Fim", "Dr. Hélio Brandão (diretor clínico)", "Hospital-escola de 1971 na divisa do Bom Fim: público, lotado e o único pronto-socorro que atende sem perguntar o plano — a Brigada pergunta depois.",
  "Pronto-socorro 24 h com fila de seis horas, enfermaria coletiva e residente que aprende no paciente; ferimento de bala vira boletim antes de virar prontuário.",
  "Bloco de concreto de dez andares com rampa de ambulância, fila na calçada, maca no corredor, brigadiano de prancheta na porta do PS.",
  ["[[Brigada Militar Metropolitana]] — posto policial no PS", "[[Resistência Urbana Gaúcha]] — residentes que 'perdem' fichas"], "Um residente sumiu depois de costurar um estudante baleado sem registrar."),
 ("Centro Histórico", "Santa Casa", "Centro Histórico", "Irmã Otília (madre superiora)", "A Santa Casa de 1803 perdeu o térreo pra enchente e segue atendendo do segundo andar pra cima, por passarela e por barco.",
  "Enfermaria de caridade sobre a água: freira, médico voluntário e remédio da Panvel racionado; atende quem chega de barco, sem plano e sem registro.",
  "Prédio colonial com a água na altura das janelas do térreo, passarela de tábua até um portão do segundo andar, freira de hábito branco recebendo bote com ferido.",
  ["[[Panvel]] — doa o remédio vencido", "[[Aliança dos Fundadores]] — a passarela"], "A Brigada quis levar um ferido da enfermaria; Irmã Otília fechou o portão e rezou alto."),
 ("Centro Histórico/Cidade Baixa", "Enfermaria das Palafitas", "Cidade Baixa", "Nêga Lu (enfermeira da [[Aliança Livre das Palafitas]])", "Uma palafita maior, de zinco, onde a enfermeira da Aliança costura, tira bala e faz parto desde a enchente.",
  "Enfermaria de guerra sobre a água: soro no arame, anestesia de cachaça, antibiótico do Mercado Flutuante; paga em dose, favor ou peixe.",
  "Palafita de zinco com cruz vermelha pintada à mão, maca de porta, lampião, bote amarrado embaixo com sangue no fundo.",
  ["[[Aliança Livre das Palafitas]] — a enfermeira é da Aliança", "[[Panvel]] — o antibiótico vem por baixo"], "Nêga Lu tirou uma bala de um brigadiano e cobrou uma semana sem batida."),
 ("Costa e Silva", "Hospital de Guarnição", "Costa e Silva", "Major-médico Arlindo Fontoura", "Hospital do Exército ao lado do QG, com o posto médico avançado da Panvel pra 'colaterais' químicos.",
  "Atende farda, família de farda e civil com favor ou ordem; tem o único kit de descontaminação selênica da cidade — e o prontuário vai pro serviço de informação.",
  "Pavilhão verde-oliva com cruz vermelha, sentinela na porta, ambulância militar, tenda de descontaminação da Panvel no pátio.",
  ["[[Governo Militar Brasileiro]] — Exército", "[[Panvel]] — o posto avançado"], "Um civil descontaminado saiu do hospital direto pro interrogatório."),
 ("Ipanema", "Clínica Ipanema", "Ipanema", "Dr. Fábio Lorentz", "Clínica particular de 1979 dentro do enclave, convênio Gradiente e Zaffari: atende executivo, família e empregado com crachá.",
  "Consultório, raio-X e dois leitos de observação; sem convênio, paga adiantado em cruzado ou dólar — e a guarita decide se entra.",
  "Casa branca de um andar com jardim aparado, placa de bronze, ambulância particular na garagem e guarita do condomínio na esquina.",
  ["[[Gradiente]] — convênio", "[[Sociedade dos Jardins]] — a clientela"], "A guarita barrou uma ambulância do Clínicas; o paciente foi atendido no portão."),
 ("Jardim Botânico", "Posto Panvel do Jardim", "Jardim Botânico", "Farmacêutico Nilton Sperb", "Farmácia com posto médico dos fundos, aberta pela Panvel em 1982 pra clientela dos prédios novos do Botânico.",
  "Farmacêutico que aplica injeção, médico de plantão à tarde, laudo de Reatividade Selênica e remédio de verdade pra quem tem receita — ou desconto em folha.",
  "Loja de vitrine iluminada com o logo da Panvel, balcão de fórmica, sala dos fundos com maca e biombo, fila de senhora com receita.",
  ["[[Panvel]] — rede", "[[Zaffari]] — desconto em folha"], "O médico de plantão passou a atender também a Estação Jardim Botânico quando alguém desmaia na plataforma."),
 ("Jardim Itu", "Ambulatório da Itú Química", "Jardim Itu", "Dra. Iara Menegatti", "Ambulatório da fábrica, obrigatório por contrato desde 1974: laudo mensal de reatividade, curativo de queimadura química e o vizinho que entra pela porta dos fundos.",
  "Atende operário com crachá na frente e vizinho sem crachá atrás; curativo, soro, antídoto de éter e o laudo que decide quem continua empregado.",
  "Anexo de alvenaria colado ao galpão, cheiro de éter, maca de lona, armário de vidro com antídotos, fila de macacão na porta.",
  ["[[Fábrica Itú Química]] — dona", "[[Comando Itu-Química]] — a doutora não entrega ninguém"], "A doutora assinou laudo 'apto' pra um operário reativo; a fábrica ainda não descobriu."),
 ("Moinhos de Vento", "Clínica Salgado", "Moinhos de Vento", "[[Dra. Beatriz Salgado]]", "Clínica cirúrgica de luxo na Padre Chagas: prótese, estética e a cirurgia que não pode aparecer no prontuário de ninguém.",
  "Centro cirúrgico privado, leito de recuperação e sigilo cobrado em favor corporativo; urgência atendida só se o nome abrir a porta.",
  "Fachada de mármore rosa com vidro fumê, sala de espera de veludo, enfermeira de scrubs de grife, Carajás preto estacionado na frente.",
  ["[[Sociedade dos Jardins]] — a presidente é a dona", "[[Gradiente]] — os pacientes que não existem"], "Um executivo da Zaffari saiu com o rosto enfaixado e a doutora com um favor a cobrar."),
 ("Nova Sarandi", "Posto Panvel da Sarandi", "Nova Sarandi", "Farmacêutica Loreni Kunz", "Farmácia-posto da Panvel na Rua da Sarandi, aberta em 1980 pra atender o turno: laudo, injeção e remédio em crédito Zaffari.",
  "Farmacêutica que costura e aplica, médico duas manhãs por semana, laudo de Reatividade na fila; remédio fiado contra o crédito de racionamento.",
  "Loja estreita com o logo da Panvel torto, balcão de fórmica, fila de macacão, sala dos fundos com maca e um cartaz da PIRA.",
  ["[[Panvel]] — rede", "[[Tramontina]] — manda o acidentado do turno"], "Um acidentado da Tramontina esperou três horas pelo médico que só vinha na quinta."),
 ("Passo D'Areia", "Hospital Cristo Redentor", "Passo D'Areia", "Dr. Antônio Bicca (chefe do pronto-socorro)", "Hospital de trauma da zona norte, na Assis Brasil: recebe o acidentado de fábrica, o atropelado e o baleado do Passo e da Sarandi.",
  "Pronto-socorro de trauma 24 h, cirurgia de urgência e enfermaria lotada; fila por gravidade, prontuário compartilhado com a Brigada.",
  "Prédio horizontal com rampa de ambulância, caminhonete da Marcopolo descarregando ferido, fila na calçada, letreiro vermelho de PRONTO-SOCORRO.",
  ["[[Brigada Militar Metropolitana]] — posto no PS", "[[Marcopolo]] — os acidentados da fábrica"], "Três feridos do acidente do ônibus SARANDI foram costurados na mesma noite."),
 ("Petrópolis", "Ambulatório da Tramontina", "Petrópolis", "Dr. Getúlio Ramos (médico do trabalho)", "Ambulatório corporativo da Tramontina na sede, desde 1980: exame admissional, prótese ajustada e a urgência de quem tem crachá.",
  "Médico de fábrica, enfermeira e uma sala de prótese; funcionário e família atendidos de graça, o resto paga adiantado — e o RH lê o prontuário.",
  "Anexo de vidro e aço da sede, sala de espera com logotipo da Tramontina, maca hidráulica, braço protético em cima da bancada.",
  ["[[Tramontina]] — dona", "[[Cartel dos Eixos]] — as próteses que somem"], "Uma prótese experimental sumiu do ambulatório e reapareceu numa corrida do Cartel."),
 ("Praia de Belas", "Enfermaria do Porto", "Praia de Belas", "Seu Valdir Fagundes (enfermeiro da Marinha, reformado)", "Sala de enfermagem do porto desde os anos 60: costura estivador, tira anzol e faz curativo de queimadura de contêiner sem perguntar de onde veio.",
  "Curativo, sutura, tala e soro; sem médico, sem registro, paga em dinheiro ou em carga; quem precisa de mais vai de balsa pra Santa Casa.",
  "Sala de tijolo dentro do armazém, maca de lona, armário de vidro com gaze e iodo, cartaz da Marinha, cheiro de maresia e diesel.",
  ["[[Zaffari]] — o porto é seu", "[[Aliança Livre das Palafitas]] — os barqueiros feridos"], "Seu Valdir costurou um barqueiro baleado pela patrulha fluvial e a Brigada veio perguntar."),
 ("Quarto Distrito", "Consultório da Farrapos", "Quarto Distrito", "Dr. Lauro Bittencourt (cassado, sem CRM)", "Consultório de porta fechada acima de um bar da Farrapos: médico cassado em 1969, atende de madrugada quem não pode ir a hospital.",
  "Ferimento, overdose de selênico, aborto e bala fora de boletim; paga em dinheiro, dose ou silêncio; sem placa, sem fila, sem prontuário.",
  "Escada estreita ao lado de um bar, sala com maca de ginecologista e luminária de cirurgião, pia manchada, rádio cobrindo o barulho da rave embaixo.",
  ["[[Ordem dos Subsolos]] — cobra o ponto", "[[Panvel]] — o remédio contrabandeado"], "O doutor atendeu uma overdose de artista famoso e a Embratel gravou a ligação de socorro."),
 ("Restinga", "Curandeira da Restinga", "Restinga", "Dona Iolanda (benzedeira e parteira)", "A parteira do enclave desde os anos 70: erva, ponto, benzedura e o antibiótico que vem do Mercado Flutuante.",
  "Parto, febre, corte e picada; erva do quintal, ponto com linha de pesca, antibiótico contrabandeado quando tem; paga em peixe, dose ou trabalho.",
  "Casa de palafita de metal reciclado com ervas secando no teto, altar de santo e garrafa de cachaça de raiz, maca de porta e um cachorro na entrada.",
  ["[[Aliança Livre das Palafitas]] — protege a casa", "[[Panvel]] — o antibiótico vem pelo Mercado Flutuante"], "Dona Iolanda fez um parto no meio da balsa da Zaffari e o fiscal olhou pro outro lado."),
 ("Zona Deserta", "Barraca do Enfermeiro", "Zona Deserta", "Bira Enfermeiro (desertor do Exército)", "Barraca de lona no meio da Zona Deserta onde um desertor da enfermaria do QG trata queimadura química e ferimento de sucata desde 1985.",
  "Curativo, sutura, morfina do Complexo Orion e antídoto improvisado; paga em sucata, dose ou favor; o Clã garante que o Exército não vem.",
  "Barraca de lona militar remendada, maca de porta sobre tambores, caixa de morfina com selo do Exército, poeira e sol.",
  ["[[Clã da Ferrugem]] — proteção", "[[Sindicato dos Catadores]] — traz o ferido no caminhão"], "Bira tratou um catador irradiado do Delta e não contou pra ninguém o que viu na pele."),
 ("Zona Leste", "Veterinário da Vila", "Zona Leste", "Doutor Pelé (veterinário)", "Consultório veterinário da vila desde 1978 que costura gente e cachorro na mesma mesa desde que o posto de saúde fechou em 1986.",
  "Sutura, tala, antibiótico veterinário e soro; ferido de briga de torcida, de bala e de acidente de oficina; paga em dinheiro, favor ou ingresso.",
  "Casa com placa de cachorro pintada, mesa de inox, armário de remédio de animal, torcedor sangrando na cadeira e um vira-lata olhando.",
  ["[[Camisa 12]] — os feridos do jogo", "[[Panvel]] — o antibiótico de gente vem de lá"], "Depois do Gre-Nal o doutor costurou onze pessoas e dois cachorros numa noite."),
]
for pasta, nome, geo, dono, ctx, desc, apar, infl, acont in SAUDE:
    poi(pasta, nome, geo, dono, ctx, desc, apar, infl, acont)


# ═══════════════════════ 3b. PLANOS TRI (Estilo de Vida · Transporte) ═══════════════════════
# TRI = Transporte Integrado, um cartão em quatro metais (Bronze · Prata · Ouro ·
# Platina); a ponta de baixo não tem cartão (A Pé) e a de cima não pega linha
# (Carro com Motorista). Regra do mestre 2026-09-08.
def plano(nome, nivel, preco, marca, classe, resumo, desc, espec):
    fm = ["aliases: ", "categoria: Recurso", "subcategoria: Transporte", 'Tipo: "Estilo de Vida"', f"Marca: {y(marca)}", f"Preço: {preco}", 'Cobrança: "mês"',
          f"Nível: {nivel}", "Onde: ", f"Resumo: {y(classe + ': ' + resumo)}", "Completo: true"]
    header = ["#Recurso", "> [!info] `= this.Tipo`: `= this.file.name`", "> 🏷️**Marca:** `= this.Marca`", "> 💰**Preço:** Cz$ `= this.Preço` · `= this.Cobrança`",
              "> 📶**Nível:** `= this.Nível`", "> 📍**Onde:** `= this.Onde`", "> 📝**Resumo:** `= this.Resumo`"]
    body = "\n".join(header) + "\n\n" + desc.strip() + "\n\n> [!info] Especificação\n" + "\n".join(f"> **{k}:** {v}" for k, v in espec + [("Classe", classe)]) + "\n"
    escrever(os.path.join(REC, "Transporte", f"{nome}.md"), "---\n" + "\n".join(fm) + "\n---\n" + body)
plano("A Pé", 1, 0, "", "Miserável", "Sem cartão: anda a pé, pega carona e paga tarifa avulsa quando não tem jeito.",
      """Nenhum cartão TRI. Anda a pé, atravessa o alagado pela passarela quando a Aliança deixa, pega carona no caminhão do [[Sindicato dos Catadores]], uma Kombi ou o [[Lancha do Barqueiro|barqueiro]] na mão. Quando precisa MESMO de um ônibus, paga a tarifa avulsa do bolso — e o Mestre desconta da ficha.""",
      [("Cartão", "nenhum"), ("Dá acesso a", "nada — passarela, carona, Kombi e barqueiro pagos na mão"), ("Quem usa", "catador, palafita, quem perdeu o emprego")])
plano("TRI Bronze", 2, 1500, "Trensurb", "Classe Baixa", "O cartão de bronze que o patrão desconta em folha: ônibus de ida e volta no horário do turno, mais nada.",
      """O cartão TRI de bronze vem descontado em folha: duas viagens de [[Passagem de Ônibus|ônibus]] por dia útil, no horário do turno, nas linhas da [[Marcopolo]] que a fábrica cadastrou. Fora do horário, fora da linha, fora do plano — o resto é a pé. A [[Embratel]] registra cada validação e o RH lê.""",
      [("Cartão", "TRI Bronze (Trensurb / [[Embratel]])"), ("Dá acesso a", "ônibus nas linhas do turno, ida e volta em dia útil"), ("Não cobre", "Aeromóvel, anfíbio, lotação, fora do turno"), ("Quem usa", "operário de fábrica, empregada, cobrador")])
plano("TRI Prata", 3, 2500, "Trensurb", "Classe Média Baixa", "Ônibus e anfíbio ilimitados, Aeromóvel popular incluso. O transporte de quem trabalha.",
      """O cartão de prata é o do operário que se virou: [[Passagem de Ônibus|ônibus]] e [[Passagem de Ônibus Anfíbio|anfíbio]] ilimitados, [[Aeromóvel Linha Popular]] incluso (quem tem carteira PIRA já tinha de graça). Superlotado, vigiado, mas leva em qualquer lugar da cidade que tenha trilho ou asfalto.""",
      [("Cartão", "TRI Prata (Trensurb)"), ("Dá acesso a", "ônibus, anfíbio e Aeromóvel popular, ilimitados"), ("Não cobre", "lotação VIP, linha executiva, táxi"), ("Quem usa", "operário PIRA, brigadiano, balconista")])
plano("TRI Ouro", 4, 5000, "Trensurb + concessionárias", "Classe Média", "Tudo do Prata mais a lotação VIP — chega sem parar em sinal.",
      """O cartão de ouro é o da classe média: tudo do [[TRI Prata]] mais a [[Lotação VIP]] ilimitada, com o rádio da [[Embratel]] abrindo as sinaleiras. É o cartão dourado que o motorista respeita e o porteiro do prédio aceita como identidade.""",
      [("Cartão", "TRI Ouro (Trensurb + concessionárias)"), ("Dá acesso a", "tudo do Prata + lotação VIP ilimitada"), ("Não cobre", "linha executiva, táxi"), ("Quem usa", "técnico graduado, gerente de loja, funcionário público")])
plano("TRI Platina", 5, 10000, "Trensurb + [[Gradiente]]", "Classe Média Alta", "Linha executiva do Aeromóvel e táxi conveniado inclusos. O cartão de quem tem crachá.",
      """O cartão de platina é o de quem tem crachá de megacorp: [[Aeromóvel Linha Executiva]] e lotação VIP ilimitadas, [[Táxi Gurgel]] conveniado (a corrida vai na conta do plano), a lancha da Gradiente com convite e prioridade na plataforma. A [[Embratel]] sabe cada trecho — e o RH também.""",
      [("Cartão", "TRI Platina ([[Gradiente]] / Trensurb)"), ("Dá acesso a", "linha executiva, lotação VIP, táxi conveniado, lancha da Gradiente com convite"), ("Não cobre", "motorista particular"), ("Quem usa", "executivo, médico de clínica, oficial")])
plano("Carro com Motorista", 6, 20000, "a empresa (crachá de diretoria)", "Classe Alta", "Carro da empresa com motorista na porta, escolta quando precisa e o TRI Platina no bolso. Ninguém da rua vê você andar.",
      """O plano da diretoria: carro da empresa com motorista à disposição, escolta da [[Gradiente]] quando o destino é feio, e um [[TRI Platina]] no bolso pra [[LINHA EXECUTIVA]] quando a rua não presta. Não se paga: a empresa desconta — e sabe onde você dormiu.""",
      [("Cartão", "TRI Platina de cortesia + carro da empresa"), ("Dá acesso a", "motorista, escolta, linha executiva, lancha da Gradiente, táxi sem limite"), ("Não cobre", "nada — cobre até o que não devia"), ("Quem usa", "diretor, coronel, dono de rede")])

# ═══════════════════════ 4. LINHAS ═══════════════════════
# Regra do mestre (2026-09-08): NADA de transporte ao sul da Praia de Belas —
# Restinga, Zona Deserta e orla sul ficam fora da malha; só a LINHA EXECUTIVA
# desce até Ipanema (e a lancha da Gradiente, que é dela). Baldeação = parada
# COMPARTILHADA: onde o ônibus passa numa estação, a parada é a estação.
ONIBUS_APAR = "Marcopolo Torino amarelo desbotado com faixa verde da prefeitura, letreiro de plástico branco com o nome em preto, adesivo 'TRI — Trensurb' na porta, roleta de ferro, poltrona de courvin rasgado, gente em pé pendurada, chuva na janela."
AERO_APAR = "Viaduto de concreto cinza com manchas de infiltração, vagão branco e verde de janelas apertadas com adesivo do regime, plataforma com catraca de leitor de carteira, cabine de vidro fumê da Brigada, cartaz 'PIRA — PRODUTIVIDADE É LIBERDADE'."
ANF_APAR = "Ônibus amarelo com a barriga de fibra branca suja de lodo, hélice enferrujada atrás, cobrador na proa com um remo, coletes salva-vidas pendurados no teto, água barrenta batendo na metade da roda."
VIP_APAR = "Van Marcopolo prateada com vidro fumê e antena de rádio comprida, letreiro digital vermelho, motorista de gravata fina, poltronas de veludo azul, sinaleira abrindo verde à frente enquanto o ônibus do lado espera."
KOMBI_APAR = "Kombi bege ou azul com o farol apagado, porta de correr aberta com um cobrador de boné pendurado, papelão no vidro com o destino escrito à mão, doze pessoas dentro, uma na porta."
MARCOPOLO = "[[Marcopolo]] por contrato com a [[Prefeitura de Porto Alegre]]"
PRATA, BRONZE, OURO, PLATINA = W("TRI Prata"), W("TRI Bronze"), W("TRI Ouro"), W("TRI Platina")
PASS, PANF, PVIP, PKOMBI = W("Passagem de Ônibus"), W("Passagem de Ônibus Anfíbio"), W("Lotação VIP"), W("Lotação Clandestina")

# Aeromóvel
linha("Aeromóvel", "Aeromóvel", "L1 POPULAR NORTE", "L1 POPULAR NORTE", "Trensurb; energia da [[Companhia Estadual de Energia Elétrica|CEEE]]", PRATA, W("Aeromóvel Linha Popular"), 3, "5h–23h",
      ["Estação Zaffari", "Estação Sarandi", "Estação Passo D'Areia", "Estação Nogueiras", "Estação Independência", "Estação Central"],
      "A linha do turno: Nova Sarandi e Passo D'Areia ao Centro em doze minutos, superlotada, vigiada e grátis com carteira PIRA.",
      """A linha do turno. Enche às cinco na [[Estação Zaffari]] e na [[Estação Sarandi]] com macacão da [[Tramontina]] e da [[Marcopolo]], para nos condomínios da [[Estação Nogueiras]], cruza a [[Estação Independência]] cheia de estudante e desce na [[Estação Central]] em doze minutos — volta às dezoito, mais cheia ainda. Brigadiano em cada plataforma: flagrante é "subversão". A carteira PIRA abre a catraca de graça; o resto passa o cartão TRI. Quando a CEEE corta a periferia, o trilho continua — prioridade absoluta do regime. Baldeação com todo ônibus da Assis Brasil nas estações Nogueiras, Passo D'Areia e Independência.""",
      AERO_APAR, cor="#1f5fbf")
linha("Aeromóvel", "Aeromóvel", "L2 POPULAR SUL", "L2 POPULAR SUL", "Trensurb; energia da [[Companhia Estadual de Energia Elétrica|CEEE]]", PRATA, W("Aeromóvel Linha Popular"), 3, "5h–23h",
      ["Estação Central", "Estação Cidade Baixa", "Estação Porto Novo", "Estação Estádios", "Estação Jardim Botânico"],
      "A linha do jogo e do porto: passa por cima do alagado da Cidade Baixa, deixa o estivador no Porto Novo e a torcida nos estádios; termina no Jardim Botânico.",
      """A linha do jogo e do porto. Sai da [[Estação Central]] por cima da água barrenta da [[Estação Cidade Baixa]], deixa o estivador na [[Estação Porto Novo]] (onde a balsa da Zaffari encosta embaixo), a torcida na [[Estação Estádios]] e termina entre árvores na [[Estação Jardim Botânico]]. Em dia de Gre-Nal a Brigada fecha a Estação Estádios uma hora antes e depois do apito e o [[Consórcio das Bandeiras]] vende ingresso na escada. Mesmo vagão da L1, menos lotado — menos gente de crachá mora no sul. É a última linha popular: ao sul da Praia de Belas não há trilho nem ônibus.""",
      "Viaduto de concreto passando por cima de água barrenta e palafita, estação com grade anti-invasão, torcedores de bandeira na plataforma, guindaste do porto atrás.", cor="#1f8f3f")
linha("Aeromóvel", "Aeromóvel", "LINHA EXECUTIVA", "LINHA EXECUTIVA", "Trensurb; segurança [[Gradiente]]", PLATINA, W("Aeromóvel Linha Executiva"), 5, "6h–1h",
      ["Estação Moinhos", "Estação Concorde", "Estação Centro Corporativo", "Estação Praia de Belas", "Estação Ipanema"],
      "A vitrine do regime: 24 poltronas, vidro fumê, telefone a bordo, dos Moinhos a Ipanema sem cruzar com ninguém da rua — o único transporte que desce até o enclave.",
      """A vitrine do regime. Vagão preto de 24 poltronas com telefone [[Embratel]] a bordo: sai da [[Estação Moinhos]] com guarita da Gradiente, para dentro do [[Edifício Concorde]] na [[Estação Concorde]], cruza o Centro pelo deck de vidro da [[Estação Centro Corporativo]] — separada da popular por uma catraca de crachá —, deixa o executivo no escritório do porto pela [[Estação Praia de Belas]] e segue sozinha pelo lago até a porta dos condomínios, na [[Estação Ipanema]]: nenhum ônibus, lotação ou balsa desce até lá. Crachá de megacorp abre a catraca; quem entra sem ele paga Cz$ 1.000, é fotografado e sai escoltado.""",
      "Vagão preto fosco com friso dourado e logo da Gradiente, plataforma de mármore com carpete, segurança de terno com radinho, executivo de pasta lendo jornal censurado, vista do Guaíba pelo vidro.", cor="#111111")
linha("Aeromóvel", "Aeromóvel", "RAMAL COSTA E SILVA", "RAMAL COSTA E SILVA", "Exército; Trensurb só mantém o trilho", "só o Exército — fechado ao público desde 1985", "", 2, "sem horário; roda de madrugada",
      ["Estação Central", "Estação Quartel"],
      "Ramal construído pra tropa entre a Estação Central e o portão do QG: fechado ao público desde 1985, roda de madrugada com as luzes apagadas.",
      """O trecho que ninguém pega. Construído em 1984 pra levar tropa do [[Quartel-General do Exército]] ao Centro, o ramal foi fechado ao público em 1985 e só roda com vagão verde-oliva, sem janela e sem horário. As escadas da [[Estação Quartel]] têm arame farpado; na [[Estação Central]] ele encosta numa plataforma trancada. O [[Cartel dos Eixos]] corre de Motomachine em cima da via quando o vagão não passa — e nos pilares parados do ramal da [[Zona Leste]], que nunca ficou pronto. Não entra no mapa da malha: não há como embarcar.""",
      "Viaduto cercado de arame farpado, vagão verde-oliva sem janela passando de madrugada com as luzes apagadas, sentinela de fuzil, torre de comunicação do quartel.", cor="#6b7b4a", fechada=True)

# Ônibus — radiais
linha("Ônibus", "Ônibus", "SARANDI — CENTRO", "SARANDI", MARCOPOLO, BRONZE, PASS, 1, "5h–23h",
      ["Estação Zaffari", "Estação Sarandi", "Rua da Sarandi", "Posto Ipiranga da Assis Brasil", "Estação Nogueiras", "Estação Independência", "Estação Central"],
      "O radial do turno pela Assis Brasil: lota às cinco, quebra na subida da Independência e é a linha mais assaltada da cidade.",
      """O corredor da [[Rua da Sarandi]]. Sai do pátio da [[Estação Zaffari]], recolhe o turno na [[Estação Sarandi]] e na [[Rua da Sarandi]], pega a Assis Brasil no [[Posto Ipiranga da Assis Brasil]] e desce pela [[Estação Nogueiras]] e pela [[Estação Independência]] até a [[Estação Central]]. O [[TRI Bronze]] vale no horário do turno; fora dele, Prata pra cima ou dinheiro pro cobrador. Motor que apaga na subida, cobrador de sacola, camelô de amendoim pela porta de trás — e assalto na parada de [[Nova Sarandi]] como rotina ([[Crimes Cotidianos]]).""", ONIBUS_APAR, cor="#e6a100")
linha("Ônibus", "Ônibus", "ASSIS BRASIL — CENTRO", "ASSIS BRASIL", MARCOPOLO, BRONZE, PASS, 2, "5h–23h",
      ["Motel Assis Brasil", "Concessionária Gurgel", "Shopping Iguatemi", "Estação Passo D'Areia", "Estação Nogueiras", "Estação Independência", "Estação Central"],
      "A linha mais cheia da cidade: um a cada cinco minutos pela Assis Brasil, do motel ao Centro.",
      """A mais cheia da cidade, um a cada cinco minutos. Vem da ponta leste da Assis Brasil — [[Motel Assis Brasil]], [[Concessionária Gurgel]], [[Shopping Iguatemi]] — para embaixo da [[Estação Passo D'Areia]] e da [[Estação Nogueiras]] pra quem não quer pagar Aeromóvel e desce pela [[Estação Independência]] até a [[Estação Central]]. TRI Bronze no turno, Prata o dia inteiro. É o ônibus que a [[Marcopolo]] mais conserta e menos conserta: tem peça, mas nunca sobra.""", ONIBUS_APAR, cor="#e63946")
linha("Ônibus", "Ônibus", "ITU — CENTRO", "ITU", MARCOPOLO, BRONZE, PASS, 1, "5h–23h",
      ["Fábrica Itú Química", "Rua da Antiga Indústria", "Estação Nogueiras", "Estação Independência", "Estação Central"],
      "A linha mais quebrada: dois ônibus pra linha inteira, cheiro de éter e o operário da Itú Química dormindo em pé.",
      """Dois ônibus pra linha inteira. Sai do portão da [[Fábrica Itú Química]], desce a [[Rua da Antiga Indústria]], cruza os condomínios da [[Estação Nogueiras]] e chega ao Centro pela [[Estação Independência]] — quando chega. TRI Bronze no turno da fábrica; o operário que perde o último dorme na [[Pensão do Itu]]. O cheiro de éter fica no estofado.""", ONIBUS_APAR, cor="#8d5a2b")
linha("Ônibus", "Ônibus", "PETRÓPOLIS — CENTRO", "PETRÓPOLIS", MARCOPOLO, PRATA, PASS, 3, "5h–23h",
      ["Sede da Tramontina", "Parque Moinhos", "Galeteria de Petrópolis", "Redenção", "Armazém Sarmento Leite", "Estação Central"],
      "O ônibus de classe média: inteiro, com rádio, pela Bento Gonçalves da sede da Tramontina até o Centro.",
      """O ônibus "de classe média": inteiro, com rádio na Farroupilha e cobrador de uniforme. Desce a Bento Gonçalves da [[Sede da Tramontina]] e do [[Parque Moinhos]], passa na [[Galeteria de Petrópolis]], contorna a [[Redenção]] e chega à [[Estação Central]] pela esquina do [[Armazém Sarmento Leite]]. Prata pra cima; a Brigada sobe pouco — o passageiro tem crachá.""", ONIBUS_APAR, cor="#7b2cbf")
linha("Ônibus", "Ônibus", "NAVEGANTES — CENTRO", "NAVEGANTES", MARCOPOLO, PRATA, PASS, 2, "5h–22h50",
      ["Velha Indústria", "Teatro Quarto Distrito", "Farrapos", "Galeria do Rosário", "Estação Central"],
      "A linha do Quarto Distrito pela Voluntários da Pátria: operário de dia, artista de noite, o último sai às 22h50 cheio.",
      """A Voluntários da Pátria de ponta a ponta. De dia leva o operário da [[Velha Indústria]]; de noite leva o artista do [[Teatro Quarto Distrito]] e quem sai dos bares da [[Farrapos]] antes do toque. Para na [[Galeria do Rosário]] e acaba na [[Estação Central]]. O último sai às 22h50 cheio de artista — e a [[Ordem dos Subsolos]] sabe quem estava nele.""", ONIBUS_APAR, cor="#ff7f0e")
linha("Ônibus", "Ônibus", "343 BEIRA-RIO", "343 BEIRA-RIO", MARCOPOLO, PRATA, PASS, 2, "5h–23h",
      ["Estação Central", "Estação Cidade Baixa", "Estação Férrea de Belas", "Estação Estádios", "Mercado de Frutos do Mar"],
      "O 343 pela orla: Centro, Cidade Baixa, estádios e o mercado de peixe — a última parada antes do nada.",
      """A orla do Guaíba até onde a cidade ainda vai. Sai da [[Estação Central]], encosta na [[Estação Cidade Baixa]] pra quem vem de barco, para na [[Estação Férrea de Belas]], lota na [[Estação Estádios]] em dia de jogo e acaba no [[Mercado de Frutos do Mar]], de onde só se segue a pé, de barco ou de carona. Prata pra cima. É o 3xx da zona sul que sobrou: os outros foram cortados quando a Restinga virou enclave.""", ONIBUS_APAR, cor="#d81b8a")
linha("Ônibus", "Ônibus", "UFRGS — BARRA", "UFRGS — BARRA", MARCOPOLO, PRATA, PASS, 2, "6h–23h",
      ["Colégio Rosário", "Armazém Sarmento Leite", "Redenção", "Estação Férrea de Belas", "Estação Porto Novo"],
      "O ônibus do estudante: do campus à 'Barra' do Porto Novo, cheio de livro proibido, com a Brigada subindo na Redenção.",
      """O ônibus do estudante — a única linha com dois nomes e nenhum número. Sai do campus, na porta do [[Colégio Rosário]], desce pela esquina do [[Armazém Sarmento Leite]], contorna a [[Redenção]] e vai até a "Barra": a [[Estação Férrea de Belas]] e a [[Estação Porto Novo]]. Cheio de livro embrulhado em jornal; a Brigada sobe na Redenção pra ver o que tem no embrulho.""", ONIBUS_APAR, cor="#00897b")
# Ônibus — transversais
linha("Ônibus", "Ônibus", "T1 SARANDI — PORTO NOVO", "T1 SARANDI — PORTO NOVO", MARCOPOLO, PRATA, PASS, 2, "5h–23h",
      ["Rua da Sarandi", "Estação Nogueiras", "Estação Independência", "Redenção", "Estação Férrea de Belas", "Estação Porto Novo"],
      "A transversal grande: uma hora e meia de Nova Sarandi ao porto sem entrar no Centro.",
      """A transversal grande: uma hora e meia de ponta a ponta sem entrar no Centro. Da [[Rua da Sarandi]] pelos condomínios da [[Estação Nogueiras]], pela [[Estação Independência]], pela [[Redenção]] e pela [[Estação Férrea de Belas]] até a [[Estação Porto Novo]]. Leva o estivador do norte pro cais e volta vazia depois das dezenove.""", ONIBUS_APAR, cor="#3949ab")
linha("Ônibus", "Ônibus", "T2 ZONA LESTE — BEIRA-RIO", "T2 ZONA LESTE — BEIRA-RIO", MARCOPOLO, BRONZE, PASS, 1, "5h–23h; em dia de jogo até o fim",
      ["Sede da Camisa 12", "Venda da Zona Leste", "Estação Jardim Botânico", "Estação Estádios", "Estação Porto Novo"],
      "A 'linha da torcida': da Zona Leste aos estádios, em dia de jogo vira caravana e a Brigada sobe armada.",
      """A "linha da torcida". Sai da porta da [[Sede da Camisa 12]] e da [[Venda da Zona Leste]], cruza a [[Estação Jardim Botânico]] e desce até a [[Estação Estádios]] e a [[Estação Porto Novo]]. TRI Bronze no turno; em dia de jogo vira caravana, com bandeira na janela e a Brigada armada na porta de trás. O motorista é colorado e para onde a torcida grita.""", ONIBUS_APAR, cor="#c62828")
linha("Ônibus", "Ônibus", "T3 VILA MILITAR — SARANDI", "T3 VILA MILITAR — SARANDI", MARCOPOLO, BRONZE, PASS, 2, "5h–23h",
      ["Vila Militar do Paraguassu", "Rádio Farroupilha", "Motel Assis Brasil", "Rua da Sarandi"],
      "A 'linha da farda': funciona porque leva soldado da Vila Militar à Assis Brasil e a Nova Sarandi.",
      """A "linha da farda". Sai da [[Vila Militar do Paraguassu]], passa na [[Rádio Farroupilha]], pega a Assis Brasil no [[Motel Assis Brasil]] e vai até a [[Rua da Sarandi]]. Funciona — tem peça, tem horário — porque leva soldado sem farda pra casa. TRI Bronze no turno; ninguém assalta.""", ONIBUS_APAR, cor="#4e6e2e")
linha("Ônibus", "Ônibus", "T4 SARANDI — MOINHOS", "T4 SARANDI — MOINHOS", MARCOPOLO, PRATA, PASS, 2, "5h–23h",
      ["Rua da Sarandi", "Estação Nogueiras", "Rua da Antiga Indústria", "Estação Moinhos"],
      "O operário que limpa os Moinhos: de Nova Sarandi, pelo Passo e pelo Itu, até a estação dos Moinhos — onde a guarita olha feio.",
      """O ônibus do operário que limpa os Moinhos. Da [[Rua da Sarandi]] pelos condomínios da [[Estação Nogueiras]], pela [[Rua da Antiga Indústria]] do [[Jardim Itu]] e até a esquina da [[Estação Moinhos]], onde a guarita da Gradiente olha feio pra quem desce de macacão. Prata pra cima; volta às dezoito com a mesma gente e cheiro de cera.""", ONIBUS_APAR, cor="#9c6b1f")
linha("Ônibus", "Ônibus", "T5 PETRÓPOLIS — QUARTO DISTRITO", "T5 PETRÓPOLIS — QUARTO DISTRITO", MARCOPOLO, PRATA, PASS, 2, "6h–23h",
      ["Galeteria de Petrópolis", "Pensão Farroupilha", "Redenção", "Estação Independência", "Farrapos", "Teatro Quarto Distrito"],
      "A linha do artista que mora em Petrópolis e finge que não: da Bento ao Bom Fim e à Farrapos, sem passar pelo Centro.",
      """A linha do artista que mora em Petrópolis e finge que não. Da [[Galeteria de Petrópolis]] pelo Bom Fim — [[Pensão Farroupilha]], [[Redenção]], [[Estação Independência]] — até a [[Farrapos]] e o [[Teatro Quarto Distrito]], sem tocar o Centro. Enche às dezenove com gente de casaco preto e volta vazia; depois do toque, só a Kombi da Voluntários faz o caminho.""", ONIBUS_APAR, cor="#5d4037")
linha("Ônibus", "Ônibus", "T6 CIRCULAR NOBRE", "T6 CIRCULAR NOBRE", MARCOPOLO, PRATA, PASS, 4, "6h–22h",
      ["Estação Moinhos", "Padre Chagas", "Parque Moinhos", "Estação Jardim Botânico", "Estação Praia de Belas"],
      "O ônibus dos bairros nobres: novo, com ar, acompanhado pela Brigada — e o motorista 'não vê' o TRI popular nos Moinhos.",
      """O ônibus dos bairros nobres, o único Torino novo da frota, com ar-condicionado e cortina. Da [[Estação Moinhos]] pela [[Padre Chagas]], pela Bento Gonçalves no [[Parque Moinhos]], pela [[Estação Jardim Botânico]] até a [[Estação Praia de Belas]], e volta pelo mesmo caminho. A Brigada acompanha de moto; o motorista "não vê" o TRI Prata quando o passageiro sobe nos Moinhos.""",
      "Marcopolo Torino novo, branco e verde, com cortina e ar-condicionado, motorista de gravata, moto da Brigada escoltando, árvores da Padre Chagas.", cor="#b8860b")
# Ônibus — circulares de bairro
linha("Ônibus", "Ônibus", "B05 BOM FIM", "B05 BOM FIM", MARCOPOLO, PRATA, PASS, 3, "6h–23h",
      ["Redenção", "Estação Independência", "Armazém Sarmento Leite", "Bar Ocidente", "Pensão Farroupilha"],
      "O microônibus do Bom Fim: vinte minutos a volta, da Redenção ao Ocidente e de volta.",
      """Um microônibus, vinte minutos a volta. Da [[Redenção]] sobe à [[Estação Independência]], desce pela esquina do [[Armazém Sarmento Leite]], para na porta do [[Bar Ocidente]] e na [[Pensão Farroupilha]] e recomeça. É o ônibus do estudante sem pressa e do professor com sacola; o cobrador conhece todo mundo pelo nome — e a Brigada, pelo cobrador.""",
      "Microônibus Marcopolo branco com faixa verde, letreiro 'B05 BOM FIM', cheio de estudante com mochila, árvores da Redenção passando na janela.", cor="#26a69a", circular=True)
linha("Ônibus", "Ônibus", "B12 PASSO D'AREIA", "B12 PASSO D'AREIA", MARCOPOLO, PRATA, PASS, 2, "5h–23h",
      ["Estação Passo D'Areia", "Estação Nogueiras", "Boteco Embaixo da Via", "Posto Ipiranga da Assis Brasil", "Shopping Iguatemi"],
      "A circular do Passo: da estação aos condomínios do Aeromóvel, ao posto e ao shopping, embaixo da via o tempo inteiro.",
      """A circular do bairro, embaixo do viaduto do Aeromóvel o tempo inteiro. Da [[Estação Passo D'Areia]] pelos condomínios da [[Estação Nogueiras]], pelo [[Boteco Embaixo da Via]], pelo [[Posto Ipiranga da Assis Brasil]] e pelo [[Shopping Iguatemi]], de volta à estação. Leva o técnico da [[Marcopolo]] pra casa e a criança pro shopping; o vagão passa por cima a cada oito minutos.""",
      "Microônibus amarelo passando por baixo do viaduto de concreto do Aeromóvel, prédios de kitnet, boteco aceso, o vagão branco cruzando por cima.", cor="#8e24aa", circular=True)
linha("Ônibus", "Ônibus", "B23 ZONA LESTE", "B23 ZONA LESTE", MARCOPOLO, BRONZE, PASS, 1, "5h–23h",
      ["Sede da Camisa 12", "Oficina do Borracheiro", "Padaria da Vila", "Venda da Zona Leste"],
      "A circular das vilas da Zona Leste: o motorista é da Camisa 12 e o ônibus para onde a vila manda.",
      """A circular das vilas. Da [[Sede da Camisa 12]] pela [[Oficina do Borracheiro]], pela [[Padaria da Vila]] e pela [[Venda da Zona Leste]], de volta à sede. O motorista é da Camisa 12, o cobrador é sobrinho da [[Pensão da Vila]] e o ônibus para onde a vila manda. TRI Bronze no turno; depois do toque, ninguém entra e ninguém sai.""",
      "Torino velho pintado de vermelho por baixo do amarelo, bandeira do Inter no retrovisor, rua de chão, vila de tijolo sem reboco, criança correndo atrás.", cor="#ef6c00", circular=True)
# Anfíbios
linha("Ônibus", "Ônibus Anfíbio", "A1 CENTRO ALAGADO", "A1 CENTRO ALAGADO", MARCOPOLO, PRATA, PANF, 2, "6h–22h",
      ["Estação Central", "Praça da Alfândega", "Galeria Malcom", "Duque de Caxias", "Salgado Filho", "Viaduto da Borges"],
      "A circular das passarelas: o único que chega ao Centro afundado sem barqueiro, boiando de galeria em galeria.",
      """A circular do Centro afundado, o único jeito de chegar às passarelas sem pagar barqueiro. Sai da passarela da [[Estação Central]], boia até a [[Praça da Alfândega]], encosta na escada da [[Galeria Malcom]], passa entre os palacetes afogados da [[Duque de Caxias]], desce o canal da [[Salgado Filho]] e volta pelo [[Viaduto da Borges]]. Torino cortado ao meio com casco de fibra da [[Gurgel]]: 15 km/h na rua, 6 na água, calado de 1,2 m. Rodam oito dos cinquenta contratados.""", ANF_APAR, cor="#0288d1", circular=True)
linha("Ônibus", "Ônibus Anfíbio", "A2 CIDADE BAIXA — CENTRO", "A2 CIDADE BAIXA — CENTRO", MARCOPOLO, PRATA, PANF, 1, "6h–22h",
      ["Trapiche da Aliança", "Lancheria da Cidade Baixa", "Estação Cidade Baixa", "Estação Central"],
      "O anfíbio das palafitas: do Trapiche da Aliança ao Centro; quando quebra fica boiando e a Aliança reboca — e cobra.",
      """O anfíbio das palafitas. Sai do [[Trapiche da Aliança]], encosta na [[Lancheria da Cidade Baixa]] e na escada da [[Estação Cidade Baixa]] e chega à passarela da [[Estação Central]]. Quando quebra fica boiando no meio do canal até a [[Aliança Livre das Palafitas]] rebocar — e cobrar de cada passageiro. A Brigada não sobe nele; revista na chegada.""", ANF_APAR, cor="#039be5")
linha("Ônibus", "Ônibus Anfíbio", "A3 LINHA DO CAIS", "A3 LINHA DO CAIS", MARCOPOLO, PRATA, PANF, 2, "5h–22h",
      ["Usina do Gasômetro", "Estação Porto Novo", "Estação Férrea de Belas", "Mercado de Frutos do Mar"],
      "A linha do cais: da Usina ao porto, à estação velha e ao mercado de peixe, meio na rua, meio na água.",
      """A linha do cais, meio na rua, meio na água. Da [[Usina do Gasômetro]] pelo cais da [[Estação Porto Novo]] e pela [[Estação Férrea de Belas]] até o [[Mercado de Frutos do Mar]], entrando na água onde o cais afundou. Leva estivador, peixeira e o ferido do porto pra Santa Casa. Prata pra cima; o cobrador tem remo.""", ANF_APAR, cor="#00acc1")
# Lotações VIP
VIP_OP = "concessionárias privadas com rádio [[Embratel]]"
linha("Lotação", "Lotação", "VIP NORTE", "VIP NORTE", VIP_OP, OURO, PVIP, 4, "6h–23h",
      ["Estação Centro Corporativo", "Estação Independência", "Estação Moinhos", "Estação Concorde", "Shopping Iguatemi"],
      "A lotação do Centro Corporativo aos Moinhos e ao Iguatemi: doze poltronas, ar, e o rádio que abre a sinaleira.",
      """De baixo do deck da [[Estação Centro Corporativo]] pela [[Estação Independência]] até a [[Estação Moinhos]], a [[Estação Concorde]] e o [[Shopping Iguatemi]]. Van Marcopolo de doze poltronas reclináveis, ar-condicionado e rádio [[Embratel]] que abre a sinaleira antes de chegar. O motorista sabe o nome de todo mundo e anota quem entrou com quem. [[TRI Ouro]] pra cima; avulso, Cz$ 500 na mão.""", VIP_APAR, cor="#8c8c8c")
linha("Lotação", "Lotação", "VIP PORTO", "VIP PORTO", VIP_OP, OURO, PVIP, 4, "6h–23h",
      ["Estação Centro Corporativo", "Estação Praia de Belas", "Estação Porto Novo"],
      "A lotação do Centro Corporativo ao escritório do porto e ao cais, sem parar em sinal.",
      """De baixo do deck da [[Estação Centro Corporativo]] ao escritório do porto na [[Estação Praia de Belas]] e ao cais da [[Estação Porto Novo]], sem parar em sinal. Leva o gerente que não tem crachá de Linha Executiva e o despachante da Zaffari com a pasta na mão. Ouro pra cima; a guarita do porto conhece a van.""", VIP_APAR, cor="#5f5f5f")
linha("Lotação", "Lotação", "VIP LESTE", "VIP LESTE", VIP_OP, OURO, PVIP, 4, "6h–23h",
      ["Estação Centro Corporativo", "Estação Independência", "Parque Moinhos", "Estação Jardim Botânico"],
      "A lotação da Bento Gonçalves: do Centro Corporativo à sede da Tramontina e aos prédios do Jardim Botânico.",
      """De baixo do deck da [[Estação Centro Corporativo]] pela [[Estação Independência]] até a Bento Gonçalves — [[Parque Moinhos]], na porta da [[Sede da Tramontina]] — e os prédios da [[Estação Jardim Botânico]]. É a van do técnico graduado e do gerente de fábrica; a [[Tramontina]] paga o plano Integrado de quem tem cargo e a Embratel registra cada validação.""", VIP_APAR, cor="#b0b0b0")
# Kombis clandestinas
KOMBI_OP = "cooperativas de bairro (motorista paga a própria propina)"
linha("Lotação", "Kombi", "KOMBI DO ITU", "KOMBI DO ITU", KOMBI_OP, "dinheiro na mão — Cz$ 80, o dobro depois das 23h", PKOMBI, 1, "sai quando enche; roda depois do toque",
      ["Ponto da Kombi do Itu", "Rua da Antiga Indústria", "Estação Nogueiras", "Estação Independência", "Estação Central"],
      "A Kombi de nove lugares (doze na prática) do Itu ao Centro: sai quando enche, para onde gritam, não aceita TRI.",
      """[[Volkswagen Kombi]] de nove lugares, doze na prática. Sai do [[Ponto da Kombi do Itu]] quando enche, desce a [[Rua da Antiga Indústria]], corta pela [[Estação Nogueiras]] e pela [[Estação Independência]] e deixa na [[Estação Central]] — para onde gritam. Não aceita TRI: Cz$ 80 na mão, o dobro depois das 23h. A Brigada apreende uma por semana e deixa os passageiros na rua.""", KOMBI_APAR, cor="#f4a261")
linha("Lotação", "Kombi", "KOMBI DA VOLUNTÁRIOS", "KOMBI DA VOLUNTÁRIOS", KOMBI_OP + "; a [[Ordem dos Subsolos]] cobra o ponto", "dinheiro na mão — Cz$ 80, o dobro depois das 23h", PKOMBI, 1, "a única linha da madrugada",
      ["Ponto da Kombi da Voluntários", "Farrapos", "Galeria do Rosário", "Estação Central", "Estação Independência", "Estação Nogueiras"],
      "A única linha da madrugada: do Quarto Distrito ao Centro e ao Passo D'Areia depois do toque, com a Ordem dos Subsolos cobrando o ponto.",
      """A única linha da madrugada. Sai do [[Ponto da Kombi da Voluntários]] com quem saiu da rave da [[Farrapos]], passa na [[Galeria do Rosário]], cruza a [[Estação Central]] às escuras, sobe a [[Estação Independência]] e deixa nos condomínios da [[Estação Nogueiras]]. Depois do toque é ela ou o barqueiro; a [[Ordem dos Subsolos]] cobra o ponto e a Brigada cobra o motorista.""", KOMBI_APAR, cor="#e76f51")
linha("Lotação", "Kombi", "KOMBI DA ZONA LESTE", "KOMBI DA ZONA LESTE", KOMBI_OP + "; a [[Camisa 12]] escolhe o motorista", "dinheiro ou dose", PKOMBI, 1, "sai quando enche",
      ["Sede da Camisa 12", "Venda da Zona Leste", "Estação Jardim Botânico", "Redenção", "Estação Central"],
      "As Kombis da Zona Leste ao Centro: sai da sede da Camisa 12, para na Redenção e cobra em dinheiro ou dose.",
      """As Kombis da Zona Leste. Saem da porta da [[Sede da Camisa 12]] e da [[Venda da Zona Leste]], cortam pela [[Estação Jardim Botânico]], param na [[Redenção]] e chegam à [[Estação Central]] quando o T2 já não roda. Dinheiro ou dose; em dia de jogo viram caravana miúda com bandeira na antena.""", KOMBI_APAR, cor="#e9c46a")
# Água
linha("Água", "Balsa", "BALSA ZAFFARI", "BALSA ZAFFARI", W("Zaffari"), "Cz$ 100 a pessoa em cima da carga, Cz$ 1.000 o volume — não é TRI", W("Balsa de Carga Zaffari"), 3, "6h e 18h em ponto",
      ["Estação Zaffari", "Delta Radioativo", "Usina do Gasômetro", "Estação Porto Novo"],
      "A balsa de carga da Zaffari: do cais do depósito, pelo rio e pelo Delta, até o Porto Novo.",
      """Balsa de 20 m com empurrador, 40 toneladas. Sai do cais embaixo da [[Estação Zaffari]] às seis e às dezoito em ponto, desce o rio rente ao [[Delta Radioativo]] (para no cais do Sindicato só de dia), contorna a ponta da [[Usina do Gasômetro]] e descarrega no cais da [[Estação Porto Novo]]. Não desce mais: a Restinga e a orla sul ficaram fora da rota desde que o enclave parou de pagar. Gente viaja em cima dos sacos de arroz: Cz$ 100 a pessoa, Cz$ 1.000 o volume, fiscal de prancheta e brigadiano contando caixa.""",
      "Balsa de chapa cinza cheia de contêiner com o esquilo da Zaffari, fiscal de prancheta, brigadiano contando caixa, gente sentada em cima dos sacos de arroz, guindaste do porto atrás.", cor="#2a9d8f")
# Informal
linha("Informal", "Caravana", "CARAVANA DA TORCIDA", "CARAVANA DA TORCIDA", W("Camisa 12"), "Cz$ 200, uma dose ou o hino inteiro — não é TRI", W("Caravana da Camisa 12"), 1, "três horas antes do jogo",
      ["Sede da Camisa 12", "Venda da Zona Leste", "Estação Jardim Botânico", "Estádio Beira-Rio"],
      "O 1113 de caçamba aberta da Camisa 12: da sede ao portão 5 do Beira-Rio com cem pessoas em pé e a Brigada olhando de longe.",
      """[[Mercedes-Benz 1113]] com carroceria de madeira e a bandeira do [[Sport Club Internacional]]. Sai da [[Sede da Camisa 12]] três horas antes do jogo, recolhe na [[Venda da Zona Leste]], cruza a [[Estação Jardim Botânico]] cantando e para no portão 5 do [[Estádio Beira-Rio]]. Cem pessoas em pé, isopor no meio, churrasquinho na caçamba. A Brigada olha de longe — e cobra na volta.""",
      "Caminhão vermelho de caçamba aberta cheio de gente com bandeira, isopor no meio, fumaça de churrasquinho, a Brigada olhando de longe.", cor="#d00000")

# ── posições no MAPA ESQUEMÁTICO (grade: x cresce pro leste, y pro norte) ──
# Cada parada ocupa um ponto; entre duas paradas consecutivas o app traça a
# parte diagonal e a parte reta (a ordem que não atravessa parada alheia).
# Rótulo: direita (padrão) | esquerda | inclinado; em fila horizontal o app inclina.
POSICOES = [
 ("Estação Central", 0, 0, "esquerda"), ("Praça da Alfândega", -1, 0, "esquerda"), ("Galeria Malcom", -2, 0, "esquerda"), ("Duque de Caxias", -3, -1, "esquerda"),
 ("Salgado Filho", -3, -2, "esquerda"), ("Viaduto da Borges", -1, -1, "direita"), ("Estação Centro Corporativo", 0, -1, "direita"),
 ("Usina do Gasômetro", -3, -4, "esquerda"), ("Delta Radioativo", -5, 3, "esquerda"), ("Trapiche da Aliança", 0, -4, "direita"), ("Lancheria da Cidade Baixa", 0, -3, "esquerda"),
 ("Estação Cidade Baixa", 1, -4, "direita"), ("Estação Férrea de Belas", 1, -5, "direita"), ("Estação Porto Novo", -1, -5, "esquerda"), ("Estação Praia de Belas", -2, -6, "esquerda"),
 ("Estação Estádios", 1, -7, "direita"), ("Estádio Beira-Rio", 2, -8, "direita"), ("Mercado de Frutos do Mar", 0, -8, "esquerda"), ("Estação Ipanema", -2, -10, "esquerda"),
 ("Estação Jardim Botânico", 6, -7, "esquerda"),
 ("Galeria do Rosário", 1, 1, "direita"), ("Ponto da Kombi da Voluntários", 0, 2, "esquerda"), ("Farrapos", 1, 2, "direita"), ("Teatro Quarto Distrito", 2, 3, "direita"), ("Velha Indústria", 3, 4, "direita"),
 ("Estação Independência", 3, 0, "direita"), ("Colégio Rosário", 3, 1, "direita"), ("Armazém Sarmento Leite", 2, -3, "direita"), ("Redenção", 3, -3, "direita"), ("Bar Ocidente", 2, -5, "esquerda"), ("Pensão Farroupilha", 3, -5, "direita"),
 ("Estação Moinhos", 6, 0, "direita"), ("Estação Concorde", 6, 1, "inclinado"), ("Padre Chagas", 7, 1, "direita"),
 ("Parque Moinhos", 8, -2, "direita"), ("Galeteria de Petrópolis", 6, -3, "direita"), ("Sede da Tramontina", 9, -2, "direita"),
 ("Sede da Camisa 12", 10, -7, "direita"), ("Venda da Zona Leste", 9, -7, "esquerda"), ("Oficina do Borracheiro", 10, -8, "direita"), ("Padaria da Vila", 9, -8, "esquerda"),
 ("Vila Militar do Paraguassu", 15, 5, "direita"), ("Rádio Farroupilha", 14, 4, "direita"),
 ("Estação Zaffari", 7, 7, "direita"), ("Estação Sarandi", 7, 6, "esquerda"), ("Rua da Sarandi", 8, 6, "direita"), ("Posto Ipiranga da Assis Brasil", 10, 5, "direita"),
 ("Estação Nogueiras", 9, 3, "esquerda"), ("Estação Passo D'Areia", 10, 3, "direita"), ("Boteco Embaixo da Via", 10, 4, "direita"), ("Shopping Iguatemi", 11, 2, "direita"),
 ("Concessionária Gurgel", 12, 3, "direita"), ("Motel Assis Brasil", 13, 3, "direita"),
 ("Rua da Antiga Indústria", 9, 1, "direita"), ("Fábrica Itú Química", 10, 1, "direita"), ("Ponto da Kombi do Itu", 10, 0, "direita"),
]

# ═══════════════════════ 5. NOTAS DE PASTA + CONTEXTO ═══════════════════════
def dv(pasta_rel, extra_where=""):
    return f'''```dataview
TABLE WITHOUT ID file.link AS "Linha", subcategoria AS "Modo", Acesso AS "Acesso", Qualidade AS "★", Horário AS "Horário", Paradas AS "Paradas"
FROM "{pasta_rel}"
WHERE categoria = "Linha"{extra_where}
SORT subcategoria ASC, file.name ASC
```'''
escrever(os.path.join(MALHA, "Malha de Transportes.md"), f"""# Malha de Transportes

Porto Alegre 1987 linha a linha: cada linha é uma nota (`categoria: Linha`) com **paradas em ordem**, **acesso** (o plano TRI mínimo, ou "na mão" quando o TRI não vale), **tarifa avulsa**, **qualidade** (★ precário · ★★ funciona, feio · ★★★ regular · ★★★★ bom, vigiado · ★★★★★ vitrine do regime), **horário** e **aparência** pra imagem. O contexto — quem manda, a geografia do alagado, quem chega onde por plano — está em [[Transporte e Mobilidade]]; os preços, em [[Custo de Vida]] e nas notas de [[Transporte]].

- [[Aeromóvel]] — o trilho elevado da Trensurb (Linhas 1 e 2, Executiva, ramal morto)
- [[Ônibus]] — radiais, transversais (T), circulares de bairro (B) e anfíbios (A) da Marcopolo
- [[Lotação]] — as vans VIP com rádio Embratel e as Kombis clandestinas
- [[Água]] — a balsa de carga da Zaffari (o barqueiro e a lancha da Gradiente não são coletivo: estão em [[Transporte]] como corrida)
- [[Informal]] — a caravana da torcida (o que mais roda sem letreiro está nas notas de [[Transporte]])

{dv("Contexto/Malha de Transportes")}
""")
for pasta, titulo, texto in [
    ("Aeromóvel", "Aeromóvel", "Viaduto de concreto de 1983 com vagões leves empurrados por ar comprimido (projeto Coester, demonstração de 1978 no [[Passo D'Areia]]; [[Inauguração da Malha de Transporte Aeromóvel]]). Compressores da [[Companhia Estadual de Energia Elétrica|CEEE]] em subestações ao longo da via — prioridade absoluta: corta a periferia antes de cortar o trilho. Duas linhas populares, uma executiva e um ramal morto; cada estação é um [[Porto Alegre|Ponto de Interesse]] no mapa da cidade."),
    ("Ônibus", "Ônibus", "Carroceria Marcopolo Torino de 1983 sobre chassi Mercedes OF-1313, sem peça de reposição há dois anos (a [[Marcopolo]] prioriza os 50 anfíbios contratados pra malha). Cobrador com validador TRI na roleta; quem paga em dinheiro paga pro cobrador e viaja em pé na porta. **Como as linhas se chamam:** radiais levam o nome do bairro de ponta (SARANDI, PETRÓPOLIS, NAVEGANTES, ITU) ou o número da zona (3xx = zona sul pelo Guaíba: 343, 353); **D** na frente é a direta (D43); **T** são as transversais que cruzam a cidade sem passar pelo Centro; **B** é o circular de bairro; **A** é o anfíbio; UFRGS–BARRA é a única linha com dois nomes. O ponto de ônibus é uma placa torta com o nome da linha pintado à mão e um banco de concreto."),
    ("Lotação", "Lotação", "Duas lotações que não se cruzam: a **VIP** das concessionárias — van Marcopolo de doze poltronas, ar-condicionado e rádio [[Embratel]] que abre a sinaleira, [[TRI Ouro]] pra cima — e a **Kombi clandestina** das cooperativas de bairro, que sai quando enche, para onde gritam e não aceita TRI ([[Lotação Clandestina]]: Cz$ 80 na mão, o dobro depois das 23h). Depois do toque de recolher, só a Kombi roda."),
    ("Água", "Água", "O [[Lago Guaíba]] é estrada, fronteira e despensa. Coletivo mesmo, só a balsa de carga da [[Zaffari]] (fiscalizada, pontual, sem banco). O bote de alumínio da [[Aliança Livre das Palafitas]] ([[Lancha do Barqueiro]]: chega em qualquer lugar, cobra em cruzado, dólar ou dose) e a lancha da [[Gradiente]] (convite) são corrida, não linha. A patrulha fluvial da [[Brigada Militar Metropolitana]] — lanchas verde-oliva com holofote, duas por turno desde os ataques ao [[Porto Novo]] — não é transporte, mas está na água: para barqueiro, revista bote, cobra."),
    ("Informal", "Informal", "O que roda sem letreiro: a caravana da [[Camisa 12]] em dia de jogo — a única com rota fixa. O resto não é linha: a carona no caminhão de coleta do [[Sindicato dos Catadores]] ([[Carona no Caminhão do Sindicato]], Zona Deserta e Restinga, fora da malha), as [[Carroça com Cavalo|carroças]] do [[Curral do Sindicato]] por onde caminhão não passa, o [[Táxi Gurgel]] dos pontos de táxi (Cz$ 300 + Cz$ 100/km, noite ×1,5, Gre-Nal ×3, [[TRI Platina]] conveniado) e a bicicleta de quem não tem plano — a ladeira da Independência é o inimigo."),
]:
    escrever(os.path.join(MALHA, pasta, f"{titulo}.md"), f"# {titulo}\n\n{texto}\n\n" + dv(f"Contexto/Malha de Transportes/{pasta}") + "\n")

# Transporte e Mobilidade: seção da malha (idempotente por marcadores)
TM = os.path.join(CTX_ATUAL, "Infraestrutura Urbana", "Transporte e Mobilidade.md")
INI, FIM = "<!-- malha:inicio -->", "<!-- malha:fim -->"
secao = f"""{INI}
#### Como o sistema funciona
- **Quem manda:** o cartão **TRI** (Transporte Integrado) é da Trensurb, administrado por terminais automatizados e monitorado pela [[Embratel]] — cada validação vira registro. A [[Companhia Estadual de Energia Elétrica|CEEE]] alimenta o [[Aeromóvel]] (prioridade absoluta: corta a periferia antes de cortar o trilho). A [[Marcopolo]] fabrica ônibus e anfíbios e opera as linhas populares por contrato com a [[Prefeitura de Porto Alegre]]; concessionárias privadas com rádio Embratel operam as lotações VIP; a [[Zaffari]] tem ferrovia e balsa próprias; a [[Aliança Livre das Palafitas]] domina a água miúda; a [[Brigada Militar Metropolitana]] vigia o que é vitrine (Aeromóvel, lotação) e ignora o que é pobre (ônibus, Kombi).
- **A geografia manda mais:** desde a [[Grande Enchente de 1986]] o [[Centro Histórico]] e a [[Cidade Baixa]] estão alagados — o "novo piso" flutuante liga o Centro por passarelas com pedágio da [[Aliança dos Fundadores]] a partir da [[Praça da Alfândega]]; o anfíbio e o barqueiro fazem o que o ônibus não faz. O [[Lago Guaíba]] é estrada, fronteira e despensa.
- **Horários:** ônibus 5h–23h; Aeromóvel popular 5h–23h (executivo 6h–1h); toque de recolher às 23h fora dos bairros nobres — depois disso só a Kombi clandestina (×2) e o barqueiro.
- **Qualidade (★ a ★★★★★):** precário (quebra, lota, assalta) · funciona, feio · regular · bom, vigiado · vitrine do regime.

#### A malha, linha a linha
Cada linha é uma nota em [[Malha de Transportes]] (paradas em ordem, acesso, tarifa, qualidade, horário, aparência): [[Aeromóvel]] · [[Ônibus]] · [[Lotação]] · [[Água]] · [[Informal]]. As estações do Aeromóvel e as paradas são Pontos de Interesse no mapa de [[Porto Alegre]].
{dv("Contexto/Malha de Transportes")}

#### Quem chega onde (por plano do mês)
Ao sul da Praia de Belas **não há malha**: a Restinga, a Zona Deserta e a orla se alcançam a pé, de carona no caminhão do Sindicato ([[Carona no Caminhão do Sindicato]]) ou de barco pago na mão — só a [[LINHA EXECUTIVA]] desce até [[Estação Ipanema|Ipanema]].
| De \\ Para | Centro | Moinhos / Ipanema | Nova Sarandi / Passo | Zona Leste / Costa e Silva | Cidade Baixa / Porto |
|---|---|---|---|---|---|
| [[A Pé]] | a pé pela passarela (pedágio) | não chega (a guarita barra) | [[KOMBI DO ITU\\|Kombi do Itu]] / [[KOMBI DA VOLUNTÁRIOS\\|da Voluntários]] na mão | [[KOMBI DA ZONA LESTE\\|Kombi da Zona Leste]] | [[Lancha do Barqueiro\\|barqueiro]] (dose) |
| [[TRI Bronze]] | [[SARANDI — CENTRO\\|SARANDI]] / [[ITU — CENTRO\\|ITU]] / [[ASSIS BRASIL — CENTRO\\|ASSIS BRASIL]] no turno | não | SARANDI, [[T3 VILA MILITAR — SARANDI\\|T3]] no turno | [[T2 ZONA LESTE — BEIRA-RIO\\|T2]] / T3 / [[B23 ZONA LESTE\\|B23]] no turno | não |
| [[TRI Prata]] | ônibus + [[L1 POPULAR NORTE\\|L1]] / [[L2 POPULAR SUL\\|L2]] + [[A1 CENTRO ALAGADO\\|A1]] | [[T4 SARANDI — MOINHOS\\|T4]] / [[T6 CIRCULAR NOBRE\\|T6]] (com cara feia); Ipanema não | L1, ASSIS BRASIL, [[T1 SARANDI — PORTO NOVO\\|T1]] | T2 / T3 | [[A2 CIDADE BAIXA — CENTRO\\|A2]], [[343 BEIRA-RIO\\|343]], [[UFRGS — BARRA\\|UFRGS]], L2 |
| [[TRI Ouro]] | + [[VIP NORTE]] / [[VIP PORTO]] / [[VIP LESTE]] | VIP Norte; Ipanema não | VIP Norte | VIP Leste, T2 / T3 | VIP Porto |
| [[TRI Platina]] | [[LINHA EXECUTIVA]] + [[Táxi Gurgel\\|táxi]] | Linha Executiva até Ipanema | táxi | táxi (o motorista reclama) | Linha Executiva (Praia de Belas) |
| [[Carro com Motorista]] | motorista (e o TRI Platina no bolso) | motorista ou a lancha da Gradiente | motorista com escolta | motorista com escolta | motorista |
{FIM}"""
s = open(TM, encoding="utf-8").read()
if INI in s:
    s = re.sub(re.escape(INI) + r".*?" + re.escape(FIM), lambda _: secao, s, flags=re.S)
else:
    s = s.rstrip("\n") + "\n\n" + secao + "\n"
open(TM, "w", encoding="utf-8").write(s)

# Custo de Vida e planos TRI apontam pra malha
CV = os.path.join(CTX_ATUAL, "Economia e Sobrevivência", "Custo de Vida.md")
s = open(CV, encoding="utf-8").read()
alvo = "o contexto em [[Transporte e Mobilidade]]."
if alvo in s and "[[Malha de Transportes]]" not in s:
    s = s.replace(alvo, "o contexto em [[Transporte e Mobilidade]]; as linhas, parada a parada, em [[Malha de Transportes]].")
    open(CV, "w", encoding="utf-8").write(s)
for plano, frase in [
    ("A Pé", "Sem TRI, o coletivo que roda é o que não aceita TRI: as Kombis ([[Lotação]]) e a [[BALSA ZAFFARI]]; barqueiro e caminhão do Sindicato são corrida ([[Lancha do Barqueiro]], [[Carona no Caminhão do Sindicato]]) — a malha em [[Malha de Transportes]]."),
    ("TRI Bronze", "As linhas onde o bronze funciona no turno — [[SARANDI — CENTRO]], [[ASSIS BRASIL — CENTRO]], [[ITU — CENTRO]], [[T2 ZONA LESTE — BEIRA-RIO]], [[T3 VILA MILITAR — SARANDI]], [[B23 ZONA LESTE]] — estão em [[Malha de Transportes]]."),
    ("TRI Prata", "Todas as linhas de [[Ônibus]] (inclusive anfíbios) e o [[Aeromóvel]] popular ([[L1 POPULAR NORTE]], [[L2 POPULAR SUL]]): [[Malha de Transportes]]."),
    ("TRI Ouro", "Além de tudo do Prata, as lotações [[VIP NORTE]], [[VIP PORTO]] e [[VIP LESTE]]: [[Malha de Transportes]]."),
    ("TRI Platina", "Abre a [[LINHA EXECUTIVA]] do Aeromóvel (e o táxi conveniado, que não é linha); o resto da malha em [[Malha de Transportes]]."),
    ("Carro com Motorista", "Quem tem motorista não pega linha — mas o [[TRI Platina]] vem no bolso: [[LINHA EXECUTIVA]] e o resto em [[Malha de Transportes]]."),
]:
    p = os.path.join(REC, "Transporte", f"{plano}.md"); s = open(p, encoding="utf-8").read()
    if "[[Malha de Transportes]]" in s:
        s = re.sub(r"\n[^\n]*\[\[Malha de Transportes\]\][^\n]*\n", "\n" + frase + "\n", s, count=1)
    else:
        s = re.sub(r"\n> \[!info\] Especificação", "\n" + frase + "\n\n> [!info] Especificação", s, count=1)
    open(p, "w", encoding="utf-8").write(s)

# ═══════════════════════ 6. MARCADORES NO MAPA DA CIDADE ═══════════════════════
# (tipo, lat, long, nome) — lat cresce pro NORTE, long pro LESTE (bounds [[0,0],[1170,850]]).
MARKERS = [
 ("Bairro", 805, 545, "Zona Leste"),
 # Centro Histórico / Cidade Baixa
 ("Parque", 866, 246, "Praça da Alfândega"), ("Mercado", 862, 252, "Galeria Malcom"), ("Mercado", 868, 264, "Galeria do Rosário"),
 ("Ponto de Interesse", 852, 258, "Duque de Caxias"), ("Ponto de Interesse", 848, 268, "Salgado Filho"), ("Ponto de Interesse", 858, 262, "Viaduto da Borges"),
 ("Porto", 838, 248, "Trapiche da Aliança"), ("Bar", 842, 258, "Lancheria da Cidade Baixa"),
 ("Estação", 874, 252, "Estação Central"), ("Estação", 864, 242, "Estação Centro Corporativo"), ("Estação", 840, 254, "Estação Cidade Baixa"),
 # Bom Fim
 ("Ponto de Interesse", 868, 282, "Independência"), ("Ponto de Interesse", 872, 276, "Colégio Rosário"), ("Mercado", 854, 286, "Armazém Sarmento Leite"),
 ("Bar", 850, 302, "Bar Ocidente"), ("Hotel", 858, 308, "Pensão Farroupilha"), ("Estação", 866, 286, "Estação Independência"),
 # Moinhos
 ("Ponto de Interesse", 890, 338, "Edifício Concorde"), ("Estação", 866, 342, "Estação Moinhos"), ("Estação", 892, 332, "Estação Concorde"),
 # Quarto Distrito
 ("Bar", 920, 300, "Farrapos"), ("Bar", 930, 306, "Teatro Quarto Distrito"), ("Ponto de Interesse", 914, 296, "Ponto da Kombi da Voluntários"),
 # Nova Sarandi
 ("Ponto de Interesse", 994, 412, "Rua da Sarandi"), ("Industrial", 986, 394, "Ferroviária Nacional"), ("Mercado", 1012, 386, "Depósito Zaffari"),
 ("Estação", 984, 400, "Estação Sarandi"), ("Estação", 1008, 392, "Estação Zaffari"),
 # Passo D'Areia
 ("Mercado", 934, 458, "Shopping Iguatemi"), ("Estação", 940, 450, "Estação Passo D'Areia"), ("Parque", 928, 438, "Praça das Nogueiras"), ("Estação", 926, 442, "Estação Nogueiras"),
 ("Hotel", 952, 472, "Motel Assis Brasil"), ("Industrial", 946, 464, "Concessionária Gurgel"), ("Industrial", 944, 454, "Posto Ipiranga da Assis Brasil"), ("Bar", 938, 446, "Boteco Embaixo da Via"),
 # Jardim Itu
 ("Industrial", 902, 432, "Fábrica Itú Química"), ("Industrial", 906, 418, "Rua da Antiga Indústria"), ("Ponto de Interesse", 896, 414, "Ponto da Kombi do Itu"),
 # Petrópolis
 ("Industrial", 866, 480, "Sede da Tramontina"), ("Parque", 870, 462, "Parque Moinhos"), ("Bar", 860, 454, "Galeteria de Petrópolis"),
 # Jardim Botânico
 ("Estação", 818, 398, "Estação Jardim Botânico"),
 # Praia de Belas
 ("Ponto de Interesse", 802, 246, "Estádio Beira-Rio"), ("Estação", 796, 254, "Estação Estádios"), ("Ponto de Interesse", 808, 252, "Estação Férrea de Belas"),
 ("Estação", 799, 238, "Estação Porto Novo"), ("Estação", 792, 240, "Estação Praia de Belas"), ("Industrial", 848, 234, "Usina do Gasômetro"),
 ("Mercado", 770, 240, "Mercado de Frutos do Mar"), ("Porto", 778, 236, "Estaleiro do Cais"),
 # Ipanema
 ("Porto", 640, 238, "Embarcadouro do Guaíba"), ("Estação", 644, 252, "Estação Ipanema"),
 # Restinga / Zona Deserta
 ("Industrial", 582, 442, "Oficina de Sucata"), ("Mercado", 572, 428, "Mercado Flutuante"),
 ("Ponto de Interesse", 412, 518, "Ponto do Caminhão do Sindicato"),
 # Costa e Silva
 ("Ponto de Interesse", 955, 553, "Quartel-General do Exército"), ("Estação", 950, 556, "Estação Quartel"), ("Ponto de Interesse", 962, 540, "Vila Militar do Paraguassu"), ("Ponto de Interesse", 946, 534, "Rádio Farroupilha"),
 # Zona Leste
 ("Ponto de Interesse", 812, 548, "Sede da Camisa 12"), ("Mercado", 806, 538, "Venda da Zona Leste"), ("Industrial", 798, 552, "Oficina do Borracheiro"), ("Mercado", 802, 556, "Padaria da Vila"),
]
POA = os.path.join(ATLAS, "Porto Alegre.md")
s = open(POA, encoding="utf-8").read()
m = re.search(r"```leaflet\n(.*?)```", s, re.S)
bloco = m.group(1)
existentes = set(re.findall(r"^marker: [^,]*,[^,]*,[^,]*,([^,]*),", bloco, re.M))
novos = [f"marker: {t},{lat},{lng},{n},,-0.1," if t != "Bairro" else f"marker: Bairro,{lat},{lng},{n},,,-0.1" for t, lat, lng, n in MARKERS if n not in existentes]
if novos:
    bloco2 = bloco.rstrip("\n") + "\n" + "\n".join(novos) + "\n"
    s = s.replace(m.group(0), "```leaflet\n" + bloco2 + "```", 1)
    open(POA, "w", encoding="utf-8").write(s)
print("marcadores novos:", len(novos))

# ícone "Estação" no plugin leaflet (o app tem o registro próprio em leaflet-local.ts)
LEAF = os.path.join(ROOT, ".obsidian", "plugins", "obsidian-leaflet-plugin", "data.json")
d = json.load(open(LEAF, encoding="utf-8"))
if not any(i.get("type") == "Estação" for i in d["markerIcons"]):
    d["markerIcons"].append({"type": "Estação", "iconName": "train", "color": "#dddddd", "alpha": 1, "layer": False, "transform": {"size": 6, "x": 0, "y": -2}, "isImage": False, "tags": [], "minZoom": None, "maxZoom": None})
    json.dump(d, open(LEAF, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


# ═══════════════════════ 6b. REMOÇÕES (revisão do mestre) ═══════════════════════
for rel in ["Água/LANCHA EXECUTIVA", "Água/ROTA DO BARQUEIRO", "Ônibus/D43 IPANEMA DIRETA", "Ônibus/353 RESTINGA", "Ônibus/SERRARIA — CENTRO", "Ônibus/PONTA GROSSA — RESTINGA", "Ônibus/343 IPANEMA", "Ônibus/T1 SARANDI — IPANEMA", "Lotação/VIP SUL", "Informal/CAMINHÃO DO SINDICATO"]:
    p = os.path.join(MALHA, rel + ".md")
    if os.path.exists(p): os.remove(p); print("removida:", rel)
for rel in ["Restinga/Serraria", "Zona Deserta/Ponta Grossa"]:
    p = os.path.join(ATLAS, rel + ".md")
    if os.path.exists(p): os.remove(p); print("removido PoI:", rel)
s_poa = open(POA, encoding="utf-8").read()
s2 = re.sub(r"^marker: [^,]*,[^,]*,[^,]*,(Serraria|Ponta Grossa),[^\n]*\n", "", s_poa, flags=re.M)
if s2 != s_poa: open(POA, "w", encoding="utf-8").write(s2)

# bloco ```malha``` na nota-mãe: posições esquemáticas (fonte única do mapa do app)
HUB = os.path.join(MALHA, "Malha de Transportes.md")
h = open(HUB, encoding="utf-8").read()
bloco = "```malha\n" + "".join(f"parada: {n}, {x}, {y}, {r}\n" for n, x, y, r in POSICOES) + "```"
INI2, FIM2 = "<!-- malha-mapa:inicio -->", "<!-- malha-mapa:fim -->"
secao2 = f"""{INI2}
## Mapa esquemático
O app desenha a malha como mapa de metrô a partir das **posições** abaixo (grade: x cresce pro leste, y pro norte; entre duas paradas consecutivas o traço faz a parte diagonal e a parte reta). Parada compartilhada por duas linhas = **baldeação**. Ao sul da Praia de Belas não há malha: só a [[LINHA EXECUTIVA]] desce até [[Estação Ipanema|Ipanema]]. Táxi, carro, barqueiro e a lancha da Gradiente não entram — isto é o transporte coletivo.
{bloco}
{FIM2}"""
if INI2 in h: h = re.sub(re.escape(INI2) + r".*?" + re.escape(FIM2), lambda _: secao2, h, flags=re.S)
else: h = h.rstrip("\n") + "\n\n" + secao2 + "\n"
open(HUB, "w", encoding="utf-8").write(h)

# Contexto POA: bloco `transporte` (categoria, nota do mapa, traço por modo)
CTX = os.path.join(ROOT, "Recursos e Mídia", "Configurações de Contextos", "Contexto POA 1987.md")
c = open(CTX, encoding="utf-8").read()
if "\n  transporte:\n" not in c:
    bloco_cfg = """    preco_em: moeda
  # MALHA DE TRANSPORTES (2026-09-08): notas `categoria: Linha` (subcategoria =
  # modo) com Paradas em ordem (wikilinks pra Localizações), Acesso (plano TRI
  # mínimo = nota Estilo de Vida, ou texto = paga na mão), Cor, Qualidade e
  # Fechada. O mapa esquemático (aba TRANSPORTE) lê as posições das paradas do
  # bloco ```malha``` da nota `mapa`; cada modo diz como se desenha.
  transporte:
    categoria: "Linha"
    mapa: "[[Malha de Transportes]]"
    modos:
      - { nome: "Aeromóvel", traco: cheio, largura: 7 }
      - { nome: "Ônibus", traco: cheio, largura: 4 }
      - { nome: "Ônibus Anfíbio", traco: tracejado, largura: 4 }
      - { nome: "Lotação", traco: cheio, largura: 3 }
      - { nome: "Kombi", traco: pontilhado, largura: 3 }
      - { nome: "Balsa", traco: tracejado, largura: 4 }
      - { nome: "Lancha", traco: tracejado, largura: 3 }
      - { nome: "Barqueiro", traco: pontilhado, largura: 3 }
      - { nome: "Caravana", traco: pontilhado, largura: 3 }
"""
    assert "    preco_em: moeda\n" in c
    c = c.replace("    preco_em: moeda\n", bloco_cfg, 1)
    open(CTX, "w", encoding="utf-8").write(c)

# ═══════════════════════ 7. CHECAGENS ═══════════════════════
names = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(ROOT, "**", "*.md"), recursive=True) if "/.obsidian/" not in p}
bad = {}
for p in escritos + [TM, CV]:
    for mm in re.finditer(r"\[\[([^\]|#\\]+)", open(p, encoding="utf-8").read()):
        t = mm.group(1)
        if t not in names and not t.endswith(".png"): bad.setdefault(t, set()).add(os.path.basename(p))
print("links sem nota:", {k: sorted(v)[:3] for k, v in bad.items()} or "nenhum")

# toda parada: nota de Localização com marcador no mapa da cidade
s = open(POA, encoding="utf-8").read()
marcados = set(re.findall(r"^marker: [^,]*,[^,]*,[^,]*,([^,]*),", re.search(r"```leaflet\n(.*?)```", s, re.S).group(1), re.M))
locs = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(ATLAS, "**", "*.md"), recursive=True)}
sem_marker, nao_local, n_linhas = set(), set(), 0
for p in glob.glob(os.path.join(MALHA, "**", "*.md"), recursive=True):
    t = open(p, encoding="utf-8").read()
    if not t.startswith("---\n") or "\ncategoria: Linha\n" not in t: continue
    n_linhas += 1
    for par in re.findall(r'^  - "\[\[([^\]|]+)', t, re.M):
        if par not in locs: nao_local.add(par)
        elif par not in marcados: sem_marker.add(par)
pos = {n for n, *_ in POSICOES}
usadas = set()
for p in glob.glob(os.path.join(MALHA, "**", "*.md"), recursive=True):
    t = open(p, encoding="utf-8").read()
    if not t.startswith("---\n") or "\ncategoria: Linha\n" not in t or "\nFechada: true\n" in t: continue
    usadas |= set(re.findall(r'^  - "\[\[([^\]|]+)', t, re.M))
print("paradas sem posição no mapa:", sorted(usadas - pos) or "nenhuma", "; posições sem linha:", sorted(pos - usadas) or "nenhuma")
print(n_linhas, "linhas; paradas fora do Atlas:", sorted(nao_local) or "nenhuma", "; paradas sem marcador:", sorted(sem_marker) or "nenhuma")

# cobertura por bairro: pernoite (Recurso noite ofertado) e saúde (PoI da lista)
noites = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(REC, "Moradia", "*.md")) if 'Cobrança: "noite"' in open(p, encoding="utf-8").read()}
saude_por = {}
for pasta, nome, *_ in SAUDE: saude_por.setdefault(pasta.split("/")[-1], []).append(nome)
saude_por.setdefault("Passo D'Areia", []).append("Clínica Ortopédica D'Areia")
bairros = {}
for p in glob.glob(os.path.join(ATLAS, "**", "*.md"), recursive=True):
    rel = os.path.relpath(p, ATLAS).split("/")
    if len(rel) < 2: continue
    bairro = "Cidade Baixa" if rel[:2] == ["Centro Histórico", "Cidade Baixa"] else rel[0]
    if bairro == "Delta Radioativo": continue  # pântano tóxico sem morador: não é bairro de gente
    b = bairros.setdefault(bairro, {"pernoite": False, "saude": False})
    t = open(p, encoding="utf-8").read()
    mm = re.search(r"\nServiços:[^\n]*\n((?:  - [^\n]*\n)*)", t)
    if mm and any(x in noites for x in re.findall(r'\[\[([^\]|]+)', mm.group(1))): b["pernoite"] = True
    if os.path.splitext(rel[-1])[0] in saude_por.get(bairro, []): b["saude"] = True
for b, c in sorted(bairros.items()):
    falta = [k for k, v in c.items() if not v]
    print(f"{b:18s} {'ok' if not falta else 'FALTA ' + ', '.join(falta)}")
print(len(escritos), "notas escritas")
