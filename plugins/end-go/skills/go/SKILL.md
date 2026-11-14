---
description: Retoma o projeto de onde a última sessão parou (lê o "Onde paramos", confere o estado, testa e diz o próximo passo)
argument-hint: [observação opcional]
disable-model-invocation: true
allowed-tools: Bash(git rev-parse *) Bash(git status *) Bash(git log *) Bash(git stash list) Bash(git fetch *) Bash(pwd) Bash(date *) Bash(/bin/ls *) Bash(node ~/Developer/backstage/tools/bs.mjs *)
---

O usuário está começando uma sessão para continuar o trabalho de uma sessão anterior, que você não viu. Retome sem refazer o que já foi feito e sem começar nada antes de saber onde o projeto está.

Observação do usuário (pode estar vazia): $ARGUMENTS

Pasta do projeto: !`git rev-parse --show-toplevel 2>/dev/null || pwd`

Data de hoje: !`date +%F`

Últimos commits: !`git log --oneline -8 2>/dev/null`

O que está sem commit: !`git status --short 2>/dev/null | head -40`

Commits ainda não enviados: !`git log --oneline @{u}..HEAD 2>/dev/null | head -20`

Stashes: !`git stash list 2>/dev/null | head -5`

A CLI do backstage (vazio se este computador não tem): !`/bin/ls ~/Developer/backstage/tools/bs.mjs 2>/dev/null`

## Passos, nesta ordem

1. **Leia o registro.** Leia o `CLAUDE.md` do projeto (e os arquivos que ele importa com `@`) e ache o andamento: o plano, o "Onde paramos" mais recente, o que depende do usuário. Leia também a memória que vier no contexto. Não leia o projeto inteiro: só o necessário para o próximo passo.
   - **Com backstage** (a CLI acima existe): rode `node ~/Developer/backstage/tools/bs.mjs agora` e `… pendentes`, da pasta do projeto. O `agora` diz o que o usuário respondeu no painel desde a última sessão: tela ou card para **refazer** (com a anotação dele), perguntas respondidas, pedidos marcados como feitos. Isso é o registro mais novo que existe, e passa na frente do "Onde paramos" no que os dois discordarem. Se ele disser que o projeto não está no backstage, sugira `/start`.

2. **Confira se o registro bate com a realidade.** Compare o que o "Onde paramos" diz com os commits, o `git status`, os stashes e, se ele falar de um deploy ou de algo no ar, com o que der para checar só lendo. Mudanças sem commit que o registro não explica, um commit que ele não cita, um stash que ele não menciona: anote para avisar. Com backstage, também uma tela em "fazendo agora" que nenhuma sessão está fazendo (sobrou de uma sessão que não fechou). Não desfaça nem apague nada.

3. **Teste rápido.** Rode os testes e o build que o projeto indica (no `CLAUDE.md`, em "Comandos"), só os rápidos, sem servidor nem navegador, para ver que nada quebrou entre as sessões. Não rode nada que use serviços de verdade, publique ou mexa em dados.

4. **Não comece o trabalho ainda**, a não ser que o registro diga que o próximo passo já foi aprovado pelo usuário e não tenha dúvida nenhuma; mesmo assim, diga o que vai fazer antes.

## No fim, responda só isto

- **Onde paramos**, em 2 ou 3 linhas.
- **Diferenças** entre o registro e o projeto, se houver (ou "o registro bate com o projeto").
- **Testes:** o comando e o resultado.
- **Próximo passo**, numa frase, com a sua recomendação.
- **Esperando por você**, em itens curtos (ou "nada"). Com backstage: o que você respondeu e eu ainda não fiz, primeiro; depois a contagem do que espera você no painel (telas para conferir, perguntas, coisas para fazer), com o endereço dele, sem copiar a lista.
- Termine com uma pergunta direta, por exemplo "Sigo com <próximo passo>?".
