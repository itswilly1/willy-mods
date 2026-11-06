import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput } from 'claude-code'

import type { Shot } from '../types'

// The pictures each call made or read, keyed by the call's tool_use_id.
const shots = atom({ plugin: 'screenshot-peek', key: 'shots' } as const, [] as Shot[])

const EXTENSIONS = 'png|jpe?g|gif|webp|heic|heif|tiff?|bmp'
const IMAGE = new RegExp(`\\.(${EXTENSIONS})$`, 'i')
const NAMES_IMAGE = new RegExp(`\\.(${EXTENSIONS})\\b`, 'i')
const BARE_PATH = new RegExp(
  `(?:^|[\\s=:,(>])((?:[^\\s'"=:,;|&()<>\\\\]|\\\\.)+\\.(?:${EXTENSIONS}))(?=$|[\\s'",;|&()<>.])`,
  'gim',
)

const MAX_SHOTS = 3
const MAX_COLUMNS = 20
const MAX_ROWS = 6
// A terminal cell's width over its height.
const CELL = 0.5
// A taller picture (a full page) is cut to this height over width, from its top.
const TALL = 1.6
const THUMB_PIXELS = 480

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

function resolve(raw: string, home: string, cwd: string): string {
  let path = raw.trim().replace(/^-{1,2}[\w-]+=/, '')
  path = path.replace(/^(\$HOME|\$\{HOME\}|~)(?=\/|$)/, home)
  if (!path.startsWith('/')) path = `${cwd}/${path}`
  return normalize(path)
}

/** The image paths a text names: a quoted one whole, the others word by word. */
function mentioned(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/'([^'\n]+)'|"([^"\n]+)"/g)) {
    const inside = (match[1] ?? match[2] ?? '').trim()
    if (IMAGE.test(inside)) found.add(inside)
  }
  for (const match of text.matchAll(BARE_PATH)) {
    const path = (match[1] ?? '').replace(/\\(.)/g, '$1')
    if (path !== '') found.add(path)
  }
  return [...found]
}

function leadingCd(command: string): string | undefined {
  const match = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)/.exec(command)
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3])
}

function stdoutOf(result: unknown): string {
  if (typeof result !== 'object' || result === null) return ''
  const stdout = (result as { stdout?: unknown }).stdout
  return typeof stdout === 'string' ? stdout.slice(0, 20_000) : ''
}

function isBackground(result: unknown): boolean {
  return typeof result === 'object' && result !== null && Boolean((result as { backgroundTaskId?: unknown }).backgroundTaskId)
}

let home: string | undefined
let folder: string | undefined

async function homeOf($: EngineInterface): Promise<string> {
  home ??= (await $.env.get('HOME')) ?? ''
  return home
}

async function thumbsFolder($: EngineInterface): Promise<string> {
  if (folder !== undefined) return folder
  const tmp = ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '')
  const made = `${tmp}/screenshot-peek`
  await $.process.run(['mkdir', '-p', made]).catch(() => undefined)
  folder = made
  return made
}

async function pictureSize($: EngineInterface, path: string): Promise<{ width: number; height: number } | undefined> {
  const out = await $.process
    .run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path], { timeoutMs: 10_000 })
    .catch(() => undefined)
  if (out === undefined || out.exitCode !== 0) return undefined
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out.stdout)?.[1] ?? 0)
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out.stdout)?.[1] ?? 0)
  return width > 0 && height > 0 ? { width, height } : undefined
}

function cellsFor(size: { width: number; height: number } | undefined): { columns: number; rows: number } {
  if (size === undefined) return { columns: 12, rows: MAX_ROWS }
  const ratio = size.height / size.width
  let columns = MAX_COLUMNS
  let rows = Math.round(columns * ratio * CELL)
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS
    columns = Math.max(4, Math.round(rows / (ratio * CELL)))
  }
  return { columns, rows: Math.max(2, rows) }
}

// A small PNG of the picture, its own file, so a later picture at the same path
// does not change what an earlier row shows.
async function thumbnail($: EngineInterface, path: string, name: string): Promise<Shot> {
  const out = `${await thumbsFolder($)}/${name}.png`
  const size = await pictureSize($, path)
  const args = ['-s', 'format', 'png']
  if (size !== undefined && size.height / size.width > TALL) {
    args.push('-c', String(Math.round(size.width * TALL)), String(size.width), '--cropOffset', '0', '0')
  }
  args.push('-Z', String(THUMB_PIXELS), path, '--out', out)
  const made = await $.process.run(['sips', ...args], { timeoutMs: 15_000 }).catch(() => undefined)
  if (made === undefined || made.exitCode !== 0) {
    return /\.png$/i.test(path) ? { path, thumb: path, ...cellsFor(size) } : { path, thumb: null, ...cellsFor(size) }
  }
  return { path, thumb: out, ...cellsFor(await pictureSize($, out)) }
}

