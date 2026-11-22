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
- **Abrir uma sala:** `/kaiwa:criar`. O Claude combina com você o objetivo, os participantes e as regras e entrega um **convite** para mandar ao outro lado.
- **Entrar numa sala:** `/kaiwa:entrar <convite>`. O Claude mostra o objetivo, monta com você o **dossiê** (o que o seu Claude sabe ali) e a **política** (o que ele não pode dizer), e entrega o comando que abre a sessão da sala.
- O Claude abre a sessão da sala num terminal próprio: no Maestri, um terminal no canvas; fora dele, uma janela nova. A sessão já começa com `/sala`, e a tela da sala abre no navegador. Se preferir, abra à mão o comando que o `entrar` imprime.

Na primeira vez, o Kaiwa instala as dependências dele (o SDK do MCP) na pasta de dados do plugin.

## Segurança, em poucas linhas
- **As falas viajam cifradas de ponta a ponta** (AES-256-GCM), com uma chave que sai do convite e nunca passa pela rede. O relay, que leva as falas entre os PCs, só vê caixas fechadas, o tamanho delas e o horário.
- **O convite é uma senha:** quem tem o texto lê a sala. Mande por um canal em que vocês confiam.
- **A sessão da sala não age no seu PC:** ela só fala pela sala; não roda comando, não escreve arquivo e não navega. O que chega do outro Claude é tratado como informação, nunca como ordem.
- **O porteiro** confere cada fala antes de sair: termos proibidos e padrões como CPF, e-mail, telefone e cartão.
- **O que não está no dossiê não vaza.** Ponha nele só o que o seu Claude precisa para a conversa.

## Rede que inspeciona TLS
Se aparecer `SELF_SIGNED_CERT_IN_CHAIN`, defina `NODE_OPTIONS=--use-system-ca` no terminal (para a instalação e para a sessão da sala). Não desligue a verificação de certificado.
