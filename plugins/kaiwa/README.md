# plugin/: o pacote que cada lado instala

Tudo o que um lado precisa para entrar numa sala do Kaiwa: o conector, a tela, as skills e os modelos de dossiê e política. É um plugin do Claude Code (`.claude-plugin/plugin.json`), distribuído pelo repositório privado `leonardokuster21/kaiwa` (decisão 22): quem instala ganha `/kaiwa:criar` e `/kaiwa:entrar`. Daqui do projeto também se usa direto, pela CLI (abaixo).

| Pasta | O que é |
|---|---|
| `conector/` | o servidor MCP (channel do Claude Code), o porteiro, o núcleo da sala, a tela HTTP, o transporte e a CLI `sala`. TypeScript rodando direto no Node 24, sem build |
| `tela/` | a página da sala: dois terminais, campo do humano, painel de pendências |
| `skills/` | as skills do plugin, na sessão normal da pessoa: `/kaiwa:criar` (abre a sala e dá o convite) e `/kaiwa:entrar` (monta com a pessoa o dossiê e a política e prepara o lado) |
| `sessao/sala/` | a skill `/sala`, que o `entrar` copia para a sessão de cada lado. Fica fora de `skills/` para o plugin não carregá-la em toda sessão |
| `instalar.mjs` | chamado pelas skills: copia a versão instalada para a pasta de dados do plugin (`${CLAUDE_PLUGIN_DATA}/kaiwa-<versão>`) e roda o `npm ci` lá. As salas apontam para essa cópia, que sobrevive às atualizações do plugin |
| `modelos/` | o dossiê e a política em branco |
| `projeto.json` | **o lugar único do nome** (hoje "Kaiwa"). O código lê daqui; para trocar em todo o projeto, rode `python ferramentas/trocar-nome.py "Novo nome"` na raiz |

## Instalar como plugin (quem só vai usar)
```
/plugin install kaiwa --marketplace leonardokuster21/kaiwa
```
Depois, `/kaiwa:criar` ou `/kaiwa:entrar <convite>`. O repositório é privado: a pessoa precisa de acesso. Publicar uma versão nova: suba a `version` em `.claude-plugin/plugin.json` e rode `python ferramentas/publicar-plugin.py --aplicar` na raiz (o repositório de distribuição é só saída; a fonte é esta pasta).

## Instalar daqui do projeto (uma vez por máquina)
```
cd plugin/conector
npm install
```
Precisa do Node 24 ou mais novo. As dependências são só o SDK do MCP (fixo em 1.32.2, decisão 17) e o zod; `typescript` e `@types/node` servem só para conferir tipos.

## Usar
```
node plugin/conector/src/cli.ts criar --objetivo "..." --participantes "leo:Léo,outro:Fulano" [--abre leo] [--rodadas 12] [--supervisao livre|aprovar]
node plugin/conector/src/cli.ts ver --convite <convite>
node plugin/conector/src/cli.ts entrar --convite <convite> --como leo --dossie <dossie.md> --politica <politica.json> [--porta 1337] [--modo channel|aguardar]
node plugin/conector/src/cli.ts estado <pasta da sala>
node plugin/conector/src/cli.ts medir <pasta da sala>
```
- `criar --relay <url>` registra a sala no relay (Fase 1, `relay/README.md`) e põe o endereço no convite; sem `--relay`, a sala é local (Fase 0).
- `criar` imprime o convite. `entrar` monta `~/.salas/<sala>/<lado>/` (ou `SALAS_DIR`, ou `--pasta`) e imprime o comando que abre a sessão.
- O comando usa `cd "..." && claude ...`: rode no Git Bash ou no cmd; no PowerShell 5.1, troque `&&` por `;`.
- **Modo channel:** `claude --strict-mcp-config --mcp-config .mcp.json --allowedTools mcp__sala --dangerously-load-development-channels server:sala`. Na primeira vez aparece o aviso do canal de desenvolvimento: aceite.
- **Modo aguardar:** sem o flag; o Claude chama `aguardar` entre as falas. Roda também sem tela interativa (`claude -p "Use a skill /sala..."`), que é como o ensaio automático de 18/11/2026 rodou.
- **O `--allowedTools mcp__sala` é obrigatório:** numa pasta ainda não marcada como confiável (e sempre no `-p`), o Claude Code ignora o "allow" do `.claude/settings.json` da pasta, e o Claude fica sem poder usar as ferramentas da sala. O "deny" continua valendo.
- Na sessão, digite `/sala`. A tela abre em `http://127.0.0.1:<porta>`.

## Testar
```
cd plugin/conector
npm run teste      # unidade e integração: dois conectores de verdade pelo stdio do MCP
npm run tipos      # confere os tipos
```

## Pegadinhas
- **Nunca escreva em stdout no conector:** é o canal do MCP. Diagnóstico vai para `console.error`.
- **Atualizar o SDK do MCP:** confira se ele não passou a negociar a revisão 2026-07-28 (há um teste para isso). Se passar, o channel some sem erro.
- **Notificação antes do aperto de mão do MCP se perde:** o conector segura o que chega até `oninitialized`.
- **Só sintaxe TypeScript apagável** (sem `enum`, sem `namespace`, sem propriedade no construtor) e imports com `.ts`: o Node roda o arquivo direto.
- A sessão da sala nega Bash, escrita, web e subagentes no `.claude/settings.json` que o `entrar` gera. Não afrouxe: é a defesa contra injeção (`vault/Contexto/Segurança e confidencialidade.md`).
