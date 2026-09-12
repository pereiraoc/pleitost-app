#!/usr/bin/env python3
"""Gera o bestiário da POA 1987 a partir de uma especificação única.

As notas de criatura NÃO são escritas à mão: este gerador lê os
`Elementos_de_Regra` das classes de bestiário e dos modificadores
(`Sistema/Regras/Bestiário/`), interpreta as diretivas `Tier N Definir/Somar/
Multiplicar` e monta o frontmatter derivado — do jeito que o motor do plugin
derivaria. Assim a base nasce correta e continua correta se a regra mudar.

Uso:
    python3 scripts/poa-bestiario.py --check     # só valida, não escreve
    python3 scripts/poa-bestiario.py             # escreve as notas
    python3 scripts/poa-bestiario.py --tabela    # imprime as tabelas do rascunho
"""
import argparse
import copy
import re
import sys
from pathlib import Path

import yaml

VAULT = Path("/data/vaults/POA 1987")
REGRAS = VAULT / "Sistema/Regras/Bestiário"
BESTIARIO = VAULT / "Sistema/Criaturas/Bestiário"
COMBATES = VAULT / "Campanhas/Combates"
import json as _json
ARMAS = _json.loads((Path(__file__).parent / "poa_armas.json").read_text(encoding="utf8"))

PERICIAS = [
    ("Atletismo", "FOR"), ("Acrobacia", "AGI"), ("Furtividade", "AGI"),
    ("Ladinagem", "AGI"), ("Arcana", "INT"), ("Sociedades", "INT"),
    ("Guerra", "INT"), ("Medicina", "INT"), ("Sobrevivência", "INT"),
    ("Anima", "PRE"), ("Diplomacia", "PRE"), ("Enganação", "PRE"),
    ("Intimidação", "PRE"),
]
# display POA → nome canônico da perícia
PERICIA_POA = {"Trônicos": "Arcana", "Lênicos": "Anima", "Malandragem": "Ladinagem"}

DEFESAS = [("Defesa", "AGI"), ("Vigor", "FOR"), ("Ímpeto", "PRE"), ("Reflexo", "INT")]
SENTIDOS = [("Percepção", "INT"), ("Intuição", "PRE")]


# ─────────────────────────── interpretador de regra ───────────────────────────

def fm_da_nota(p: Path) -> dict:
    txt = p.read_text(encoding="utf8")
    partes = txt.split("---")
    return yaml.safe_load(partes[1]) or {}


def elementos(nome: str, pasta: str) -> list[str]:
    fm = fm_da_nota(REGRAS / pasta / f"{nome}.md")
    return [str(e) for e in (fm.get("Elementos_de_Regra") or []) if e]


def set_path(alvo: dict, caminho: str, valor, verbo: str = "Definir"):
    """`Defesas_Resistencias.Lista.Defesa.Proficiencia` → navega e escreve.
    Listas de dicionários com `Nome` são indexadas pelo Nome; `*` = todos."""
    partes = caminho.split(".")
    cur = alvo
    for i, chave in enumerate(partes[:-1]):
        prox = partes[i + 1]
        if isinstance(cur, list):
            if chave == "*":
                for item in cur:
                    set_path({"x": item}, "x." + ".".join(partes[i + 1:]), valor, verbo)
                return
            achado = next((x for x in cur if _slug(x.get("Nome", "")) == _slug(chave)), None)
            if achado is None:
                return
            cur = achado
            continue
        if chave not in cur:
            cur[chave] = {}
        cur = cur[chave]
        if isinstance(cur, list) and prox == "*":
            for item in cur:
                set_path({"x": item}, "x." + ".".join(partes[i + 2:]), valor, verbo)
            return
    ultimo = partes[-1]
    if isinstance(cur, list):
        for item in cur:
            if isinstance(item, dict):
                item[ultimo] = valor
        return
    if verbo == "Somar":
        cur[ultimo] = (cur.get(ultimo) or 0) + valor
    elif verbo == "Multiplicar":
        cur[ultimo] = (cur.get(ultimo) or 0) * valor
    else:
        cur[ultimo] = valor


