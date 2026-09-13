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


# ───────────────────── compatibilidade módulo × hospedeiro ─────────────────────
# O sistema declara, na PRÓPRIA nota do tesouro, a que ele se aplica (verbo
# `AplicavelA`): módulo de corte não entra em maça, nenhum módulo entra em arma
# natural e NENHUM entra em arma arcanônica. Aqui isso é lido da nota (fonte de
# verdade) e vira erro de geração — a mesma semântica que o app avalia em
# `src/rules/aplicavel-a.ts` (AND entre os grupos, OR dentro do grupo).

EQUIPAMENTO = VAULT / "Sistema/Equipamento"
_ITENS: dict[str, dict] = {}


def itens_do_catalogo() -> dict[str, dict]:
    if not _ITENS:
        for p in EQUIPAMENTO.rglob("*.md"):
            try:
                fm = fm_da_nota(p)
            except Exception:
                continue
            if isinstance(fm, dict) and fm.get("categoria") == "Item":
                _ITENS[p.stem] = fm
    return _ITENS


def _predicados_aplicavel(fm_tesouro: dict):
    """`AplicavelA Grupo,cac-marcial|cac-simples Tipo,corte` → [[(slot,valor)…]…].
    None = o tesouro não restringe hospedeiro."""
    for e in fm_tesouro.get("Elementos_de_Regra") or []:
        txt = str(e).strip()
        if not txt.startswith("AplicavelA "):
            continue
        grupos = []
        for bloco in txt[len("AplicavelA "):].split():
            slot, cond = None, []
            for pedaco in bloco.split("|"):
                if "," in pedaco:
                    slot, agulha = pedaco.split(",", 1)
                else:
                    agulha = pedaco
                cond.append((slot, agulha))
            grupos.append(cond)
        return grupos
    return None


