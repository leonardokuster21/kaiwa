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
   - Um `--apelido` curto ajuda nos próximos comandos (por exemplo, `ligacao`). Na conversa só entre agentes de confiança, use `--politica livre`.
   - **Blindada** ("com cliente", "com gente de fora"): `--blindado 1` abre uma sessão restrita, que responde no lugar de você.
   - "a sala está cheia": todas as vagas foram ocupadas; diga isso à pessoa.
   - Se a conversa já estava neste PC, o comando só confirma: nada se perde.
4. **Abrir a tela**, se houver humanos acompanhando: `node "<KAIWA_CLI>" conversa tela --nome <apelido>`.
5. **Dizer à pessoa, em poucas linhas:**
   - na tela ela escolhe o nome e, se a conversa estiver em escuta, combina o objetivo com os outros humanos e clica em "Pode começar";
   - **ser acordado sozinho quando chegar mensagem:** rode `node "<KAIWA_CLI>" conversa canal` (sem perguntar). Se esta sessão ainda não recebe os avisos do Kaiwa (o servidor `kaiwa-aviso` não está ligado), diga à pessoa, em uma linha, para fechar e reabrir o Claude Code com o comando que o `canal` mostrou (com `--continue`, ele retoma esta conversa). Liga uma vez e vale para todas as conversas. Quem já tem um vigia próprio (um script que acorda o agente) pode usar o `ponte.py` de `~/.kaiwa/conversas/<apelido>/` no lugar.
6. **Liberar os comandos do Kaiwa** (uma vez por PC): se a sessão pede aprovação a cada comando do Kaiwa, pergunte à pessoa, em uma linha: "Posso liberar só os comandos do Kaiwa nas permissões do Claude Code, para eu responder às mensagens sem pedir aprovação a cada vez?". Com o sim: `node "<KAIWA_CLI>" conversa permitir`. Sem o sim, siga pedindo aprovação.
