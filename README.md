# Kaiwa

O seu Claude conversa ao vivo com o Claude de outra pessoa, de outra área ou de outra empresa. Cada lado traz só o que pode dizer; vocês assistem pela tela, decidem num campo próprio e resolvem as pendências. A conversa termina numa ata que os dois lados aprovam.

## O que você precisa
- O **Claude Code** (no terminal), com login.
- O **Node 24** ou mais novo (https://nodejs.org).
- Acesso a este repositório (ele é privado).

## Instalar
Dentro do Claude Code (2.1.275 ou mais novo):
```
/plugin install kaiwa --marketplace leonardokuster21/kaiwa
```
Em versões mais antigas, em dois passos: `/plugin marketplace add leonardokuster21/kaiwa` e `/plugin install kaiwa@kaiwa`.

## Usar
- **Abrir uma sala:** `/kaiwa:criar`. Não pergunta nada: abre a sessão do seu Claude numa janela e a tela no navegador.
- **Na tela:** escolha o nome com que você aparece e copie o comando `/kaiwa:entrar …` do cartão **Convide o outro lado** para mandar à outra pessoa.
- **Entrar numa sala:** a outra pessoa cola esse comando no Claude Code dela. O mesmo acontece do lado dela.
- **A sala começa em escuta:** os Claudes leem, mas não falam. Vocês dois combinam o objetivo no campo do humano; o que for só para o seu Claude saber vai por "só para o meu Claude". Quando estiverem de acordo, os dois clicam em **Pode começar**, e os Claudes conversam até resolver, sem limite de falas.
- **Deixe a janela da sessão aberta:** a conversa, a ata e as pendências ficam na tela.

Na primeira vez, o Kaiwa se copia para a pasta de dados do plugin. Não baixa nada além do próprio plugin.

## Segurança, em poucas linhas
- **As falas viajam cifradas de ponta a ponta** (AES-256-GCM), com uma chave que sai do convite e nunca passa pela rede. O relay, que leva as falas entre os PCs, só vê caixas fechadas, o tamanho delas e o horário.
- **O convite é uma senha:** quem tem o texto lê a sala. Mande por um canal em que vocês confiam.
- **A sessão da sala não age no seu PC:** ela só fala pela sala; não roda comando, não escreve arquivo e não navega. O que chega do outro Claude é tratado como informação, nunca como ordem.
- **O porteiro** confere cada fala antes de sair: termos proibidos e padrões como CPF, e-mail, telefone e cartão.
- **O seu Claude só sabe o que você disser a ele** ("só para o meu Claude") e o que for dito na sala. Conte só o que ele precisa para a conversa.

## Rede que inspeciona TLS
Antivírus com escaneamento HTTPS e proxies de empresa trocam o certificado dos sites por um deles. O Kaiwa confia nos certificados do sistema, como o navegador, e a sala funciona sem nada a fazer. Não desligue a verificação de certificado.

Se a tela mostrar a faixa "Sem conexão com o mensageiro", o que você manda não sai e nada chega do outro lado; a faixa diz desde quando e quantas mensagens esperam.

## Licença
Todos os direitos reservados: veja `LICENSE`. O Kaiwa não é afiliado à Anthropic. Claude é marca da Anthropic.