def _slug(s: str) -> str:
    s = str(s)
    for a, b in [("á", "a"), ("â", "a"), ("ã", "a"), ("é", "e"), ("ê", "e"), ("í", "i"),
                 ("ó", "o"), ("ô", "o"), ("õ", "o"), ("ú", "u"), ("ç", "c")]:
        s = s.replace(a, b).replace(a.upper(), b.upper())
    return s.lower().replace(" ", "")


def aplicar(els: list[str], fm: dict, tier: int, intelecto: int = 0):
    """Aplica as diretivas cujo Tier <= tier, na ordem da nota."""
    for e in els:
        m = re.match(r"^(?:Tier (\d+) )?(?:Condicional \(([^)]*)\) )?(\w+) (.+)$", e.strip())
        if not m:
            continue
        t_str, cond, verbo, resto = m.groups()
        if t_str is not None and int(t_str) > tier:
            continue
        if verbo in ("Definir", "Somar", "Multiplicar", "Sobrescrever"):
            partes = resto.rsplit(" ", 1)
            if len(partes) != 2:
                continue
            caminho, bruto = partes
            if bruto == "Propriedade(INT)":
                valor = intelecto
            elif re.fullmatch(r"-?\d+", bruto):
                valor = int(bruto)
            else:
                valor = bruto
            if cond:  # (FOR>AGI) — resolvido pelo chamador via atributos
                a, b = cond.split(">")
                if not (fm["Atributos"][a] > fm["Atributos"][b]):
                    continue
            set_path(fm, caminho, valor, "Definir" if verbo == "Sobrescrever" else verbo)


# ─────────────────────────── esqueleto da criatura ───────────────────────────

def linha_pericia(nome: str, atributo: str) -> dict:
    return {"Nome": nome, "Atributo": atributo, "Proficiencia": "N", "Bonus_Item": 0,
            "Bonus_Especial": 0, "Especializacao": "", "Maestria": "", "Incrementos": []}


