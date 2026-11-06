import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const NOW = 1_800_000_000_000
const HOME = '/Users/w'
const ROOT = `${HOME}/Developer/web/garoa`
const OTHER = `${HOME}/Developer/web/brisa/.claude/icon`

const glyph = (code: string) => String.fromCodePoint(Number.parseInt(code, 16))

// A slice of glyphnames.json, padded past the size the mod trusts as a whole list.
const LIST: [string, string][] = [
  ['md-weather_rainy', 'f0597'],
  ['md-weather_pouring', 'f0596'],
  ['weather-rain', 'e318'],
  ['fa-umbrella', 'f0e9'],
  ['md-umbrella', 'f054a'],
  ['md-umbrella_outline', 'f054b'],
  ['md-cloud', 'f015f'],
  ['fa-cloud', 'f0c2'],
  ['pl-left_hard_divider', 'e0b0'],
  ['md-folder', 'f024b'],
  ['md-rocket', 'f0463'],
  ...Array.from({ length: 1000 }, (_, i): [string, string] => [`md-filler_${i}`, (0xf1000 + i).toString(16)]),
]

const PANE = {
  plugin: 'icon-picker',
  component: 'Pane',
  requestId: 'icone',
  props: {
    title: 'Ícone de garoa',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const ICONE = {
  command: 'icone',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ran = (stdout = '', exitCode = 0): Run => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

function engine(on: On, options: { isIgnored?: boolean; stored?: boolean } = {}) {
  const writes: { path: string; text: string }[] = []
  const toasts: string[] = []
  const fetched: string[] = []
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME })
  mock.store(on, options.stored === false ? {} : { glyphs: { version: '3.5.1', fetchedAt: NOW, list: LIST } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: ROOT, remote: null, internal: false, name: null } }))
  on('command.register', () => ({ value: { command: 'icone' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: e.path === `${HOME}/Developer` }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', (_, e) => {
    if (e.path === OTHER) return { value: `${glyph('f0597')}\n` }
    if (e.path === `${ROOT}/README.md`) return { value: '# Garoa\nApp de clima que avisa quando vai chover.' }
    return { deny: 'ENOENT' }
  })
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('http.fetch', (_, e) => {
    fetched.push(e.url)
    const json = Object.fromEntries([['METADATA', { version: '3.5.1' }], ...LIST.map(([name, code]) => [name, { char: glyph(code), code }])])
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(json) } }
  })
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: 'rain\numbrella\ncloud',
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  on('process.run', (_, e) => {
    const [command, ...args] = e.argv
    if (command === 'find') return { value: ran(`${OTHER}\n`) }
    if (command === 'ghostty') return { value: ran(`U+${args[1]?.slice(7)} found in face “JetBrainsMono Nerd Font”.`) }
    if (command === 'git') return { value: ran('', options.isIgnored === false ? 1 : 0) }
    return { value: ran() }
  })
  return { writes, toasts, fetched, clock }
}

// Runs the clock until the mod's timer work is done (the start waits 2 s before looking).
async function settle(clock: { advance: (ms: number) => Promise<void> }, $: Engine, isDone: () => Promise<boolean>) {
  for (let i = 0; i < 40 && !(await isDone()); i++) await clock.advance(i === 0 ? 1 : 100)
}

test('/icone lists glyphs for the project, skips the ones in use, and saves the pick', async ($, on) => {
  const { writes, clock } = engine(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.command.run(ICONE)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await settle(clock, $, async () => (await ui.findAll({ type: 'Button' })).length > 1)
  await ui.unmount()
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  const buttons = await ui.findAll({ type: 'Button' })
  const keys = buttons.map(button => button.key)
  // brisa already uses md-weather_rainy; powerline glyphs are no icons.
  expect(keys).not.toContain('glyph-f0597')
  expect(keys).not.toContain('glyph-e0b0')
  // One per word first: rain, umbrella, cloud.
  expect(keys.slice(0, 3)).toEqual(['glyph-e318', 'glyph-f054a', 'glyph-f015f'])

  await ui.press({ key: 'glyph-f054a' })
  expect(writes).toEqual([{ path: `${ROOT}/.claude/icon`, text: `${glyph('f054a')}\n` }])
  await ui.unmount()
})

test('a git project with no icon gets one at the start, where git ignores the file', async ($, on) => {
  const { writes, toasts, clock } = engine(on, { isIgnored: true })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle(clock, $, async () => writes.length > 0)

  expect(writes[0]?.path).toBe(`${ROOT}/.claude/icon`)
  expect(toasts.at(-1)).toMatch(/criado para garoa/)
})

test('where git would track the file, only a nudge', async ($, on) => {
  const { writes, toasts, clock } = engine(on, { isIgnored: false })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await settle(clock, $, async () => toasts.length > 0)

  expect(writes).toEqual([])
  expect(toasts).toEqual(['garoa não tem ícone · /icone escolhe um'])
})

test('with no list kept, it fetches glyphnames.json once', async ($, on) => {
  const { fetched, clock } = engine(on, { stored: false })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.command.run(ICONE)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await settle(clock, $, async () => (await ui.findAll({ type: 'Button' })).length > 1)
  expect(fetched).toEqual(['https://raw.githubusercontent.com/ryanoasis/nerd-fonts/master/glyphnames.json'])
  await ui.unmount()
})
