# -*- coding: utf-8 -*-
"""Recursos do mundo POA 1987 — rodada v4 (2026-09-08), IN-PLACE sobre a vault.

- Veículos de posse bem mais definidos (carros, motos, bicicletas, barcos,
  carroça) — notas `Contexto/Recursos/Transporte/<Nome>.md` com Marca, Preço
  novo, Usado, Manutenção mensal (manutenção, combustível, seguro, IPVA),
  Nível (classe), Onde e Especificação.
- Todo bairro tem pelo menos UM estabelecimento de cada tipo de serviço
  (veículos · moradia · padaria/lancheria · boteco · armazém · táxi/barqueiro),
  cada um uma nota de Ponto de Interesse com `Dono:` e descrição breve;
  o comércio de rua genérico (mapa no FM do bairro) vira estabelecimento.
- Estabelecimentos existentes ganham `Dono:` e as novas ofertas.

Guardado no repo do app (scripts/) porque a rodada anterior perdeu os geradores
do scratchpad. Idempotente: regrava as notas que gera; não toca no resto.
Uso:  python3 scripts/poa-recursos-v4.py
"""
import os, re, glob, json

ROOT = "/data/vaults/POA 1987"
BASE = os.path.join(ROOT, "Contexto", "Recursos")
ATLAS = os.path.join(ROOT, "Atlas", "Porto Alegre")
T, M, A = "Transporte", "Moradia", "Alimentação"
W = lambda s: f"[[{s}]]"
L = lambda n, est=None: f"[[{n}]]" + (f" {est}" if est else "")

def y(v):
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, int): return str(v)
    if isinstance(v, list): return "\n" + "\n".join(f'  - {json.dumps(x, ensure_ascii=False)}' for x in v)
    return json.dumps(v, ensure_ascii=False)

