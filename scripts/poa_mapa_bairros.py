#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAIRROS DO MAPA DE PORTO ALEGRE (2026-09-09) — as REGIÕES COLORIDAS que o
mestre desenhou em `Mapa de Porto Alegre RPG.png` viram território de bairro, e
todo marcador do bloco ```leaflet``` de `Atlas/Porto Alegre/Porto Alegre.md`
passa a cair DENTRO do bairro que a nota dele declara.

Por que existe: as coordenadas dos marcadores são as REAIS de Porto Alegre
(scripts/poa-malha-transportes.py, tabela COORDS + geo_px), mas as regiões que o
mestre pintou não seguem o desenho real dos bairros — "mudamos um pouco o
tamanho dos bairros". Resultado: Iguatemi caía no Jardim Itu, o Motel Assis
Brasil na Nova Sarandi, a Usina do Gasômetro na água. Este módulo puxa cada
marcador desses pro ponto mais próximo dentro da região certa; quem já estava
certo não se mexe (a curadoria à mão do mestre é preservada).

A COR é a fonte de verdade da região: o marcador `Bairro` de cada bairro é a
SEMENTE — a cor exatamente sob ele delimita o território daquele bairro. Nada de
tabela de cores no código. Cor acromática (cinza/branco do papel) não é região:
o Delta Radioativo, que fica na água, segue como pino solto.

Uso:
    python3 scripts/poa_mapa_bairros.py            # relatório, sem escrever
    python3 scripts/poa_mapa_bairros.py --escrever # aplica no Porto Alegre.md
