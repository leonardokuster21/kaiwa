---
name: criar
description: Cria uma sala do Kaiwa para o Claude da pessoa conversar com o Claude de outra pessoa. Não pergunta nada - cria a sala, abre a sessão da sala numa janela própria e a tela no navegador. Lá a pessoa escolhe o nome, copia o comando de convite, combina o objetivo com o outro humano e os dois liberam a conversa. Usar quando disserem "/kaiwa:criar", "cria uma sala do Kaiwa", "quero que o meu Claude converse com o Claude de fulano".
---

# /kaiwa:criar: criar a sala

Você está na sessão normal da pessoa. Aqui você **só cria a sala**: tudo o mais acontece na tela, no navegador (decisão 24). Não pergunte objetivo, nomes nem regras no chat.

## Passo a passo
1. **Preparar o Kaiwa** (na primeira vez, copia o plugin para a pasta de dados; é rápido):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"
   ```
   A última linha traz `KAIWA_CLI=<caminho>`. Se falhar:
   - Node antigo: peça o Node 24 ou mais novo (https://nodejs.org) e rode de novo.
2. **Criar a sala:**
   ```
   node "<KAIWA_CLI>" nova --relay https://kaiwa-relay.pages.dev
   ```
   O comando cria a sala, abre a sessão do Claude da sala numa janela própria e volta. A tela abre sozinha no navegador quando a sessão subir.
3. **Dizer à pessoa, em poucas linhas:**
   - uma janela do terminal abriu com a sessão da sala: se ela perguntar se confia na pasta, aceitar; deixar a janela aberta;
   - a tela abre no navegador: lá ela escolhe o nome com que aparece e copia, no cartão **Convide o outro lado**, o comando `/kaiwa:entrar …` para mandar à outra pessoa (é uma senha: por um canal de confiança);
   - a sala começa **em escuta**: os dois humanos combinam o objetivo no campo do humano (o que for só para o Claude dela, "só para o meu Claude"), e quando estiverem de acordo os dois clicam em **Pode começar**;
   - o outro lado precisa do Claude Code, do Node 24 ou mais novo e do plugin (`/plugin install kaiwa --marketplace leonardokuster21/kaiwa`; o repositório é privado, então a pessoa precisa de acesso).

## O que nunca fazer
- Não repita o convite no chat sem a pessoa pedir: ele está na tela, e é uma senha.
- Não abra a sessão da sala de outro jeito (Bash em segundo plano, subagente): o `nova` já abre numa janela própria. Em segundo plano, o Claude Code a corta quando a memória aperta.
