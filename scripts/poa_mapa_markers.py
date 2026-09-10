#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MARCADOR PRA CADA LUGAR DO ATLAS (2026-09-09) — 122 dos 226 lugares de
`Atlas/Porto Alegre` não tinham ponto no mapa: existiam na vault, mas não no
bloco ```leaflet``` de `Porto Alegre.md`. Este gerador dá um marcador a cada um.

DUAS COISAS SÃO DADO DA NOTA, não decisão do código:

  * o TIPO do marcador vive no FM `markerTag` (o campo que os bairros e o
    Mercado Público já usavam). Quem não tinha recebeu o seu aqui, UMA vez, e
    daqui pra frente a nota é a fonte: o bloco é derivado dela. Quem já tinha
    marcador teve o tipo do bloco copiado pro FM (backfill), então nada de
    duas verdades;
  * o BAIRRO vem do FM `Geolocalização` (subindo a cadeia), como no
    poa_mapa_bairros.

A POSIÇÃO é o que este script decide, e decide ancorada na geografia real:
cada lugar novo nasce ao lado do marcador que o nome dele aponta ("Café da
Padre Chagas" na Padre Chagas, "Ponto de Táxi da Redenção" na Redenção) — o
casamento é automático pelo nome, com a tabela `ANCORAS` cobrindo o que o nome
não diz mas Porto Alegre diz (a Rua da Praia é a Alfândega, a Bento é
Petrópolis, as palafitas são a Cidade Baixa). Sem âncora nenhuma, o lugar nasce
perto do marcador do próprio bairro. O ponto escolhido é sempre DENTRO da
região colorida do bairro (map de cor do poa_mapa_bairros) e a uma distância
mínima dos outros, numa espiral determinística — rodar de novo dá o mesmo mapa.

Uso:
    python3 scripts/poa_mapa_markers.py            # relatório
    python3 scripts/poa_mapa_markers.py --escrever # aplica
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import poa_mapa_bairros as pmb

LEAFLET_DATA = os.path.join(
    pmb.ROOT, ".obsidian", "plugins", "obsidian-leaflet-plugin", "data.json"
)

# px entre dois marcadores (45,6 m/px: 5 px ≈ 230 m — dá pra clicar em cada um)
SEPARACAO = 5
# raio inicial e passo da espiral em volta da âncora
RAIO_INICIAL, RAIO_PASSO = 5, 3
# ângulo de ouro: espalha bem sem alinhar
ANGULO = 137.508

# ───────────────────── TIPO de cada lugar sem marcador ─────────────────────
# Curadoria (2026-09-09). Vai pro FM `markerTag` da nota; o registro de glifos
# do app é map/leaflet-local.ts (Bar, Mercado, Parque, Industrial, Porto,
# Hotel, Hospital, Estação, Radioativo, Bairro; o resto cai no pino genérico).
TIPOS = {
    # Bom Fim
    "Bicicletaria do Alemão": "Industrial",
    "Farmácia Panvel da Independência": "Hospital",
    "Igreja Nosso Senhor do Bom Fim": "Ponto de Interesse",
    "Imobiliária Independência": "Ponto de Interesse",
    "Lancheria do Bom Fim": "Bar",
    "Ocidente": "Bar",
    "Padaria Colonial do Bom Fim": "Mercado",
    "Ponto de Táxi da Redenção": "Ponto de Interesse",
    "Restaurante Familiar do Bom Fim": "Bar",
    # Centro Histórico (e Cidade Baixa, que fica dentro dele)
    "Armazém da Palafita": "Mercado",
    "Banca da Esquina Democrática": "Mercado",
    "Bar do Zeca": "Bar",
    "Enfermaria das Palafitas": "Hospital",
    "Garagem Rua da Praia": "Industrial",
    "Hotel Rua da Praia": "Hotel",
    "Imobiliária da Rua da Praia": "Ponto de Interesse",
    "Locadora Gurgel da Rua da Praia": "Industrial",
    "Oficina do Cardã": "Industrial",
    "Padaria Central": "Mercado",
    "Padaria da Ponte": "Mercado",
    "Plaza São Rafael": "Hotel",
    "Ponto de Táxi da Alfândega": "Ponto de Interesse",
    # Costa e Silva
    "Armazém Costa e Silva": "Mercado",
    "Bar do Sargento": "Bar",
    "Oficina Paraguassu": "Industrial",
    "Padaria do Quartel": "Mercado",
    "Pensão da Vila Militar": "Hotel",
    "Ponto de Táxi do Quartel": "Ponto de Interesse",
    # Ipanema
    "Bar da Praia de Ipanema": "Bar",
    "Clube de Golfe de Ipanema": "Parque",
    "Clínica Ipanema": "Hospital",
    "Corretora Ipanema": "Ponto de Interesse",
    "Empório Ipanema": "Mercado",
    "Padaria Ipanema": "Mercado",
    "Ponto de Táxi de Ipanema": "Ponto de Interesse",
    "Revenda Ipanema Motors": "Industrial",
    # Jardim Botânico (com a vila)
    "Bar do Botânico": "Bar",
    "Biblioteca Verde": "Ponto de Interesse",
    "Bicicletaria Verde": "Industrial",
    "Estufa Histórica": "Parque",
    "Garagem do Jardim": "Industrial",
    "Hospedaria do Jardim": "Hotel",
    "Imobiliária Jardim": "Ponto de Interesse",
    "Lago Dilúvio": "Parque",
    "Mercadinho do Jardim": "Mercado",
    "Padaria do Jardim": "Mercado",
    "Pensão da Vila": "Hotel",
    "Ponto de Táxi do Parque": "Ponto de Interesse",
    "Posto Panvel do Jardim": "Hospital",
    "Veterinário da Vila": "Hospital",
    "Xis da Vila": "Bar",
    # Jardim Itu
    "Ambulatório da Itú Química": "Hospital",
    "Armazém do Itu": "Mercado",
    "Boteco do Químico": "Bar",
    "Clube dos Químicos": "Bar",
    "Oficina da Antiga Indústria": "Industrial",
    "Padaria do Itu": "Mercado",
    "Pensão do Itu": "Hotel",
    "Vila da Itú Química": "Industrial",
    # Moinhos de Vento
    "Adega Moinhos": "Mercado",
    "Café da Padre Chagas": "Bar",
    "Churrascaria do Parcão": "Bar",
    "Clínica Salgado": "Hospital",
    "Hotel Padre Chagas": "Hotel",
    "Imobiliária Moinhos": "Ponto de Interesse",
    "Ponto de Táxi dos Moinhos": "Ponto de Interesse",
    "Revenda Moinhos": "Industrial",
    "Zaffari dos Moinhos": "Mercado",
    # Nova Sarandi
    "Boteco do Apito": "Bar",
    "Cantina da Fábrica": "Bar",
    "Garagem da Ferroviária": "Industrial",
    "Padaria da Sarandi": "Mercado",
    "Pensão da Ferroviária": "Hotel",
    "Portaria da Tramontina": "Industrial",
    "Posto Panvel da Sarandi": "Hospital",
    # Passo D'Areia
    "Banca do Aeromóvel": "Mercado",
    "Clínica Ortopédica D'Areia": "Hospital",
    "Imobiliária Passo D'Areia": "Ponto de Interesse",
    "Lancheria do Passo": "Bar",
    "Moto Center Assis Brasil": "Industrial",
    "Padaria Nogueiras": "Mercado",
    "Zaffari do Passo D'Areia": "Mercado",
    # Petrópolis
    "Ambulatório da Tramontina": "Hospital",
    "Armazém Petrópolis": "Mercado",
    "Auto Petrópolis": "Industrial",
    "Boteco da Bento": "Bar",
    "Imobiliária Petrópolis": "Ponto de Interesse",
    "Padaria de Petrópolis": "Mercado",
    "Pensão da Bento": "Hotel",
    "Ponto de Táxi da Bento": "Ponto de Interesse",
    "Rua das Indústrias": "Industrial",
    # Praia de Belas (com o Porto Novo)
    "Armazém do Porto": "Mercado",
    "Barraca do Cais": "Mercado",
    "Boteco do Estivador": "Bar",
    "Enfermaria do Porto": "Hospital",
    "Estádio Olímpico Monumental": "Ponto de Interesse",
    "Garagem do Estivador": "Industrial",
    "Padaria da Belas": "Mercado",
    "Pensão do Cais": "Hotel",
    # Quarto Distrito
    "Armazém do Distrito": "Mercado",
    "Boteco do Quarto": "Bar",
    "Consultório da Farrapos": "Hospital",
    "Garagem dos Rachas": "Industrial",
    "Padaria Navegantes": "Mercado",
    "Pensão sem Placa": "Hotel",
    # Restinga
    "Armazém do Renato": "Mercado",
    "Bar da Estrada": "Bar",
    "Carpintaria da Restinga": "Industrial",
    "Curandeira da Restinga": "Hospital",
    "Padaria da Restinga": "Mercado",
    "Pousada da Estrada": "Hotel",
    "Torre de Vigilância Caseira": "Industrial",
    # Zona Deserta
    "Barraca de Escambo": "Mercado",
    "Barraca do Enfermeiro": "Hospital",
    "Barraco de Aluguel do Clã": "Hotel",
    "Base Fantasma": "Industrial",
    "Complexo de Testes Orion": "Industrial",
    "Curral do Sindicato": "Industrial",
    "Depósito de Sucata": "Industrial",
    # Fora de qualquer bairro: a água e o delta
    "Lago Guaíba": "Parque",
    "Lagoa do Pinheiro": "Parque",
    "Rua do Rato": "Ponto de Interesse",
}

# ─────────── ÂNCORA: o que o nome não diz, mas Porto Alegre diz ───────────
# Só o que o casamento por nome não resolve (ou resolve pior). Cada valor é o
# NOME de um marcador que já existe no bloco.
ANCORAS = {
    # Centro: a Rua da Praia é o eixo da Alfândega; a Esquina Democrática é a
    # Rua da Praia com a Borges
    "Garagem Rua da Praia": "Praça da Alfândega",
    "Hotel Rua da Praia": "Praça da Alfândega",
    "Imobiliária da Rua da Praia": "Praça da Alfândega",
    "Locadora Gurgel da Rua da Praia": "Praça da Alfândega",
    "Banca da Esquina Democrática": "Viaduto da Borges",
    "Bar do Zeca": "Duque de Caxias",
    "Plaza São Rafael": "Estação Central",
    # as palafitas e a ponte são a Cidade Baixa alagada
    "Armazém da Palafita": "Cidade Baixa",
    "Enfermaria das Palafitas": "Cidade Baixa",
    "Padaria da Ponte": "Estação Cidade Baixa",
    "Oficina do Cardã": "Lancheria da Cidade Baixa",
    # Bom Fim: a Igreja e a Lancheria são a Osvaldo Aranha, ao lado da Redenção
    "Igreja Nosso Senhor do Bom Fim": "Redenção",
    "Lancheria do Bom Fim": "Bar Ocidente",
    "Padaria Colonial do Bom Fim": "Bar Ocidente",
    "Bicicletaria do Alemão": "Bar Ocidente",
    "Restaurante Familiar do Bom Fim": "Pensão Farroupilha",
    # Moinhos
    "Clínica Salgado": "Padre Chagas",
    # Quarto Distrito: Navegantes e a Voluntários
    "Padaria Navegantes": "Farrapos",
    "Garagem dos Rachas": "Velha Indústria",
    "Pensão sem Placa": "Teatro Quarto Distrito",
    # Nova Sarandi: a fábrica é a Tramontina, no eixo da ferroviária
    "Portaria da Tramontina": "Ferroviária Nacional",
    "Cantina da Fábrica": "Ferroviária Nacional",
    "Boteco do Apito": "Ferroviária Nacional",
    # Passo D'Areia
    "Banca do Aeromóvel": "Estação Passo D'Areia",
    # Jardim Itu
    "Armazém do Itu": "Ponto da Kombi do Itu",
    "Padaria do Itu": "Ponto da Kombi do Itu",
    "Pensão do Itu": "Ponto da Kombi do Itu",
    "Boteco do Químico": "Fábrica Itú Química",
    "Clube dos Químicos": "Fábrica Itú Química",
    # Petrópolis: a Bento é o eixo do bairro
    "Boteco da Bento": "Galeteria de Petrópolis",
    "Pensão da Bento": "Galeteria de Petrópolis",
    "Ponto de Táxi da Bento": "Galeteria de Petrópolis",
    "Rua das Indústrias": "Sede da Tramontina",
    # Jardim Botânico: o parque e o arroio
    "Biblioteca Verde": "Estação Jardim Botânico",
    "Bicicletaria Verde": "Estação Jardim Botânico",
    "Estufa Histórica": "Estação Jardim Botânico",
    "Ponto de Táxi do Parque": "Estação Jardim Botânico",
    "Lago Dilúvio": "Campus Central da PUCRS",
    # Praia de Belas: o Olímpico não é vizinho do Beira-Rio (fica pro norte)
    "Estádio Olímpico Monumental": "Estação Praia de Belas",
    "Boteco do Estivador": "Estaleiro do Cais",
    "Garagem do Estivador": "Estaleiro do Cais",
    # Restinga: a estrada e o ferro-velho
    "Bar da Estrada": "Mercado da Restinga",
    "Pousada da Estrada": "Mercado da Restinga",
    "Armazém do Renato": "Mercado da Restinga",
    "Torre de Vigilância Caseira": "Oficina de Sucata",
    # Costa e Silva
    "Armazém Costa e Silva": "Rádio Farroupilha",
    "Bar do Sargento": "Vila Militar do Paraguassu",
    # Zona Deserta: o acampamento do Sindicato é o único ponto de encontro
    "Barraca de Escambo": "Ponto do Caminhão do Sindicato",
    "Barraca do Enfermeiro": "Ponto do Caminhão do Sindicato",
    "Barraco de Aluguel do Clã": "Ponto do Caminhão do Sindicato",
    "Depósito de Sucata": "Ponto do Caminhão do Sindicato",
    # o delta radioativo (sem região colorida: fica na água, ao norte)
    "Lagoa do Pinheiro": "Delta Radioativo",
    "Rua do Rato": "Delta Radioativo",
}

# Lugar sem bairro E sem âncora: posição escolhida à mão (lat, long do bloco).
# O Guaíba é a água a oeste da cidade — nenhum bairro o contém.
POSICOES_FIXAS = {"Lago Guaíba": (700.0, 130.0)}

# Ícone do plugin leaflet do Obsidian por tipo (o app tem o registro próprio em
# map/leaflet-local.ts; aqui é só pra vault mostrar o mesmo desenho).
ICONES_OBSIDIAN = {
    "Bairro": "city",
    "Bar": "glass-martini-alt",
    "Mercado": "shopping-basket",
    "Parque": "tree",
    "Industrial": "industry",
    "Porto": "anchor",
    "Hotel": "bed",
    "Radioativo": "radiation",
}

STOP = {"do", "da", "de", "dos", "das", "o", "a", "e", "no", "na", "os", "as", "em", "com"}


def palavras(nome):
    return [p for p in re.split(r"[^0-9A-Za-zÀ-ÿ]+", nome) if p and p.lower() not in STOP]


def notas_do_atlas():
    """basename → dict(caminho, geo, markerTag)."""
    out = {}
    for raiz, _dirs, arquivos in os.walk(pmb.ATLAS):
        for arq in sorted(arquivos):
            if not arq.endswith(".md"):
                continue
            caminho = os.path.join(raiz, arq)
            txt = open(caminho, encoding="utf-8").read()
            geo = re.search(r"^Geoloca[^:]*:\s*\"?\[\[([^\]|#]+)", txt, re.M)
            tag = re.search(r"^markerTag:\s*(.+?)\s*$", txt, re.M)
            out[arq[:-3]] = {
                "caminho": caminho,
                "geo": geo.group(1).strip() if geo else None,
                "tag": tag.group(1).strip() if tag else None,
            }
    return out


def gravar_marker_tag(caminho, tag):
    """Escreve `markerTag: X` no fim do frontmatter (ou troca o valor)."""
    texto = open(caminho, encoding="utf-8").read()
    if not texto.startswith("---\n"):
        return False
    fim = texto.find("\n---\n", 4)
    if fim < 0:
        return False
    fm = texto[4:fim]
    if re.search(r"^markerTag:", fm, re.M):
        novo_fm = re.sub(r"^markerTag:.*$", f"markerTag: {tag}", fm, count=1, flags=re.M)
    else:
        novo_fm = fm.rstrip("\n") + f"\nmarkerTag: {tag}"
    novo = "---\n" + novo_fm + texto[fim:]
    if novo == texto:
        return False
    open(caminho, "w", encoding="utf-8").write(novo)
    return True


def rodar(escrever=False):
    texto = open(pmb.POA_MD, encoding="utf-8").read()
    marcadores = pmb.ler_markers(texto)
    sementes = {m.nome: (m.lat, m.long) for m in marcadores if m.tipo == "Bairro"}
    regioes = pmb.Regioes(pmb.MAPA_PNG, sementes)
    geo = {n: (d["geo"], None) for n, d in notas_do_atlas().items()}
    notas = notas_do_atlas()
    # pasta como fallback do bairro (mesma regra do poa_mapa_bairros)
    geo = pmb.geolocalizacoes()
    porNome = {m.nome: m for m in marcadores}

    # 1. BACKFILL: quem já tem marcador leva o tipo do bloco pro FM
    backfill = []
    for m in marcadores:
        nota = notas.get(m.nome)
        if not nota or nota["tag"] == m.tipo:
            continue
        backfill.append((m.nome, nota["tag"], m.tipo))
        if escrever:
            gravar_marker_tag(nota["caminho"], m.tipo)

    # 2. quem NÃO tem marcador: tipo do TIPOS (ou o subtipo genérico da nota)
    novos = sorted(n for n in notas if n not in porNome and n != "Porto Alegre")
    sem_tipo = [n for n in novos if n not in TIPOS]

    # 3. âncora de cada novo
    def bairro_de(nome):
        return regioes.nomes and pmb.bairro_declarado(nome, geo, regioes)

    def ancora_automatica(nome, bairro):
        alvo = [p for p in palavras(nome) if len(p) >= 4]
        candidatos = [
            m for m in marcadores if m.nome != bairro and bairro_de(m.nome) == bairro
        ]
        for existente in candidatos:
            tk = {p.lower() for p in palavras(existente.nome)}
            for p in reversed(alvo):
                if p.lower() in tk:
                    return existente.nome
        return None

    ocupados = [(m.long, pmb.ALTURA - m.lat) for m in marcadores]
    postos, sem_lugar = [], []
    for nome in novos:
        if nome in POSICOES_FIXAS:
            lat, long = POSICOES_FIXAS[nome]
            postos.append((nome, TIPOS.get(nome, "Ponto de Interesse"), lat, long, "à mão"))
            ocupados.append((long, pmb.ALTURA - lat))
            continue
        bairro = bairro_de(nome)
        alvo_nome = ANCORAS.get(nome) or (ancora_automatica(nome, bairro) if bairro else None)
        alvo = porNome.get(alvo_nome) if alvo_nome else None
        if alvo is None and bairro:
            alvo = porNome.get(bairro)
            alvo_nome = bairro
        if alvo is None:
            sem_lugar.append(nome)
            continue
        ax, ay = alvo.long, pmb.ALTURA - alvo.lat
        escolhido = None
        for k in range(240):
            raio = RAIO_INICIAL + RAIO_PASSO * (k // 8)
            ang = math.radians(ANGULO * k)
            x = int(round(ax + raio * math.cos(ang)))
            y = int(round(ay + raio * math.sin(ang)))
            if bairro and not regioes.dentro(bairro, x, y):
                continue
            if not bairro and regioes.bairro_em(pmb.ALTURA - y, x) is not None:
                continue  # o que não é de bairro não invade bairro
            if any(abs(x - ox) < SEPARACAO and abs(y - oy) < SEPARACAO for ox, oy in ocupados):
                continue
            escolhido = (x, y)
            break
        if not escolhido:
            sem_lugar.append(nome)
            continue
        x, y = escolhido
        postos.append(
            (nome, TIPOS.get(nome, "Ponto de Interesse"), float(pmb.ALTURA - y), float(x), alvo_nome)
        )
        ocupados.append((x, y))

    print(f"marcadores no bloco: {len(marcadores)} · lugares sem marcador: {len(novos)}")
    conflitos = [(n, a, b) for n, a, b in backfill if a is not None]
    print(f"backfill de markerTag (do bloco pro FM): {len(backfill)}")
    if conflitos:
        # o BLOCO ganha: o tipo desenhado no mapa é a escolha mais recente do
        # autor (o Delta Radioativo é `Radioativo` no mapa e ficou `Bairro` no
        # FM de quando a nota nasceu; a `subcategoria` continua dizendo que é
        # bairro, que é o que a hierarquia usa).
        print(f"  conflito FM x bloco ({len(conflitos)}) — o bloco ganha:")
        for n, antes, agora in conflitos:
            print(f"    {n}: FM dizia {antes}, bloco desenha {agora}")
    if sem_tipo:
        print(f"\nSEM TIPO CURADO ({len(sem_tipo)}) — entram como Ponto de Interesse:")
        for n in sem_tipo:
            print(f"  {n}")
    print(f"\nmarcadores novos: {len(postos)}")
    for nome, tipo, lat, long, ancora in postos:
        print(f"  {tipo:19s} {nome:36s} lat={lat:7.1f} long={long:6.1f}  ← {ancora}")
    if sem_lugar:
        print(f"\nSEM LUGAR ({len(sem_lugar)}):", ", ".join(sem_lugar))

    if not escrever:
        return postos

    # 4. FM dos novos + linhas no bloco
    for nome, tipo, _lat, _long, _a in postos:
        gravar_marker_tag(notas[nome]["caminho"], tipo)
    linhas = [
        f"marker: {tipo},{lat:g},{long:g},{nome},,-0.1,"
        for nome, tipo, lat, long, _a in postos
    ]
    bloco = re.search(r"```leaflet\n(.*?)```", texto, re.S)
    novo_bloco = bloco.group(1).rstrip("\n") + "\n" + "\n".join(linhas) + "\n"
    texto = texto.replace(bloco.group(0), "```leaflet\n" + novo_bloco + "```", 1)
    open(pmb.POA_MD, "w", encoding="utf-8").write(texto)
    print(f"\n{len(linhas)} marcador(es) no bloco; {len(postos)} FM com markerTag.")

    # 5. ícone de cada tipo no plugin leaflet do Obsidian
    if os.path.exists(LEAFLET_DATA):
        d = json.load(open(LEAFLET_DATA, encoding="utf-8"))
        tipos = {i.get("type") for i in d.get("markerIcons", [])}
        mudou = False
        for tipo, icone in ICONES_OBSIDIAN.items():
            if tipo in tipos:
                continue
            d["markerIcons"].append(
                {
                    "type": tipo,
                    "iconName": icone,
                    "color": "#dddddd",
                    "alpha": 1,
                    "layer": False,
                    "transform": {"size": 6, "x": 0, "y": -2},
                    "isImage": False,
                    "tags": [],
                    "minZoom": None,
                    "maxZoom": None,
                }
            )
            mudou = True
        if mudou:
            json.dump(d, open(LEAFLET_DATA, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            print("ícones novos no plugin leaflet do Obsidian.")
    return postos


if __name__ == "__main__":
    rodar(escrever="--escrever" in sys.argv)