async function keep($: EngineInterface, id: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '')
  const list: Shot[] = []
  for (const [i, path] of paths.slice(0, MAX_SHOTS).entries()) {
    list.push(await thumbnail($, path, `${safe}-${i}`))
  }
  await update($, memberOf(shots, { requestId: id }), () => list)
}

async function openPicture($: EngineInterface, path: string): Promise<void> {
  if (!(await $.fs.exists(path).catch(() => false))) {
    $.ui.toast(`${basename(path)} não existe mais`)
    return
  }
  const opened = await $.process.run(['open', path]).catch(() => undefined)
  if (opened === undefined || opened.exitCode !== 0) $.ui.toast(`Não consegui abrir ${basename(path)}`)
}

async function strip($: EngineInterface, e: ResolveInput, list: readonly Shot[]) {
  const { Box, Text, Button } = $.ui.resolve(e)
  // Pictures are the terminal's alone (kitty graphics in Ghostty and kitty, iTerm2).
  const Image = e.surface === 'terminal' ? $.ui.resolve(e).Image : undefined
  const drawable = await Promise.all(
    list.map(async shot =>
      Image !== undefined && shot.thumb !== null ? $.fs.exists(shot.thumb).catch(() => false) : false,
    ),
  )
  const isMany = list.length > 1

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginLeft={5}>
      {list.map((shot, i) => (
        <Box flexDirection="column">
          {Image !== undefined && shot.thumb !== null && drawable[i] === true ? (
            <Image
              key={`img-${i}`}
              source={{ file: shot.thumb, format: 'png' }}
              columns={shot.columns}
              rows={shot.rows}
              alt={basename(shot.path)}
            />
          ) : (
            <Text dimColor>{basename(shot.path)}</Text>
          )}
          <Button
            key={`open-${i}`}
            label={isMany ? `abrir ${i + 1}` : 'abrir'}
            onPress={() => openPicture($, shot.path)}
          />
        </Box>
      ))}
    </Box>
  )
}

// This mod only watches: if its own code fails, the call goes on untouched.
const passThrough = <E, R>(_: unknown, e: E, next: (e: E) => R) => next(e)

export const register: Register = on => {
  // A command that writes a picture: screencapture, Chrome --screenshot, a script.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const startedAt = await $.clock.now()
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || isBackground(ran.result)) return ran

    const text = `${e.command}\n${stdoutOf(ran.result)}`
    if (!NAMES_IMAGE.test(text)) return ran

    const homeDir = await homeOf($)
    const sessionCwd = await $.session.cwd()
    const cd = leadingCd(e.command)
    const cwd = cd === undefined ? sessionCwd : resolve(cd, homeDir, sessionCwd)

    const fresh: string[] = []
    for (const raw of mentioned(text)) {
      const path = resolve(raw, homeDir, cwd)
      if (fresh.includes(path)) continue
      const stat = await $.fs.stat(path).catch(() => undefined)
      // Only what this call wrote: a picture it merely names is not new.
      if (stat === undefined || stat.kind !== 'file' || stat.size === 0 || stat.mtimeMs < startedAt - 2_000) continue
      fresh.push(path)
      if (fresh.length >= MAX_SHOTS) break
    }
    await keep($, e.tool_use_id, fresh)
    return ran
  }).catch(passThrough)

  // A picture Claude looks at.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || !IMAGE.test(e.file_path)) return ran
    await keep($, e.tool_use_id, [e.file_path])
    return ran
  }).catch(passThrough)

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Bash' && e.props.tool !== 'Read') return next(e)
    const list = await read($, memberOf(shots, e))
    if (list.length === 0) return next(e)

    const { Box } = $.ui.resolve(e)
    const row = await next(e)
    return (
      <Box flexDirection="column">
        {row}
        {await strip($, e, list)}
      </Box>
    )
  })

  // Reads folded into one line ("Read 3 files") show their pictures under it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const list: Shot[] = []
    for (const call of e.props.calls) {
      if (call.tool_use_id === undefined || (call.tool !== 'Read' && call.tool !== 'Bash')) continue
      list.push(...(await read($, memberOf(shots, { requestId: call.tool_use_id }))))
    }
    if (list.length === 0) return next(e)

    const { Box } = $.ui.resolve(e)
    const group = await next(e)
    return (
      <Box flexDirection="column">
        {group}
        {await strip($, e, list.slice(0, 6))}
      </Box>
    )
  })
}