"""
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.environ.get("PLEITOST_VAULT_ROOT", "/data/vaults/POA 1987")
ATLAS = os.path.join(ROOT, "Atlas", "Porto Alegre")
POA_MD = os.path.join(ATLAS, "Porto Alegre.md")
MAPA_PNG = os.path.join(
    ROOT, "Recursos e Mídia", "Imagens", "Contextos", "Mapa de Porto Alegre RPG.png"
)

# `bounds: [[0,0],[1170,850]]` no bloco leaflet: lat = altura (cresce pra CIMA),
# long = largura. O PNG é 850×1170, então 1 unidade = 1 px.
LARGURA, ALTURA = 850, 1170
# Uma cor é REGIÃO de bairro só se tiver matiz; o papel do mapa é acromático
# (255,255,255 / 240,239,239 / 228,228,228 têm max−min ≤ 1) e o bairro mais
# apagado que o mestre usou (Jardim Itu, 140,135,144) tem 9.
CROMA_MIN = 5
# Dois marcadores reposicionados no MESMO pixel dariam distância zero entre
# paradas no planejador de trajeto. Só vale pra quem se mexe: co-locação
# autoral (Estação Nogueiras na Praça das Nogueiras) fica como está.
SEPARACAO = 2
# Marcadores fora da região que estão a menos disto um do outro são um LUGAR
# só (a vila do Jardim Botânico: Camisa 12, venda, borracheiro, padaria) e
# entram na região juntos, por uma translação única — puxados um a um, se
# espalhavam pela borda e perdiam a vizinhança.
RAIO_CACHO = 25


# ───────────────────────────── bloco leaflet ─────────────────────────────

RE_MARKER = re.compile(r"^marker: ([^,]*),([^,]*),([^,]*),([^,]*),(.*)$", re.M)


class Marcador:
    __slots__ = ("tipo", "lat", "long", "nome", "resto", "linha", "movido")

    def __init__(self, tipo, lat, long, nome, resto, linha):
        self.tipo, self.lat, self.long, self.nome = tipo, lat, long, nome
        self.resto, self.linha = resto, linha
        self.movido = False

    def mover(self, lat, long):
        self.lat, self.long, self.movido = lat, long, True

    def render(self):
        """Linha do marcador. Sem mudança de posição devolve a ORIGINAL, byte a
        byte: reformatar `260.0` como `260` só produziria ruído no diff."""
        if not self.movido:
            return self.linha
        return f"marker: {self.tipo},{self.lat:g},{self.long:g},{self.nome},{self.resto}"


def ler_markers(texto):
    """Marcadores do bloco ```leaflet``` da nota, na ordem em que aparecem."""
    bloco = re.search(r"```leaflet\n(.*?)```", texto, re.S)
    if not bloco:
        raise SystemExit("Porto Alegre.md: bloco ```leaflet``` não encontrado")
    out = []
    for m in RE_MARKER.finditer(bloco.group(1)):
        out.append(
            Marcador(
                m.group(1).strip(),
                float(m.group(2)),
                float(m.group(3)),
                m.group(4).strip(),
                m.group(5),
                m.group(0),
            )
        )
    return out


def escrever_markers(texto, marcadores):
    """Reescreve, no lugar, a linha de cada marcador (a ordem do bloco não muda)."""
    for mk in marcadores:
        novo = mk.render()
        if novo != mk.linha:
            texto = texto.replace(mk.linha, novo, 1)
    return texto


# ───────────────────────── hierarquia do Atlas ─────────────────────────


def geolocalizacoes():
    """basename → (pai declarado no FM `Geolocalização`, pasta que o contém)."""
    out = {}
    for raiz, _dirs, arquivos in os.walk(ATLAS):
        for arq in arquivos:
            if not arq.endswith(".md"):
                continue
            base = arq[:-3]
            caminho = os.path.join(raiz, arq)
            txt = open(caminho, encoding="utf-8").read()
            m = re.search(r"^Geoloca[^:]*:\s*\"?\[\[([^\]|#]+)", txt, re.M)
            partes = os.path.relpath(caminho, ATLAS).split(os.sep)
            pasta = partes[-2] if len(partes) >= 2 else "Porto Alegre"
            if base == pasta and len(partes) >= 2:  # nota-da-pasta: sobe um nível
                pasta = partes[-3] if len(partes) >= 3 else "Porto Alegre"
            out[base] = (m.group(1).strip() if m else None, pasta)
    return out


def bairro_declarado(nome, geo, regioes):
    """Bairro COM REGIÃO a que o lugar pertence, subindo o FM `Geolocalização`
    (Estação Cidade Baixa → Cidade Baixa → Centro Histórico). Cadeia que não
    chega a região alguma cai na PASTA da nota. None = nenhum dos dois resolve."""
    atual, vistos = nome, set()
    while atual and atual not in vistos:
        vistos.add(atual)
        pai, pasta = geo.get(atual, (None, None))
        if pai in regioes:
            return pai
        if pai is None or pai == atual:
            return pasta if pasta in regioes else None
        atual = pai
    return None


# ────────────────────────── regiões por cor ──────────────────────────


class Regioes:
    """Território de cada bairro no PNG, semeado pelos marcadores `Bairro`."""

    def __init__(self, png, sementes):
        rgb = np.asarray(Image.open(png).convert("RGB")).astype(np.int32)
        self.altura, self.largura = rgb.shape[0], rgb.shape[1]
        chave = (rgb[:, :, 0] << 16) | (rgb[:, :, 1] << 8) | rgb[:, :, 2]
        self.nomes = []
        self.cores = {}
        self.mascaras = {}
        for nome, (lat, lng) in sementes.items():
            x, y = self.px(lat, lng)
            if not (0 <= x < self.largura and 0 <= y < self.altura):
                continue
            cor = tuple(int(v) for v in rgb[y, x])
            if max(cor) - min(cor) < CROMA_MIN:  # papel do mapa, não região
                continue
            self.cores[nome] = cor
            self.mascaras[nome] = chave == ((cor[0] << 16) | (cor[1] << 8) | cor[2])
            self.nomes.append(nome)
        # índice px → bairro (int8; −1 = fora de qualquer região)
        self.indice = np.full((self.altura, self.largura), -1, dtype=np.int8)
        for i, nome in enumerate(self.nomes):
            self.indice[self.mascaras[nome]] = i

    def px(self, lat, lng):
        """(lat, long) do leaflet → (x, y) do PNG."""
        return int(round(lng)), int(round(self.altura - lat))

    def latlong(self, x, y):
        return round(self.altura - y, 1), round(float(x), 1)

    def __contains__(self, nome):
        return nome in self.mascaras

    def bairro_em(self, lat, lng):
        x, y = self.px(lat, lng)
        if not (0 <= x < self.largura and 0 <= y < self.altura):
            return None
        i = int(self.indice[y, x])
        return self.nomes[i] if i >= 0 else None

    def dentro(self, nome, x, y):
        return (
            0 <= x < self.largura
            and 0 <= y < self.altura
            and bool(self.mascaras[nome][y, x])
        )

    def puxar(self, nome, lat, lng, ocupados=()):
        """Ponto mais próximo DENTRO da região, em (lat, long) do leaflet. Busca
        em anéis a partir da posição atual — o deslocamento típico é de dezenas
        de px. `ocupados` são pontos a evitar (dois marcadores no MESMO pixel
        dariam distância zero no planejador de trajeto). None quando a região
        não existe no mapa."""
        x0, y0 = self.px(lat, lng)
        vistos = {(x0, y0)}
        fila = deque([(x0, y0)])
        while fila:
            x, y = fila.popleft()
            if self.dentro(nome, x, y) and all(
                abs(x - ox) >= SEPARACAO or abs(y - oy) >= SEPARACAO for ox, oy in ocupados
            ):
                return self.latlong(x, y)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                p = (x + dx, y + dy)
                if p in vistos or not (0 <= p[0] < self.largura and 0 <= p[1] < self.altura):
                    continue
                vistos.add(p)
                fila.append(p)
        return None

    def centroide(self, nome):
        ys, xs = np.nonzero(self.mascaras[nome])
        return self.latlong(xs.mean(), ys.mean())


# ──────────────────────────── reposicionamento ────────────────────────────


def cachos(fora, raio=RAIO_CACHO):
    """Agrupa (marcador, bairro) fora da região em CACHOS por bairro e
    proximidade (ligação simples, raio em px). Devolve [(bairro, [marcadores])]
    em ordem estável."""
    saida = []
    por_bairro = {}
    for mk, bairro in fora:
        por_bairro.setdefault(bairro, []).append(mk)
    for bairro in sorted(por_bairro):
        pendentes = por_bairro[bairro]
        while pendentes:
            grupo = [pendentes.pop(0)]
            mudou = True
            while mudou:
                mudou = False
                for mk in list(pendentes):
                    if any(
                        abs(mk.lat - g.lat) <= raio and abs(mk.long - g.long) <= raio
                        for g in grupo
                    ):
                        grupo.append(mk)
                        pendentes.remove(mk)
                        mudou = True
            saida.append((bairro, grupo))
    return saida


def rodar(escrever=False):
    texto = open(POA_MD, encoding="utf-8").read()
    marcadores = ler_markers(texto)
    sementes = {mk.nome: (mk.lat, mk.long) for mk in marcadores if mk.tipo == "Bairro"}
    regioes = Regioes(MAPA_PNG, sementes)
    geo = geolocalizacoes()
    print(f"{len(marcadores)} marcadores · {len(regioes.nomes)} bairros com região")
    sem_regiao = sorted(set(sementes) - set(regioes.nomes))
    if sem_regiao:
        print("  bairros sem região colorida (seguem como pino):", ", ".join(sem_regiao))

    bairro_por_nome = {}
    for mk in marcadores:
        bairro_por_nome[mk.nome] = (
            mk.nome if mk.tipo == "Bairro" and mk.nome in regioes else bairro_declarado(mk.nome, geo, regioes)
        )

    puxados, sem_bairro, sem_regiao_alvo = [], [], []
    fora = []
    for mk in marcadores:
        bairro = bairro_por_nome.get(mk.nome)
        if bairro is None:
            sem_bairro.append(mk.nome + ("" if mk.nome in geo else " (sem nota no Atlas)"))
            continue
        if regioes.bairro_em(mk.lat, mk.long) != bairro:
            fora.append((mk, bairro))

    ocupados = []
    for bairro, cacho in cachos(fora):
        if bairro not in regioes:
            sem_regiao_alvo += [mk.nome for mk in cacho]
            continue
        # translação do CACHO: leva o centro dele pro ponto mais próximo dentro
        # da região e mantém a vizinhança entre os membros
        clat = sum(mk.lat for mk in cacho) / len(cacho)
        clong = sum(mk.long for mk in cacho) / len(cacho)
        centro = regioes.puxar(bairro, clat, clong)
        dlat, dlong = (centro[0] - clat, centro[1] - clong) if centro else (0.0, 0.0)
        for mk in cacho:
            alvo = regioes.puxar(bairro, mk.lat + dlat, mk.long + dlong, ocupados)
            if alvo is None:
                sem_regiao_alvo.append(mk.nome)
                continue
            dist = round(((alvo[0] - mk.lat) ** 2 + (alvo[1] - mk.long) ** 2) ** 0.5)
            puxados.append((mk.nome, bairro, dist, len(cacho)))
            mk.mover(*alvo)
            ocupados.append(regioes.px(*alvo))
    puxados.sort(key=lambda t: (t[1], t[0]))

    print(f"\npuxados pro bairro certo: {len(puxados)}")
    for nome, bairro, dist, tam in puxados:
        cacho = f" · cacho de {tam}" if tam > 1 else ""
        print(f"  {nome:36s} → {bairro:20s} ({dist} px ≈ {round(dist * 45.6)} m{cacho})")
    if sem_bairro:
        print(f"\nsem bairro resolvido ({len(sem_bairro)}, ficam onde estão):")
        for n in sem_bairro:
            print(f"  {n}")
    if sem_regiao_alvo:
        print(f"\nbairro declarado sem região no mapa ({len(sem_regiao_alvo)}):", ", ".join(sem_regiao_alvo))

    if escrever:
        novo = escrever_markers(texto, marcadores)
        if novo != texto:
            open(POA_MD, "w", encoding="utf-8").write(novo)
            print("\nPorto Alegre.md reescrito.")
        else:
            print("\nnada a mudar.")
    return regioes, marcadores, bairro_por_nome


if __name__ == "__main__":
    rodar(escrever="--escrever" in sys.argv)
