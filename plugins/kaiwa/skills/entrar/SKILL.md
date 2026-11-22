---
name: entrar
description: Entra numa sala do Kaiwa com um convite (um texto que começa com "sala1."). Não pergunta nada - prepara o lado da pessoa, abre a sessão da sala numa janela própria e a tela no navegador, onde ela escolhe o nome, combina o objetivo com o outro humano e libera a conversa. Usar quando disserem "/kaiwa:entrar", "recebi um convite do Kaiwa", "entrar na sala" ou colarem um convite sala1.
argument-hint: <convite>
---

# /kaiwa:entrar: entrar numa sala

Você está na sessão normal da pessoa. Aqui você **só entra na sala**: tudo o mais acontece na tela, no navegador (decisão 24).

Convite recebido: $ARGUMENTS

## Passo a passo
1. **O convite.** Se veio vazio acima, peça que a pessoa cole o convite. Ele é uma senha: não o repita sem precisar nem o mande a nenhum serviço.
2. **Preparar o Kaiwa** (na primeira vez, instala as dependências):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"
   ```
   A última linha traz `KAIWA_CLI=<caminho>`. Se falhar:
   - Node antigo: peça o Node 24 ou mais novo (https://nodejs.org) e rode de novo.
   - Erro `SELF_SIGNED_CERT_IN_CHAIN` (rede que inspeciona TLS) na instalação: rode de novo com a variável `NODE_OPTIONS=--use-system-ca` no ambiente. Nunca desligue a verificação de certificado. Depois de instalado, o Kaiwa já confia sozinho nos certificados do sistema (1.0.1).
3. **Entrar:**
   ```
   node "<KAIWA_CLI>" juntar --convite "<convite>"
   ```
   O comando busca a sala no relay, prepara o lado da pessoa e abre a sessão do Claude da sala numa janela própria. A tela abre sozinha no navegador quando a sessão subir.
4. **Dizer à pessoa, em poucas linhas:**
   - uma janela do terminal abriu com a sessão da sala: se perguntar se confia na pasta, aceitar; deixar a janela aberta;
   - na tela, ela escolhe o nome com que aparece. Se aparecer a faixa vermelha "Sem conexão com o mensageiro", nada sai nem chega: ela avisa você;
   - a sala começa **em escuta**: os dois humanos combinam o objetivo no campo do humano. O que for só para o Claude dela saber (o contexto dela, o que não pode sair), ela manda "só para o meu Claude";
   - quando estiverem de acordo, os dois clicam em **Pode começar**, e os Claudes conversam.

## O que nunca fazer
- Não abra a sessão da sala de outro jeito (Bash em segundo plano, subagente): o `juntar` já abre numa janela própria.
- Não afrouxe o `.claude/settings.json` que fica na pasta do lado: é ele que impede o Claude da sala de agir no PC.
