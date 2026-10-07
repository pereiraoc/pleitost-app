#!/usr/bin/env python3
"""TERRENO DO MAPA — pinta o terreno inicial do hexcrawl a partir da arte.

Lê o `Mapa do Mundo Livre.png` (grade flat-top odd-q calibrada em
app/src/grupo/exploracao.ts: HEX_SIZE 74, origem (39,122)) e classifica cada
hex da grade ANTIGA; converte pra grade do mundo/trilha (col+44, row+5 —
ATLAS_COL_SHIFT/ATLAS_ROW_SHIFT em app/src/map/atlas-grid.ts, o mesmo rebase
de group-store.paraGradeMundo e do seed `mapa:mundo`).

Camada BASE (Terreno):
  • mar           — tiles de mar (azul claro e azul escuro)
  • muito_dificil — tiles de montanha (Montanhas de Vidro, Serra do Bode) e o
                    maciço cinza do vulcão na Ilha das Cinzas
  • dificil       — floresta (Grande Mata, Floresta da Ordem) e o deserto de
                    Pedra Fina: SÓ o componente amarelo conectado às Ruínas de
                    Luxor (inclui a faixa pontilhada da costa/Montanhas de
                    Vidro e a faixa a oeste delas); praias de Riqueza, a faixa
                    ondulada da Serra do Bode e as terras rachadas (Pencas,
                    Rharos) ficam normais
  • (resto)       — normal (não listado)
Os tiles da arte são carimbos idênticos: cada hex é classificado pela mediana
de cor de 7 setores (votação — rótulos/cidades cobrem só parte do hex) contra
protótipos medidos na própria arte.

Camada ROTAS:
  • estrada       — hexes cortados pelas estradas bege. O fundo de cada tipo de
                    tile é a mediana pixel-a-pixel de todos os hexes do mesmo
                    tipo (carimbo limpo); conta pixels cor-de-estrada que
                    DIFEREM do fundo (rio azul e fronteira vermelha não têm a
                    cor; árvore/tronco do carimbo some na subtração).
  • rota_maritima — hexes de mar cortados pela rota branca pontilhada. O PNG
                    colorido não desenha a rota; ela vem do atlas.webp (mesma
                    grade re-renderizada, atlas-grid.ts: size 55.335; cols do
                    mundo direto), contando pixels brancos sobre o mar.

Uso (de qualquer pasta):
  python3 scripts/terreno-do-mapa.py              # só o PNG de revisão
  python3 scripts/terreno-do-mapa.py --write      # + reescreve o FM da nota
  python3 scripts/terreno-do-mapa.py --revisao /caminho/revisao.png
"""
import argparse
import math
import re
import sys
from collections import Counter, deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None

VAULT = Path('/data/vaults/pleitost')
MAPA = VAULT / 'Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.png'
ATLAS = VAULT / 'Recursos e Mídia/Imagens/Mapas/atlas.webp'
NOTA = VAULT / 'Atlas/Mundo Livre/Terreno do Mundo Livre.md'
REVISAO = Path('/tmp/claude-1000/-data-vaults-pleitost/8c31f3d6-f6e9-48ed-8bee-5bbb84a590a6/scratchpad/terreno-revisao.png')

# grade antiga (exploracao.ts)
S = 74
HS = 1.5 * S
VS = math.sqrt(3) * S
OX, OY = 39, 122
# rebase pra grade do mundo (atlas-grid.ts)
COL_SHIFT, ROW_SHIFT = 44, 5
# grade do atlas.webp (atlas-grid.ts) — coords do MUNDO
A_S = 55.335
A_SCALE = 0.74777
A_TX, A_TY = 3620.1, 466.5
A_OX, A_OY = -2.85, 78.52

# Protótipos (mediana de cor dos carimbos, medidos na arte) → grupo
PROTOS = [
    ((66, 83, 118), 'mar'), ((74, 105, 124), 'mar'),
    ((107, 108, 107), 'montanha'), ((81, 79, 79), 'montanha'), ((128, 125, 100), 'montanha'),
    ((128, 128, 128), 'cinza'), ((138, 138, 138), 'cinza'),
    ((117, 136, 70), 'floresta'), ((73, 105, 82), 'floresta'),
    ((214, 203, 146), 'areia'), ((210, 200, 135), 'areia'), ((208, 198, 134), 'areia'),
    ((202, 192, 131), 'areia'), ((190, 186, 130), 'areia'),
    ((127, 134, 89), 'normal'), ((142, 143, 110), 'normal'), ((143, 144, 111), 'normal'),
    ((136, 137, 106), 'normal'), ((137, 140, 121), 'normal'), ((129, 161, 99), 'normal'),
    ((142, 137, 111), 'normal'), ((142, 133, 112), 'normal'), ((150, 151, 116), 'normal'),
    ((217, 193, 138), 'normal'), ((217, 191, 134), 'normal'), ((210, 188, 113), 'normal'),
    ((0, 0, 0), 'fora'),
]
PROTO_RGB = np.array([p[0] for p in PROTOS], dtype=float)
MAX_DIST = 16.0
# mediana do hex inteiro precisa bater com folga pequena (carimbo limpo)
DIST_HEX = 6.0
# sementes do deserto de Pedra Fina (grade antiga): Ruínas de Luxor
SEMENTES_DESERTO = [(8, 7), (8, 11), (5, 9), (12, 12)]
# Ilha das Cinzas: tiles cinza a leste/sul (col>=27,row>=30) = maciço do vulcão
def eh_vulcao(col, row):
    return col >= 27 and row >= 30


