---
name: reabrir
description: Reabre a sessão de uma sala do Kaiwa que já existe neste PC, de quem criou ou de quem entrou, quando a janela da sessão fechou ou caiu. Sem argumento, lista as salas abertas deste PC; com uma só, reabre direto. Usar quando disserem "/kaiwa:reabrir", "a janela da sala fechou", "volta para a sala do Kaiwa", "reabre a sala".
argument-hint: [sala]
---

# /kaiwa:reabrir: voltar para uma sala

Você está na sessão normal da pessoa. Aqui você **só reabre a sessão da sala**: a conversa continua na tela, no navegador.

Sala pedida: $ARGUMENTS

## Passo a passo
1. **Preparar o Kaiwa:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"
   ```
   A última linha traz `KAIWA_CLI=<caminho>`.
2. **Reabrir:**
   ```
   node "<KAIWA_CLI>" reabrir <sala, se veio acima>
   ```
   - Sem sala, e com uma sala aberta só neste PC, ele reabre essa.
   - Com mais de uma, ele lista as salas (da mais recente para a mais antiga). Mostre a lista à pessoa, pergunte qual e rode de novo com o nome da sala escolhida.
   - Sem nenhuma, diga que não há sala aberta neste PC (para criar: `/kaiwa:criar`; para entrar numa sala nova: o `/kaiwa:entrar` que recebeu).
3. **Dizer à pessoa, em poucas linhas:**
   - a sessão da sala abriu de novo numa janela própria: se perguntar se confia na pasta, aceitar; deixar a janela aberta;
   - a tela abre de novo no navegador, com a conversa como estava;
   - o Claude da sala recomeça sem lembrar da conversa: ele lê o histórico antes de falar, e o que chegou enquanto a janela estava fechada ele recebe de novo.

## O que nunca fazer
- Não abra a sessão de outro jeito (Bash em segundo plano, subagente): o `reabrir` já abre numa janela própria.
- Não use `/kaiwa:criar` para voltar: ele cria uma sala nova.
