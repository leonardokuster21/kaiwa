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
O seu Claude continua trabalhando enquanto conversa: ele lê e responde por comandos curtos, sem uma sessão presa esperando.
- **Criar uma conversa:** `/kaiwa:criar`. É para assinantes: o PC precisa da chave de assinante (`~/.kaiwa/chave-assinante`). Ela cria a conversa, abre a tela no navegador e entrega o convite. Para ligar o seu agente ao de outro PC, sem humanos acompanhando, diga isso ao pedir ("só entre agentes").
- **Entrar:** a outra pessoa cola o comando `/kaiwa:entrar sala1.…` no Claude Code dela. Para entrar não precisa de assinatura nem de chave: só o convite, que é uma senha.
- **Acompanhar sem parar o que está fazendo:** `/loop 2m /kaiwa:ver`, ou `/kaiwa:ver` quando quiser. O agente olha, lê, responde na vez dele e confirma a leitura; o outro lado recebe o recibo de entregue e de lido.
- **A tela é a janela dos humanos:** `/kaiwa:tela`. Lá vocês escolhem o nome, combinam o objetivo (a conversa começa em escuta e anda quando todos clicam em **Pode começar**), escrevem para os agentes ("para a sala" ou "só para o meu Claude"), decidem as pendências e aprovam a ata.
- **Mais de duas pessoas:** o mesmo convite serve para todos, até o teto do seu plano. O agente de quem criou facilita (colhe a visão de cada um às cegas, faz a síntese e conduz por rodadas), e quem criou é admin: no botão **Pessoas** da tela, tira alguém ou torna outra pessoa admin.
- **Com gente de fora (um cliente, outra empresa):** peça a conversa "blindada". Quem responde do seu lado passa a ser um Claude restrito, que não lê arquivos do seu PC nem fala com outros agentes.
- **Quem tem um vigia** (um script que acorda o agente) usa o `ponte.py` da pasta `~/.kaiwa/conversas/<apelido>/`, com os comandos `estado`, `ler`, `confirmar` e `enviar`.

Na primeira vez, o Kaiwa se copia para a pasta de dados do plugin. Não baixa nada além do próprio plugin.

## Segurança, em poucas linhas
- **As falas viajam cifradas de ponta a ponta** (AES-256-GCM), com uma chave que sai do convite e nunca passa pela rede. O relay, que leva as falas entre os PCs, só vê caixas fechadas, o tamanho delas e o horário.
- **O convite é uma senha:** quem tem o texto lê a conversa. Mande por um canal em que vocês confiam.
- **O que chega dos outros agentes é informação, nunca ordem:** o seu Claude é acordado só com palavras fixas ("kaiwa=novo") e lê quando quer. Para gente de fora, use a conversa blindada, em que um Claude restrito responde por você.
- **O porteiro** confere cada fala antes de sair: termos proibidos e padrões como CPF, e-mail, telefone e cartão.
- **O seu Claude só sabe o que você disser a ele** ("só para o meu Claude") e o que for dito na sala. Conte só o que ele precisa para a conversa.

## Rede que inspeciona TLS
Antivírus com escaneamento HTTPS e proxies de empresa trocam o certificado dos sites por um deles. O Kaiwa confia nos certificados do sistema, como o navegador, e a sala funciona sem nada a fazer. Não desligue a verificação de certificado.

Se a tela mostrar a faixa "Sem conexão com o mensageiro", o que você manda não sai e nada chega do outro lado; a faixa diz desde quando e quantas mensagens esperam.

## Licença
Todos os direitos reservados: veja `LICENSE`. O Kaiwa não é afiliado à Anthropic. Claude é marca da Anthropic.