def centro(col, row):
    return OX + HS * col, OY + VS * (row + 0.5 * (col & 1))


def vizinhos(col, row):
    if col & 1:
        d = [(0, -1), (0, 1), (-1, 0), (-1, 1), (1, 0), (1, 1)]
    else:
        d = [(0, -1), (0, 1), (-1, -1), (-1, 0), (1, -1), (1, 0)]
    return [(col + a, row + b) for a, b in d]


def mascaras(r_disco, r_lim):
    yy, xx = np.mgrid[-r_disco:r_disco + 1, -r_disco:r_disco + 1]
    rr = np.hypot(xx, yy)
    ang = (np.degrees(np.arctan2(yy, xx)) + 360) % 360
    dentro = rr <= r_lim
    setores = [dentro & (rr <= r_lim * 0.4)]
    for k in range(6):
        setores.append(dentro & (rr > r_lim * 0.4) & (ang >= 60 * k) & (ang < 60 * (k + 1)))
    return dentro, setores


def recorte(img, x, y, r):
    """Janela (2r+1)² centrada em (x,y); None se sair da imagem."""
    h, w = img.shape[:2]
    if x - r < 0 or y - r < 0 or x + r >= w or y + r >= h:
        return None
    return img[y - r:y + r + 1, x - r:x + r + 1]


PAD = 64


def classificar_base(img):
    """Grupo por hex (grade antiga). Hex cujo carimbo bate inteiro com um
    protótipo (mediana do hex ≤ DIST_HEX) leva o grupo dele. O resto (cidade,
    rótulo, rio cruzando o tile): mar se ≥4 dos 7 setores são mar; senão a
    maioria dos VIZINHOS de terra já resolvidos (cidade na planície = planície,
    Krasnogor nas montanhas = montanha), com os votos dos setores desempatando."""
    h, w = img.shape[:2]
    # borda espelhada: a coluna 0 (centro em x=39) fica com o hex inteiro
    pad = np.pad(img, ((PAD, PAD), (PAD, PAD), (0, 0)), mode='reflect')
    R = 58
    dentro, setores = mascaras(R, 52)
    grupos, chaves, janelas, votos_de = {}, {}, {}, {}
    for col in range(0, 40):
        for row in range(0, 46):
            cx, cy = centro(col, row)
            x, y = int(round(cx)), int(round(cy))
            if not (0 <= x < w and 0 <= y < h):
                continue
            jan = recorte(pad, x + PAD, y + PAD, R)
            if jan is None:
                continue
            votos = Counter()
            for m in setores:
                med = np.median(jan[m], axis=0)
                d = np.linalg.norm(PROTO_RGB - med, axis=1)
                i = int(d.argmin())
                if d[i] <= MAX_DIST:
                    votos[PROTOS[i][1]] += 1
            med = np.median(jan[dentro], axis=0)
            d = np.linalg.norm(PROTO_RGB - med, axis=1)
            i = int(d.argmin())
            chaves[(col, row)] = i if d[i] <= DIST_HEX else -1
            grupos[(col, row)] = PROTOS[i][1] if d[i] <= DIST_HEX else None
            votos_de[(col, row)] = votos
            janelas[(col, row)] = jan
    # montanha/floresta/cinza isolada (sem vizinho do mesmo grupo) é carimbo
    # parecido por acaso (vila, tile com rio) — resolve pelos vizinhos
    for k, g in list(grupos.items()):
        if g in ('montanha', 'floresta', 'cinza') and not any(grupos.get(n) == g for n in vizinhos(*k)):
            grupos[k] = None
    pend = [k for k, g in grupos.items() if g is None]
    for k in pend:
        if votos_de[k]['mar'] >= 4:
            grupos[k] = 'mar'
    for _ in range(6):
        for k in pend:
            if grupos[k] is not None:
                continue
            v = Counter(grupos.get(n) for n in vizinhos(*k)
                        if grupos.get(n) not in (None, 'mar', 'fora') and n not in pend)
            if not v:
                v = Counter(grupos.get(n) for n in vizinhos(*k) if grupos.get(n) not in (None, 'mar', 'fora'))
            if v:
                top = max(v.values())
                cands = [g for g, n in v.items() if n == top]
                grupos[k] = max(cands, key=lambda g: votos_de[k][g])
    for k in pend:
        if grupos[k] is None:
            grupos[k] = votos_de[k].most_common(1)[0][0] if votos_de[k] else 'normal'
    return grupos, chaves, janelas