escritos = []
def nota(aba, nome, tipo, marca, preco, cobranca, onde, resumo, desc, espec, **extra):
    fm = ["aliases: ", "categoria: Recurso", f"subcategoria: {aba}", f"Tipo: {y(tipo)}", f"Marca: {y(marca)}", f"Preço: {preco}", f"Cobrança: {y(cobranca)}"]
    for k in ("Usado", "Compra", "Manutenção", "Nível", "Por_km", "Longa", "Volume"):
        if k in extra and extra[k] is not None: fm.append(f"{k}: {extra[k]}")
    fm += [f"Onde: {y(onde)}", f"Resumo: {y(resumo)}", "Completo: true"]
    header = ["#Recurso", "> [!info] `= this.Tipo`: `= this.file.name`", "> 🏷️**Marca:** `= this.Marca`", "> 💰**Preço:** Cz$ `= this.Preço` · `= this.Cobrança`"]
    if "Usado" in extra: header.append("> 🔧**Usado:** Cz$ `= this.Usado`")
    if "Compra" in extra: header.append("> 🏠**Compra:** Cz$ `= this.Compra`")
    if "Manutenção" in extra: header.append("> 🛠️**Manutenção:** Cz$ `= this.Manutenção` por mês (manutenção, combustível, seguro, IPVA / condomínio, IPTU)")
    if "Nível" in extra: header.append("> 📶**Nível:** `= this.Nível`")
    header += ["> 📍**Onde:** `= this.Onde`", "> 📝**Resumo:** `= this.Resumo`"]
    desc = re.sub(r"\[\[([^\]]*?)\n\s*([^\]]*?)\]\]", lambda m: "[[" + m.group(1) + " " + m.group(2) + "]]", desc)
    body = "\n".join(header) + "\n\n" + desc.strip() + "\n\n> [!info] Especificação\n" + "\n".join(f"> **{k}:** {v}" for k, v in espec) + "\n"
    path = os.path.join(BASE, aba, f"{nome}.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write("---\n" + "\n".join(fm) + "\n---\n" + body)
    escritos.append(path)

def veic(nome, marca, novo, usado, manut, nivel, onde, resumo, desc, espec):
    extra = {"Manutenção": manut, "Nível": nivel}
    if usado is not None: extra["Usado"] = usado
    nota(T, nome, "Veículo", marca, novo, "única", onde, resumo, desc, espec, **extra)

# ───────────────────────────── VEÍCULOS DE POSSE ─────────────────────────────
# Carros da Gurgel (a megacorp local) — os três já existentes ficam; entram XEF, BR-800 e Tocantins
veic("Gurgel XEF", W("Gurgel"), 180000, 60000, 1500, 4, [W("Passo D'Areia"), W("Camelódromo")],
     "Microcarro de três lugares lado a lado, fibra, motor a ar: o carro de cidade da classe média que não cabe num Carajás.",
     """O XEF é o menor carro que a [[Gurgel]] fabrica: três pessoas sentadas lado a lado num banco só, carroceria de fibra
que não enferruja e motor VW a ar que ronca na subida da Independência. Estaciona onde a bicicleta estaciona e
gasta o que uma moto gasta. Usado, é o primeiro carro de todo técnico da [[Gradiente]].""",
     [("Modelo", "Gurgel XEF 1984, 3 lugares lado a lado, 2 portas, fibra Plasteel"), ("Motor", "VW 1.6 a ar, 50 cv; 11 km/l"), ("Velocidade", "110 km/h no plano"),
      ("Novo", "[[Concessionária Gurgel]] com nota"), ("Usado", "[[Camelódromo]] e garagens de bairro, sem documento"), ("Manutenção", "Cz$ 1.500 por mês: pouca gasolina, oficina de bairro, IPVA baixo")])
veic("Gurgel BR-800", W("Gurgel"), 250000, None, 2000, 4, [W("Passo D'Areia")],
     "O carro popular que a Gurgel promete pra 1988: pré-série de dois lugares e meio, comprado por cota no consórcio da fábrica.",
     """O BR-800 é o 'carro do povo' que a [[Gurgel]] anuncia em outdoor no [[Passo D'Areia]] há dois anos: motor próprio de
dois cilindros, carroceria de fibra, lugar pra dois adultos e uma criança. Só se compra por cota no consórcio da
fábrica — quem tem carteira PIRA na Gurgel entra na fila primeiro. Não existe usado: quem tem, não vende.""",
     [("Modelo", "Gurgel BR-800 pré-série 1987, 2+1 lugares, fibra"), ("Motor", "Gurgel Enertron 0.8 bicilíndrico, 33 cv; 14 km/l"), ("Velocidade", "105 km/h"),
      ("Como comprar", "cota no consórcio da [[Concessionária Gurgel]]; entrega em 6 a 12 meses"), ("Manutenção", "Cz$ 2.000 por mês — peça só na concessionária")])
veic("Gurgel Tocantins", W("Gurgel"), 1500000, 500000, 10000, 6, [W("Passo D'Areia"), W("Moinhos de Vento"), W("Ipanema")],
     "Utilitário 4×4 blindado da Gurgel, o carro da Brigada e da diretoria: passa por cima de alagado, barricada e gente.",
     """O Tocantins é o jipe grande da [[Gurgel]] com a blindagem que a [[Brigada Militar Metropolitana]] encomendou:
vidro laminado, chapa nas portas, pneu que roda furado. A diretoria das megacorps comprou o mesmo pacote, com
couro. Usado, só o que a Brigada leiloa depois de um tiroteio — com os furos.""",
     [("Modelo", "Gurgel Tocantins 1987, 4×4, blindagem nível Brigada, 5 lugares"), ("Motor", "Chevrolet 4.1 a gasolina, 140 cv; 5 km/l"), ("Velocidade", "150 km/h; anda com 40 cm de água"),
      ("Novo", "[[Concessionária Gurgel]] sob encomenda; [[Revenda Ipanema Motors]] com couro"), ("Usado", "leilão da Brigada, com os furos"), ("Manutenção", "Cz$ 10.000 por mês: gasolina sem cota, seguro da [[Gradiente]], pneu de blindado")])
# Carros de fora do estado (segunda mão ou revenda de bairro nobre)
veic("Volkswagen Fusca", "Volkswagen", 90000, None, 1500, 3, [W("Centro Histórico"), W("Zona Leste"), W("Costa e Silva")],
     "O Fusca 1300 que sobrou de antes da Gurgel: só usado, pega sempre, todo mecânico de esquina conhece o motor.",
     """A Volkswagen parou de fazer o Fusca em 1986 e a cidade continua andando nele: motor a ar de 1300 que pega em qualquer
inverno, peça em toda oficina, lataria que a umidade come devagar. É o carro do servente que juntou um ano de
salário, do padre e do brigadiano que não quer chamar atenção.""",
     [("Modelo", "Fusca 1300/1500 (1970–1986), 4 lugares, 2 portas"), ("Motor", "VW 1.3/1.5 a ar, 46 cv; 10 km/l"), ("Velocidade", "120 km/h descendo"),
      ("Só usado", "garagens de bairro e [[Camelódromo]]; Cz$ 90.000 com lataria boa, Cz$ 60.000 com bolha"), ("Manutenção", "Cz$ 1.500 por mês: peça barata, gasolina de cota, IPVA quase nada")])
veic("Volkswagen Brasília", "Volkswagen", 70000, None, 1500, 3, [W("Zona Leste"), W("Jardim Botânico"), W("Nova Sarandi")],
     "A Brasília amarela de família: mecânica de Fusca com porta-malas, só usada, cheira a plástico quente.",
     """A Brasília é o Fusca com espaço: mesma mecânica a ar, quatro portas em algumas, porta-malas pra feira e pra
mudança. Saiu de linha em 1982 e está em toda garagem da [[Zona Leste]]. O banco de trás vira cama em dia de
Gre-Nal.""",
     [("Modelo", "Brasília (1973–1982), 5 lugares, 2 ou 4 portas"), ("Motor", "VW 1.6 a ar, 56 cv; 9 km/l"), ("Velocidade", "125 km/h"),
      ("Só usado", "garagens de bairro; Cz$ 70.000 inteira"), ("Manutenção", "Cz$ 1.500 por mês")])
veic("Volkswagen Kombi", "Volkswagen", 350000, 120000, 3000, 4, [W("Nova Sarandi"), W("Praia de Belas"), W("Petrópolis")],
     "A van de frete, de lotação clandestina e de mudança de palafita: nove lugares ou uma tonelada, motor a ar atrás.",
     """A Kombi carrega o que a cidade precisa mover: nove passageiros numa lotação clandestina da [[Zona Leste]], o
estoque de um armazém, a mudança inteira de uma palafita. Nova custa o preço de um Carajás; usada, o [[Cartel dos
Eixos]] entrega com placa de outro estado.""",
     [("Modelo", "Kombi Standard 1986, 9 lugares ou furgão de carga"), ("Motor", "VW 1.6 a ar, 56 cv; 8 km/l"), ("Carga", "1.000 kg"),
      ("Novo", "revendas de [[Petrópolis]] e [[Passo D'Areia]]"), ("Usado", "garagens de [[Nova Sarandi]] e do cais"), ("Manutenção", "Cz$ 3.000 por mês — lotação clandestina paga a própria propina")])
veic("Chevrolet Chevette", "Chevrolet", 300000, 110000, 2500, 4, [W("Petrópolis"), W("Centro Histórico"), W("Jardim Botânico")],
     "O sedã pequeno da GM, o carro do bancário e do sargento: confiável, sem graça, com rádio de fábrica.",
     """O Chevette é o carro de quem quer um carro e nada mais: quatro lugares, motor 1.6 a gasolina que não dá trabalho,
rádio AM de fábrica. Novo, é o que o sargento compra com vinte anos de PIRA; usado, é o táxi que a [[Gurgel]]
não conseguiu substituir.""",
     [("Modelo", "Chevette Junior/SL 1987, 2 portas, 4 lugares"), ("Motor", "GM 1.6 a gasolina, 72 cv; 10 km/l"), ("Velocidade", "140 km/h"),
      ("Novo", "[[Auto Petrópolis]]"), ("Usado", "[[Garagem Rua da Praia]], [[Garagem do Jardim]]"), ("Manutenção", "Cz$ 2.500 por mês")])
veic("Chevrolet Opala Diplomata", "Chevrolet", 900000, 350000, 6000, 5, [W("Ipanema"), W("Moinhos de Vento"), W("Costa e Silva")],
     "O Opala seis cilindros, o carro de coronel: bancos de veludo, motor que bebe e presença que abre blitz.",
     """O Opala Diplomata é o carro oficial de quem manda sem crachá de megacorp: coronel, delegado, deputado da
[[Aliança dos Fundadores]]. Seis cilindros, veludo, vidro elétrico, e a blitz da Brigada bate continência antes
de olhar a placa. Usado, vem com histórias que ninguém conta.""",
     [("Modelo", "Opala Diplomata 1987, 4 portas, 6 cilindros"), ("Motor", "GM 4.1 gasolina, 171 cv; 6 km/l"), ("Velocidade", "180 km/h"),
      ("Novo", "[[Revenda Ipanema Motors]], [[Revenda Moinhos]]"), ("Usado", "leilão de repartição, Cz$ 350.000"), ("Manutenção", "Cz$ 6.000 por mês: gasolina sem cota e seguro")])
veic("Chevrolet Monza", "Chevrolet", 700000, 280000, 5000, 5, [W("Moinhos de Vento"), W("Petrópolis"), W("Ipanema")],
     "O sedã do executivo de megacorp em início de carreira: ar-condicionado, vidro fumê e vaga com nome no estacionamento.",
     """O Monza é o carro que o RH da [[Gradiente]] financia pro gerente novo: sedã de quatro portas, ar-condicionado,
direção hidráulica, rádio toca-fitas. Anda na [[Padre Chagas]] com o vidro fumê fechado e estaciona na vaga com
o nome na placa. Usado, vem do leilão da própria empresa.""",
     [("Modelo", "Monza Classic 1987, 4 portas, ar-condicionado"), ("Motor", "GM 2.0 gasolina/álcool, 110 cv; 8 km/l"), ("Velocidade", "170 km/h"),
      ("Novo", "[[Revenda Moinhos]], [[Auto Petrópolis]]"), ("Usado", "leilão de frota de megacorp"), ("Manutenção", "Cz$ 5.000 por mês")])
veic("Ford Del Rey", "Ford", 600000, 220000, 4500, 5, [W("Petrópolis"), W("Moinhos de Vento")],
     "O sedã da Ford pra quem acha o Monza vulgar: banco de veludo, motor CHT, cara de médico credenciado.",
     """O Del Rey é o carro do médico credenciado da [[Panvel]] e do advogado que ganha em alvará: sóbrio, veludo marrom,
motor CHT que não empolga e não quebra. Anda devagar de propósito.""",
     [("Modelo", "Del Rey Ghia 1987, 4 portas"), ("Motor", "Ford CHT 1.6 gasolina/álcool, 73 cv; 9 km/l"), ("Velocidade", "150 km/h"),
      ("Novo", "[[Auto Petrópolis]], [[Revenda Moinhos]]"), ("Usado", "Cz$ 220.000 com veludo intacto"), ("Manutenção", "Cz$ 4.500 por mês")])
veic("Fiat 147", "Fiat", 60000, None, 1200, 3, [W("Jardim Botânico"), W("Zona Leste"), W("Nova Sarandi")],
     "O carrinho italiano de segunda mão que pega no frio quando o Fusca não pega: barato, apertado, enferruja olhando.",
     """O 147 é o carro mais barato que anda: motor a álcool que pega no inverno (ao contrário do Fusca), quatro
lugares apertados, lataria que a umidade do Guaíba devora em três anos. Só usado; a Fiat vende o Uno agora, e
ninguém aqui tem dinheiro pra Uno.""",
     [("Modelo", "Fiat 147 (1976–1986), 2 portas, 4 lugares"), ("Motor", "Fiat 1.3 álcool, 61 cv; 11 km/l"), ("Velocidade", "135 km/h"),
      ("Só usado", "garagens de bairro; Cz$ 60.000 — Cz$ 40.000 com o assoalho podre"), ("Manutenção", "Cz$ 1.200 por mês")])
veic("Mercedes-Benz 1113", "Mercedes-Benz", 1800000, 800000, 12000, 5, [W("Nova Sarandi"), W("Praia de Belas")],
     "O caminhão de tudo: frete pesado, caravana de torcida, mudança de fábrica. Usado, é o que o Cartel usa pra levar carro roubado.",
     """O 1113 é o caminhão médio que carrega Porto Alegre: sucata da [[Zona Deserta]], cesta do [[Depósito Zaffari]], a
[[Caravana da Camisa 12]] em dia de jogo. Motor diesel que dura quarenta anos, cabine sem nada. Usado, é a
ferramenta do frete de [[A Caixinha|Caixinha]] — e do [[Cartel dos Eixos]].""",
     [("Modelo", "Mercedes-Benz L-1113 (1970–1987), caminhão toco, 6 toneladas"), ("Motor", "OM-352 diesel, 130 cv; 4 km/l"), ("Velocidade", "90 km/h"),
      ("Novo", "concessionária Mercedes em [[Nova Sarandi]], sob encomenda"), ("Usado", "[[Garagem da Ferroviária]], [[Garagem do Estivador]]"), ("Manutenção", "Cz$ 12.000 por mês: diesel, pneu, documento de carga")])
# Motos
veic("Honda CG 125", "Honda", 120000, 45000, 1000, 3, [W("Passo D'Areia"), W("Zona Leste"), W("Nova Sarandi")],
     "A moto do office-boy, do entregador e da Caixinha: 125 cilindradas, gasta nada, passa em qualquer buraco.",
     """A CG 125 é a moto mais vendida do país e a ferramenta do Contratado de rank baixo: passa entre os carros
parados da Assis Brasil, sobe a passarela empurrada, gasta um tanque por semana. Usada, todo entregador tem uma;
nova, é o primeiro salário de moto-boy do [[Shopping Iguatemi]].""",
     [("Modelo", "Honda CG 125 1987, 4 tempos"), ("Motor", "125 cc, 11 cv; 40 km/l"), ("Velocidade", "100 km/h"),
      ("Novo", "[[Moto Center Assis Brasil]]"), ("Usado", "oficinas de bairro, Cz$ 45.000"), ("Manutenção", "Cz$ 1.000 por mês: gasolina de moto não tem cota")])
veic("Yamaha RD 135", "Yamaha", 160000, 60000, 1500, 4, [W("Quarto Distrito"), W("Passo D'Areia")],
     "A dois tempos que grita: a moto do racha da Voluntários, fumaça azul e velocidade de gente que não pensa no amanhã.",
     """A RD 135 é a moto de dois tempos que a molecada do [[Quarto Distrito]] envenena pra correr na Voluntários de
madrugada. Fumaça azul, barulho de serra, arrancada que assusta Carajás. A [[Ordem dos Subsolos]] aposta nelas;
a Brigada apreende uma por semana.""",
     [("Modelo", "Yamaha RD 135 1986, 2 tempos"), ("Motor", "135 cc, 17 cv; 25 km/l"), ("Velocidade", "130 km/h de fábrica; envenenada, mais"),
      ("Novo", "[[Moto Center Assis Brasil]]"), ("Usado", "[[Garagem dos Rachas]], com o escape alterado"), ("Manutenção", "Cz$ 1.500 por mês: óleo dois tempos e pneu")])
veic("Agrale 27.5", "Agrale (Caxias do Sul)", 90000, 35000, 800, 3, [W("Jardim Itu"), W("Nova Sarandi"), W("Costa e Silva")],
     "A moto gaúcha da Agrale, de Caxias: pequena, feia, dura — a moto do interior que a periferia adotou.",
     """A Agrale faz motos em Caxias do Sul desde os anos 60 e a 27.5 é a mais simples delas: 50 cilindradas, partida no
pedal, sem frescura. É a moto do peão de fábrica e do vigia; não chama a atenção de ninguém, nem do ladrão.""",
     [("Modelo", "Agrale 27.5 1985, 2 tempos"), ("Motor", "50 cc, 5 cv; 45 km/l"), ("Velocidade", "70 km/h"),
      ("Novo", "[[Moto Center Assis Brasil]], [[Oficina Paraguassu]]"), ("Usado", "Cz$ 35.000 em qualquer oficina"), ("Manutenção", "Cz$ 800 por mês")])
veic("Honda CB 450", "Honda", 350000, 130000, 3000, 5, [W("Moinhos de Vento"), W("Passo D'Areia")],
     "A moto grande: 450 cilindradas, carenagem, a que o executivo compra pra parecer perigoso no fim de semana.",
     """A CB 450 é a moto de quem tem garagem: bicilíndrica, carenagem, cromado. O gerente da [[Gradiente]] tira no
domingo pra ir até [[Ipanema]] e volta antes do toque. Roubada, vale três CG no [[Camelódromo]].""",
     [("Modelo", "Honda CB 450 1987, 4 tempos"), ("Motor", "450 cc bicilíndrico, 43 cv; 20 km/l"), ("Velocidade", "170 km/h"),
      ("Novo", "[[Moto Center Assis Brasil]], [[Revenda Moinhos]]"), ("Usado", "Cz$ 130.000 — roubada, metade"), ("Manutenção", "Cz$ 3.000 por mês")])
veic("Mobilete Caloi", "Caloi", 40000, 15000, 400, 2, [W("Bom Fim"), W("Zona Leste"), W("Passo D'Areia")],
     "A bicicleta motorizada de 50 cc: pedala pra pegar, faz 30 por hora e leva o padeiro pro trabalho sem carteira.",
     """A Mobilete é o degrau entre a bicicleta e a moto: motorzinho de 50 cc que se liga pedalando, sem carteira, sem
placa, sem seguro. É o transporte do padeiro, do estudante e da dona de armazém; a Brigada nem olha.""",
     [("Modelo", "Caloi Mobilete 1986, motor auxiliar"), ("Motor", "50 cc, 2 tempos; 50 km/l"), ("Velocidade", "35 km/h"),
      ("Novo", "[[Bicicletaria do Alemão]], [[Moto Center Assis Brasil]]"), ("Usado", "Cz$ 15.000"), ("Manutenção", "Cz$ 400 por mês")])
# Bicicletas (a Caloi 10 já existe)
veic("Monark Barra Circular", "Monark", 10000, 3000, 150, 2, [W("Zona Leste"), W("Restinga"), W("Bom Fim")],
     "A bicicleta de padeiro: quadro de ferro, freio contrapedal, bagageiro que carrega um saco de pão ou uma criança.",
     """A Barra Circular é a bicicleta que não morre: quadro de ferro pesado, freio no pedal, bagageiro de aço. Anda
devagar e leva tudo — o pão da padaria, a lata de água, o filho. Usada, sai por três mil em qualquer oficina de
bairro, provavelmente roubada uma vez antes.""",
     [("Modelo", "Monark Barra Circular, quadro de aço, freio contrapedal"), ("Peso", "18 kg"), ("Novo", "[[Bicicletaria do Alemão]], [[Bicicletaria Verde]]"),
      ("Usado", "oficinas de bairro, Cz$ 3.000"), ("Manutenção", "Cz$ 150 por mês: câmara e óleo")])
veic("Caloi Cross", "Caloi", 15000, 6000, 200, 2, [W("Jardim Botânico"), W("Bom Fim"), W("Passo D'Areia")],
     "A bicicleta da molecada: aro 20, guidão alto, salta o meio-fio e desce a escadaria da passarela.",
     """A Cross é a bicicleta que todo moleque do [[Jardim Botânico]] pede no Natal: aro 20, quadro reforçado, guidão
alto. Serve pra saltar meio-fio, entregar recado da [[Resistência Urbana Gaúcha]] e fugir de brigadiano a pé.""",
     [("Modelo", "Caloi Cross 1986, aro 20"), ("Peso", "13 kg"), ("Novo", "[[Bicicletaria Verde]]"), ("Usado", "Cz$ 6.000"), ("Manutenção", "Cz$ 200 por mês")])
# Barcos
veic("Bote de Alumínio com Motor", "Estaleiros do cais", 180000, 60000, 2000, 3, [W("Praia de Belas"), W("Cidade Baixa"), W("Restinga")],
     "Bote de alumínio de cinco metros com motor de popa 15 HP: o carro de quem mora na água.",
     """O bote de alumínio com motor de popa é o Carajás das palafitas: cinco metros, quatro pessoas, motor Yamaha de
15 HP contrabandeado pelo [[Porto Novo]]. Com ele se mora na [[Cidade Baixa]] sem depender de barqueiro, se pesca
na [[Restinga]] e se some pelo Guaíba quando a patrulha aparece.""",
     [("Modelo", "bote de alumínio 5 m, 4 lugares, motor de popa 15 HP"), ("Motor", "Yamaha 15 HP 2 tempos (contrabando); 3 km/l"), ("Velocidade", "30 km/h em água parada"),
      ("Novo", "[[Estaleiro do Cais]]"), ("Usado", "[[Trapiche da Aliança]], [[Estaleiro da Restinga]]"), ("Manutenção", "Cz$ 2.000 por mês: gasolina em dólar, hélice, casco")])
veic("Barco de Pesca de Madeira", "Carpinteiros da Restinga", 60000, 40000, 1000, 2, [W("Restinga"), W("Praia de Belas")],
     "Barco de madeira a remo e vela de saco, seis metros: o barco do pescador da Restinga, sem motor e sem pressa.",
     """O barco de pesca da [[Restinga]] é feito de madeira reaproveitada pelos carpinteiros do [[Movimento Restinga
Livre]]: seis metros, remo, vela de saco de farinha. Não tem motor e não precisa: o Guaíba é parado e o peixe
está perto. Compra-se em dólar.""",
     [("Modelo", "barco de madeira 6 m, remo e vela, 3 pessoas ou 300 kg de peixe"), ("Motor", "nenhum"), ("Velocidade", "a do vento"),
      ("Novo", "[[Estaleiro da Restinga]] (US$ 600)"), ("Usado", "Cz$ 40.000 com casco calafetado"), ("Manutenção", "Cz$ 1.000 por mês: breu, corda e uma vela nova por ano")])
veic("Lancha de Fibra", "Estaleiros de Ipanema", 900000, 300000, 8000, 6, [W("Ipanema"), W("Praia de Belas")],
     "Lancha de fibra de sete metros com motor de centro: o brinquedo do Embarcadouro e o jeito da elite atravessar o Guaíba.",
     """A lancha de fibra é o Monza da água: sete metros, motor de centro a gasolina, cabine com dois beliches, rádio
[[Embratel]]. Fica no trapiche da [[Casa em Ipanema]] e atravessa o Guaíba sem passar por barqueiro, patrulha ou
palafita. Usada, é a que a Brigada apreendeu com contrabando.""",
     [("Modelo", "lancha de fibra 7 m, motor de centro, cabine com 2 beliches"), ("Motor", "Chevrolet 4.1 marinizado, 150 cv; 1 km/l"), ("Velocidade", "60 km/h"),
      ("Novo", "[[Embarcadouro do Guaíba]]"), ("Usado", "leilão da Brigada, [[Estaleiro do Cais]]"), ("Manutenção", "Cz$ 8.000 por mês: gasolina, vaga no embarcadouro, seguro")])
# Tração animal
veic("Carroça com Cavalo", W("Sindicato dos Catadores"), 40000, 25000, 800, 1, [W("Zona Deserta"), W("Zona Leste"), W("Restinga")],
     "Carroça de madeira e um cavalo magro: o veículo do catador, passa onde caminhão não passa e a Brigada não para.",
     """A carroça do [[Sindicato dos Catadores]] é o veículo mais comum da [[Zona Deserta]]: pneu de carro, caçamba de
tábua, um cavalo que come o que acha. Leva sucata, mudança e gente; ninguém para carroça — nem Brigada, nem
pedágio de facção. A manutenção é o cavalo.""",
     [("Modelo", "carroça de madeira sobre eixo de Fusca, 500 kg, 1 cavalo"), ("Motor", "cavalo; come Cz$ 600 por mês"), ("Velocidade", "8 km/h"),
      ("Novo", "[[Curral do Sindicato]] (carroça nova + cavalo velho)"), ("Usado", "[[Oficina do Borracheiro]], Cz$ 25.000 com o cavalo"), ("Manutenção", "Cz$ 800 por mês: ferradura, feno e um pneu")])


# Corridas avulsas de bairro pobre (à vista; o plano TRI não cobre clandestino)
nota(T, "Lotação Clandestina", "Corrida", "Cooperativas de Kombi", 80, "viagem", [W("Jardim Itu"), W("Quarto Distrito"), W("Zona Leste"), W("Costa e Silva")],
     "Kombi lotada de nove que sai quando enche, sem TRI e sem horário: a lotação da periferia, Cz$ 80 na mão do motorista.",
     """Onde o ônibus da [[Marcopolo]] não entra, entra a Kombi: nove passageiros sentados e mais três na porta, sai
quando enche, para onde o passageiro grita. Não aceita TRI — é Cz$ 80 na mão do motorista, que paga a própria
propina pra Brigada não parar. Depois do toque de recolher é o único transporte que existe, pelo dobro.""",
     [("Veículo", "[[Volkswagen Kombi]] de 9 lugares (12 na prática)"), ("Preço", "Cz$ 80; Cz$ 160 depois do toque"), ("Pagamento", "na mão, sem TRI"), ("Onde pega", "ponto de Kombi de cada bairro; sinal de mão na avenida"), ("Risco", "a Brigada apreende a Kombi e deixa os passageiros na rua")], Nível=2)
nota(T, "Carona no Caminhão do Sindicato", "Corrida", W("Sindicato dos Catadores"), 10, "viagem", [W("Zona Deserta"), W("Zona Leste"), W("Restinga")],
     "Carona na caçamba do caminhão de lixo do Sindicato: Cz$ 10 ou um favor, passa por qualquer barricada — ninguém para caminhão de lixo.",
     """O caminhão de coleta do [[Sindicato dos Catadores]] atravessa a cidade duas vezes por dia e leva quem sobe na
caçamba: Cz$ 10, uma dose ou um favor. Ninguém para caminhão de lixo — nem Brigada, nem pedágio de facção — e é
por isso que o Contratado sem plano chega onde precisa cheirando a lixo.""",
     [("Veículo", "[[Mercedes-Benz 1113]] de coleta, caçamba aberta"), ("Preço", "Cz$ 10, uma dose ou um favor"), ("Rota", "[[Zona Deserta]] → [[Zona Leste]] → Centro → [[Restinga]], 5h e 17h"), ("Regra", "quem sobe ajuda a carregar")], Nível=1)

# ───────────────────────────── MORADIAS que faltavam (uma por bairro sem) ─────────────────────────────
def morad(nome, marca, preco, nivel, onde, resumo, desc, espec, compra=None, manut=None):
    extra = {"Nível": nivel}
    if compra is not None: extra["Compra"] = compra
    if manut is not None: extra["Manutenção"] = manut
    nota(M, nome, "Aluguel", marca, preco, "mês", onde, resumo, desc, espec, **extra)
morad("Apartamento no Bom Fim", "Imobiliária Independência", 8000, 4, [W("Bom Fim"), W("Independência")],
      "Dois dormitórios num prédio de 1960 na Independência: sacada pra Redenção, elevador que funciona e livro proibido no prédio inteiro.",
      """Os prédios da [[Independência]] são de professor, médico e jornalista: dois dormitórios, sacada pra [[Redenção]],
porteiro que conhece a Brigada pelo nome. Aluga-se ou compra-se na [[Imobiliária Independência]]; o condomínio
inclui o gerador e a discrição.""",
      [("Imóvel", "2 dormitórios, 65 m², prédio de 1960 com elevador"), ("Inclui", "portaria, água e luz oficiais, telefone"), ("Compra", "Cz$ 800.000"), ("Manutenção", "Cz$ 2.000 por mês de condomínio e IPTU"), ("Classe", "Classe Média")],
      compra=800000, manut=2000)
morad("Apartamento no Jardim Botânico", "Imobiliária Jardim", 10000, 5, [W("Jardim Botânico")],
      "Três dormitórios com vista pro parque, prédio novo de 1984, garagem e síndico da Zaffari.",
      """O [[Jardim Botânico]] cresceu em prédio de 1984 pra família de técnico e gerente: três dormitórios, garagem,
vista pra copa das árvores e o síndico que trabalha na [[Zaffari]]. Compra-se na [[Imobiliária Jardim]] com
financiamento em folha.""",
      [("Imóvel", "3 dormitórios, 90 m², prédio de 1984 com garagem"), ("Inclui", "condomínio com porteiro, gerador, água e luz oficiais"), ("Compra", "Cz$ 1.000.000"), ("Manutenção", "Cz$ 2.500 por mês"), ("Classe", "Classe Média Alta")],
      compra=1000000, manut=2500)
morad("Vaga na Pensão da Vila Militar", "Dona Zulmira", 1800, 3, [W("Costa e Silva"), W("Vila Militar do Paraguassu")],
      "Quarto de solteiro na pensão de suboficial ao lado da Vila Militar: toque de recolher interno e café às cinco.",
      """A pensão da Dona Zulmira, viúva de sargento, aluga quarto pra soldado sem farda de casa e pra quem quer morar
perto do quartel sem ser do quartel. Regras de quartel: café às cinco, luz apagada às dez, visita nunca.""",
      [("Quarto", "solteiro, armário, banheiro no corredor"), ("Inclui", "café das cinco, roupa lavada na sexta"), ("Regra", "luz apagada às dez; a dona conhece todo mundo do QG"), ("Classe", "Classe Média Baixa")])
morad("Vaga na Vila da Itú Química", "Fábrica Itú Química", 2000, 3, [W("Jardim Itu"), W("Fábrica Itú Química")],
      "Casa geminada na vila da fábrica de remédios genéricos: desconto em folha, cheiro de éter e laudo mensal.",
      """A [[Fábrica Itú Química]] aloja o operário na vila atrás do galpão: casa geminada de dois cômodos, água da
fábrica, cheiro de éter que não sai da roupa. Desconto em folha; perdeu o emprego, perdeu a casa — e o laudo de
Reatividade é mensal.""",
      [("Casa", "geminada de 38 m², dois cômodos"), ("Pagamento", "desconto em folha da fábrica"), ("Inclui", "água e luz da fábrica, ração em crédito"), ("Classe", "Classe Média Baixa")])
morad("Vaga na Pensão do Cais", "Dona Neusa", 1800, 3, [W("Praia de Belas"), W("Porto Novo")],
      "Quarto na pensão do cais pra estivador e viajante de barco: cheiro de maresia, chave de verdade, janta às sete.",
      """A [[Pensão do Cais]] fica de frente pro [[Porto Novo]] e aluga quarto pra estivador, marinheiro de balsa e quem
chegou de barco sem saber pra onde vai. Dona Neusa serve janta às sete e não pergunta o sobrenome.""",
      [("Quarto", "solteiro ou duplo, janela pro cais"), ("Inclui", "janta às sete, roupa lavada, recado anotado"), ("Regra", "porta fecha à meia-noite — o toque é antes"), ("Classe", "Classe Média Baixa")])
morad("Barraco de Sucata", W("Clã da Ferrugem"), 300, 1, [W("Zona Deserta")],
      "Barraco de chapa e lona na Zona Deserta, alugado ao Clã da Ferrugem por trezentos: teto, e só.",
      """Na [[Zona Deserta]] o teto é chapa de contêiner, lona e a palavra do [[Clã da Ferrugem]]. Trezentos cruzados por
mês — ou sucata equivalente — e ninguém vem cobrar mais nada. Não tem água, não tem luz, não tem endereço; tem o
Delta rio acima.""",
      [("Barraco", "chapa, lona, chão de terra; 12 m²"), ("Pagamento", "Cz$ 300 ou sucata"), ("Compra", "Cz$ 20.000 — 'posse' com a bênção do Clã"), ("Manutenção", "Cz$ 100 por mês (uma lona por ano)"), ("Classe", "Miserável")],
      compra=20000, manut=100)

# ───────────────────────────── ESTABELECIMENTOS ─────────────────────────────
def poi(pasta, nome, geo, dono, contexto, descricao, aparencia, influencias, acontecimento, servicos):
    fm = ["aliases: ", "categoria: Localização", "subcategoria: Ponto de Interesse", f'Geolocalização: "[[{geo}]]"', f"Dono: {y(dono)}",
          "Contexto: ", "Descrição: ", "Organizações_Influentes: ", "Acontecimento_Recente: ",
          "Serviços: " + ("\n" + "\n".join(f'  - "{s}"' for s in servicos)), "Completo: true"]
    body = "\n".join([
        "#Local",
        "> [!abstract] Contexto do `= this.subcategoria`: `= this.file.name`",
        "> 🗺️**Geolocalização:** `= this.Geolocalização`",
        f"> 📖**Contexto Histórico:** {contexto}",
        "",
        "> [!info] Informações do `= this.subcategoria`: `= this.file.name`",
        f"> ℹ️**Descrição:** {descricao}",
        "> ",
        "> 👤**Dono:** `= this.Dono`",
        "> ",
        f"> 👁️**Aparência do Local:** {aparencia}",
        "> ",
        "> 🛡️**Influências:**",
    ] + [f"> - {x}" for x in influencias] + [
        "> ",
        f"> 📖**Acontecimento Recente:** {acontecimento}",
        "",
        "> [!info] Serviços",
        "> O que este estabelecimento vende ou aluga (aba **Serviços** do app; preço e marca vivem na nota de cada [[Recursos|Recurso]]):",
        "> `= this.Serviços`",
        "",
    ])
    path = os.path.join(ATLAS, pasta, f"{nome}.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write("---\n" + "\n".join(fm) + "\n---\n" + body)
    escritos.append(path)

# atalhos de ofertas por tipo de estabelecimento (o que muda entre bairros é o que ENTRA e quanto rola)
PADARIA = [L("Café da Manhã de Padaria"), L("Café Passado"), L("Empada de Padaria"), L("Bolo de Padaria"), L("Cueca Virada")]
BOTECO = [L("Polar Tradicional"), L("Cachaça de Boteco"), L("Café Passado"), L("Churrasquinho de Barraca")]
ARMAZEM = [L("Cesta Básica Zaffari"), L("Água Mineral em Galão"), L("Erva-Mate Charrua"), L("Cream Cracker Isabela"), L("Grapette"), L("Guaraná Fruki"), L("Bala Soft"), L("Chiclete Ping Pong")]
LANCHERIA = [L("Xis"), L("Guaraná Fruki"), L("Laranjinha Fruki"), L("Polar Tradicional"), L("Café Passado")]
BANCA = [L("Mate Gelado Charrua"), L("Chá Mate Leão"), L("Elma Chips"), L("Bubbaloo"), L("Chiclete Ping Pong"), L("Diamante Negro"), L("Amendoim Japonês")]
TAXI = [L("Táxi Gurgel")]
BARQUEIRO = [L("Lancha do Barqueiro"), L("Lancha de Aluguel")]

NOVOS = [
 # ── Bom Fim (Rua de Comércio)
 ("Bom Fim", "Bicicletaria do Alemão", "Bom Fim", "Rudi Schneider, o Alemão", "Oficina de bicicleta desde 1961, do pai do Rudi; sobreviveu à enchente com o estoque no segundo andar.",
  "Vende e conserta Caloi, Monark e Mobilete; câmara na hora, roubo de bicicleta é 'recompra' sem pergunta.", "Loja estreita com quadros pendurados no teto, cheiro de borracha e graxa, rádio na Farroupilha.",
  ["[[Resistência Urbana Gaúcha]] — recado passa pela oficina", "[[Camelódromo]] — as roubadas voltam por lá"], "Uma Caloi 10 vendida na segunda voltou 'pra conserto' na quarta com outro dono.",
  [L("Bicicleta Caloi 10"), L("Monark Barra Circular"), L("Caloi Cross"), L("Mobilete Caloi"), L("Bicicleta Caloi 10", "usado"), L("Monark Barra Circular", "usado")]),
 ("Bom Fim", "Armazém Sarmento Leite", "Bom Fim", "Seu Abílio Trindade", "Armazém de secos e molhados de 1950 na esquina da Sarmento Leite; o caderno de fiado tem três gerações.",
  "Cesta, erva, bolacha, refrigerante gelado no isopor e bala de troco; fiado só pra freguês com nome no caderno.", "Balcão de madeira gasto, prateleira até o teto, saco de arroz aberto e um gato dormindo na balança.",
  ["[[Zaffari]] — entrega a cesta racionada aqui", "[[Resistência Urbana Gaúcha]] — a cisterna do quintal"], "O Zaffari cortou a cota de cesta do armazém; Seu Abílio compra do caminhão por fora.", ARMAZEM + [L("Doce de Leite Colonial")]),
 ("Bom Fim", "Lancheria do Bom Fim", "Bom Fim", "Dona Marli Peixoto", "Lancheria aberta em 1979 pra vender xis pra saída do cinema; hoje é o último balcão aceso antes do toque.",
  "Xis prensado, refrigerante da caçulinha, Polar e café; funciona até o toque de recolher e dez minutos depois.", "Chapa fumegante, banquetas altas, vitrine de vidro com pastel e uma TV com o jogo.",
  ["[[Polar]] — a geladeira é da marca", "[[Brigada Militar Metropolitana]] — entra às 22h50 pra ver quem sobrou"], "A Brigada levou o rádio da lancheria por 'tocar rádio pirata'; a Marli comprou outro.", LANCHERIA + [L("Brahma Chopp")]),
 ("Bom Fim", "Ponto de Táxi da Redenção", "Bom Fim", "Zé da Redenção (chefe do ponto)", "Ponto de táxi na esquina da Redenção desde os anos 70; a fila de Carajás amarelos é referência do bairro.",
  "Seis táxis Gurgel em fila; o Zé sabe o preço de tudo e o endereço de todo mundo.", "Guarita de madeira com telefone, banco de praça e os taxistas jogando canastra no capô.",
  ["[[Gurgel]] — frota conveniada", "[[Embratel]] — o rádio do ponto"], "Um taxista sumiu com um passageiro do [[Bar Ocidente]]; o Zé diz que foi pra Restinga.", TAXI),
 ("Bom Fim", "Imobiliária Independência", "Bom Fim", "Dr. Amadeu Prates", "Imobiliária de família na Independência desde 1955; aluga e vende os prédios de professor do bairro.",
  "Apartamentos da Independência pra alugar ou comprar; exige fiador e discrição, oferece as duas coisas.", "Escritório no térreo de um prédio de 1960, plantas na parede, secretária que lê o jornal proibido.",
  ["[[Resistência Urbana Gaúcha]] — o Dr. Amadeu aluga pra quem precisa sumir", "[[Brigada Militar Metropolitana]] — pede a lista de inquilinos todo mês"], "Dois apartamentos ficaram vagos depois de uma batida; a imobiliária não anuncia.", [L("Apartamento no Bom Fim")]),
 # ── Centro Histórico (Centro)
 ("Centro Histórico", "Garagem Rua da Praia", "Centro Histórico", "Seu Adão Machado", "Garagem de usados no segundo andar de um prédio alagado; os carros sobem pela rampa da passarela.",
  "Fusca, Brasília, Chevette, Kombi e CG de segunda mão, com ou sem documento; troca-se por dólar ou por dose.", "Salão de concreto com carros enfileirados na penumbra, poça no chão, um cachorro e um caderno de placas.",
  ["[[Cartel dos Eixos]] — metade do estoque chega por eles", "[[Aliança dos Fundadores]] — pedágio da rampa"], "A Brigada reconheceu um Chevette roubado na vitrine; o Seu Adão pagou e o carro continua lá.",
  [L("Volkswagen Fusca"), L("Volkswagen Brasília"), L("Chevrolet Chevette", "usado"), L("Volkswagen Kombi", "usado"), L("Honda CG 125", "usado"), L("Fiat 147")]),
 ("Centro Histórico", "Padaria Central", "Centro Histórico", "Seu Osvaldo Benetti", "Padaria italiana de 1938 na Rua da Praia; subiu um andar depois da cheia e o forno a lenha foi junto.",
  "Cacetinho quente, café passado, empada, bolo e a cueca virada das três; fila de escritório de manhã e de camelô à tarde.", "Vitrine embaçada na passarela, balcão de mármore, forno visto pela porta dos fundos.",
  ["[[Zaffari]] — farinha racionada", "[[Aliança dos Fundadores]] — a passarela cobra a entrega"], "A farinha atrasou; a padaria vendeu pão de ontem pela metade e a fila dobrou.", PADARIA),
 ("Centro Histórico", "Bar do Zeca", "Centro Histórico", "Zeca Lopes", "Boteco de balcão de zinco na Rua da Praia desde 1962; o Zeca herdou do pai junto com o fiado.",
  "Polar, Brahma pra quem paga mais, cachaça de garrafão, xis da chapa e café; aberto das seis ao toque.", "Balcão de zinco, prateleira de garrafas, ventilador de teto e a TV no jogo de domingo.",
  ["[[Brigada Militar Metropolitana]] — o sargento bebe de graça", "[[Consórcio das Bandeiras]] — cobra a barraca em dia de jogo"], "Uma briga de arquibancada terminou no balcão; o vidro é novo.", BOTECO + [L("Brahma Chopp"), L("Xis")]),
 ("Centro Histórico", "Ponto de Táxi da Alfândega", "Centro Histórico", "Seu Valter Bandeira (chefe do ponto)", "O ponto de táxi mais antigo da cidade, na praça em frente à Alfândega alagada; os táxis ficam na passarela.",
  "Táxi Gurgel na fila o dia inteiro; à noite, o dobro; em dia de jogo, o triplo.", "Fila de Carajás amarelos sobre a passarela reforçada, guarita com rádio e um cartaz de tarifa rasurado.",
  ["[[Gurgel]] — frota", "[[Embratel]] — rádio do ponto"], "A tarifa noturna subiu de novo; ninguém reclamou porque não tem ônibus.", TAXI),
 # ── Cidade Baixa (Boca de Bairro)
 ("Centro Histórico/Cidade Baixa", "Oficina do Cardã", "Cidade Baixa", "Ademar “Cardã” Lemos", "Oficina sobre estacas na Cidade Baixa, do mecânico do Cartel dos Eixos; o motor que sai daqui não tem origem.",
  "Vende Fusca, Kombi, CG e Motomachine de segunda mão duvidosa, conserta qualquer coisa e não pergunta de onde veio.", "Galpão de tábua sobre a água, guincho de corrente, motores no chão e um Fusca sem porta na rampa.",
  ["[[Cartel dos Eixos]] — o Cardã é deles", "[[Aliança Livre das Palafitas]] — pedágio da rampa"], "Um Carajás da Concessionária apareceu aqui em peças três dias depois de sumir do pátio.",
  [L("Volkswagen Fusca"), L("Volkswagen Kombi", "usado"), L("Honda CG 125", "usado"), L("Gurgel Motomachine", "usado"), L("Gurgel Carajás", "usado"), L("Gasolina Ipiranga")]),
 ("Centro Histórico/Cidade Baixa", "Armazém da Palafita", "Cidade Baixa", "Dona Lurdes Cabral", "Armazém numa palafita grande, no cruzamento das passarelas; a única balança da Cidade Baixa.",
  "Cesta, água em galão, bolacha, refrigerante quente e cachaça; aceita dólar, dose e sucata; fiado com a Aliança de fiador.", "Palafita com balcão pra passarela, prateleira presa com arame, galões de água empilhados e um rádio.",
  ["[[Aliança Livre das Palafitas]] — a Dona Lurdes é da Aliança", "[[Zaffari]] — a cesta chega de bote"], "A cheia levou o estoque de arroz; a Aliança repôs e a Dona Lurdes deve.", ARMAZEM + [L("Cachaça de Boteco"), L("Ração PIRA")]),
 ("Centro Histórico/Cidade Baixa", "Padaria da Ponte", "Cidade Baixa", "Seu Antero Dias", "Padaria ao pé da passarela que liga a Cidade Baixa ao Centro; o forno é o único ponto seco do quarteirão.",
  "Pão, café passado e bolo de fubá; vende pão dormido pela metade pra quem chega depois das nove.", "Forno de tijolo, balcão de tábua, pão em cesto de vime e fila de manhã na passarela.",
  ["[[Aliança Livre das Palafitas]] — pedágio da ponte", "[[Resistência Urbana Gaúcha]] — sopa de terça sai daqui"], "O forno rachou na última cheia e o Seu Antero assa em turno pra vizinhança.", [L("Café da Manhã de Padaria"), L("Café Passado"), L("Bolo de Padaria")]),
 # ── Costa e Silva (Boca de Bairro)
 ("Costa e Silva", "Oficina Paraguassu", "Costa e Silva", "Ex-cabo Romildo Farias", "Oficina de ex-cabo da Brigada atrás da Vila Militar; conserta o carro do quartel e vende o que sobra do leilão.",
  "Fusca, Chevette e motos de segunda mão saídos de leilão de repartição; documento em ordem porque o dono conhece quem carimba.", "Pátio de terra com carros em fila, barracão de zinco, um cão de guarda e a bandeira do quartel.",
  ["[[Brigada Militar Metropolitana]] — cliente e fornecedor", "[[Quartel-General do Exército]] — o leilão"], "Um Opala de delegado saiu do leilão por metade do preço; a oficina revendeu no mesmo dia.",
  [L("Volkswagen Fusca"), L("Chevrolet Chevette", "usado"), L("Honda CG 125", "usado"), L("Agrale 27.5"), L("Chevrolet Opala Diplomata", "usado")]),
 ("Costa e Silva", "Bar do Sargento", "Costa e Silva", "Sargento reformado Ubirajara", "Boteco de sargento reformado na entrada da Vila Militar; farda pendurada atrás do balcão e conversa que não sai dali.",
  "Polar, cachaça, churrasquinho e café; brigadiano de folga bebe fiado e paga com informação.", "Bar de esquina com mesa de plástico, retrato do presidente e um rádio na Rádio Farroupilha.",
  ["[[Brigada Militar Metropolitana]] — a clientela", "[[Rádio Farroupilha]] — o som"], "Um tenente pagou a conta de todo mundo na noite em que a Brigada fechou a Sede da Camisa 12.", BOTECO),
 ("Costa e Silva", "Armazém Costa e Silva", "Costa e Silva", "Seu Nestor Garcia", "Armazém de secos e molhados da vila dos suboficiais; a cesta racionada chega escoltada.",
  "Cesta básica, água, bolacha, refrigerante e bala de troco; ração PIRA pra quem tem carteira.", "Prateleira arrumada como quartel, balcão limpo, caixa registradora antiga e uma foto de formatura.",
  ["[[Zaffari]] — cota escoltada", "[[Quartel-General do Exército]] — o fiscal"], "A cota de arroz do armazém dobrou quando o QG passou a comprar aqui.", ARMAZEM + [L("Ração PIRA")]),
 ("Costa e Silva", "Pensão da Vila Militar", "Costa e Silva", "Dona Zulmira Fraga", "Pensão de viúva de sargento ao lado da Vila Militar; regras de quartel e café às cinco.",
  "Quarto de solteiro por mês pra soldado sem farda de casa e vigia de fábrica; luz apagada às dez.", "Casa de vila com sete quartos, corredor encerado, quadro de avisos e horário na porta.",
  ["[[Brigada Militar Metropolitana]] — a clientela", "[[Vila Militar do Paraguassu]] — a vizinhança"], "Um hóspede foi 'chamado ao QG' e não voltou; o quarto está vago.", [L("Vaga na Pensão da Vila Militar")]),
 ("Costa e Silva", "Padaria do Quartel", "Costa e Silva", "Seu Élio Wenzel", "Padaria alemã de 1954 na frente do QG; fornece o pão do quartel e o da vila.",
  "Cacetinho, café, bolo e cueca virada; o soldado compra fiado e paga no dia do soldo.", "Fachada verde e branca, vitrine com cuca, fila de farda às seis da manhã.",
  ["[[Quartel-General do Exército]] — o maior cliente", "[[Zaffari]] — farinha"], "O QG atrasou o pagamento do pão; o Seu Élio parou de entregar por dois dias e a cidade soube.", PADARIA),
 # ── Ipanema (Rua de Comércio)
 ("Ipanema", "Revenda Ipanema Motors", "Ipanema", "Sr. Heitor Gastal", "Revenda de carros de luxo na entrada de Ipanema desde 1981; vende Opala, Monza, Del Rey e o Tocantins com couro.",
  "Carros de coronel e diretor, novos e de leilão de repartição, com blindagem opcional e entrega em casa.", "Vitrine de vidro espelhado, tapete vermelho, um Opala Diplomata girando e um segurança da Gradiente na porta.",
  ["[[Gradiente]] — segurança e seguro", "[[Gurgel]] — o Tocantins vem de lá com couro"], "Um Tocantins blindado saiu pra um diretor e voltou com dois furos na semana seguinte; a revenda trocou a porta.",
  [L("Chevrolet Opala Diplomata"), L("Chevrolet Monza"), L("Ford Del Rey"), L("Gurgel Tocantins"), L("Honda CB 450"), L("Chevrolet Opala Diplomata", "usado")]),
 ("Ipanema", "Corretora Ipanema", "Ipanema", "Dra. Regina Sirotsky", "Corretora dos condomínios fechados de Ipanema; só atende com indicação e vende silêncio.",
  "Casas em condomínio fechado com trapiche; visita agendada, fotografada e com fiador de megacorp.", "Sala com vista pro Guaíba, maquete do condomínio, café de verdade e uma secretária que confere o crachá.",
  ["[[Gradiente]] — guarita e câmera de tudo que ela vende", "[[Governo Militar Brasileiro]] — coronéis clientes"], "Uma casa ficou seis meses 'reservada' pra um general que nunca veio.", [L("Casa em Ipanema")]),
 ("Ipanema", "Empório Ipanema", "Ipanema", "Seu Carlito Mattos", "Empório fino na avenida de Ipanema desde 1979; importado pelo Clube dos Sete Portos e vinho da serra com rótulo de reserva.",
  "Corte especial, vinho, Coca de lata, doce de leite colonial em pote de vidro e chocolate; entrega em casa com nota.", "Loja de madeira escura, adega de vidro, balcão de frios com selo do Zaffari e um menino de entrega de bicicleta.",
  ["[[Zaffari]] — o corte especial", "[[Clube dos Sete Portos]] — o importado"], "Um lote de uísque com selo falso foi apreendido; o Seu Carlito diz que era de outro empório.",
  [L("Corte Especial Zaffari"), L("Vinho Aurora"), L("Coca-Cola"), L("Doce de Leite Colonial"), L("Chocolate Neugebauer"), L("Água Mineral em Galão"), L("Uísque de Contrabando")]),
 ("Ipanema", "Bar da Praia de Ipanema", "Ipanema", "Toninho Ferraz", "Bar na beira da praia de Ipanema, de calçadão, com mesa na areia e Brahma gelada; a elite bebe e a Brigada olha.",
  "Brahma, Polar, churrasquinho e café; à noite, coquetel de gim pra quem pede baixinho.", "Deck de madeira sobre a areia, guarda-sol listrado, mesa de plástico branca e o Guaíba escuro atrás.",
  ["[[Gradiente]] — segurança do calçadão", "[[Resort Nova Porto Alegre]] — hóspede vem aqui fugir do resort"], "Um hóspede do Resort caiu na água de madrugada; o Toninho pescou e ninguém registrou.", [L("Brahma Chopp"), L("Polar Tradicional"), L("Churrasquinho de Barraca"), L("Café Passado"), L("Coca-Cola")]),
 ("Ipanema", "Padaria Ipanema", "Ipanema", "Dona Ilse Hoffmann", "Padaria alemã de 1966 na avenida de Ipanema; cuca de banana e pão de centeio pra família de coronel.",
  "Café da manhã completo, empada de camarão, bolo e cueca virada; entrega em casa nos condomínios.", "Vitrine de cuca, balcão de mármore, cheiro de centeio, uma Kombi de entrega na porta.",
  ["[[Gradiente]] — entrega passa pela guarita", "[[Zaffari]] — farinha sem cota"], "A padaria passou a entregar dentro dos condomínios; a guarita revista a Kombi toda manhã.", PADARIA),
 ("Ipanema", "Ponto de Táxi de Ipanema", "Ipanema", "Seu Dirceu Ramos (chefe do ponto)", "Ponto de táxi na entrada dos condomínios; os carros são Carajás com ar-condicionado e o motorista de gravata.",
  "Táxi Gurgel conveniado com os condomínios; tarifa executiva, discrição incluída.", "Quatro Carajás encerados numa baia coberta, telefone direto com as guaritas e um motorista lendo o jornal.",
  ["[[Gradiente]] — convênio das guaritas", "[[Gurgel]] — frota"], "Um taxista foi demitido por comentar aonde levou um coronel.", TAXI),
 # ── Jardim Botânico (Rua de Comércio)
 ("Jardim Botânico", "Bicicletaria Verde", "Jardim Botânico", "Seu Ivo Balestrin", "Bicicletaria de 1972 na avenida do parque; vende a Cross da molecada e conserta a Caloi 10 do estudante.",
  "Caloi Cross, Caloi 10, Monark e Mobilete, novas e usadas; conserto na hora e cadeado com desconto.", "Loja com bicicletas penduradas na fachada, bancada de conserto na calçada e um cachorro vira-lata.",
  ["[[Resistência Urbana Gaúcha]] — recado de bicicleta", "[[Camelódromo]] — o destino das roubadas"], "Duas Cross sumiram do parque no mesmo domingo; o Seu Ivo vendeu duas na segunda.",
  [L("Caloi Cross"), L("Bicicleta Caloi 10"), L("Monark Barra Circular"), L("Mobilete Caloi"), L("Bicicleta Caloi 10", "usado"), L("Caloi Cross", "usado")]),
 ("Jardim Botânico", "Garagem do Jardim", "Jardim Botânico", "Seu Galvão Pereira", "Garagem de usados de bairro ao lado do parque; vende o carro de segunda mão da classe média.",
  "Chevette, Fiat 147, Brasília e CG de segunda mão com documento; financia em três vezes com cheque.", "Pátio cercado com carros lavados, faixa de 'promoção', escritório de madeira e uma bandeira do Grêmio.",
  ["[[Zaffari]] — o síndico compra aqui", "[[Brigada Militar Metropolitana]] — confere placa uma vez por mês"], "Um 147 vendido na semana passada voltou de guincho; o Seu Galvão devolveu metade.",
  [L("Chevrolet Chevette", "usado"), L("Fiat 147"), L("Volkswagen Brasília"), L("Honda CG 125", "usado"), L("Volkswagen Fusca")]),
 ("Jardim Botânico", "Imobiliária Jardim", "Jardim Botânico", "Dona Marlene Sperb", "Imobiliária dos prédios novos do Jardim Botânico; vende apartamento de família de técnico com financiamento em folha.",
  "Apartamentos de três dormitórios com garagem, aluguel ou compra; exige crachá de megacorp ou fiador.", "Loja de vitrine com plantas coloridas, maquete do prédio novo e uma corretora de tailleur.",
  ["[[Zaffari]] e [[Gradiente]] — financiam em folha", "[[Companhia Estadual de Energia Elétrica|CEEE]] — o gerador é argumento de venda"], "Um apartamento foi vendido com o gerador do vizinho na foto.", [L("Apartamento no Jardim Botânico")]),
 ("Jardim Botânico", "Padaria do Jardim", "Jardim Botânico", "Seu Arlindo Pretto", "Padaria de esquina de 1970 na frente do parque; a cueca virada das três atrai a Biblioteca Verde inteira.",
  "Pão, café, empada, bolo e cueca virada; fiado pra freguês do prédio.", "Vitrine de vidro, mesa na calçada com vista pro parque, cheiro de canela.",
  ["[[Biblioteca Verde]] — a clientela da tarde", "[[Zaffari]] — farinha"], "A padaria passou a fechar às 22h por causa do toque; a cueca virada agora sai às duas.", PADARIA),
 ("Jardim Botânico", "Bar do Botânico", "Jardim Botânico", "Seu Waldir Kessler", "Boteco de esquina de 1968 na avenida do parque; a mesa de sinuca é a mais disputada do bairro.",
  "Polar, Brahma, cachaça, xis e café; sinuca a Cz$ 20 a partida.", "Bar com mesa de sinuca no meio, balcão de fórmica, ventilador e a TV no jogo.",
  ["[[Grêmio Foot-Ball Porto Alegrense]] — o dono é tricolor", "[[Brigada Militar Metropolitana]] — a ronda para pra ver o jogo"], "Uma aposta de sinuca terminou em briga; a mesa ganhou pano novo.", BOTECO + [L("Brahma Chopp"), L("Xis")]),
 ("Jardim Botânico", "Mercadinho do Jardim", "Jardim Botânico", "Dona Iolanda Fraga", "Mercadinho de bairro de 1975 com a cota Zaffari e o isopor de Kibon na porta.",
  "Cesta, água, refrigerante, salgadinho, chá mate, sorvete e bala; entrega de bicicleta pros prédios.", "Loja pequena com gôndola, freezer de Kibon na porta e um menino de entrega.",
  ["[[Zaffari]] — cota e marca própria", "[[Resistência Urbana Gaúcha]] — cisterna no fundo"], "O freezer parou no apagão; a Dona Iolanda vendeu sorvete derretido de canudo.", ARMAZEM + [L("Elma Chips"), L("Chá Mate Leão"), L("Sorvete Kibon")]),
 # ── Jardim Itu (Boca de Bairro)
 ("Jardim Itu", "Oficina da Antiga Indústria", "Jardim Itu", "Seu Bento Flores", "Oficina num galpão desativado da Rua da Antiga Indústria; conserta e vende o que o operário consegue pagar.",
  "Fusca, Agrale, CG, Motomachine e Kombi de segunda mão; peça pirata do Cartel pela metade.", "Galpão industrial com portão de correr, motores empilhados, um Fusca no elevador e cheiro de solvente.",
  ["[[Cartel dos Eixos]] — peça pirata", "[[Fábrica Itú Química]] — o operário é a clientela"], "A Brigada apreendeu um lote de peça pirata; o Seu Bento reabriu no dia seguinte.",
  [L("Volkswagen Fusca"), L("Agrale 27.5"), L("Honda CG 125", "usado"), L("Gurgel Motomachine", "usado"), L("Volkswagen Kombi", "usado"), L("Fiat 147")]),
 ("Jardim Itu", "Vila da Itú Química", "Jardim Itu", "Dr. Cláudio Werlang (gerente da fábrica)", "Vila operária atrás do galpão da Itú Química; casa geminada com desconto em folha e cheiro de éter.",
  "Casa na vila pra quem tem carteira na fábrica; água e luz da fábrica, laudo mensal obrigatório.", "Fileira de casas geminadas de reboco cinza, roupa no varal, chaminé da fábrica atrás.",
  ["[[Fábrica Itú Química]] — dona da vila", "[[Sindicato dos Metalúrgicos]] — panfleta na entrada"], "Uma família foi despejada no dia em que o laudo do pai deu positivo.", [L("Vaga na Vila da Itú Química")]),
 ("Jardim Itu", "Armazém do Itu", "Jardim Itu", "Seu Tadeu Borges", "Armazém de fundo de quintal no Jardim Itu; a cesta chega de Kombi e o fiado é anotado a lápis.",
  "Cesta, marmita congelada, refrigerante, mate gelado, bolacha e água; ração PIRA vencida por baixo.", "Garagem virada em armazém, prateleira de caixote, freezer de marmita e um caderno pendurado.",
  ["[[Zaffari]] — cota", "[[Clã da Ferrugem]] — gato de luz do freezer"], "O freezer queimou no apagão e as marmitas foram vendidas pela metade no mesmo dia.", ARMAZEM + [L("Marmita Congelada Zaffari"), L("Mate Gelado Charrua"), L("Ração PIRA")]),
 ("Jardim Itu", "Padaria do Itu", "Jardim Itu", "Dona Cecília Pinto", "Padaria de bairro na rua da fábrica; abre às cinco pro turno e fecha quando o pão acaba.",
  "Cacetinho, café e bolo de fubá; pão dormido de graça pra quem varre a frente.", "Casinha com balcão na janela, forno de tijolo e fila de operário de capacete.",
  ["[[Fábrica Itú Química]] — o turno", "[[Resistência Urbana Gaúcha]] — sopa de terça"], "A padaria começou a vender pão pela metade depois das nove; a fila mudou de horário.", [L("Café da Manhã de Padaria"), L("Café Passado"), L("Bolo de Padaria")]),
 ("Jardim Itu", "Boteco do Químico", "Jardim Itu", "Seu Doca Ferreira", "Boteco na saída da fábrica; o operário toma a cachaça do turno e o químico do clube desce pra fingir que é povo.",
  "Cachaça, Polar, churrasquinho e café; fiado até o dia do vale.", "Balcão de zinco, luz de lâmpada nua, cadeira de ferro e o cheiro de éter que vem da fábrica.",
  ["[[Fábrica Itú Química]] — a clientela", "[[Clube dos Químicos]] — o técnico que desce"], "Um químico do clube pagou a rodada inteira e foi visto conversando com o Sindicato.", BOTECO),
 # ── Moinhos de Vento (Centro ×1,5)
 ("Moinhos de Vento", "Revenda Moinhos", "Moinhos de Vento", "Sr. Lauro Bins", "Revenda multimarcas de luxo na Padre Chagas; Monza, Del Rey, Opala e o X-12 da Gurgel com acabamento de diretoria.",
  "Sedãs de executivo e o anfíbio da Gurgel, novos e de leilão de frota; entrega com placa e seguro da Gradiente.", "Salão envidraçado com carpete, café de cortesia, vendedor de terno e um X-12 preto na vitrine.",
  ["[[Gradiente]] — seguro e segurança", "[[Gurgel]] — o X-12 com couro"], "Um Monza do leilão da Gradiente foi vendido com o rádio da empresa ainda instalado.",
  [L("Chevrolet Monza"), L("Ford Del Rey"), L("Chevrolet Opala Diplomata"), L("Gurgel X-12 Anfíbio"), L("Honda CB 450"), L("Chevrolet Monza", "usado")]),
 ("Moinhos de Vento", "Café da Padre Chagas", "Moinhos de Vento", "Madame Lisette Dumont", "Café de calçada na Padre Chagas, aberto em 1980 por uma francesa de passagem que ficou.",
  "Café, empada, chocolate, Coca de lata e cueca virada com nome francês; a conta vem em bandeja de prata.", "Mesas de ferro na calçada, toldo listrado, garçom de avental longo e um segurança discreto.",
  ["[[Gradiente]] — segurança da rua", "[[Embratel]] — telefone na mesa do fundo"], "A Madame recusou servir um brigadiano de farda; a Brigada agora vem à paisana.", [L("Café Passado"), L("Empada de Padaria"), L("Chocolate Neugebauer"), L("Coca-Cola"), L("Cueca Virada"), L("Café da Manhã de Padaria")]),
 ("Moinhos de Vento", "Adega Moinhos", "Moinhos de Vento", "Seu Ítalo Bertoldi", "Adega de vinho e bebida importada na Padre Chagas; o rótulo 'reserva' nasce aqui.",
  "Vinho Aurora com rótulo de reserva, Brahma, água mineral e uísque de contrabando com selo colado; entrega em casa.", "Loja de madeira escura com garrafas até o teto, balcão de degustação e um menino de entrega.",
  ["[[Clube dos Sete Portos]] — o uísque", "[[Gradiente]] — a segurança"], "Um lote de uísque com selo falso saiu daqui pro Plaza; a adega diz que o selo é verdadeiro.", [L("Vinho Aurora"), L("Brahma Chopp"), L("Água Mineral em Galão"), L("Uísque de Contrabando"), L("Coca-Cola"), L("Doce de Leite Colonial")]),
 ("Moinhos de Vento", "Ponto de Táxi dos Moinhos", "Moinhos de Vento", "Seu Antônio Gomes (chefe do ponto)", "Ponto de táxi na esquina do Parcão; Carajás com ar-condicionado e motorista que não fala.",
  "Táxi Gurgel executivo; tarifa dos Moinhos, sem meter conversa.", "Baia coberta com quatro táxis encerados e um telefone direto com os prédios.",
  ["[[Gradiente]] — convênio dos prédios", "[[Gurgel]] — frota"], "Um taxista levou um diretor pra Restinga e voltou sem o carro.", TAXI),
 # ── Nova Sarandi (Boca de Bairro)
 ("Nova Sarandi", "Garagem da Ferroviária", "Nova Sarandi", "Seu Juarez Bitencourt", "Garagem de usados ao lado do pátio de manobras; vende o veículo de trabalho da periferia.",
  "Kombi, Fusca, caminhão 1113 usado, CG e Agrale; troca por serviço de frete.", "Pátio de brita com caminhões e Kombis, guincho, um cão preso e o barulho do trem.",
  ["[[Ferroviária Nacional]] — o pátio é vizinho", "[[Cartel dos Eixos]] — o 1113 veio de lá"], "Um 1113 vendido aqui foi flagrado com carro roubado na caçamba; a garagem 'não sabia'.",
  [L("Volkswagen Kombi", "usado"), L("Volkswagen Fusca"), L("Mercedes-Benz 1113", "usado"), L("Honda CG 125", "usado"), L("Agrale 27.5", "usado"), L("Volkswagen Brasília")]),
 ("Nova Sarandi", "Cantina da Fábrica", "Nova Sarandi", "Dona Ilse Brand", "Cantina da rua das fábricas; serve o turno da Tramontina e da Marcopolo com marmita, mate e café.",
  "Marmita congelada, ração PIRA em crédito, mate gelado e café; PF ao meio-dia pra quem paga em espécie.", "Salão de mesa comprida, balcão de alumínio, caldeirão de sopa e a fila de macacão.",
  ["[[Tramontina]] e [[Marcopolo]] — o crédito PIRA vale aqui", "[[Sindicato dos Metalúrgicos]] — reunião no fundo"], "O Sindicato usou o fundo da cantina pra uma assembleia; a Brigada chegou atrasada.", [L("Marmita Congelada Zaffari"), L("Ração PIRA"), L("Mate Gelado Charrua"), L("Café Passado"), L("Prato Feito da Cantina do Mercado")]),
 ("Nova Sarandi", "Boteco do Apito", "Nova Sarandi", "Seu Piá Rodrigues", "Boteco na frente da portaria da Tramontina; abre no apito das cinco e fecha no das dezoito.",
  "Cachaça antes do turno, Polar depois, churrasquinho e café; fiado até o vale.", "Balcão de tábua, banco de ferro, um rádio e a portaria da fábrica do outro lado da rua.",
  ["[[Tramontina]] — a clientela", "[[Brigada Militar Metropolitana]] — a ronda do turno"], "A portaria proibiu entrar bêbado; o Seu Piá passou a vender café mais forte.", BOTECO),
 ("Nova Sarandi", "Padaria da Sarandi", "Nova Sarandi", "Seu Osmar Kunz", "Padaria de esquina de 1965 na Rua da Sarandi; o pão do turno sai às quatro.",
  "Cacetinho, café e bolo; pão dormido pela metade depois das nove.", "Forno a lenha, balcão de madeira, fila de macacão às quatro e meia.",
  ["[[Tramontina]] — o turno", "[[Zaffari]] — farinha"], "O forno parou no apagão; a padaria vendeu bolacha Isabela no lugar do pão.", [L("Café da Manhã de Padaria"), L("Café Passado"), L("Bolo de Padaria")]),
 # ── Passo D'Areia (Rua de Comércio)
 ("Passo D'Areia", "Moto Center Assis Brasil", "Passo D'Areia", "Seu Wilson Prates", "Loja de motos na Assis Brasil desde 1978; vende a CG do entregador e a RD do racha.",
  "CG 125, RD 135, CB 450, Agrale e Mobilete, novas e usadas; capacete de brinde e financiamento em doze vezes.", "Loja de vidro com motos em fila, cheiro de óleo dois tempos e um mecânico na calçada.",
  ["[[Brigada Militar Metropolitana]] — apreende RD envenenada e a loja revende", "[[Ordem dos Subsolos]] — a molecada do racha"], "Uma RD apreendida no racha voltou pra vitrine em uma semana.",
  [L("Honda CG 125"), L("Yamaha RD 135"), L("Honda CB 450"), L("Agrale 27.5"), L("Mobilete Caloi"), L("Honda CG 125", "usado"), L("Yamaha RD 135", "usado")]),
 ("Passo D'Areia", "Lancheria do Passo", "Passo D'Areia", "Seu Adair Bastos", "Lancheria embaixo da via do Aeromóvel; o xis sai prensado quando o vagão passa.",
  "Xis, refrigerante da caçulinha, Polar e café; o trem treme a chapa a cada seis minutos.", "Balcão de fórmica debaixo do viaduto, banquetas, vitrine de pastel e o vagão passando em cima.",
  ["[[Companhia Estadual de Energia Elétrica|CEEE]] — a luz do viaduto", "[[Brigada Militar Metropolitana]] — a ronda da plataforma"], "A lancheria vendeu xis pra Brigada de graça durante uma operação; agora tem fila de farda.", LANCHERIA),
 ("Passo D'Areia", "Banca do Aeromóvel", "Passo D'Areia", "Seu Darci Nunes (jornaleiro)", "Banca de jornal na entrada da estação do Aeromóvel; vende o que se come na plataforma.",
  "Mate gelado, salgadinho, chiclete, chocolate e chá mate; jornal censurado e o outro por baixo.", "Banca de ferro com isopor, revistas presas com prendedor e a fila da catraca do lado.",
  ["[[Embratel]] — o jornal censurado", "[[Resistência Urbana Gaúcha]] — o jornalzinho por baixo"], "A Brigada levou o jornaleiro por um dia; a banca reabriu vendendo só chiclete.", BANCA),
 ("Passo D'Areia", "Boteco Embaixo da Via", "Passo D'Areia", "Seu Neca Vargas", "Boteco de trabalhador embaixo do viaduto do Aeromóvel; a Polar é gelada e o vagão é o relógio.",
  "Polar, cachaça, churrasquinho e café; brigadiano da plataforma bebe de graça.", "Mesa de plástico debaixo do concreto, balcão de zinco, isopor e o vagão em cima.",
  ["[[Brigada Militar Metropolitana]] — plataforma em cima", "[[Camisa 12]] — o bairro é colorado"], "Um vagão parou em cima do boteco por uma hora; o Seu Neca vendeu tudo.", BOTECO),
 ("Passo D'Areia", "Padaria Nogueiras", "Passo D'Areia", "Dona Nelci Schmitt", "Padaria de esquina na Praça das Nogueiras desde 1971; o pão da kitnet do Aeromóvel.",
  "Café da manhã, empada, bolo e cueca virada; entrega nos condomínios do Aeromóvel.", "Vitrine com cuca, mesa na praça, um menino de bicicleta com cesto de pão.",
  ["[[Praça das Nogueiras]] — a clientela", "[[Zaffari]] — farinha"], "A padaria passou a entregar nos condomínios; a portaria cobra Cz$ 10 por entrega.", PADARIA),
 # ── Petrópolis (Centro ×1,5)
 ("Petrópolis", "Auto Petrópolis", "Petrópolis", "Sr. Getúlio Rech", "Revenda de carros de Petrópolis desde 1975; o Chevette do sargento e o Monza do engenheiro saem daqui.",
  "Chevette, Del Rey, Monza e Kombi novos; Opala e Chevette de segunda mão com documento; financiamento em folha de megacorp.", "Pátio de vitrine com bandeirolas, escritório de vidro, um vendedor de gravata e o cheiro de carro novo.",
  ["[[Tramontina]] — financia em folha", "[[Gradiente]] — seguro"], "Um Monza saiu pra um engenheiro da Tramontina e voltou no leilão da empresa três meses depois.",
  [L("Chevrolet Chevette"), L("Ford Del Rey"), L("Chevrolet Monza"), L("Volkswagen Kombi"), L("Chevrolet Opala Diplomata", "usado"), L("Chevrolet Chevette", "usado")]),
 ("Petrópolis", "Padaria de Petrópolis", "Petrópolis", "Frau Ingrid Kretzer", "Padaria alemã de 1949 na Bento; a cuca de banana da Frau Ingrid tem fila de coronel.",
  "Café da manhã completo, empada, bolo, cueca virada e cuca; entrega em casa nas ruas de casario.", "Vitrine de vidro com cuca, mesa de madeira, cheiro de canela e uma Kombi de entrega.",
  ["[[Tramontina]] — a família do engenheiro", "[[Zaffari]] — farinha sem cota"], "A Frau Ingrid recusou o cartão Zaffari; vende só em cruzado.", PADARIA),
 ("Petrópolis", "Boteco da Bento", "Petrópolis", "Seu Norberto Lima", "Boteco de esquina na Bento Gonçalves desde 1960; o sargento e o engenheiro dividem o balcão.",
  "Polar, Coca, vinho da serra, cachaça e café; Brahma pra quem pede.", "Balcão de mármore gasto, prateleira de vinho, ventilador e o jornal do dia preso no balcão.",
  ["[[Brigada Militar Metropolitana]] — o sargento", "[[Tramontina]] — o engenheiro"], "Um engenheiro e um sargento brigaram por causa do Gre-Nal; o Seu Norberto separou com a vassoura.", BOTECO + [L("Coca-Cola"), L("Vinho Aurora"), L("Brahma Chopp")]),
 ("Petrópolis", "Armazém Petrópolis", "Petrópolis", "Seu Waldemar Krebs", "Armazém de secos e molhados de 1958 na Bento; vende o que o Zaffari não vende mais.",
  "Cesta, água, chocolate Neugebauer, Coca, vinho, doce de leite e bala; fiado pro casario.", "Loja de madeira com balcão de mármore, prateleira até o teto, balança de prato e um gato.",
  ["[[Zaffari]] — a cota", "[[Tramontina]] — o casario é a clientela"], "O armazém passou a vender corte especial por baixo; o Zaffari mandou o fiscal.", ARMAZEM + [L("Chocolate Neugebauer"), L("Coca-Cola"), L("Vinho Aurora"), L("Doce de Leite Colonial")]),
 ("Petrópolis", "Ponto de Táxi da Bento", "Petrópolis", "Seu Ari Machado (chefe do ponto)", "Ponto de táxi na Bento Gonçalves em frente à galeteria; os Carajás cheiram a galeto.",
  "Táxi Gurgel na fila do meio-dia às onze da noite; tarifa de Petrópolis, sem surpresa.", "Cinco táxis na fila da calçada, guarita de madeira e um cartaz de tarifa.",
  ["[[Gurgel]] — frota", "[[Embratel]] — rádio do ponto"], "Um taxista virou informante depois de levar um sargento todo dia; o ponto sabe.", TAXI),
 # ── Praia de Belas (Rua de Comércio)
 ("Praia de Belas", "Estaleiro do Cais", "Praia de Belas", "Seu Tibúrcio Anacleto", "Estaleiro de bote e lancha ao lado do Porto Novo; casco de alumínio novo e lancha de leilão da Brigada.",
  "Bote de alumínio com motor, barco de pesca e lancha de fibra usada; conserta casco e vende motor de popa contrabandeado.", "Galpão de zinco na beira da água, rampa de concreto, botes virados e cheiro de resina.",
  ["[[Clube dos Sete Portos]] — o motor de popa", "[[Brigada Militar Metropolitana]] — o leilão"], "Uma lancha do leilão saiu com o rádio da Brigada ainda instalado.",
  [L("Bote de Alumínio com Motor"), L("Barco de Pesca de Madeira"), L("Lancha de Fibra", "usado"), L("Bote de Alumínio com Motor", "usado")]),
 ("Praia de Belas", "Garagem do Estivador", "Praia de Belas", "Seu Chico Frete", "Garagem de frete e usados no cais; Kombi e caminhão que carregam o porto de dia e o Cartel de noite.",
  "Kombi, Fusca e 1113 de segunda mão; frete com o caminhão por diária.", "Pátio de paralelepípedo com caminhão, Kombi e um guincho velho; escritório de contêiner.",
  ["[[Cartel dos Eixos]] — frete de noite", "[[Zaffari]] — frete de dia"], "O 1113 da garagem foi flagrado na balsa com carga de sucata sem nota.",
  [L("Volkswagen Kombi", "usado"), L("Volkswagen Fusca"), L("Mercedes-Benz 1113", "usado"), L("Volkswagen Kombi")]),
 ("Praia de Belas", "Pensão do Cais", "Praia de Belas", "Dona Neusa Amaral", "Pensão de estivador e marinheiro de balsa em frente ao Porto Novo; janta às sete e chave de verdade.",
  "Quarto de solteiro ou duplo por mês; janta, roupa lavada e recado anotado.", "Sobrado de tijolo aparente com janela pro cais, escada de madeira e cheiro de maresia e sopa.",
  ["[[Zaffari]] — os marinheiros da balsa", "[[Brigada Militar Metropolitana]] — confere o livro na terça"], "Um hóspede chegou de barco sem documento; a Dona Neusa deu o quarto e não anotou.", [L("Vaga na Pensão do Cais")]),
 ("Praia de Belas", "Barraca do Cais", "Praia de Belas", "Seu Bagé Medeiros", "Barraca de churrasquinho no cais desde 1975; a fumaça se sente do estádio.",
  "Churrasquinho, Polar e cachaça; em dia de jogo, o dobro e a taxa do Consórcio.", "Barraca de lona com a marca do Zaffari, grelha de tambor, isopor e banco de tábua.",
  ["[[Consórcio das Bandeiras]] — pedágio em dia de jogo", "[[Zaffari]] — a lona"], "O Consórcio dobrou a taxa da barraca; o Seu Bagé diminuiu o espeto.", [L("Churrasquinho de Barraca"), L("Polar Tradicional"), L("Cachaça de Boteco"), L("Café Passado")]),
 ("Praia de Belas", "Padaria da Belas", "Praia de Belas", "Seu Genésio Fontana", "Padaria de esquina de 1962 entre o cais e o estádio; o pão do estivador e o cacetinho do torcedor.",
  "Cacetinho, café e bolo; pão com mortadela em dia de jogo.", "Fachada descascada, vitrine de pão, forno a lenha nos fundos e o cheiro de maresia.",
  ["[[Sport Club Internacional]] — dia de jogo", "[[Zaffari]] — farinha"], "A padaria vendeu 2.000 cacetinhos num Gre-Nal; a farinha acabou na segunda.", [L("Café da Manhã de Padaria"), L("Café Passado"), L("Bolo de Padaria"), L("Sanduíche de Mortadela do Mercado")]),
 ("Praia de Belas", "Armazém do Porto", "Praia de Belas", "Dona Zenaide Farias", "Armazém de secos e molhados no cais; a cesta chega de balsa e o dólar de marinheiro.",
  "Cesta, água, refrigerante, bolacha e mate gelado; aceita dólar de estivador.", "Loja de porta de ferro, prateleira de caixote, balança de prato e um marinheiro comprando bala.",
  ["[[Zaffari]] — a balsa traz a cota", "[[Clube dos Sete Portos]] — o dólar"], "Um lote de bolacha veio de contêiner sem nota; o armazém vendeu pela metade.", ARMAZEM + [L("Mate Gelado Charrua")]),
 # ── Quarto Distrito (Rua de Comércio)
 ("Quarto Distrito", "Garagem dos Rachas", "Quarto Distrito", "Beto Racha", "Garagem num galpão da Voluntários onde a molecada envenena Motomachine e RD pra correr de madrugada.",
  "Motomachine, RD 135, Fusca envenenado e CG de segunda mão; escape aberto e motor mexido, sem documento.", "Galpão com portão de correr, motos na fila, um Fusca rebaixado e som alto.",
  ["[[Ordem dos Subsolos]] — aposta do racha", "[[Brigada Militar Metropolitana]] — apreensão semanal"], "A Brigada apreendeu quatro motos numa noite; a garagem revendeu duas no fim de semana.",
  [L("Gurgel Motomachine", "usado"), L("Yamaha RD 135", "usado"), L("Volkswagen Fusca"), L("Honda CG 125", "usado"), L("Gurgel Motomachine")]),
 ("Quarto Distrito", "Boteco do Quarto", "Quarto Distrito", "Seu Lindomar Teixeira", "Boteco na Voluntários da Pátria de 1966; artista, punk e operário no mesmo balcão.",
  "Polar, cachaça, xis e café; a mesa do fundo é da banda.", "Balcão comprido, cartaz de show colado, luz vermelha e o som do ensaio do lado.",
  ["[[Ordem dos Subsolos]] — a mesa do fundo", "[[Teatro Quarto Distrito]] — a clientela"], "A Brigada levou a mesa do fundo inteira depois de um show; o Seu Lindomar comprou outra.", BOTECO + [L("Xis")]),
 ("Quarto Distrito", "Armazém do Distrito", "Quarto Distrito", "Dona Nadir Cardoso", "Armazém de esquina do bairro fabril; vende a cesta e o chiclete da molecada do racha.",
  "Cesta, água, refrigerante, salgadinho, bolacha e bala; fiado anotado.", "Loja de porta dupla, prateleira de madeira, freezer de refrigerante e um rádio na pirata.",
  ["[[Resistência Urbana Gaúcha]] — a rádio pirata", "[[Zaffari]] — cota"], "O rádio da Dona Nadir tocou a pirata na hora da ronda; ela disse que era interferência.", ARMAZEM + [L("Elma Chips")]),
 ("Quarto Distrito", "Padaria Navegantes", "Quarto Distrito", "Seu Reinaldo Voigt", "Padaria de 1957 ao lado da fábrica da Neugebauer; o pão sai com cheiro de cacau.",
  "Cacetinho, café, empada, bolo e cueca virada; o chocolate da fábrica vizinha na vitrine.", "Vitrine de vidro com cuca, balcão de madeira, o cheiro de cacau da chaminé do lado.",
  ["Neugebauer — a vizinha", "[[Zaffari]] — farinha"], "A Neugebauer passou a vender o tablete quebrado pra padaria; a vitrine tem chocolate a Cz$ 20.", PADARIA + [L("Chocolate Neugebauer")]),
 # ── Restinga (Boca de Bairro, dólar)
 ("Restinga", "Estaleiro da Restinga", "Restinga", "Seu Zeca Pescador", "Estaleiro de carpinteiro do Movimento Restinga Livre; faz barco de madeira reaproveitada e vende em dólar.",
  "Barco de pesca de madeira novo, bote de alumínio usado; conserto de casco por peixe.", "Rampa de tábua, barcos virados, serrote e breu, uma bandeira do Movimento na estaca.",
  ["[[Movimento Restinga Livre]] — dono", "[[Sindicato dos Pescadores]] — a clientela"], "A patrulha fluvial apreendeu dois barcos; o estaleiro fez mais dois na mesma semana.",
  [L("Barco de Pesca de Madeira"), L("Bote de Alumínio com Motor", "usado"), L("Barco de Pesca de Madeira", "usado")]),
 ("Restinga", "Armazém do Renato", "Restinga", "Dona Marta (pelo Movimento)", "Armazém do Movimento Restinga Livre no meio das palafitas de metal; tudo em dólar redondo.",
  "Cesta, água em galão, bolacha, refrigerante, mate gelado e cachaça; nada vale menos de um dólar, vende-se em lote.", "Contêiner cortado com balcão, prateleira de sucata, galões de água e um quadro com o câmbio do dia.",
  ["[[Movimento Restinga Livre]] — dono", "[[Clã da Ferrugem]] — o contêiner"], "O câmbio do quadro subiu duas vezes na mesma semana; a Dona Marta diz que é o mundo.", ARMAZEM + [L("Mate Gelado Charrua"), L("Cachaça de Boteco")]),
 ("Restinga", "Bar da Balsa", "Restinga", "Seu Osório Lemos", "Bar na chegada da balsa do Zaffari; o marinheiro desce e bebe antes de subir de novo.",
  "Polar, cachaça, churrasquinho, pescado frito e café; em dólar, em lote.", "Balcão de tábua sobre a água, grelha de tambor, bandeira do Movimento e a balsa encostando.",
  ["[[Movimento Restinga Livre]] — o pedágio", "[[Zaffari]] — a balsa traz a clientela"], "A balsa atrasou um dia inteiro; o bar vendeu todo o pescado.", BOTECO + [L("Pescado do Mercado Flutuante")]),
 ("Restinga", "Padaria da Restinga", "Restinga", "Dona Neiva Correa", "Padaria de forno de barro numa palafita de metal; o pão da Restinga é pago em dólar ou em peixe.",
  "Pão, café e bolo; dois cacetinhos por um dólar — sem troco.", "Palafita de chapa com forno de barro na varanda, cesto de pão e fila de pescador.",
  ["[[Movimento Restinga Livre]] — dono do terreno", "[[Resistência Urbana Gaúcha]] — farinha da cooperativa"], "A farinha da cooperativa chegou molhada; a padaria fez bolo a semana inteira.", [L("Café da Manhã de Padaria"), L("Café Passado"), L("Bolo de Padaria")]),
 # ── Zona Leste (Boca de Bairro)
 ("Zona Leste", "Oficina do Borracheiro", "Zona Leste", "João “Borracheiro” Dias", "Borracharia do Borracheiro, chefe da Camisa 12; remenda pneu de dia e vende usado de noite.",
  "Fusca, Brasília, CG, Mobilete, carroça com cavalo e bicicleta usada; pneu remendado na hora.", "Barracão de zinco com pilha de pneu, um Fusca no macaco, cavalo amarrado e a bandeira do Inter.",
  ["[[Camisa 12]] — o dono", "[[Cartel dos Eixos]] — o Fusca de origem duvidosa"], "O Borracheiro trocou um Fusca por um ingresso de camarote; a história correu a Zona Leste.",
  [L("Volkswagen Fusca"), L("Volkswagen Brasília"), L("Honda CG 125", "usado"), L("Mobilete Caloi", "usado"), L("Carroça com Cavalo", "usado"), L("Bicicleta Caloi 10", "usado"), L("Monark Barra Circular", "usado")]),
 ("Zona Leste", "Padaria da Vila", "Zona Leste", "Dona Terezinha Souza", "Padaria de forno a lenha na vila; o pão é o mesmo desde 1960 e o fiado também.",
  "Cacetinho, café, bolo e cueca virada; pão dormido de graça pra criança da vila.", "Casinha com balcão na porta, forno de tijolo no quintal, fila de chinelo às seis.",
  ["[[Camisa 12]] — a vila", "[[Resistência Urbana Gaúcha]] — cisterna"], "A Dona Terezinha vendeu pão fiado pra vila inteira no mês da greve; ninguém deve mais.", PADARIA),
 ("Zona Leste", "Xis da Zona Leste", "Zona Leste", "Seu Cacaio Lopes", "Lancheria de carrinho que virou loja; o xis mais barato da cidade, com ovo e sem pressa.",
  "Xis, refrigerante, Polar e café; em dia de jogo, o xis vai pra caravana.", "Loja de porta de ferro, chapa na frente, banquetas e um rádio no jogo.",
  ["[[Camisa 12]] — a caravana come aqui", "[[Fruki]] — a geladeira"], "O Cacaio fez 300 xis pra caravana do Gre-Nal e a chapa não apagou por dois dias.", LANCHERIA),
 # ── Zona Deserta (sem régua — escambo)
 ("Zona Deserta", "Barraca de Escambo", "Zona Deserta", "Seu Cipriano Ramos", "Barraca de lona no meio da sucata onde a Zona Deserta troca o que tem pelo que falta.",
  "Água, ração PIRA vencida, cachaça e bolacha; paga-se em sucata, dose ou favor — cruzado só se insistir.", "Lona esticada em quatro estacas, caixotes, galões e uma balança de sucata.",
  ["[[Clã da Ferrugem]] — o terreno", "[[Sindicato dos Catadores]] — a clientela"], "A barraca trocou um galão de água por um motor de Fusca; o motor virou lancha.", [L("Água Mineral em Galão"), L("Ração PIRA"), L("Cachaça de Boteco"), L("Cream Cracker Isabela"), L("Café Passado")]),
 ("Zona Deserta", "Curral do Sindicato", "Zona Deserta", "Waldemar “Papeleiro” Nunes", "Curral do Sindicato dos Catadores: as carroças, os cavalos e as bicicletas que recolhem a cidade.",
  "Carroça com cavalo nova ou usada, mobilete e bicicleta recuperadas da sucata; paga-se em sucata.", "Cercado de arame com cavalos magros, carroças em fila, montanha de papelão e um galpão de chapa.",
  ["[[Sindicato dos Catadores]] — dono", "[[Clã da Ferrugem]] — a sucata"], "O Sindicato recuperou quatro bicicletas roubadas e devolveu duas; as outras viraram carroça.",
  [L("Carroça com Cavalo"), L("Carroça com Cavalo", "usado"), L("Mobilete Caloi", "usado"), L("Bicicleta Caloi 10", "usado"), L("Monark Barra Circular", "usado")]),
 ("Zona Deserta", "Barraco de Aluguel do Clã", "Zona Deserta", "Maria “Ferrugem” Souza (pelo Clã)", "Fileira de barracos de chapa que o Clã da Ferrugem aluga pra quem chega na Zona Deserta sem nada.",
  "Barraco de chapa e lona por mês, ou 'posse' com a bênção do Clã; sem água, sem luz, sem endereço.", "Barracos de contêiner cortado em fila, lona azul, fio de gato e o Delta no horizonte.",
  ["[[Clã da Ferrugem]] — dono", "[[Sindicato dos Catadores]] — os vizinhos"], "O Clã despejou um barraco por dívida e alugou pra outro no mesmo dia.", [L("Barraco de Sucata")]),

 ("Costa e Silva", "Ponto de Táxi do Quartel", "Costa e Silva", "Seu Ademir Rosa (chefe do ponto)", "Ponto de táxi em frente ao QG; os Carajás levam oficial de folga e viúva de sargento.",
  "Táxi Gurgel na fila do portão do quartel; tarifa oficial e motorista que não conversa.", "Três táxis na sombra do muro do QG, guarita de madeira, um soldado na esquina.",
  ["[[Quartel-General do Exército]] — a clientela", "[[Gurgel]] — frota"], "Um taxista levou um oficial pra Restinga e foi interrogado na volta.", TAXI),
 ("Jardim Botânico", "Ponto de Táxi do Parque", "Jardim Botânico", "Seu Lauro Vieira (chefe do ponto)", "Ponto de táxi na entrada do parque, na frente da Biblioteca Verde.",
  "Táxi Gurgel de dia; à noite só com telefonema pro ponto.", "Dois táxis debaixo das árvores, guarita com telefone e um jornal aberto no capô.",
  ["[[Gurgel]] — frota", "[[Biblioteca Verde]] — a clientela da tarde"], "O ponto perdeu um táxi pra Brigada por 'transporte de subversivo'; era um professor.", TAXI),
 ("Jardim Itu", "Ponto da Kombi do Itu", "Jardim Itu", "Cooperativa dos Kombeiros (Seu Elói)", "Ponto de Kombi-lotação na saída da fábrica; sai quando enche, para onde gritam.",
  "Lotação clandestina de Kombi pro Centro e pra Nova Sarandi; Cz$ 80 na mão, o dobro depois do toque.", "Três Kombis encostadas na calçada, um homem gritando o destino e a fila de macacão.",
  ["[[Brigada Militar Metropolitana]] — a propina semanal", "[[Fábrica Itú Química]] — a clientela"], "A Brigada apreendeu uma Kombi cheia e deixou doze pessoas na rua às onze da noite.", [L("Lotação Clandestina")]),
 ("Quarto Distrito", "Ponto da Kombi da Voluntários", "Quarto Distrito", "Cooperativa dos Kombeiros (Dona Alba)", "Ponto de Kombi-lotação na Voluntários da Pátria; a única linha que roda depois do toque.",
  "Lotação clandestina pro Centro e pro Passo D'Areia; Cz$ 80 de dia, Cz$ 160 de madrugada, saindo da rave.", "Kombis com farol apagado numa esquina escura, um cobrador de boné e a fila da rave.",
  ["[[Ordem dos Subsolos]] — cobra o ponto", "[[Brigada Militar Metropolitana]] — cobra a Kombi"], "Uma Kombi da madrugada foi parada com a rave inteira dentro; a Ordem pagou.", [L("Lotação Clandestina")]),
 ("Zona Deserta", "Ponto do Caminhão do Sindicato", "Zona Deserta", "Waldemar “Papeleiro” Nunes", "O ponto de saída do caminhão de coleta do Sindicato: às cinco e às cinco da tarde, leva quem ajudar a carregar.",
  "Carona na caçamba do caminhão de lixo, Cz$ 10 ou um favor; passa por qualquer barricada da cidade.", "Um Mercedes 1113 de caçamba aberta parado no meio da sucata, gente sentada em cima do papelão.",
  ["[[Sindicato dos Catadores]] — dono", "[[Clã da Ferrugem]] — o terreno"], "O caminhão levou um fugitivo da Brigada até a Restinga dentro do papelão; ninguém viu.", [L("Carona no Caminhão do Sindicato")]),
]
for pasta, nome, geo, dono, contexto, descricao, aparencia, infl, acont, servicos in NOVOS:
    poi(pasta, nome, geo, dono, contexto, descricao, aparencia, infl, acont, servicos)

# ───────────────────────────── EXISTENTES: Dono + ofertas novas ─────────────────────────────
DONOS = {
 "Bom Fim/Bar Ocidente": "Tonho Ocidente", "Bom Fim/Padaria Colonial do Bom Fim": "Seu Helmut Kruger", "Bom Fim/Restaurante Familiar do Bom Fim": "Dona Nina Zanetti",
 "Bom Fim/Farmácia Panvel da Independência": "[[Panvel]] (gerente Sr. Élcio Motta)", "Bom Fim/Pensão Farroupilha": "Dona Olga Wentz", "Bom Fim/Redenção": "ninguém — brique e barracas da [[Resistência Urbana Gaúcha]]",
 "Bom Fim/Independência": "ninguém — comércio da rua", "Jardim Botânico/Biblioteca Verde": "[[Prefeitura de Porto Alegre]]",
 "Centro Histórico/Mercado Público": "Associação dos Permissionários (presidente Seu Waldir Pacheco)", "Centro Histórico/Camelódromo": "comissão dos camelôs (Nego Dito)",
 "Centro Histórico/Locadora Gurgel da Rua da Praia": "[[Gurgel]] (gerente Sílvio Brandão)", "Centro Histórico/Imobiliária da Rua da Praia": "Dr. Otávio Lemos",
 "Centro Histórico/Hotel Rua da Praia": "Dona Cléa Marchesan", "Centro Histórico/Plaza São Rafael": "Plaza Hotéis (gerente Sr. Bernardes)", "Centro Histórico/Banca da Esquina Democrática": "Seu Nilo Espíndola (jornaleiro)",
 "Centro Histórico/Galeria do Rosário": "Chico do Cachorro-Quente (o carrinho)", "Centro Histórico/Galeria Malcom": "ninguém — coletivo da galeria", "Centro Histórico/Viaduto da Borges": "ninguém — camelôs do viaduto",
 "Centro Histórico/Duque de Caxias": "ninguém — botecos dos palacetes", "Centro Histórico/Salgado Filho": "ninguém — comércio da avenida",
 "Centro Histórico/Cidade Baixa/Trapiche da Aliança": "[[Aliança Livre das Palafitas]] (Seu Bagé, barqueiro-chefe)", "Centro Histórico/Cidade Baixa/Lancheria da Cidade Baixa": "Seu Valdomiro Assis",
 "Costa e Silva/Vila Militar do Paraguassu": "Exército (cantina do Sargento Nunes)",
 "Ipanema/Resort Nova Porto Alegre": "[[Gradiente]] e sócios", "Ipanema/Clube de Golfe de Ipanema": "diretoria do clube (presidente Dr. Ênio Sperb)", "Ipanema/Embarcadouro do Guaíba": "[[Gradiente]] (capitão do píer Seu Nelson)",
 "Jardim Itu/Clube dos Químicos": "diretoria do clube (Dr. Jairo Tessmann)", "Jardim Itu/Fábrica Itú Química": "[[Fábrica Itú Química]] (gerente Dr. Cláudio Werlang)", "Jardim Itu/Rua da Antiga Indústria": "ninguém — botecos e postos da rua",
 "Moinhos de Vento/Edifício Concorde": "condomínio (síndico Sr. Aristides)", "Moinhos de Vento/Padre Chagas": "ninguém — restaurantes da rua", "Moinhos de Vento/Parcão": "[[Prefeitura de Porto Alegre]] (eventos: [[Panvel]])",
 "Moinhos de Vento/Imobiliária Moinhos": "Dr. Fernando Marques", "Moinhos de Vento/Zaffari dos Moinhos": "[[Zaffari]] (gerente Sra. Denise)", "Moinhos de Vento/Churrascaria do Parcão": "Seu Osmar Boff",
 "Nova Sarandi/Depósito Zaffari": "[[Zaffari]] (chefe de pátio Seu Ramão)", "Nova Sarandi/Portaria da Tramontina": "[[Tramontina]] (chefe da portaria Sr. Adalberto)", "Nova Sarandi/Ferroviária Nacional": "Ferrovia Federal (chefe de pátio)", "Nova Sarandi/Rua da Sarandi": "ninguém — comércio da rua",
 "Passo D'Areia/Concessionária Gurgel": "[[Gurgel]] (gerente Dr. Ubirajara Ceccato)", "Passo D'Areia/Imobiliária Passo D'Areia": "Dona Cida Ramos", "Passo D'Areia/Posto Ipiranga da Assis Brasil": "Seu Pedrinho Ferrão",
 "Passo D'Areia/Zaffari do Passo D'Areia": "[[Zaffari]] (gerente Sr. Jorge)", "Passo D'Areia/Motel Assis Brasil": "Sr. Nelsinho (o Gerente)", "Passo D'Areia/Shopping Iguatemi": "administração do shopping", "Passo D'Areia/Praça das Nogueiras": "ninguém — carrinhos da praça",
 "Petrópolis/Imobiliária Petrópolis": "Dr. Aloísio Sanmartin", "Petrópolis/Galeteria de Petrópolis": "família Zanella (Seu Ângelo)", "Petrópolis/Parque Moinhos": "[[Tramontina]] (parque dos funcionários)", "Petrópolis/Rua das Indústrias": "ninguém — oficinas da rua", "Petrópolis/Sede da Tramontina": "[[Tramontina]]",
 "Praia de Belas/Boteco do Estivador": "Seu Manoel Estivador", "Praia de Belas/Estádio Beira-Rio": "[[Sport Club Internacional]]", "Praia de Belas/Estádio Olímpico Monumental": "[[Grêmio Foot-Ball Porto Alegrense]]",
 "Praia de Belas/Mercado de Frutos do Mar": "Sindicato dos Pescadores", "Praia de Belas/Porto Novo": "[[Zaffari]] (administração do porto)", "Praia de Belas/Estação Férrea de Belas": "Ferrovia Federal", "Praia de Belas/Usina do Gasômetro": "ninguém — ocupada",
 "Quarto Distrito/Velha Indústria": "ninguém — ocupada pelos artistas", "Quarto Distrito/Teatro Quarto Distrito": "coletivo do teatro", "Quarto Distrito/Farrapos": "[[Ordem dos Subsolos]]", "Quarto Distrito/Pensão sem Placa": "o Gordo",
 "Restinga/Mercado Flutuante": "[[Movimento Restinga Livre]] ([[Renato “Livre” Costa]])", "Restinga/Oficina de Sucata": "Seu Tião Sucata",
 "Zona Leste/Sede da Camisa 12": "[[Camisa 12]] ([[João “Borracheiro” Dias]])", "Zona Leste/Venda da Zona Leste": "Dona Nair Quadros",
 "Zona Deserta/Depósito de Sucata": "[[Clã da Ferrugem]] ([[Maria “Ferrugem” Souza]])",
}
MAIS_OFERTAS = {
 "Passo D'Areia/Concessionária Gurgel": [L("Gurgel XEF"), L("Gurgel BR-800"), L("Gurgel Tocantins")],
 "Centro Histórico/Camelódromo": [L("Gurgel XEF", "usado"), L("Volkswagen Fusca"), L("Honda CG 125", "usado"), L("Mobilete Caloi", "usado")],
 "Zona Deserta/Depósito de Sucata": [L("Volkswagen Fusca"), L("Volkswagen Kombi", "usado"), L("Fiat 147"), L("Carroça com Cavalo", "usado")],
 "Restinga/Oficina de Sucata": [L("Barco de Pesca de Madeira", "usado"), L("Bote de Alumínio com Motor", "usado"), L("Honda CG 125", "usado"), L("Carroça com Cavalo", "usado")],
 "Ipanema/Embarcadouro do Guaíba": [L("Lancha de Fibra"), L("Bote de Alumínio com Motor")],
 "Petrópolis/Rua das Indústrias": [L("Chevrolet Chevette", "usado"), L("Honda CG 125", "usado")],
 "Jardim Itu/Rua da Antiga Indústria": [L("Volkswagen Fusca"), L("Agrale 27.5", "usado")],
 "Centro Histórico/Cidade Baixa/Trapiche da Aliança": [L("Bote de Alumínio com Motor", "usado")],
 "Praia de Belas/Mercado de Frutos do Mar": [L("Barco de Pesca de Madeira", "usado")],
}
def patch_existente(rel, dono, extras):
    p = os.path.join(ATLAS, rel + ".md"); s = open(p, encoding="utf-8").read()
    if "\nDono:" not in s:
        s = s.replace("\nContexto: ", f"\nDono: {y(dono)}\nContexto: ", 1) if "\nContexto: " in s else s.replace("\nCompleto:", f"\nDono: {y(dono)}\nCompleto:", 1)
    else:
        s = re.sub(r"\nDono:[^\n]*", f"\nDono: {y(dono)}", s, count=1)
    if "**Dono:**" not in s:
        s = re.sub(r"(> ℹ️\*\*Descrição:\*\*[^\n]*\n)", r"\1> \n> 👤**Dono:** `= this.Dono`\n", s, count=1)
    if extras:
        m = re.search(r"\nServiços:[^\n]*\n((?:  [^\n]*\n)*)", s)
        if m and not re.search(r"\n  [^-\s][^\n]*:\n", m.group(0)):
            atuais = re.findall(r'  - "([^"]+)"', m.group(1))
            novos = [x for x in extras if x not in atuais]
            if novos:
                bloco = m.group(0).rstrip("\n") + "\n" + "".join(f'  - "{x}"\n' for x in novos)
                s = s.replace(m.group(0), bloco, 1)
    open(p, "w", encoding="utf-8").write(s)
for rel, dono in DONOS.items():
    patch_existente(rel, dono, MAIS_OFERTAS.get(rel, []))

# bairros: o comércio de rua virou estabelecimento — o mapa sai do FM do bairro
for p in glob.glob(os.path.join(ATLAS, "**", "*.md"), recursive=True):
    s = open(p, encoding="utf-8").read()
    m = re.search(r"\nServiços:\s*\n((?:  [A-ZÀ-Úa-zà-ú][^\n]*:\n(?:    - [^\n]*\n)*)+)", s)
    if m:
        s = s.replace(m.group(0), "\n", 1)
        s = re.sub(r"\n> \[!info\] Serviços\n> O que o comércio de rua do bairro vende[^\n]*\n> `= this\.Serviços`\n?", "\n", s)
        open(p, "w", encoding="utf-8").write(s.rstrip("\n") + "\n")

# ───────────────────────────── checagens ─────────────────────────────
names = {os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(ROOT, "**", "*.md"), recursive=True) if "/.obsidian/" not in p}
bad = {}
for p in escritos + [os.path.join(ATLAS, r + ".md") for r in DONOS]:
    for mm in re.finditer(r"\[\[([^\]|#]+)", open(p, encoding="utf-8").read()):
        t = mm.group(1)
        if t not in names and not t.endswith(".png"): bad.setdefault(t, set()).add(os.path.basename(p))
print("links sem nota:", {k: sorted(v)[:3] for k, v in bad.items()})
ofertados = set()
for p in glob.glob(os.path.join(ATLAS, "**", "*.md"), recursive=True):
    s = open(p, encoding="utf-8").read()
    m = re.search(r"\nServiços:[^\n]*\n((?:  [^\n]*\n)*)", s)
    if m:
        for x in re.findall(r'\[\[([^\]|]+)', m.group(1)): ofertados.add(x)
recursos = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob(os.path.join(BASE, "*", "*.md"))}
sem = [n for n, p in recursos.items() if n not in (T, M, A) and 'Tipo: "Estilo de Vida"' not in open(p, encoding="utf-8").read() and 'Tipo: "Passagem"' not in open(p, encoding="utf-8").read() and n not in ofertados]
print("recursos sem estabelecimento:", sorted(sem))
print("ofertas de nota inexistente:", sorted(x for x in ofertados if x not in recursos))
# cobertura por bairro: veículos · moradia · padaria/lancheria · boteco · armazém · táxi/barqueiro
TIPOS_SERV = {"veiculo": {"Veículo"}, "moradia": {"Aluguel", "Hotel"}, "padaria": {"Refeição"}, "boteco": {"Bebida"}, "armazem": {"Mantimento", "Refrigerante", "Salgado", "Guloseima"}, "transporte": {"Corrida", "Aluguel de Veículo"}}
tipo_de = {}
for n, p in recursos.items():
    mm = re.search(r'^Tipo: "([^"]+)"', open(p, encoding="utf-8").read(), re.M)
    if mm: tipo_de[n] = mm.group(1)
por_bairro = {}
for p in glob.glob(os.path.join(ATLAS, "**", "*.md"), recursive=True):
    s = open(p, encoding="utf-8").read()
    m = re.search(r"\nServiços:[^\n]*\n((?:  [^\n]*\n)*)", s)
    if not m: continue
    bairro = os.path.relpath(os.path.dirname(p), ATLAS).split("/")[0]
    cobre = por_bairro.setdefault(bairro, set())
    for x in re.findall(r'\[\[([^\]|]+)', m.group(1)):
        t = tipo_de.get(x)
        for k, ts in TIPOS_SERV.items():
            if t in ts: cobre.add(k)
for b, c in sorted(por_bairro.items()):
    falta = set(TIPOS_SERV) - c
    print(f"{b:20s} {'ok' if not falta else 'FALTA ' + ', '.join(sorted(falta))}")
print(len(recursos), "recursos;", len(escritos), "notas escritas")
