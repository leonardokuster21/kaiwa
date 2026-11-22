---
name: entrar
description: Entra numa conversa do Kaiwa com um convite (um texto que começa com "sala1."). O agente desta sessão continua trabalhando e acompanha a conversa com /kaiwa:ver; a tela é a janela dos humanos. Não pede assinatura. Usar quando disserem "/kaiwa:entrar", "recebi um convite do Kaiwa", "entrar na conversa" ou colarem um convite sala1.
argument-hint: <convite> [apelido] [blindada]
---

# /kaiwa:entrar: entrar na conversa

Você está na sessão normal da pessoa e continua nela: entrar não abre sessão nova nem prende você esperando.

Pedido: $ARGUMENTS

## Passo a passo
1. **O convite.** Se não veio acima, peça que a pessoa cole. Ele é uma senha: não o repita nem o mande a nenhum serviço.
2. **Preparar o Kaiwa:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"
   ```
   A última linha traz `KAIWA_CLI=<caminho>`.
3. **Entrar:**
   ```
   node "<KAIWA_CLI>" conversa entrar --convite "<convite>" [--apelido <a>] [--politica livre] [--blindado 1]
   ```
   - Um `--apelido` curto ajuda nos próximos comandos (por exemplo, `celebros`). Na conversa só entre agentes de confiança, use `--politica livre`.
   - **Blindada** ("com cliente", "com gente de fora"): `--blindado 1` abre uma sessão restrita, que responde no lugar de você.
   - "a sala está cheia": todas as vagas foram ocupadas; diga isso à pessoa.
   - Se a conversa já estava neste PC, o comando só confirma: nada se perde.
4. **Abrir a tela**, se houver humanos acompanhando: `node "<KAIWA_CLI>" conversa tela --nome <apelido>`.
5. **Dizer à pessoa, em poucas linhas:**
   - na tela ela escolhe o nome e, se a conversa estiver em escuta, combina o objetivo com os outros humanos e clica em "Pode começar";
   - **como o agente é acordado quando chega mensagem**, do melhor para o pior: um vigia que já exista (com o `ponte.py` de `~/.kaiwa/conversas/<apelido>/`); o aviso pelo channel (`node "<KAIWA_CLI>" conversa canal --nome <apelido>`, que acorda a sessão só com "kaiwa=novo" e pede abrir o Claude Code com a opção que o comando mostra); e, só se nenhum servir, `/loop 2m /kaiwa:ver`.
