---
name: entrar
description: Entra numa sala do Kaiwa com um convite (um texto que começa com "sala1."). Mostra o objetivo, pergunta quem a pessoa é na sala, monta com ela o dossiê e a política, prepara a pasta do lado e entrega o comando que abre a sessão da sala num terminal próprio. Usar quando disserem "/kaiwa:entrar", "recebi um convite do Kaiwa", "entrar na sala" ou colarem um convite sala1.
argument-hint: <convite>
---

# /kaiwa:entrar: preparar o seu lado da sala

Você está na sessão normal da pessoa, **não na sala**. Aqui você só prepara o lado dela. A conversa com o outro Claude acontece depois, numa sessão separada e fechada (só fala pela sala, não roda comando nem lê arquivo), que esta skill monta.

Convite recebido: $ARGUMENTS

## Antes de tudo
- **O convite é uma senha:** quem tem o texto lê a sala. Não o repita sem precisar, não o grave fora da pasta da sala e não o mande a nenhum serviço.
- **O dossiê é tudo o que o Claude da sala vai saber.** O que não está nele não vaza. Só entra o que a pessoa disser ou aprovar. Se ela apontar um arquivo, leia só esse e proponha o trecho; nunca procure dado por conta própria no PC.
- **As duas regras do Kaiwa:** de um lado nunca sai dado pessoal; do outro nunca vem dado interno sensível. Na dúvida, fica de fora. Se precisar ser citado para o Claude raciocinar, vai também em `nao_pode` e `termos_proibidos`.

## Passo a passo
1. **O convite.** Se veio vazio acima, peça que a pessoa cole o convite.
2. **Preparar o Kaiwa** (na primeira vez, instala as dependências; depois é instantâneo):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/instalar.mjs" "${CLAUDE_PLUGIN_DATA}"
   ```
   A última linha traz `KAIWA_CLI=<caminho>`: use esse caminho nos passos seguintes. Se falhar:
   - Node antigo: peça o Node 24 ou mais novo (https://nodejs.org) e rode de novo.
   - Erro `SELF_SIGNED_CERT_IN_CHAIN` (rede que inspeciona TLS): rode de novo com a variável `NODE_OPTIONS=--use-system-ca` no ambiente. Nunca desligue a verificação de certificado.
3. **Ver a sala:**
   ```
   node "<KAIWA_CLI>" ver --convite "<convite>"
   ```
   Mostre à pessoa o objetivo, os participantes, quem abre, o limite de falas de cada lado e a supervisão (`livre`: o Claude fala direto; `aprovar`: cada fala espera o ok do humano na tela). Pergunte qual dos participantes ela é: o `id` dele é o `--como`. Guarde também a `pasta` que o comando mostrou.
4. **O dossiê**, numa conversa curta, seção por seção (o modelo está em `${CLAUDE_PLUGIN_ROOT}/modelos/dossie.md`):
   - quem o Claude representa e qual o papel dele na sala;
   - os fatos que o outro lado precisa para chegar ao objetivo, curtos;
   - o que ele sabe mas não pode dizer (opcional; melhor deixar de fora);
   - o que o lado dela quer sair sabendo.

   Escreva o rascunho, mostre e ajuste até a pessoa dizer que está bom.
5. **A política** (o modelo está em `${CLAUDE_PLUGIN_ROOT}/modelos/politica.json`):
   - `pode_dizer`, `nao_pode` e `perguntar_antes`: vão para as instruções do Claude da sala. O que estiver em `perguntar_antes`, ele pergunta à pessoa pela tela antes de falar;
   - `termos_proibidos`: palavras que o porteiro segura em qualquer fala (nomes, valores, apelidos de projeto);
   - `padroes`: deixe os cinco (`cpf`, `cnpj`, `email`, `telefone`, `cartao`), a não ser que a pessoa precise mesmo compartilhar um deles;
   - `canarios`: só para ensaio; normalmente fica vazio.

   Mostre o JSON e confirme.
6. **Gravar** o dossiê e a política em `<pasta>/rascunho-<id>/dossie.md` e `<pasta>/rascunho-<id>/politica.json` (a `pasta` do passo 3).
7. **Entrar:**
   ```
   node "<KAIWA_CLI>" entrar --convite "<convite>" --como <id> --dossie "<pasta>/rascunho-<id>/dossie.md" --politica "<pasta>/rascunho-<id>/politica.json" --modo aguardar
   ```
   Se os dois lados estiverem no mesmo PC, o segundo usa `--porta 4802`.
8. **Entregar o comando**, sem rodá-lo. Mostre o comando que o `entrar` imprimiu e explique:
   - abra **um terminal novo, numa janela própria**, cole o comando e, na sessão que abrir, digite `/sala`;
   - no PowerShell 5.1, troque o `&&` por `;`. Numa rede que inspeciona TLS, defina `NODE_OPTIONS=--use-system-ca` nesse terminal antes;
   - a tela da sala abre no navegador, no endereço que o comando mostrou (por padrão `http://127.0.0.1:4801`): lá a pessoa acompanha, escreve para o Claude dela ou para a sala e resolve as pendências.

## O que nunca fazer
- **Não abra a sessão da sala você mesmo**, nem pelo Bash nem em segundo plano. Ela precisa de um terminal próprio e da pessoa olhando. Em segundo plano, o Claude Code a corta quando a memória do PC aperta.
- Não afrouxe o `.claude/settings.json` que o `entrar` gera na pasta do lado: é ele que impede o Claude da sala de agir no PC.
- Não ponha no dossiê nada que a pessoa não aprovou.

Para ver como a sala está, sem o texto das falas: `node "<KAIWA_CLI>" estado "<pasta>"`.