def _basename_wl(s: str) -> str:
    s = str(s).strip()
    m = re.fullmatch(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", s)
    return (m.group(1) if m else s).strip()


def _casa(fm_host: dict, slot: str, agulha: str) -> bool:
    chave = _slug(slot or "")
    if chave == "propriedades":
        m = re.fullmatch(r"Contem\((.+)\)", agulha.strip())
        alvo = _slug(_basename_wl(m.group(1) if m else agulha))
        props = fm_host.get("propriedades") or []
        return any(_slug(_basename_wl(x)) == alvo for x in props)
    valor = {
        "subcategoria": fm_host.get("subcategoria"),
        "grupo": fm_host.get("grupo"),
        "tipo": fm_host.get("tipo"),
        "maos": fm_host.get("mãos", fm_host.get("maos")),
    }.get(chave)
    if valor is None:
        return False
    return str(valor).strip().lower() == agulha.strip().lower()


def checa_hospedagem(tesouro: str, host: str, dono: str):
    """Estoura se o módulo/premium não puder morar nesse item."""
    cat = itens_do_catalogo()
    fm_t, fm_h = cat.get(tesouro), cat.get(host)
    if fm_t is None:
        raise SystemExit(f"{dono}: tesouro '{tesouro}' não existe no catálogo")
    if fm_h is None:
        raise SystemExit(f"{dono}: item '{host}' não existe no catálogo")
    preds = _predicados_aplicavel(fm_t)
    if preds is None:
        return
    if not all(any(_casa(fm_h, slot, ag) for slot, ag in grupo) for grupo in preds):
        raise SystemExit(f"{dono}: '{tesouro}' não é aplicável a '{host}' "
                         f"(grupo {fm_h.get('grupo')}, tipo {fm_h.get('tipo')})")


# ───────────────────── a criatura alcança a própria arma? ─────────────────────
# `Força X` e `Inteligência X` são requisitos, não decoração: quem fica abaixo
# de Força leva −1 cumulativo em ataque e dano (−2 e −5 de alcance no arco, ou
# recarga dobrada na besta) e quem fica abaixo de Inteligência simplesmente NÃO
# ATACA com a arma. O bestiário tinha 18 casos assim. Aqui vira erro de geração:
# nenhuma criatura carrega arma que ela não consegue usar.

def requisitos_da_arma(nome: str) -> tuple[int, int]:
    fm = itens_do_catalogo().get(nome) or {}
    forca = intelecto = 0
    for prop in fm.get("propriedades") or []:
        m = re.search(r"Força\s+(\d+)", str(prop))
        if m:
            forca = int(m.group(1))
        m = re.search(r"Intelig[êe]ncia\s+(\d+)", str(prop))
        if m:
            intelecto = int(m.group(1))
    return forca, intelecto


def checa_requisitos(nome: str, atributos: dict, dono: str):
    if nome not in itens_do_catalogo():
        raise SystemExit(f"{dono}: arma '{nome}' não existe no catálogo")
    forca, intelecto = requisitos_da_arma(nome)
    if atributos["FOR"] < forca:
        raise SystemExit(f"{dono}: '{nome}' pede Força {forca} e a criatura tem "
                         f"FOR {atributos['FOR']}")
    if atributos["INT"] < intelecto:
        raise SystemExit(f"{dono}: '{nome}' pede Inteligência {intelecto} e a criatura "
                         f"tem INT {atributos['INT']} — não conseguiria atacar")


# ─────────────────────── tecnologias: catálogo e repartição ───────────────────
# O catálogo de magia é a VAULT, não uma lista mantida à mão: o mestre pediu que
# o bestiário exercitasse o sistema inteiro, e "tecnologia" na POA é justamente
# `Sistema/Criação de Personagem/Magia`. Ler dali é o que garante que uma magia
# nova nasça sem dono visível em vez de sumir do radar.

MAGIA = VAULT / "Sistema/Criação de Personagem/Magia"
RANKS = ["Básica", "Adepta", "Experiente", "Mestre"]
# Até que rank cada tier alcança. T0 só o básico; T3 chega no Mestre.
TETO_RANK = {0: 1, 1: 2, 2: 3, 3: 4}
# pasta → escola no vocabulário da POA
ESCOLA_DA_PASTA = {
    "Magia Anima": "Lênica",
    "Magia Arcana Branca": "Positrônica",
    "Magia Arcana Negra": "Negatrônica",
    "Magia Arcana Essencial": "Utilitrônica",
}


def catalogo_magias() -> list[dict]:
    """Toda magia da vault, com escola, elemento e rank. A escola vem da PASTA
    (é ela que separa Branca de Negra de Essencial); o rank e o elemento vêm do
    frontmatter da própria magia."""
    out = []
    for md in sorted(MAGIA.rglob("*.md")):
        try:  # as notas-índice da pasta não têm frontmatter
            fm = fm_da_nota(md)
        except Exception:
            continue
        if not isinstance(fm, dict) or fm.get("categoria") != "Magia":
            continue
        partes = md.relative_to(MAGIA).parts
        escola = None
        for parte in partes[:-1]:
            for pasta, nome in ESCOLA_DA_PASTA.items():
                if parte.startswith(pasta):
                    escola = nome
        if escola is None:
            # `Magia Especial` (Trônicos Especiais) fica DE FORA da cobertura do
            # bestiário de propósito: as quatro não se escolhem, vêm de
            # habilidade de HERÓI — Raio Arcano de [[Princípios Arcanos]]
            # (Arcanista) e as três do Bardo de [[Estilo de Combate (Arte
            # Mágica)]]. Nenhuma das oito classes de bestiário as alcança.
            continue
        rank = str(fm.get("rank") or "Básica")
        out.append({"nome": md.stem, "escola": escola, "rank": rank,
                    "elemento": fm.get("elemento") or None,
                    "ordem": (RANKS.index(rank) if rank in RANKS else 0, md.stem)})
    return out


def _pool_da_criatura(spec: dict, catalogo: list[dict]) -> list[dict]:
    teto = TETO_RANK[spec["tier"]]
    return [m for m in catalogo
            if m["escola"] == spec["escola"]
            and RANKS.index(m["rank"]) < teto
            # Na Lênica o Fator do sangue tranca o elemento; as magias sem
            # elemento (Manifestação Básica e cia.) servem a qualquer Fator.
            and (spec["escola"] != "Lênica" or m["elemento"] in (None, spec["elemento"]))]


def distribui_magias(criaturas: list[dict]) -> list[str]:
    """Reparte o catálogo entre os operadores e devolve o que ficou sem dono.

    Duas passadas: primeiro cada magia AINDA SEM DONO procura o operador elegível
    mais vazio (cobertura antes de sabor), depois as vagas que sobraram são
    preenchidas com o que couber. Determinístico.

    A ORDEM da primeira passada é o que faz a conta fechar. Do rank mais ALTO
    para o mais baixo, porque uma Mestre só cabe num T3 e uma Básica cabe em
    qualquer um: servir as difíceis primeiro reserva o teto pra quem precisa
    dele. E, dentro do rank, as de elemento antes das neutras — a neutra serve
    qualquer Fator, então é ela que deve sobrar pra tapar buraco."""
    catalogo = catalogo_magias()
    casters = [s for s in criaturas if s.get("escola")]
    for s in casters:
        s["magias"] = []
    pools = {s["nome"]: _pool_da_criatura(s, catalogo) for s in casters}

    def prioridade(m: dict):
        return (-RANKS.index(m["rank"]), 0 if m["elemento"] else 1, m["nome"])

    for magia in sorted(catalogo, key=prioridade):
        aptos = [s for s in casters
                 if magia in pools[s["nome"]] and len(s["magias"]) < s["n_magias"]]
        if not aptos:
            continue
        # o mais vazio primeiro; empate resolve pelo menor tier (deixa o teto
        # alto livre pras magias que só ele alcança) e depois pelo nome
        aptos.sort(key=lambda s: (len(s["magias"]), s["tier"], s["nome"]))
        aptos[0]["magias"].append(magia["nome"])

    postos = {m for s in casters for m in s["magias"]}
    for s in casters:
        for magia in sorted(pools[s["nome"]], key=lambda m: m["ordem"]):
            if len(s["magias"]) >= s["n_magias"]:
                break
            if magia["nome"] not in s["magias"]:
                s["magias"].append(magia["nome"])
    return sorted(m["nome"] for m in catalogo if m["nome"] not in postos)


# ───────────────────── tecnologias que o tesouro concede ─────────────────────
# `Complementar Magias.Lista.Tesouros.Lista [[X]]` na nota do tesouro: é o que
# põe Detectar Magia na ficha de quem carrega um Sensor Arcano. A ficha do herói
# já traz isso; a da criatura não trazia — o bloco Tesouros nascia vazio.

def magias_do_tesouro(nome: str, categoria: str) -> list[str]:
    fm = itens_do_catalogo().get(nome) or {}
    out: list[str] = []
    for e in fm.get("Elementos_de_Regra") or []:
        m = re.match(r"^(?:Categoria (\w+) )?Complementar Magias\.Lista\.Tesouros\.Lista (.+)$",
                     str(e).strip())
        if not m:
            continue
        exige, alvo = m.groups()
        if exige and exige != categoria:
            continue
        nome_magia = _basename_wl(alvo)
        if nome_magia not in out:
            out.append(nome_magia)
    return out


# ─────────────────────────── esqueleto da criatura ───────────────────────────

def linha_pericia(nome: str, atributo: str) -> dict:
    return {"Nome": nome, "Atributo": atributo, "Proficiencia": "N", "Bonus_Item": 0,
            "Bonus_Especial": 0, "Especializacao": "", "Maestria": "", "Incrementos": []}


def esqueleto() -> dict:
    return {
        "aliases": [], "categoria": "Criatura", "subcategoria": "Monstro", "grupo": [],
        "Imagem": "", "Tier": 0, "Classe": "", "Modificador": "", "Sintonia": "", "Raça": "",
        "Tamanho": "Médio",
        "Descrição": "",
        "Afiliação": "",
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
        checa_requisitos(a["nome"], spec["atributos"], spec["nome"])
        if a.get("propriedade"):
            # Módulo/premium só entra onde existe QUALIDADE que o sustente: o
            # bônus de item do monstro é Tier−1 (+1 com modificador), então um
            # T1 comum tem 0 e a ficha sairia com propriedade sem categoria.
            if not qualidade:
                raise SystemExit(f"{spec['nome']}: '{a['propriedade']}' em "
                                 f"'{a['nome']}' sem qualidade — bônus de item 0")
            checa_hospedagem(a["propriedade"], a["nome"], spec["nome"])
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
    # O MODIFICADOR vive num campo próprio do FM: é de lá que a dificuldade de
    # encontro lê (parseModificador) — o alias da Classe é só display. Sem ele,
    # um Solo pontuava como monstro comum e todo encontro saía subavaliado.
    if mod:
        fm["Modificador"] = mod
    else:
        fm.pop("Modificador", None)
    fm["aliases"] = spec.get("aliases", [])
    fm["Raça"] = spec.get("raca", "[[Humano|Humano (Médio)]]")
    fm["Tamanho"] = spec.get("tamanho", "Médio")
    fm["Sintonia"] = spec.get("sintonia", "")
    fm["Descrição"] = spec.get("descricao", "")
    # AFILIAÇÃO: a organização (ou, pra bicho e avulso, o lugar) a que a
    # criatura responde. É o que agrupa o bestiário fora do tier.
    fm["Afiliação"] = spec.get("org", "")
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
        if a.get("propriedade"):
            checa_hospedagem(a["propriedade"], a["nome"], spec["nome"])
        pesada = "Pesada" in a["nome"]
        fm["Inventario"]["Armadura"] = {
            "Nome": f"[[{a['nome']}]]",
            "Categoria": f"[[{a['categoria']}]]" if a.get("categoria") else "",
            "Propriedade": f"[[{a['propriedade']}]]" if a.get("propriedade") else "",
            "Proficiencia": {"Sem": "P", "Leve": "P", "Pesada": "P" if pesada else "N"},
        }
    if inv.get("escudo"):
        e = inv["escudo"]
        if e.get("propriedade"):
            checa_hospedagem(e["propriedade"], e["nome"], spec["nome"])
        fm["Inventario"]["Escudo"] = {
            "Nome": f"[[{e['nome']}]]", "Dano": e.get("dano", 4), "Dureza": e.get("dureza", 5),
            "Categoria": f"[[{e['categoria']}]]" if e.get("categoria") else "",
            "Propriedade": f"[[{e['propriedade']}]]" if e.get("propriedade") else "",
            "Proficiencia": "P",
        }
    fm["Inventario"]["Tesouros"] = [f"[[{t}]]" for t in inv.get("tesouros", [])]
    fm["Inventario"]["Consumiveis"] = [f"[[{c}]]" for c in inv.get("consumiveis", [])]
    fm["Inventario"]["Ouro"] = inv.get("ouro", 0)

    # O que o TESOURO concede entra na linha "Tesouros" do bloco de tecnologia —
    # é de lá que a ficha lê o Detectar Magia de quem carrega um Sensor Arcano.
    # A categoria do tesouro de criatura é a do tier (CAT_POR_TIER), e é ela que
    # decide o degrau: a Capa Discreta Mestre também dá Invisibilidade.
    categoria = {0: "Adepto", 1: "Adepto", 2: "Experiente", 3: "Mestre"}[tier]
    concedidas: list[dict] = []
    for t_nome in inv.get("tesouros", []):
        for magia in magias_do_tesouro(t_nome, categoria):
            chave = f"[[{magia}]]"
            if all(chave not in d for d in concedidas):
                concedidas.append({chave: f"Tesouro.[[{t_nome}]]"})
    if concedidas:
        alvo = next(x for x in fm["Magias"]["Lista"] if x["Nome"] == "Tesouros")
        alvo["Lista"] = concedidas
    return fm


def cobertura(criaturas) -> dict[str, list[str]]:
    """O que do catálogo NINGUÉM carrega. O pedido do mestre é que o bestiário
    exercite o sistema inteiro: pelo menos uma criatura por arma, por módulo e
    por equipamento (as versões A/E/M não precisam todas). Conta também as
    notas escritas à mão (as herdadas do bestiário base)."""
    tem: set[str] = set()
    for spec in criaturas:
        for a in spec.get("armas", []):
            tem.add(a["nome"])
            if a.get("propriedade"):
                tem.add(a["propriedade"])
        inv = spec.get("inventario", {})
        for slot in ("armadura", "escudo"):
            if inv.get(slot):
                tem.add(inv[slot]["nome"])
                if inv[slot].get("propriedade"):
                    tem.add(inv[slot]["propriedade"])
        tem |= set(inv.get("tesouros", [])) | set(inv.get("consumiveis", []))
    gerados = {spec["nome"] for spec in criaturas}
    for nota in BESTIARIO.glob("*.md"):
        if nota.stem in gerados:
            continue
        texto = nota.read_text(encoding="utf8")
        for nome in itens_do_catalogo():
            if f"[[{nome}]]" in texto or f"[[{nome}|" in texto:
                tem.add(nome)
    SEM_DONO = {"Ataque Desarmado", "Sem Armadura"}
    # O que o MUNDO declara que não existe nele não entra na cobertura: a POA
    # 1987 não tem as Garras do Rei-Mago (Contexto-Def, disponibilidade).
    fora = set(_json.loads((Path(__file__).parents[1] / "vault-data-cyberpunk/contexto.json")
                           .read_text(encoding="utf8")).get("disponibilidade", {}).get("indisponiveis", []))
    falta: dict[str, list[str]] = {}
    for nome, fm in sorted(itens_do_catalogo().items()):
        if nome in tem or nome in SEM_DONO or nome in fora:
            continue
        falta.setdefault(str(fm.get("subcategoria") or "?"), []).append(nome)
    return falta


# ─────────────────────────── encontros prontos ───────────────────────────
# Dificuldade ESPELHA as tabelas do plugin (runtime/encounter/contributions.ts),
# as mesmas que o app usa em src/mestre/encounter-compute.ts. Nada de fórmula
# nova aqui: só a conferência de que cada encontro entrega, pro grupo de
# referência do rank, a dificuldade que o spec declara.
PONTOS_TIER = {0: 5, 1: 10, 2: 25, 3: 40}
PONTOS_COMPETENTE = {0: 6, 1: 12, 2: 28, 3: 48}
PONTOS_HEROI = {1: 10, 2: 11, 3: 12, 4: 25, 5: 27, 6: 29, 7: 40, 8: 44, 9: 48, 10: 52}
# rank do encontro: a régua tier→rank do bestiário (T0 C, T1 B, T2 A, T3 S) e a
# faixa de níveis de cada um; o nível do MEIO é o grupo de referência.
RANK_DO_TIER = {0: ("C", "níveis 1–3", 2), 1: ("B", "níveis 4–6", 5),
                2: ("A", "níveis 7–9", 8), 3: ("S", "nível 10", 10)}


def pontos_da_criatura(fm: dict) -> int:
    tier = int(fm.get("Tier") or 0)
    mod = str(fm.get("Modificador") or "")
    if mod == "Competente":
        return PONTOS_COMPETENTE[tier]
    base = PONTOS_TIER[tier]
    return base * 2 if mod == "Elite" else base * 3 if mod == "Solo" else base


def rotulo_dificuldade(razao: float) -> str:
    if razao < 50:
        return "TRIVIAL"
    if razao <= 75:
        return "FÁCIL"
    if razao <= 100:
        return "DIFICIL"
    return "LETAL"


def dificuldade_do_encontro(enc: dict, fichas: dict[str, dict]) -> tuple[int, float, str]:
    total = sum(l["qtd"] * pontos_da_criatura(fichas[l["criatura"]]) for l in enc["roster"])
    nivel = RANK_DO_TIER[enc["tier"]][2]
    heroi = PONTOS_HEROI[nivel] * 4
    razao = total / heroi * 100
    return total, razao, rotulo_dificuldade(razao)


def fichas_do_bestiario(criaturas: list[dict] | None = None) -> dict[str, dict]:
    """Fichas pra conta de dificuldade. As geradas vêm do SPEC, não do disco —
    senão `--check` (que não escreve) não enxerga criatura nova e a conta
    estoura. As escritas à mão (as quatro herdadas) vêm da vault."""
    fichas = {p.stem: fm_da_nota(p) for p in BESTIARIO.glob("*.md") if p.stem != "Bestiário"}
    for spec in criaturas or []:
        fichas[spec["nome"]] = monta(spec)
    return fichas


CORPO_ENCONTRO = """### `= this.file.name`
> [!info] Encontro de tier {tier} — rank {rank} ({faixa})
> 📍**Onde:** `= this.Onde`
> 🎬**Situação:** `= this.Situação`

```combat-marker
{roster}
```
"""


_AMBIGUOS: set[str] | None = None


def wikilink_da_criatura(nome: str) -> str:
    """`[[Nome]]` — ou `[[caminho|Nome]]` quando o nome existe em MAIS DE UMA
    nota da vault. Sem isso o alvo resolve como `ambiguous` (catalog.resolve) e
    o combatente entra no roster SEM ficha: zero stats e zero ponto de
    dificuldade. A Coronel Luciana Prado tem nota de Pessoa e ficha de monstro."""
    global _AMBIGUOS
    if _AMBIGUOS is None:
        vistos: dict[str, int] = {}
        for md in VAULT.rglob("*.md"):
            if ".obsidian" in md.parts:
                continue
            vistos[md.stem] = vistos.get(md.stem, 0) + 1
        _AMBIGUOS = {n for n, q in vistos.items() if q > 1}
    if nome in _AMBIGUOS:
        return f"[[{BESTIARIO.relative_to(VAULT)}/{nome}|{nome}]]"
    return f"[[{nome}]]"


def escreve_encontros(encontros, fichas, dry=False) -> list[str]:
    """Escreve as notas de Combate e devolve as divergências de dificuldade."""
    COMBATES.mkdir(parents=True, exist_ok=True)
    avisos: list[str] = []
    for enc in encontros:
        total, razao, rotulo = dificuldade_do_encontro(enc, fichas)
        if rotulo != enc["alvo"]:
            avisos.append(f"{enc['nome']}: {rotulo} ({razao:.0f}%, {total} pts) — spec pede {enc['alvo']}")
        rank, faixa, _ = RANK_DO_TIER[enc["tier"]]
        fm = {"aliases": None, "categoria": "Combate", "subcategoria": "Encontro",
              "Tier": enc["tier"], "Onde": enc["onde"], "Situação": enc["situacao"],
              "Completo": True}
        linhas = "\n".join(
            f"- {l['qtd']} {wikilink_da_criatura(l['criatura'])} {l['velocidade']}"
            for l in enc["roster"])
        corpo = CORPO_ENCONTRO.format(tier=enc["tier"], rank=rank, faixa=faixa, roster=linhas)
        y = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False, width=4096)
        if not dry:
            (COMBATES / f"{enc['nome']}.md").write_text(f"---\n{y}---\n{corpo}", encoding="utf8")
    return avisos


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
    ap.add_argument("--cobertura", action="store_true", help="lista o catálogo sem dono")
    ap.add_argument("--encontros", action="store_true", help="tabela de dificuldade dos encontros")
    args = ap.parse_args()
    sys.path.insert(0, str(Path(__file__).parent))
    from poa_bestiario_dados import CRIATURAS
    # A repartição das tecnologias roda ANTES de qualquer coisa: é ela que
    # preenche spec["magias"], e tanto a geração quanto a cobertura leem de lá.
    orfas = distribui_magias(CRIATURAS)
    if args.cobertura:
        falta = cobertura(CRIATURAS)
        for sub, nomes in falta.items():
            print(f"{sub} ({len(nomes)}): " + " · ".join(nomes))
        total = len(catalogo_magias())
        print(f"Tecnologia: {total - len(orfas)}/{total} com dono"
              + (" · sem dono: " + " · ".join(orfas) if orfas else ""))
        if not falta and not orfas:
            print("catálogo inteiro coberto")
        sys.exit(0)
    from poa_bestiario_dados import ENCONTROS
    if orfas:
        print("! tecnologia sem dono: " + " · ".join(orfas))
    if args.encontros:
        fichas = fichas_do_bestiario(CRIATURAS)
        usadas: set[str] = set()
        for enc in sorted(ENCONTROS, key=lambda e: (e["tier"], e["nome"])):
            total, razao, rotulo = dificuldade_do_encontro(enc, fichas)
            marca = " " if rotulo == enc["alvo"] else "!"
            usadas |= {l["criatura"] for l in enc["roster"]}
            print(f"{marca} T{enc['tier']} {total:>4}pts {razao:>5.0f}%  {rotulo:<8} {enc['nome']}")
        sem = sorted(set(fichas) - usadas)
        print(f"\nsem encontro ({len(sem)}): " + (" · ".join(sem) if sem else "—"))
        sys.exit(0)
    n = escreve_bestiario(CRIATURAS, dry=args.check)
    avisos = escreve_encontros(ENCONTROS, fichas_do_bestiario(CRIATURAS), dry=args.check)
    print(("(dry) " if args.check else "") + f"{n} criaturas em {BESTIARIO}")
    print(("(dry) " if args.check else "") + f"{len(ENCONTROS)} encontros em {COMBATES}")
    for a in avisos:
        print("  ! " + a)
