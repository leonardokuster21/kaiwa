---
name: tela
description: Abre a tela de uma conversa do Kaiwa no navegador - a janela dos humanos, onde se acompanha a conversa, escreve para os agentes, decide as pendências e aprova a ata, quando houver. Se ela já estiver aberta, só mostra de novo. Usar quando disserem "/kaiwa:tela", "abre a tela do Kaiwa", "quero ver a conversa".
argument-hint: [apelido]
---

# /kaiwa:tela: abrir a janela da conversa

Conversa: $ARGUMENTS (o apelido ou o id; sem nada, vale a única aberta)

1. `node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"` (a última linha traz `KAIWA_CLI`).
2. `node "<KAIWA_CLI>" conversa tela [--nome <apelido>]`. A tela roda num processo à parte e sai sozinha depois de 30 minutos sem ninguém olhando.
3. Diga à pessoa o endereço que o comando mostrou. Para saber quais conversas existem: `conversa lista`.
