# willy-mods

Mods for [Claude Code](https://claude.com/claude-code): plugins whose hooks are a TypeScript module that can draw in Claude Code's own interface.

> Mods use Claude Code's function hooks, an early-access surface that may change between releases without notice. They were written and tested on Claude Code 2.1.319.

## Mods

| Mod | What it does |
| --- | --- |
| [`background-shells`](plugins/background-shells) | Shows a yellow, highlighter-style band above the prompt while shells or monitors run in the background, with how long each has been running. It hides itself when nothing runs and shows a short toast when one finishes. |
| [`screenshot-peek`](plugins/screenshot-peek) | Draws a small thumbnail under each call that writes or reads a picture (`screencapture`, Chrome `--screenshot`, a script, the Read tool), with an `abrir` button that opens it full size. Only pictures the call itself wrote count, not ones it merely names. Thumbnails need a terminal that shows images (Ghostty, kitty, iTerm2 3.5+) and macOS (`sips`, `open`). |
| [`push-gate`](plugins/push-gate) | Refuses `git push`, `gh repo create`, `gh pr merge`, deploys (Vercel, Netlify, Firebase, Fly, Wrangler, gcloud, EAS, fastlane, rsync or scp to a server), publishes (npm, Docker, cargo, gems) and production migrations unless your own messages in the task asked for them; Claude reads why and asks you first. A plain ask passes at once; an unclear one is judged by a small model, so a "sim" to Claude's "Posso fazer o push?" counts. A force push needs its own ask. `/push-livre` frees a plain `git push` in the project you are in, for good (`/push-livre bloquear` asks again, `/push-livre ver` lists them); only you can type it, and force pushes, deploys, publishes, merges and migrations still ask. |
| [`mac-app-runner`](plugins/mac-app-runner) | While a Mac app from Xcode's build products is open, a band above the prompt shows it, how long it has run and when a newer build is waiting, with `reabrir` (quit and open the new build) and `fechar` buttons. macOS. |
| [`icon-picker`](plugins/icon-picker) | `/icone` opens a pane of Nerd Font glyphs picked for the project, leaving out the ones your other projects under `~/Developer` already use and the ones your terminal font lacks (checked with Ghostty), and writes the pick to `.claude/icon`. A git project with no icon gets the first suggestion at session start, but only where git ignores that file. |
| [`end-go`](plugins/end-go) | Two skills you type: `/end` before closing a session (rewrites the project's "Onde paramos" with what was done, decided and is next, updates what the project's rules ask for, saves memories, stops what it started and commits; push only where `/push-livre` allows) and `/go` at the start of the next one (reads that record, checks it against git, runs the quick tests and says the next step, then waits). |
| [`spinner-ptbr`](plugins/spinner-ptbr) | Portuguese spinner words ("Matutando…", "Garimpando…") and turn line ("✻ Garimpou por 1m 4s"). |

The mods speak Brazilian Portuguese. Two bands at once:

```
   Garoa · Debug  aberto há 3m · build novo pronto   [ reabrir ] [ fechar ]
  1 shell em segundo plano · Build do projeto 3m    /tasks para ver
```

## Install

At the prompt of a terminal session, with the mod's name from the table:

```
/plugin install push-gate --marketplace itswilly1/willy-mods
```

Answer `y` to add the marketplace, then pick a scope (user is the first one). The mod is active right away.

From a shell:

```
claude plugin install push-gate --marketplace itswilly1/willy-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `itswilly1/willy-mods`, then Add plugin.

## Develop

Each mod lives in `plugins/<name>` and is listed in `.claude-plugin/marketplace.json`.

```
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
```

## License

[MIT](LICENSE)
