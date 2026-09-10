#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EMBED DA FIGURA NA NOTA (2026-09-09) — a figura de uma nota do mundo só
aparece no app se a NOTA a embutir (`![[Nome.png]]`): o app lê `doc.images`, e
não adivinha por nome de arquivo. Depois de cada rodada do gerador
(`gen-context-figures.mjs --ingest`) sobram notas com figura pronta em
`Recursos e Mídia/Recursos de Contextos/<Categoria>/<Nome>.png` e sem o embed.
Este script põe o embed onde as notas irmãs já o põem — nada de posição nova:

  * nota com linha de TAG (`#Local`, `#Pessoa`, `#Organização`): logo depois dela;
  * nota sem tag (dossiê de Contexto Atual): logo depois do primeiro callout,
    que é onde `Transporte e Mobilidade` e as outras 30 já a têm.

Idempotente: nota que já embute qualquer figura não é tocada.

Uso:
    python3 scripts/poa_embeds_figuras.py            # relatório
    python3 scripts/poa_embeds_figuras.py --escrever # aplica
"""
import os
import re
import sys

ROOT = os.environ.get("PLEITOST_VAULT_ROOT", "/data/vaults/POA 1987")
FIGURAS = os.path.join(ROOT, "Recursos e Mídia", "Recursos de Contextos")

# Pasta de notas → pasta de figuras (o mesmo mapa do gerador de imagens).
CATEGORIAS = [
    (os.path.join("Atlas", "Porto Alegre"), "Locais"),
    (os.path.join("Contexto", "Histórias", "Contexto Atual"), "Contexto Atual"),
    (os.path.join("Contexto", "Organizações"), "Organizações"),
    (os.path.join("Contexto", "Pessoas"), "Pessoas"),
    (os.path.join("Contexto", "Recursos"), "Recursos"),
]

RE_EMBED_IMG = re.compile(
    r"^!\[\[[^\]]+\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:\|[^\]]*)?\]\]\s*$", re.I
)
RE_TAG = re.compile(r"^#[^\s#]\S*\s*$")


def corpo_e_fm(texto):
    """(frontmatter com os delimitadores, corpo). Sem FM, ('', texto)."""
    if not texto.startswith("---\n"):
        return "", texto
    fim = texto.find("\n---\n", 4)
    if fim < 0:
        return "", texto
    return texto[: fim + 5], texto[fim + 5 :]


def onde_embutir(linhas):
    """Índice em que o embed entra, seguindo as notas irmãs: depois da linha de
    TAG, ou depois do primeiro callout. None quando nenhum dos dois existe (aí
    a nota tem outro formato e é melhor não chutar)."""
    for i, l in enumerate(linhas[:6]):
        if RE_TAG.match(l):
            return i + 1
    for i, l in enumerate(linhas):
        if not l.startswith(">"):
            continue
        j = i
        while j < len(linhas) and linhas[j].startswith(">"):
            j += 1
        return j
    return None


def rodar(escrever=False):
    postos, sem_figura, sem_lugar, ja_tinham = [], [], [], 0
    for pasta_notas, pasta_fig in CATEGORIAS:
        raiz = os.path.join(ROOT, pasta_notas)
        if not os.path.isdir(raiz):
            continue
        for base_dir, _dirs, arquivos in os.walk(raiz):
            for arq in sorted(arquivos):
                if not arq.endswith(".md"):
                    continue
                nome = arq[:-3]
                caminho = os.path.join(base_dir, arq)
                texto = open(caminho, encoding="utf-8").read()
                fm, corpo = corpo_e_fm(texto)
                linhas = corpo.split("\n")
                if any(RE_EMBED_IMG.match(l.strip()) for l in linhas):
                    ja_tinham += 1
                    continue
                figura = os.path.join(FIGURAS, pasta_fig, f"{nome}.png")
                if not os.path.exists(figura):
                    sem_figura.append(f"{pasta_fig}/{nome}")
                    continue
                i = onde_embutir(linhas)
                if i is None:
                    sem_lugar.append(f"{pasta_fig}/{nome}")
                    continue
                linhas.insert(i, f"![[{nome}.png]]")
                postos.append((caminho, fm + "\n".join(linhas), f"{pasta_fig}/{nome}"))

    print(f"embeds a pôr: {len(postos)} · já embutiam: {ja_tinham}")
    for _c, _t, chave in postos:
        print(f"  {chave}")
    if sem_lugar:
        print(f"\nsem lugar canônico pro embed ({len(sem_lugar)}):", ", ".join(sem_lugar))
    print(f"\nnotas ainda SEM figura gerada: {len(sem_figura)}")

    if escrever:
        for caminho, texto, _chave in postos:
            open(caminho, "w", encoding="utf-8").write(texto)
        print(f"\n{len(postos)} nota(s) reescrita(s).")
    return postos, sem_figura


if __name__ == "__main__":
    rodar(escrever="--escrever" in sys.argv)
