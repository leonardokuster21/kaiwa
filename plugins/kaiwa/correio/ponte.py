"""ponte.py do Kaiwa: a mesma interface do correio por git (comandos, saídas e a classe Ponte), sobre uma conversa do
Kaiwa 2.0 (o agente continua trabalhando; lê e responde por comando).

Quem já usa o ponte.py troca só a pasta: este arquivo fica em ~/.kaiwa/conversas/<apelido>/, ao lado de kaiwa.json,
que diz onde estão o Node e a CLI do Kaiwa e qual é a conversa. Só biblioteca padrão. Sem IA e sem navegador.
O --lado (pessoal ou trabalho) continua aceito, para a linha de comando não mudar; quem diz o lado é a conversa.

  python ponte.py --lado pessoal|trabalho <comando>

Comandos (como no correio por git):
  enviar --tipo T --arquivo msg.txt   cifra e manda pela conversa (sem rede, fica na fila e sai no próximo comando)
  ler                                 imprime o que chegou do outro lado e ainda não foi confirmado
  confirmar                           marca como lido o que o último `ler` mostrou e manda o recibo de lido
  vivo                                consulta o relay (o outro lado vê há quantos minutos este lado deu sinal)
  estado                              há novidade? quando o outro lado deu sinal? (só palavras fixas)
  recibos                             das mensagens deste lado: entregue, lida (há quanto tempo) e respondida (novo)
  historico [--desde <id>]            uma linha por mensagem, desde uma mensagem, para as notas (novo)

Em enviar, opcionais (novos): --fio <assunto>, --responde <começo do id>, --prazo "AAAA-MM-DD HH:MM",
--palavra "<a frase exata do humano>" --palavra-quando "<data e hora>" --palavra-onde "<canal>".

`estado` nunca imprime o texto de uma mensagem: o que um vigia imprime entra no terminal como se fosse digitado.
Saídas de `estado`: novidade=sim|nao, quantas=N, rede=ok|falhou, outro-lado=vivo|sem-sinal|nunca|desconhecido,
sinal-ha-min=N, na-fila=N, entregues-nao-lidas=N, nao-entregues=N.
Código de saída: 0 = há novidade; 1 = nada de novo; 2 = erro; 3 = ficou na fila.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

LADOS = ("pessoal", "trabalho")
LIMITE_SEM_SINAL_MIN = 60


class Erro(Exception):
    pass


class Ponte:
    """A mesma classe do correio por git, para quem a importa (um vigia): estado(), vivo(), enviar(), ler(), confirmar()."""

    def __init__(self, repo: Path, lado: str, limite_min: int = LIMITE_SEM_SINAL_MIN):
        self.pasta = Path(repo)
        self.limite = limite_min
        try:
            k = json.loads((self.pasta / "kaiwa.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raise Erro(f"falta {self.pasta / 'kaiwa.json'}: rode `conversa ponte --nome <apelido>` na CLI do Kaiwa")
        self.node, self.cli, self.nome = k["node"], k["cli"], k["conversa"]
        self._estado = None

    def _rodar(self, *args: str) -> subprocess.CompletedProcess:
        r = subprocess.run([self.node, self.cli, "conversa", *args, "--nome", self.nome], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 2:
            raise Erro((r.stderr or r.stdout).strip().removeprefix("erro: "))
        return r

    def _json(self, *args: str):
        r = self._rodar(*args, "--json", "1")
        return json.loads(r.stdout or "null")

    def estado(self) -> tuple[list[str], bool, float | None]:
        s = self._json("estado", "--limite", str(self.limite))
        self._estado = s
        return s["novas"], s["rede"], s["minutos"]

    def na_fila(self) -> int:
        if self._estado is None:
            self.estado()
        return int(self._estado["naFila"])

    def sincronizar(self) -> bool:
        return bool(self._json("estado", "--limite", str(self.limite))["rede"])

    def vivo(self) -> bool:
        return self.sincronizar()

    def enviar(self, tipo: str, texto: str, **extras: str) -> tuple[str, bool]:
        """extras: fio, responde, prazo, palavra, palavra_quando, palavra_onde (todos opcionais)."""
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(texto)
            caminho = f.name
        try:
            mais = [a for k, v in extras.items() if v for a in (f"--{k.replace('_', '-')}", str(v))]
            r = self._rodar("falar", "--tipo", tipo, "--arquivo", caminho, *mais)
        finally:
            os.unlink(caminho)
        linha = (r.stdout or "").strip()
        if r.returncode in (4, 5):  # o porteiro segurou, ou a conversa recusou (escuta, pausa, fora da vez)
            raise Erro(linha)
        ident = linha.split()[0].removeprefix("enviado=") if linha else ""
        return ident, r.returncode == 0

    def ler(self) -> list[tuple[str, str]]:
        return [(f"{m['id']} ({m['tipo']}, de {m['de']})", m["texto"]) for m in self._json("ler")]

    def confirmar(self) -> int:
        r = self._rodar("confirmar")
        return int((r.stdout or "confirmadas=0").strip().split("=")[-1])

    def recibos(self) -> list[dict]:
        return self._json("recibos")

    def historico(self, desde: str = "") -> str:
        return (self._rodar("historico", "--resumo", "1", *(["--desde", desde] if desde else [])).stdout or "").strip()


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lado", required=True, choices=LADOS)
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parent), help="a pasta do correio (padrão: a deste arquivo)")
    ap.add_argument("--limite", type=int, default=LIMITE_SEM_SINAL_MIN, help="minutos sem sinal para dar o outro lado como mudo")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("enviar")
    e.add_argument("--tipo", required=True)
    e.add_argument("--arquivo", required=True)
    for opc in ("fio", "responde", "prazo", "palavra", "palavra-quando", "palavra-onde"):
        e.add_argument(f"--{opc}", default="")
    h = sub.add_parser("historico")
    h.add_argument("--desde", default="")
    for c in ("ler", "confirmar", "vivo", "estado", "recibos"):
        sub.add_parser(c)
    a = ap.parse_args(argv)
    try:
        p = Ponte(Path(a.repo), a.lado, a.limite)
        if a.cmd == "enviar":
            extras = {k: getattr(a, k) for k in ("fio", "responde", "prazo", "palavra", "palavra_quando", "palavra_onde")}
            nome, ok = p.enviar(a.tipo, Path(a.arquivo).read_text(encoding="utf-8-sig"), **extras)
            print(f"enviado={nome} rede={'ok' if ok else 'falhou-na-fila'}")
            return 0 if ok else 3
        if a.cmd == "ler":
            itens = p.ler()
            if not itens:
                print("nada novo")
            for nome, texto in itens:
                print(f"===== {nome} =====\n{texto}")
            return 0
        if a.cmd == "confirmar":
            print(f"confirmadas={p.confirmar()}")
            return 0
        if a.cmd == "vivo":
            ok = p.vivo()
            print(f"vivo={'ok' if ok else 'rede-falhou'}")
            return 0 if ok else 3
        if a.cmd == "recibos":
            for m in p.recibos():
                print(f"{m['id'][:8]} {m.get('etiqueta') or m['tipo']} entregue={(m['entregue'] or 'nao')[:16]} lida={(m['lida'] or 'nao')[:16]} respondida={'sim' if m.get('respondida') else 'nao'}")
            return 0
        if a.cmd == "historico":
            print(p.historico(a.desde) or "nada desde então")
            return 0
        novas, rede, min_ = p.estado()
        print(f"novidade={'sim' if novas else 'nao'} quantas={len(novas)} rede={'ok' if rede else 'falhou'}")
        if min_ is None:
            print("outro-lado=nunca" if rede else "outro-lado=desconhecido")
        else:
            print(f"outro-lado={'vivo' if min_ <= a.limite else 'sem-sinal'} sinal-ha-min={int(min_)}")
        if p.na_fila():
            print(f"na-fila={p.na_fila()}")
        s = p._estado
        print(f"entregues-nao-lidas={len(s['entreguesNaoLidas'])} nao-entregues={len(s['naoEntregues'])}")
        return 0 if novas else 1
    except Erro as ex:
        print(f"erro: {ex}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