def esqueleto() -> dict:
    return {
        "aliases": [], "categoria": "Criatura", "subcategoria": "Monstro", "grupo": [],
        "Imagem": "", "Tier": 0, "Classe": "", "Sintonia": "", "Raça": "", "Tamanho": "Médio",
        "Descrição": "",
        "Bairros": [],
        "Vida": {"Vitalidade": 0},
        "Atributos": {"Principal": "FOR", "FOR": 0, "AGI": 0, "INT": 0, "PRE": 0},
        "Defesas_Resistencias": {"Lista": [
            {"Nome": n, "Atributo": a, "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0}
            for n, a in DEFESAS]},
        "Sentidos": {"Lista": [
            {"Nome": n, "Atributo": a, "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0}
            for n, a in SENTIDOS]},
        "Movimento": {"Lista": [{"Nome": "Terrestre", "Atributo": "AGI", "Bonus_Item": 0, "Bonus_Especial": 0}]},
        "Pericias": {"Slots": {"A": 0, "E": 0, "M": 0},
                     "Lista": [linha_pericia(n, a) for n, a in PERICIAS]},
        "Habilidades": {"Lista": [], "Especiais": []},
        "Magias": {"Potencia": 0, "EM": 0, "Slots": {"B": 0, "A": 0, "E": 0, "M": 0},
                   "Lista": [
                       {"Nome": "Arcana Negra", "Atributo": "INT", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                       {"Nome": "Arcana Branca", "Atributo": "INT", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                       {"Nome": "Anima", "Atributo": "PRE", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                       {"Nome": "Tesouros", "Atributo": "", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                   ],
                   "Secundaria": {"Potencia": 0, "EM": 0, "Slots": {"B": 0, "A": 0, "E": 0, "M": 0},
                                  "Lista": [
                                      {"Nome": "Arcana Negra", "Atributo": "INT", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                                      {"Nome": "Arcana Branca", "Atributo": "INT", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                                      {"Nome": "Anima", "Atributo": "PRE", "Proficiencia": "N", "Bonus_Item": 0, "Bonus_Especial": 0, "Lista": []},
                                  ]}},
        "Ataques": {"Proficiencia": "N", "Lista": [
            {"Nome": "Manobras", "Atributo": "FOR", "Bonus_Item": 0, "Bonus_Especial": 0,
             "Categoria": None, "Propriedade": None, "Fonte": "Padrao"}]},
        "Inventario": {
            "Ouro": 0,
            "Armadura": {"Nome": "", "Categoria": "", "Propriedade": "",
                         "Proficiencia": {"Sem": "P", "Leve": "N", "Pesada": "N"}},
            "Escudo": {"Nome": "", "Dano": 0, "Dureza": 0, "Categoria": "", "Propriedade": "", "Proficiencia": "N"},
            "Tesouros": [], "Tesouros_Especiais": "", "Consumiveis": [],
            "Armas": {"Proficiencia": {"Simples": "P", "Marciais": "N", "Especificas": []}, "Lista": []},
        },
        "Biografia": {"Passado": "", "Motivacao": "", "Genero": "", "Idade": "", "Naturalidade": "",
                      "Altura": "", "Peso": "", "Ideais": [], "Desprezos": [], "Qualidades": [],
                      "Defeitos": [], "Anotacoes": ""},
        "Completo": True,
    }


CORPO = "#Criatura\n\n```autosheet-yaml\nModo: Resumo\n```\n"


def dump_nota(fm: dict) -> str:
    y = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False, width=4096)
    return f"---\n{y}---\n{CORPO}"


def monta(spec: dict) -> dict:
    """spec → frontmatter derivado. A regra roda UMA vez, depois que as armas
    já estão na lista (senão o Bonus_Item delas não é atingido pelo `*`)."""
    fm = esqueleto()
    tier, papel, mod = spec["tier"], spec["papel"], spec.get("mod")
    fm["Tier"] = tier
    fm["Atributos"] = {"Principal": spec["principal"], **spec["atributos"]}
    intel = spec["atributos"]["INT"]

    # Bônus de item do monstro (Evolução Básica: Tier−1; +1 com modificador) —
    # e a QUALIDADE da arma é a que produz esse bônus, pra ficha não se
    # contradizer (Adepto +1, Experiente +2, Mestre +3).
    bonus = tier - 1 + (1 if mod else 0)
    qualidade = {1: "Adepto", 2: "Experiente", 3: "Mestre"}.get(bonus)
    agi, forca = spec["atributos"]["AGI"], spec["atributos"]["FOR"]
    especificas = []
    lista_armas = []
    for a in spec.get("armas", []):
        info = ARMAS.get(a["nome"], {})
        grupo = str(info.get("grupo", ""))
        # arma a distância e arcanônica atacam com AGI; corpo-a-corpo Precisa
        # usa AGI quando a criatura é mais ágil que forte.
        atributo = "AGI" if grupo.startswith("d-") or (info.get("precisa") and agi > forca) else "FOR"
        if grupo == "d-arcanonico":
            especificas.append(f"[[{a['nome']}]]")
        lista_armas.append({
            "Nome": f"[[{a['nome']}]]",
            "Atributo": atributo,
            "Bonus_Item": 0, "Bonus_Especial": 0,
            "Categoria": f"[[{qualidade}]]" if (a.get("propriedade") and qualidade) else None,
            "Propriedade": f"[[{a['propriedade']}]]" if a.get("propriedade") else None,
            "Fonte": "Manual",
        })
    fm["Inventario"]["Armas"]["Lista"] = lista_armas
    if especificas:
        fm["Inventario"]["Armas"]["Proficiencia"]["Especificas"] = especificas

    aplicar(elementos(papel, "Classes de Bestiário"), fm, tier, intel)
    aplicar(elementos("Evolução Básica de Monstro", "Modificadores"), fm, tier, intel)
    if mod:
        if mod in ("Elite", "Solo"):
            aplicar(elementos("Competente", "Modificadores"), fm, tier, intel)
        aplicar(elementos(mod, "Modificadores"), fm, tier, intel)

    alias = f"{papel} {mod}" if mod else papel
    fm["Classe"] = f"[[{papel}|{alias}]]"
    fm["aliases"] = spec.get("aliases", [])
    fm["Raça"] = spec.get("raca", "[[Humano|Humano (Médio)]]")
    fm["Tamanho"] = spec.get("tamanho", "Médio")
    fm["Sintonia"] = spec.get("sintonia", "")
    fm["Descrição"] = spec.get("descricao", "")
    fm["Bairros"] = spec.get("bairros", [])

    hab = [{"[[Evolução Básica de Monstro]]": f"Regra.[[{papel}]]"}]
    for h in spec.get("habilidades", []):
        hab.append({f"[[{h}]]": "Manual.Habilidade"})
    if mod:
        hab.append({f"[[{mod}]]": "Manual.Modificador"})
    fm["Habilidades"]["Lista"] = hab

    for nome, prof in spec.get("pericias", []):
        canon = PERICIA_POA.get(nome, nome)
        linha = next(x for x in fm["Pericias"]["Lista"] if x["Nome"] == canon)
        linha["Proficiencia"] = prof
        incs = [{"A": "Slot.A"}]
        if prof in ("E", "M"):
            incs.append({"E": "Slot.E"})
        if prof == "M":
            incs.append({"M": "Slot.M"})
        linha["Incrementos"] = incs

    if spec.get("linha_magia"):
        alvo = next(x for x in fm["Magias"]["Lista"] if x["Nome"] == spec["linha_magia"])
        alvo["Lista"] = [{f"[[{m}]]": "Regra"} for m in spec.get("magias", [])]

    inv = spec.get("inventario", {})
    if inv.get("armadura"):
        a = inv["armadura"]
        pesada = "Pesada" in a["nome"]
        fm["Inventario"]["Armadura"] = {
            "Nome": f"[[{a['nome']}]]",
            "Categoria": f"[[{a['categoria']}]]" if a.get("categoria") else "",
            "Propriedade": f"[[{a['propriedade']}]]" if a.get("propriedade") else "",
            "Proficiencia": {"Sem": "P", "Leve": "P", "Pesada": "P" if pesada else "N"},
        }
    if inv.get("escudo"):
        e = inv["escudo"]
        fm["Inventario"]["Escudo"] = {
            "Nome": f"[[{e['nome']}]]", "Dano": e.get("dano", 4), "Dureza": e.get("dureza", 5),
            "Categoria": f"[[{e['categoria']}]]" if e.get("categoria") else "",
            "Propriedade": f"[[{e['propriedade']}]]" if e.get("propriedade") else "",
            "Proficiencia": "P",
        }
    fm["Inventario"]["Tesouros"] = [f"[[{t}]]" for t in inv.get("tesouros", [])]
    fm["Inventario"]["Consumiveis"] = [f"[[{c}]]" for c in inv.get("consumiveis", [])]
    fm["Inventario"]["Ouro"] = inv.get("ouro", 0)
    return fm


def escreve_bestiario(criaturas, dry=False) -> int:
    BESTIARIO.mkdir(parents=True, exist_ok=True)
    n = 0
    for spec in criaturas:
        fm = monta(spec)
        destino = BESTIARIO / f"{spec['nome']}.md"
        texto = dump_nota(fm)
        if not dry:
            destino.write_text(texto, encoding="utf8")
        n += 1
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="não escreve, só conta")
    args = ap.parse_args()
    sys.path.insert(0, str(Path(__file__).parent))
    from poa_bestiario_dados import CRIATURAS
    n = escreve_bestiario(CRIATURAS, dry=args.check)
    print(("(dry) " if args.check else "") + f"{n} criaturas em {BESTIARIO}")
