import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { App } from '../types'

const apps = atom({ plugin: 'mac-app-runner', key: 'apps' } as const, [] as App[])
// Bumped on a timer so "aberto há 3m" redraws.
const tick = atom({ plugin: 'mac-app-runner', key: 'tick' } as const, 0)
// The apps a press is closing or reopening right now.
const busy = atom({ plugin: 'mac-app-runner', key: 'busy' } as const, [] as number[])

// Catppuccin Mocha, the statusline's palette.
const CHIP = '#89dceb'
const STALE = '#fab387'
const INK = '#1e1e2e'
const APPLE = '' // nf-fa-apple
const SHOWN = 2
const POLL_MS = 4_000

// An executable inside an .app that Xcode built: DerivedData or a -derivedDataPath folder.
const BUILT_APP = /^(.+\/Build\/Products\/((?:Debug|Release)[^/]*)\/([^/]+)\.app)\/Contents\/MacOS\/[^/]+$/
const MAY_LAUNCH = /xcodebuild|\.app\b|\bopen\b|\bkill(all)?\b/

// Quits $1, waits for it to go (SIGKILL after 5 s), then opens $2 when given.
const QUIT_AND_OPEN = [
  'kill "$1" 2>/dev/null',
  'i=0',
  'while kill -0 "$1" 2>/dev/null; do',
  '  i=$((i+1))',
  '  [ "$i" -eq 25 ] && kill -9 "$1" 2>/dev/null',
  '  [ "$i" -gt 40 ] && exit 1',
  '  sleep 0.2',
  'done',
  '[ -n "$2" ] && exec open "$2"',
  'exit 0',
].join('\n')

/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in milliseconds. */
function elapsedOf(text: string): number {
  const dash = text.indexOf('-')
  const days = dash === -1 ? 0 : Number(text.slice(0, dash))
  const parts = text.slice(dash + 1).split(':').map(Number)
  while (parts.length < 3) parts.unshift(0)
  const [hours = 0, minutes = 0, seconds = 0] = parts
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000
}

function since(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'aberto agora'
  if (minutes < 60) return `aberto há ${minutes}m`
  return `aberto há ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function isStale(app: App): boolean {
  return app.builtAt > app.startedAt + 2_000
}

async function scan($: EngineInterface): Promise<App[] | undefined> {
  const out = await $.process.run(['ps', '-axo', 'pid=,etime=,comm='], { timeoutMs: 5_000 }).catch(() => undefined)
  if (out === undefined || out.exitCode !== 0) return undefined

  const now = await $.clock.now()
  const found: App[] = []
  for (const line of out.stdout.split('\n')) {
    const row = /^\s*(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line)
    if (row === null) continue
    const binary = row[3] ?? ''
    const app = BUILT_APP.exec(binary)
    if (app === null) continue
    const stat = await $.fs.stat(binary).catch(() => undefined)
    found.push({
      pid: Number(row[1]),
      name: app[3] ?? binary,
      bundle: app[1] ?? binary,
      binary,
      config: app[2] ?? 'Debug',
      startedAt: now - elapsedOf(row[2] ?? '0:0'),
      builtAt: stat?.mtimeMs ?? 0,
    })
  }
  return found.sort((a, b) => b.startedAt - a.startedAt)
}

async function refresh($: EngineInterface): Promise<void> {
  const found = await scan($)
  if (found === undefined) return
  const known = await read($, apps)
  // A known process keeps the start it was first seen with: ps counts whole seconds.
  const merged = found.map(app => {
    const old = known.find(one => one.pid === app.pid)
    return old === undefined ? app : { ...app, startedAt: old.startedAt }
  })
  const signature = (list: readonly App[]) => list.map(app => `${app.pid}:${app.builtAt}`).join(',')
  if (signature(merged) !== signature(known)) await update($, apps, () => merged)
}

async function quit($: EngineInterface, app: App, reopen: boolean): Promise<void> {
  await update($, busy, list => [...list, app.pid])
  try {
    const done = await $.process
      .run(['/bin/sh', '-c', QUIT_AND_OPEN, 'mac-app-runner', String(app.pid), reopen ? app.bundle : ''], {
        timeoutMs: 15_000,
      })
      .catch(() => undefined)
    if (done === undefined || done.exitCode !== 0) {
      $.ui.toast(reopen ? `Não consegui reabrir ${app.name}` : `Não consegui fechar ${app.name}`)
    } else {
      $.ui.toast(reopen ? `${app.name} reaberto` : `${app.name} fechado`)
    }
  } finally {
    await update($, busy, list => list.filter(pid => pid !== app.pid))
    await refresh($)
    // The reopened app takes a moment to show up in ps.
    $.clock.after(1_500, () => {
      void refresh($)
    })
  }
}

// This mod only watches: if its own code fails, the event goes on untouched.
const passThrough = <E, R>(_: unknown, e: E, next: (e: E) => R) => next(e)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    let isScanning = false
    const poll = async () => {
      if (isScanning) return
      isScanning = true
      try {
        await refresh($)
      } finally {
        isScanning = false
      }
    }
    $.clock.after(0, () => {
      void poll()
    })
    $.clock.every(POLL_MS, () => {
      void poll()
    })
    $.clock.every(30_000, () => {
      void (async () => {
        if ((await read($, apps)).length > 0) await update($, tick, n => n + 1)
      })()
    })
    return started
  })

  // Claude built, opened or killed an app: look now rather than at the next poll.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (MAY_LAUNCH.test(e.command)) await refresh($)
    return ran
  }).catch(passThrough)

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, apps)
    await read($, tick)
    if (e.props.hasSurvey || list.length === 0) return next(e)

    const pending = await read($, busy)
    const now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)
    // Other bands (background-shells) draw under this one.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {list.slice(0, SHOWN).map(app => {
          const stale = isStale(app)
          const color = stale ? STALE : CHIP
          return (
            <Box flexDirection="row">
              <Text backgroundColor={color} color={INK} bold>
                {` ${APPLE} ${app.name} `}
              </Text>
              <Text backgroundColor={color} color={INK}>
                {`· ${app.config} `}
              </Text>
              <Text dimColor>{` ${since(now - app.startedAt)}`}</Text>
              {stale && (
                <Text color={STALE} bold>
                  {' · build novo pronto'}
                </Text>
              )}
              <Text>{'  '}</Text>
              {pending.includes(app.pid) ? (
                <Text dimColor>fechando…</Text>
              ) : (
                <>
                  <Button
                    key={`reopen-${app.pid}`}
                    label="reabrir"
                    variant={stale ? 'primary' : 'secondary'}
                    onPress={() => quit($, app, true)}
                  />
                  <Text> </Text>
                  <Button key={`close-${app.pid}`} label="fechar" onPress={() => quit($, app, false)} />
                </>
              )}
            </Box>
          )
        })}
        {list.length > SHOWN && <Text dimColor>{`+${list.length - SHOWN} apps`}</Text>}
        {below}
      </Box>
    )
  })
}
