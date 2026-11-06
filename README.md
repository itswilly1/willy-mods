# willy-mods

Mods for [Claude Code](https://claude.com/claude-code): plugins whose hooks are a TypeScript module that can draw in Claude Code's own interface.

> Mods use Claude Code's function hooks, an early-access surface that may change between releases without notice. They were written and tested on Claude Code 2.1.319.

## Mods

| Mod | What it does |
| --- | --- |
| [`background-shells`](plugins/background-shells) | Shows a yellow, highlighter-style band above the prompt while shells or monitors run in the background, with how long each has been running. It hides itself when nothing runs and shows a short toast when one finishes. |

```
  1 shell em segundo plano · Build do projeto 3m    /tasks para ver
```

## Install

At the prompt of a terminal session:

```
/plugin install background-shells --marketplace itswilly1/willy-mods
```

Answer `y` to add the marketplace, then pick a scope (user is the first one). The mod is active right away.

From a shell:

```
claude plugin install background-shells --marketplace itswilly1/willy-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `itswilly1/willy-mods`, then Add plugin.

## Develop

Each mod lives in `plugins/<name>` and is listed in `.claude-plugin/marketplace.json`.

```
claude plugin validate plugins/background-shells
claude plugin test plugins/background-shells
```

## License

[MIT](LICENSE)
