---
description: Começa um projeto (novo, ou que ainda não tem registro): o plano, o CLAUDE.md, o ícone e a pasta dele no backstage, com o mapa das telas
argument-hint: [nome do projeto ou observação]
disable-model-invocation: true
allowed-tools: Bash(git rev-parse *) Bash(git status *) Bash(git log *) Bash(pwd) Bash(date *) Bash(/bin/ls *) Bash(node ~/Developer/backstage/tools/bs.mjs *) Bash(node ~/Developer/backstage/tools/novo.mjs *)
---

O usuário está começando um projeto, ou trazendo para o jeito dele de trabalhar um projeto que já existe sem registro. Deixe-o pronto para as próximas sessões (`/go` no começo de cada uma, `/end` no fim): um plano com "Onde paramos", um `CLAUDE.md` curto e verdadeiro e, se houver backstage neste computador, a pasta do projeto lá, com o mapa das telas. Não escreva o código do app aqui: isso é o passo seguinte, com plano.

Observação do usuário (pode estar vazia): $ARGUMENTS

Pasta do projeto: !`git rev-parse --show-toplevel 2>/dev/null || pwd`

Data de hoje: !`date +%F`

O que há na pasta: !`/bin/ls -A 2>/dev/null | head -40`

Últimos commits: !`git log --oneline -5 2>/dev/null`

O que está sem commit: !`git status --short 2>/dev/null | head -20`

O backstage (vazio se este computador não tem): !`/bin/ls ~/Developer/backstage 2>/dev/null | head -30`

## Passos, nesta ordem

1. **De onde o projeto parte.** Pelo que há na pasta, é um destes três casos; diga qual numa frase antes de seguir:
   - **Novo:** pasta vazia ou quase. Siga as instruções do usuário sobre onde cada tipo de projeto fica; se a pasta atual não é o lugar certo, pergunte antes de criar outra.
   - **Existe, sem registro:** há código, mas falta o `PLANO.md`, o `CLAUDE.md` ou a pasta no backstage. Leia só o necessário para descrevê-lo (o README, o manifesto de dependências, a árvore de pastas, os scripts): não leia o projeto inteiro.
   - **Já tem tudo** (plano com "Onde paramos" e, havendo backstage, a pasta dele lá): não refaça nada. Diga que é caso de `/go` e pare.

2. **Pergunte o mínimo, de uma vez.** Só o que não dá para tirar da pasta nem da observação: o nome, o que é em uma frase e para quem, o tipo (site, app, extensão…) e se vai para alguma loja. Não pergunte o que as instruções do usuário já respondem (idioma, onde fica, servidor local).

3. **O registro no código.** Crie o que falta, sem sobrescrever o que existe:
   - `PLANO.md`: as decisões já tomadas (uma tabela curta), um **"Onde paramos"** com a data de hoje (o que existe, o próximo passo, um só, e os comandos para conferir, se já houver), "Em aberto" e "Depois". Havendo backstage, sem lista do que depende do usuário: isso vai para lá (passo 5).
   - `CLAUDE.md`: o que o projeto é, em um parágrafo; a linha `@PLANO.md`; a estrutura **só do que existe hoje**; as regras que o usuário já deu; os comandos de desenvolver, testar e build que funcionam (rode-os para conferir; não invente os que ainda não existem). Curto: ele é lido em toda conversa. Se já existe um, só acrescente o que falta.
   - O ícone do projeto e o que mais as instruções do usuário pedem para todo projeto (por exemplo `.claude/icon`).
   - Sem `git`: `git init` e um `.gitignore` do tipo de projeto.

4. **A pasta no backstage** (só se existe `~/Developer/backstage/tools/novo.mjs`; sem ele, pule para o passo 6 e diga que pulou). Leia antes o `README.md` de lá.
   - Sem pasta do projeto lá: `node ~/Developer/backstage/tools/novo.mjs <pasta> --nome "<Nome>"`, com `--lojas` se ele vai para loja. `<pasta>` é o nome da pasta do código.
   - Preencha o `project.json` (resumo, situação, links que já existem, caminhos, identificadores, a cor e o ícone se houver) e o `README.md` do projeto lá (o que tem ali e o que fica fora, e por quê). Campo que você não sabe fica vazio, não inventado.
   - `docs/testar.md` e `docs/publicar.md`: preencha só com o que já é verdade; senão, deixe o modelo.

5. **O mapa das telas e o que depende do usuário** (com backstage). `bs` é `node ~/Developer/backstage/tools/bs.mjs`, rodado da pasta do código.
   - **Projeto novo:** o mapa fica vazio; as telas entram quando os esboços forem aprovados (`bs nova`, `bs esboco`).
   - **Projeto que já tem telas:** ache as áreas e as telas pela navegação (rotas, abas, o menu), sem tirar prints ainda, e mostre a lista ao usuário, na ordem em que se chega a cada uma, antes de criar. Com o OK dele, `bs nova <id> "<título>" --area "<área>" [--de <id>] [--via "como se chega"]` para cada uma. Tirar o print de cada tela (`bs print`) é o passo seguinte, se ele quiser.
   - O que depende dele para o projeto andar (uma conta, uma chave, um domínio, uma decisão): `bs pedir <id> "<o que fazer>"` e `bs perguntar <id> "<pergunta>" "<opção>" "<opção>"`. Não numa lista no plano.

6. **Confira.** `git status`; havendo backstage, `bs agora` responde e o painel abre (o endereço está no README de lá). Rode o teste e o build só se já existirem.

7. **Commit.** Um commit do registro inicial no projeto e, havendo backstage, outro lá só com a pasta deste projeto, no idioma e no estilo de cada repositório. Sem push, a não ser que o usuário peça; nunca deploy nem publicação.

## No fim, responda só isto

- **O que foi criado**, em itens curtos com o caminho (e o que já existia e ficou como estava).
- **O painel** do projeto no backstage, com o endereço (ou "este computador não tem backstage").
- **O que ficou vazio** e depende de você preencher ou decidir.
- **Próximo passo**, numa frase, com a sua recomendação.
- Termine com uma pergunta direta, por exemplo "Começo pelo esboço da primeira tela?".
