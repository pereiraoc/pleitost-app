#!/usr/bin/env python3
"""ÍCONES DE CUSTO DE AÇÃO — 1/2/3 ações, reação, ação livre.

Entrada: as artes do user (glifo preto sobre branco, ~1250px, sem alfa útil)
  1-acao.png · 2-acoes.png · 3-acoes.png · reacao.png · acao-livre.png

Saídas:
  • design/acoes/<nome>.png — glifo limpo: alfa tirado da luminância (limiar +
    rampa de antialias), recortado justo, preto puro, altura 512px. Mestre versionado: rodar de novo
    a partir daqui reproduz o SVG (a tela usa só o vetor).
  • app/src/generated/acao-icones.ts — o glifo VETORIZADO (contornos do OpenCV
    → polígonos, fill-rule evenodd), viewBox com altura 100 e largura
    proporcional. O componente <AcaoIcone> desenha isso inline com
    fill=currentColor: herda a cor do texto (tema claro/escuro, badges) e
    imprime sem depender de mask/background.

Uso:  python3 scripts/acoes-icones.py [pasta-das-artes]   (default design/acoes)
Requer Pillow + numpy + opencv-python (cv2).
"""
from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_PNG = ROOT / "design" / "acoes"
OUT_TS = ROOT / "app" / "src" / "generated" / "acao-icones.ts"

# chave do componente → arquivo da arte
GLIFOS = {
    "1": "1-acao.png",
    "2": "2-acoes.png",
    "3": "3-acoes.png",
    "reacao": "reacao.png",
    "livre": "acao-livre.png",
}

ALTURA_PNG = 512   # mestre limpo versionado (re-vetorizável)
ALTURA_VB = 100    # altura do viewBox do SVG
EPS = 0.0016       # tolerância do approxPolyDP, fração da altura do glifo


def alfa_da_luminancia(im: Image.Image) -> np.ndarray:
    """0..255: preto → opaco. Rampa linear entre 60 e 200 preserva o antialias."""
    rgba = im.convert("RGBA")
    a_src = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255.0
    lum = np.asarray(rgba.convert("L"), dtype=np.float32)
    lo, hi = 60.0, 200.0
    a = np.clip((hi - lum) / (hi - lo), 0.0, 1.0) * a_src
    return (a * 255).round().astype(np.uint8)


def recorte(alpha: np.ndarray, pad: int) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > 8)
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + 1 + pad, alpha.shape[1])
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + 1 + pad, alpha.shape[0])
    return x0, y0, x1, y1


def png_limpo(alpha: np.ndarray, destino: Path) -> None:
    h, w = alpha.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 3] = alpha
    img = Image.fromarray(out, "RGBA")
    nw = max(1, round(w * ALTURA_PNG / h))
    img.resize((nw, ALTURA_PNG), Image.LANCZOS).save(destino, optimize=True)


def vetoriza(alpha: np.ndarray) -> tuple[float, str]:
    """→ (largura do viewBox, path d). Coordenadas normalizadas pra altura 100."""
    h, w = alpha.shape
    k = ALTURA_VB / h
    binaria = (alpha >= 128).astype(np.uint8) * 255
    contornos, _ = cv2.findContours(binaria, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    partes: list[str] = []
    for c in contornos:
        if cv2.contourArea(c) < 20:
            continue
        p = cv2.approxPolyDP(c, EPS * h, True).reshape(-1, 2)
        pts = [f"{x * k:.1f} {y * k:.1f}" for x, y in p]
        partes.append("M" + "L".join(pts) + "Z")
    return round(w * k, 1), "".join(partes)


def main() -> None:
    fonte = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_PNG
    OUT_PNG.mkdir(parents=True, exist_ok=True)
    entradas: list[str] = []
    for chave, nome in GLIFOS.items():
        im = Image.open(fonte / nome)
        alpha = alfa_da_luminancia(im)
        x0, y0, x1, y1 = recorte(alpha, pad=0)
        cort = alpha[y0:y1, x0:x1]
        if fonte.resolve() != OUT_PNG.resolve():
            png_limpo(cort, OUT_PNG / nome)
        # vetoriza com 1px de folga pra o contorno não encostar na borda
        larg, d = vetoriza(np.pad(cort, 1))
        entradas.append(f'  {chave!r}: {{ w: {larg}, d: {d!r} }},'.replace("'", '"'))
        print(f"{chave:7s} {nome:16s} {cort.shape[1]}x{cort.shape[0]} → vb {larg}x{ALTURA_VB}, {len(d)} chars")
    OUT_TS.write_text(
        "/* GERADO por scripts/acoes-icones.py a partir de design/acoes/*.png — NÃO EDITAR À MÃO. */\n\n"
        "/** Glifos vetorizados dos custos de ação: viewBox `0 0 w 100`, fill-rule evenodd. */\n"
        f"export const ACAO_GLIFOS = {{\n" + "\n".join(entradas) + "\n} as const\n\n"
        f"export const ACAO_GLIFO_ALTURA = {ALTURA_VB}\n",
        encoding="utf-8",
    )
    print(f"→ {OUT_TS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
