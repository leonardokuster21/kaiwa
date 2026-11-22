---
name: criar
description: Cria uma sala do Kaiwa para o Claude da pessoa conversar com o Claude de outra pessoa. Combina o objetivo, os participantes, quem abre, o limite de falas e a supervisão, registra a sala no relay e entrega o convite para mandar ao outro lado. Usar quando disserem "/kaiwa:criar", "cria uma sala do Kaiwa", "quero que o meu Claude converse com o Claude de fulano".
argument-hint: [objetivo]
---

# /kaiwa:criar: abrir uma sala

Você está na sessão normal da pessoa. Aqui você cria a sala e o convite; depois, cada lado prepara o seu com `/kaiwa:entrar`.

Objetivo sugerido: $ARGUMENTS

## Passo a passo
1. **Combinar a sala**, numa rodada de perguntas:
   - **objetivo:** uma ou duas frases sobre o que a conversa deve produzir (uma decisão, uma proposta, uma lista). É o que os dois Claudes vão perseguir;
   - **participantes:** dois, cada um com um `id` curto (letras minúsculas, números e `_`) e um nome, no formato `id:Nome,id:Nome`;
   - **quem abre:** o `id` de quem fala primeiro (padrão: o primeiro);
   - **limite de falas de cada lado** (padrão 12);
   - **supervisão:** `livre` (o Claude fala direto) ou `aprovar` (cada fala espera o ok do humano na tela).

   Os nomes vão na configuração da sala, que viaja cifrada: o relay não os lê.
2. **Preparar o Kaiwa:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"
   ```
   A última linha traz `KAIWA_CLI=<caminho>`. Se falhar, veja o passo 2 da skill `/kaiwa:entrar`.
3. **Criar a sala:**
   ```
   node "<KAIWA_CLI>" criar --objetivo "<objetivo>" --participantes "<id:Nome,id:Nome>" --abre <id> --rodadas <n> --supervisao <livre|aprovar> --relay https://kaiwa-relay.pages.dev
   ```
   O relay é o carteiro entre os PCs: só guarda e entrega envelopes cifrados. Sem `--relay`, a sala só funciona com os dois lados no mesmo PC.
4. **Entregar o convite.** O comando imprime o convite (`sala1.…`). Explique:
   - mande o convite ao outro lado por um canal em que vocês confiam. **Ele é uma senha:** quem tem o texto lê a sala;
   - o outro lado precisa do Claude Code, do Node 24 ou mais novo e do plugin Kaiwa (`/plugin install kaiwa --marketplace leonardokuster21/kaiwa`; o repositório é privado, então a pessoa precisa de acesso a ele). Lá, ela roda `/kaiwa:entrar <convite>`.
5. **O lado desta pessoa:** ofereça seguir agora com a skill `/kaiwa:entrar`, com o mesmo convite.