def deserto_pedra_fina(grupos):
    vis = set()
    fila = deque(s for s in SEMENTES_DESERTO if grupos.get(s) == 'areia')
    vis.update(fila)
    while fila:
        k = fila.popleft()
        for n in vizinhos(*k):
            if n not in vis and grupos.get(n) == 'areia':
                vis.add(n)
                fila.append(n)
    return vis


def faixa_rotulo(j):
    """Pixels de faixa de rótulo (papel claro e pouco saturado) dilatados —
    a sombra da faixa tem a cor da estrada."""
    r, g, b = j[..., 0], j[..., 1], j[..., 2]
    papel = (r >= 152) & (r <= 190) & (r - g >= 3) & (r - g <= 13) & (g - b >= 14) & (g - b <= 34)
    m = Image.fromarray((papel * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(19))
    return np.asarray(m) > 0


def detectar_estradas(img, grupos, chaves, janelas):
    R = 58
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
    rr = np.hypot(xx, yy)
    disco = rr <= 56
    anel = disco & (rr > 30)
    # fundo limpo por carimbo (mediana pixel-a-pixel dos hexes do mesmo protótipo)
    por_chave = {}
    for k, ch in chaves.items():
        if ch >= 0:
            por_chave.setdefault(ch, []).append(k)
    fundo = {}
    for ch, ks in por_chave.items():
        if len(ks) >= 5:
            fundo[ch] = np.median(np.stack([janelas[k] for k in ks]).astype(np.int16), axis=0)
    score = {}
    for k, jan in janelas.items():
        if grupos.get(k) in ('mar', 'fora'):
            continue
        j = jan.astype(np.int16)
        r, g, b = j[..., 0], j[..., 1], j[..., 2]
        cor = (r >= 134) & (r <= 157) & (r - g >= 10) & (r - g <= 24) & (g - b >= 8) & (g - b <= 26)
        cor &= ~faixa_rotulo(j)
        ch = chaves.get(k, -1)
        if ch in fundo:
            dif = np.abs(j - fundo[ch]).sum(axis=2) > 15
            cor &= dif
        score[k] = (int((cor & disco).sum()), int((cor & anel).sum()))
    return score


def rota_maritima_atlas(mar_mundo):
    """Hexes de mar (coords do MUNDO) cortados pela rota branca no atlas.webp."""
    at = np.asarray(Image.open(ATLAS).convert('RGB')).astype(np.int16)
    h, w = at.shape[:2]
    a_hs, a_vs = 1.5 * A_S, math.sqrt(3) * A_S
    # origem da grade do mundo no atlas (ATLAS_HEX_OFFSET_X/Y) — confere com
    # o afim do Mundo Livre: célula antiga (0,0) ⇔ mundo (44,5)
    ox0, oy0 = A_OX, A_OY
    assert abs(A_TX + A_SCALE * OX - a_hs * COL_SHIFT - ox0) < 0.5
    assert abs(A_TY + A_SCALE * OY - a_vs * ROW_SHIFT - oy0) < 0.5
    R = 40
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
    disco = np.hypot(xx, yy) <= 42
    out = {}
    for (col, row) in mar_mundo:
        cx = ox0 + a_hs * col
        cy = oy0 + a_vs * (row + 0.5 * (col & 1))
        jan = recorte(at, int(round(cx)), int(round(cy)), R)
        if jan is None:
            continue
        r, g, b = jan[..., 0], jan[..., 1], jan[..., 2]
        branco = (r > 215) & (g > 215) & (b > 215)
        out[(col, row)] = int((branco & disco).sum())
    return out


def lugares_nomeados():
    """Células com localId do seed canônico do Mundo Livre (grade antiga)."""
    import json
    src = (Path(__file__).resolve().parent.parent / 'app/src/data/seed-hexmaps.ts').read_text(encoding='utf-8')
    tag = "'Atlas/Mundo Livre/Mundo Livre': "
    cells, _ = json.JSONDecoder().raw_decode(src[src.index(tag) + len(tag):])
    return [(c['col'], c['row']) for c in cells if c.get('localId')]


def ordenar(keys):
    return sorted(keys, key=lambda k: (k[0], k[1]))


def fmt(keys):
    return '[' + ', '.join(f'"{c},{r}"' for c, r in ordenar(keys)) + ']'


def escrever_nota(base, rotas):
    txt = NOTA.read_text(encoding='utf-8')
    m = re.match(r'^---\n.*?\n---\n', txt, re.S)
    if not m:
        sys.exit(f'{NOTA}: sem frontmatter')
    fm = (
        '---\n'
        'Terreno:\n'
        f'  dificil: {fmt(base["dificil"])}\n'
        f'  muito_dificil: {fmt(base["muito_dificil"])}\n'
        f'  mar: {fmt(base["mar"])}\n'
        'Rotas:\n'
        f'  estrada: {fmt(rotas["estrada"])}\n'
        f'  rota_maritima: {fmt(rotas["rota_maritima"])}\n'
        '---\n'
    )
    NOTA.write_text(fm + txt[m.end():], encoding='utf-8')


def revisao(img, base, rotas, destino):
    W = 1500
    sc = W / img.shape[1]
    fundo = Image.fromarray(img.astype(np.uint8)).resize((W, int(img.shape[0] * sc)), Image.LANCZOS).convert('RGBA')
    cam = Image.new('RGBA', fundo.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(cam)
    cores = {'mar': (0, 90, 255, 70), 'muito_dificil': (230, 0, 0, 120), 'dificil': (255, 140, 0, 120)}

    def poly(col, row, enc=1.0):
        cx, cy = centro(col - COL_SHIFT, row - ROW_SHIFT)
        return [((cx + S * enc * math.cos(math.radians(60 * k))) * sc,
                 (cy + S * enc * math.sin(math.radians(60 * k))) * sc) for k in range(6)]

    for chave, ks in base.items():
        for (c, r) in ks:
            d.polygon(poly(c, r, 0.95), fill=cores[chave])
    for (c, r) in rotas['estrada']:
        d.polygon(poly(c, r, 0.62), outline=(255, 0, 255, 255), width=3)
    for (c, r) in rotas['rota_maritima']:
        cx, cy = centro(c - COL_SHIFT, r - ROW_SHIFT)
        d.ellipse([cx * sc - 6, cy * sc - 6, cx * sc + 6, cy * sc + 6], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255))
    destino.parent.mkdir(parents=True, exist_ok=True)
    Image.alpha_composite(fundo, cam).convert('RGB').save(destino)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='reescreve o FM da nota de terreno')
    ap.add_argument('--revisao', type=Path, default=REVISAO)
    ap.add_argument('--debug', action='store_true')
    a = ap.parse_args()

    img = np.asarray(Image.open(MAPA).convert('RGB'))
    grupos, chaves, janelas = classificar_base(img)
    deserto = deserto_pedra_fina(grupos)
    mundo = lambda k: (k[0] + COL_SHIFT, k[1] + ROW_SHIFT)
    base = {'dificil': set(), 'muito_dificil': set(), 'mar': set()}
    for k, g in grupos.items():
        if g == 'mar':
            base['mar'].add(mundo(k))
        elif g == 'montanha' or (g == 'cinza' and eh_vulcao(*k)):
            base['muito_dificil'].add(mundo(k))
        elif g == 'floresta' or k in deserto:
            base['dificil'].add(mundo(k))

    score = detectar_estradas(img, grupos, chaves, janelas)
    est = {k for k, (tot, anel) in score.items() if tot >= ESTRADA_MIN_TOT and anel >= ESTRADA_MIN_ANEL}
    # a arte da cidade cobre a estrada no próprio hex: lugar nomeado (seed do
    # mapa do Mundo Livre) colado numa estrada é ponta/parada da estrada
    for k in lugares_nomeados():
        if k not in est and any(n in est for n in vizinhos(*k)):
            est.add(k)
    # buraco de 1 hex: liga dois trechos não adjacentes entre si
    for k, (tot, _) in score.items():
        if k in est or tot < 10:
            continue
        ns = [n for n in vizinhos(*k) if n in est]
        if any(b not in vizinhos(*a) for i, a in enumerate(ns) for b in ns[i + 1:]):
            est.add(k)
    estrada = {mundo(k) for k in est}
    lane = rota_maritima_atlas(base['mar'])
    rota = {k for k, n in lane.items() if n >= ROTA_MIN}
    rotas = {'estrada': estrada, 'rota_maritima': rota}

    if a.debug:
        for k in ordenar(score):
            print('estrada', mundo(k), grupos.get(k), score[k])
        for k in ordenar(lane):
            if lane[k]:
                print('rota', k, lane[k])
    revisao(img, base, rotas, a.revisao)
    for kk, v in {**base, **rotas}.items():
        print(f'{kk}: {len(v)}')
    print(f'revisão: {a.revisao}')
    if a.write:
        escrever_nota(base, rotas)
        print(f'escrito: {NOTA}')


ESTRADA_MIN_TOT = 30
ESTRADA_MIN_ANEL = 15
ROTA_MIN = 6

if __name__ == '__main__':
    main()
