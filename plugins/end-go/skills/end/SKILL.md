---
description: Fecha a sessão com segurança, deixando o projeto pronto para continuar depois (registros, docs, memória, commit)
argument-hint: [observação opcional]
disable-model-invocation: true
allowed-tools: Bash(git rev-parse *) Bash(git status *) Bash(git log *) Bash(pwd) Bash(date *) Bash(pgrep *)
---

O usuário vai encerrar esta sessão e continuar depois, numa sessão nova que não verá esta conversa. Deixe o projeto de um jeito que essa sessão nova continue sem refazer trabalho, sem perder decisões e sem adivinhar.

Observação do usuário (pode estar vazia): $ARGUMENTS

Pasta do projeto: !`git rev-parse --show-toplevel 2>/dev/null || pwd`

Data de hoje: !`date +%F`

O que está sem commit: !`git status --short 2>/dev/null | head -40`

Commits ainda não enviados: !`git log --oneline @{u}..HEAD 2>/dev/null | head -20`

## Passos, nesta ordem

1. **Onde os registros ficam.** Leia o `CLAUDE.md` do projeto (e os arquivos que ele importa com `@`) e ache onde o projeto guarda o andamento: o plano, o "Onde paramos", o manual, o changelog, o `IDEIAS.md`. Siga o que o projeto manda; se ele não tiver um lugar para o andamento, use o `PLANO.md` (crie se faltar, com uma seção "Onde paramos").

2. **Atualize o "Onde paramos".** Reescreva o trecho em vez de só acrescentar: o que estiver desatualizado (tarefas que já acabaram, instruções antigas de "ao continuar", arquivos ou stashes que não existem mais) sai ou é corrigido. Ele precisa dizer, com a data de hoje:
   - o que ficou pronto nesta sessão, com os commits;
   - o que ficou pela metade, com os arquivos e onde parou;
   - as decisões tomadas (as do usuário e as suas, marcando quais foram suas);
   - o próximo passo, um só, concreto;
   - os comandos para conferir (testes, build, roteiros) e o último resultado deles;
   - o que está no ar e o que não está (deploy, versão);
   - o que depende do usuário (decidir, testar, aprovar, pedir deploy).

3. **Os outros registros que o projeto exige junto.** Se uma regra do projeto manda atualizar algo quando o código muda (manual, docs, briefing, prints), confira se foi feito nesta sessão; se não, faça agora ou anote no "Onde paramos" como pendente.

4. **Memória.** Salve na memória só o que vale entre sessões e não está no repositório: correções que o usuário fez no seu jeito de trabalhar, preferências novas, fatos do projeto que não estão no código. Atualize uma memória que já cobre o assunto em vez de criar outra. Não repita na memória o que acabou de ir para o "Onde paramos".

5. **Limpeza.** Desligue os servidores e processos que você ligou nesta sessão e apague as sobras temporárias que você criou. Não toque no que o usuário ligou (por exemplo um servidor local dele) nem nos servidores fixos do ambiente; se algo dele ficou com dados de teste seus, diga.
   - **Navegador headless órfão.** Rode `pgrep -fl "remote-debugging-port|headless"`. Um Chrome/Chromium aberto por automação que sobrevive ao script fica órfão e pode ocupar vários núcleos por horas, principalmente com `swiftshader`, que renderiza a GPU na CPU. Encerre os que esta sessão abriu (perfil temporário em `/var/folders/.../T`, porta de debug que você usou). Se achar algum que não reconhece, não mate: liste o PID, as flags e o tempo rodando e pergunte.
   - Se o script que abriu o navegador não o fecha sozinho (`try/finally`, `SIGINT`/`SIGTERM`, timeout), anote no "Onde paramos" como pendente.

6. **Commit.** Faça o commit do que é desta sessão, separando assuntos diferentes, no idioma e no estilo dos commits do projeto. Não junte mudanças de outra sessão que você não reconhece: avise. Push só se o projeto estiver liberado (`/push-livre`) ou se o usuário pedir; nunca deploy, migração em produção ou publicação.

7. **Confira.** Rode `git status` e confirme que não sobrou nada desta sessão sem commit.

## No fim, responda só isto

- **Pronto para encerrar** (ou, se algo impediu, o que impediu e o que falta).
- Uma linha com os commits feitos e se foram para o remoto.
- O próximo passo, numa frase.
- O que depende do usuário, em itens curtos (ou "nada").
- "Para continuar: numa sessão nova, diga `continuar`."
