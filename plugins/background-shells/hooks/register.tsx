import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BgTask } from '../types'

const tasks = atom({ plugin: 'background-shells', key: 'tasks' } as const, [] as BgTask[])
// Bumped on a timer so the elapsed times in the band redraw.
const tick = atom({ plugin: 'background-shells', key: 'tick' } as const, 0)

// Catppuccin Mocha yellow, the same palette as the statusline.
const HIGHLIGHT = '#f9e2af'
const INK = '#1e1e2e'
const TERMINAL_GLYPH = '' // nf-fa-terminal
const SHOWN = 2

const TASK_ID = /<task-id>\s*([^<\s]+)\s*<\/task-id>/
const ENDED = /<status>\s*(completed|failed|killed|stopped|cancelled)\s*<\/status>/i

function shorten(text: string, max = 36): string {
  const line = (text.split('\n')[0] ?? '').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function elapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

async function track($: EngineInterface, task: BgTask) {
  await update($, tasks, list => [...list.filter(t => t.id !== task.id), task])
}

async function forget($: EngineInterface, id: string, announce: boolean) {
  const list = await read($, tasks)
  const gone = list.find(t => t.id === id)
  if (gone === undefined) return
  await update($, tasks, current => current.filter(t => t.id !== id))
  if (announce) $.ui.toast(`${gone.kind === 'monitor' ? 'Monitor' : 'Shell'} terminou: ${gone.label}`)
}

// This mod only watches: if its own code fails, the event goes on untouched.
const passThrough = <E, R>(_: unknown, e: E, next: (e: E) => R) => next(e)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(30_000, () => {
      void (async () => {
        if ((await read($, tasks)).length === 0) return
        const now = await $.clock.now()
        await update($, tick, () => now)
      })()
    })
    return next(e)
  })

  // A shell goes to the background: run_in_background, or Ctrl+B mid-run.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true && ran.result.backgroundTaskId) {
      await track($, {
        id: ran.result.backgroundTaskId,
        kind: 'shell',
        label: shorten(e.description || e.command),
        startedAt: await $.clock.now(),
      })
    }
    return ran
  }).catch(passThrough)

  on('tool.call', { tool: 'Monitor' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true && ran.result.taskId) {
      await track($, {
        id: ran.result.taskId,
        kind: 'monitor',
        label: shorten(e.description),
        startedAt: await $.clock.now(),
      })
    }
    return ran
  }).catch(passThrough)

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await forget($, ran.result.task_id, false)
    }
    return ran
  }).catch(passThrough)

  // The notification a background task sends when it ends.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    const text = e.message.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('\n')
    if (text.includes('<task-notification>') && ENDED.test(text)) {
      const id = TASK_ID.exec(text)?.[1]
      if (id !== undefined) await forget($, id, true)
    }
    return stored
  }).catch(passThrough)

  // Each turn's end carries the full list of what still runs: the source of truth.
  on('classic.Stop', async ($, e, next) => {
    const live = e.background_tasks
    if (live !== undefined) {
      await update($, tasks, list =>
        live
          .filter(t => t.type === 'shell' || t.type === 'monitor')
          .map(
            t =>
              list.find(known => known.id === t.id) ?? {
                id: t.id,
                kind: t.type === 'monitor' ? ('monitor' as const) : ('shell' as const),
                label: shorten(t.description || t.command || t.id),
                startedAt: null,
              },
          ),
      )
    }
    return next(e)
  }).catch(passThrough)

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, tasks)
    await read($, tick)
    if (e.props.hasSurvey || list.length === 0) return next(e)

    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)
    const n = list.length
    const onlyShells = list.every(t => t.kind === 'shell')
    const head = onlyShells
      ? `${n} ${n === 1 ? 'shell' : 'shells'} em segundo plano`
      : `${n} em segundo plano`
    const items = list
      .slice(0, SHOWN)
      .map(t => (t.startedAt === null ? t.label : `${t.label} ${elapsed(now - t.startedAt)}`))
    const more = n > SHOWN ? ` · +${n - SHOWN}` : ''

    return (
      <Box>
        <Text backgroundColor={HIGHLIGHT} color={INK} bold>
          {` ${TERMINAL_GLYPH} ${head} `}
        </Text>
        <Text backgroundColor={HIGHLIGHT} color={INK}>
          {`· ${items.join(' · ')}${more} `}
        </Text>
        <Text dimColor>{'  /tasks para ver'}</Text>
      </Box>
    )
  })
}
