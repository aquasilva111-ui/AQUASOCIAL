#!/usr/bin/env python3
"""
Gera test/vetores/paridade.json com o Python de VERDADE da U.I.
(I.U-A.I/repositorio.py: normalizar, gerar_id; pendentes.py: _chave),
usado só como referência de leitura — nada é escrito lá.

    PYTHONDONTWRITEBYTECODE=1 UI_DIR=<clone de I.U-A.I> BASE_DIR=<clone de base-de-sinteses> \
        python3 scripts/gerar-vetores.py

Das amostras reais da base-de-sinteses só vão os campos que formam o id
(tipo, nomes, âncoras, origem/destino/tipo/contexto): nada de descrições,
conversas ou procedência. O script confere cada id antes de gravar.
"""
import glob
import json
import os
import sys
import unicodedata
from pathlib import Path

sys.dont_write_bytecode = True
UI_DIR = Path(os.environ["UI_DIR"]).resolve()
BASE_DIR = Path(os.environ["BASE_DIR"]).resolve()
sys.path.insert(0, str(UI_DIR))

from repositorio import gerar_id, normalizar  # noqa: E402
from pendentes import _chave  # noqa: E402

DIFICEIS = [
    "Ação", "Ac\u0327a\u0303o", "2ª Esfera: Criação", "２ª", "ﬁnal", "İstanbul", "ı",
    "ΟΔΟΣ ΣΟΦΟΣ", "Σ", "Straße", "ẞ", "Ǆemal", "ǅ", "♒︎", "🜔", "☽♇", "👨‍👩‍👧",
    "  muitos   espaços\t\n", "a\u00a0b", "a\u3000b", "a\u001cb", "a\u001fb", "a\u0085b",
    "a\ufeffb", "a\u200bb", "aspas \" e \\ barra", "ctrl\u0001x\u007f", "linha\u2028sep\u2029",
    "Ꭰ cherokee", "①", "ℌ", "\u2126", "\u212a", "ﾊﾟ", "㍿", "x\u0301\u0301", "\u0345",
    "MAIÚSCULAS E minúsculas", "", "   ", "OUTRAS INTELIGÊNCIAS", "Autômato ☽♇",
]
SEM_ID = ["\ud800", "a\udc00b"]          # surrogate isolado: o Python não consegue gravar


def main() -> None:
    vetores = {"gerado_por": "scripts/gerar-vetores.py", "unicode_python": unicodedata.unidata_version,
               "normalizar": [], "convencoes": [], "sinapses": [], "sinteses": [],
               "pendentes": [], "sem_id": [], "reais": []}
    for s in DIFICEIS:
        vetores["normalizar"].append({"entrada": s, "saida": normalizar(s)})
        vetores["convencoes"].append({"tipo": "conceito", "nome": s,
                                      "id": gerar_id("convencao", normalizar("conceito"), normalizar(s))})
        vetores["convencoes"].append({"tipo": s, "nome": "x",
                                      "id": gerar_id("convencao", normalizar(s), normalizar("x"))})
    for fonte, valor in [("wikidata", "Q155"), ("wikidata", "Q220"), ("outra-fonte", "Ação ♒︎")]:
        vetores["convencoes"].append({"ancora": [fonte, valor], "id": gerar_id("convencao", fonte, valor)})
    a, b = gerar_id("convencao", "tema", "música"), gerar_id("convencao", "tema", "arte")
    for tipo, ctx in [("leva a", ""), ("É PARTE DE", "Ciclo  Contínuo"), ("coocorre", "noite"),
                      ("simboliza", "♒︎ e 🜔"), ("a\u0085b", "c\ufeffd")]:
        vetores["sinapses"].append({"origem": a, "destino": b, "tipo": tipo, "contexto": ctx,
                                    "id": gerar_id("sinapse", a, b, normalizar(tipo), normalizar(ctx))})
    ids = [gerar_id("sinapse", a, b, "x", str(i)) for i in range(4)]
    for grupo in [ids, list(reversed(ids)) + ids[:2], ids[:1]]:
        vetores["sinteses"].append({"sinapses": grupo, "id": gerar_id("sintese", sorted(set(grupo)))})
    for proposta in [
        {"forma": "inferencia-aqua", "pasta": "convencoes",
         "objeto": {"tipo": "tema", "nomes": ["música"], "forca": 1}},
        {"z": 1, "a": [True, None, "ç"], "É": {"b": "♒︎", "a": -3}, "pendente_id": "ignorado",
         "procedencia": {"ignorado": 1}},
        {"texto": "aspas \" \\ \n\t\u2028 \u0001"},
    ]:
        vetores["pendentes"].append({"proposta": proposta, "id": _chave(proposta)})
    for s in SEM_ID:
        try:
            json.dumps(["convencao", "conceito", normalizar(s)], ensure_ascii=False).encode("utf-8")
            raise AssertionError("esperava erro do Python")
        except UnicodeEncodeError:
            vetores["sem_id"].append(s)

    escolhidas = 0
    for f in sorted(glob.glob(str(BASE_DIR / "7-convencoes-de-realidade/convencoes/*.json"))):
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        nomes = d["nomes"]
        dificil = d.get("ancoras") or any(any(ord(ch) > 127 for ch in n) or n != normalizar(n)
                                          for n in nomes)
        if not dificil:
            continue
        candidatos = [gerar_id("convencao", k, v) for k, v in (d.get("ancoras") or {}).items()]
        candidatos += [gerar_id("convencao", normalizar(d["tipo"]), normalizar(n)) for n in nomes]
        assert d["id"] in candidatos, f
        amostra = {"pasta": "convencoes", "arquivo": str(Path(f).relative_to(BASE_DIR)),
                   "id": d["id"], "tipo": d["tipo"], "nomes": nomes}
        if d.get("ancoras"):
            amostra["ancoras"] = d["ancoras"]
        vetores["reais"].append(amostra)
        escolhidas += 1
        if escolhidas >= 16:
            break
    for f in sorted(glob.glob(str(BASE_DIR / "*/sinapses/*.json")))[:6]:
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        assert d["id"] == gerar_id("sinapse", d["origem"], d["destino"], normalizar(d["tipo"]),
                                   normalizar(d.get("contexto", ""))), f
        vetores["reais"].append({"pasta": "sinapses", "arquivo": str(Path(f).relative_to(BASE_DIR)),
                                 "id": d["id"], "origem": d["origem"], "destino": d["destino"],
                                 "tipo": d["tipo"], "contexto": d.get("contexto", ""),
                                 "esfera": d.get("esfera")})

    saida = Path(__file__).resolve().parent.parent / "test" / "vetores" / "paridade.json"
    saida.write_text(json.dumps(vetores, ensure_ascii=True, indent=1) + "\n", encoding="utf-8")
    print(f"{saida.name}: {sum(len(v) for v in vetores.values() if isinstance(v, list))} vetores")


if __name__ == "__main__":
    main()
