import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const NOW = 1_800_000_000_000
const GAROA = '/Users/w/Library/Developer/Xcode/DerivedData/Garoa-abc/Build/Products/Debug/Garoa.app'
const RAIO = '/Users/w/Developer/app/raio/build/Build/Products/Release/Raio Beta.app'

const BAND = {
  plugin: 'mac-app-runner',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ran = (stdout = '', exitCode = 0): Run => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

// ps lists what runs; the executables were last written at `builtAt`.
function engine(on: On, state: { ps: string; builtAt: Record<string, number> }) {
  const runs: string[][] = []
  const clock = mock.clock(on, { now: NOW })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return { value: e.argv[0] === 'ps' ? ran(state.ps) : ran() }
  })
  on('fs.stat', (_, e) => ({
    value: { kind: 'file' as const, size: 10, mtimeMs: state.builtAt[e.path] ?? 0, isLink: false },
  }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  return { runs, clock }
}

test('an open Debug app shows with how long it has run, over the other bands', async ($, on) => {
  const { clock } = engine(on, {
    ps: `  1 01-02:00:00 /sbin/launchd\n 4242 03:10 ${GAROA}/Contents/MacOS/Garoa\n 77 00:05 /Applications/Ghostty.app/Contents/MacOS/ghostty\n`,
    builtAt: { [`${GAROA}/Contents/MacOS/Garoa`]: NOW - 4 * 60_000 },
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(10)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Garoa/ }))?.props.backgroundColor).toBe('#89dceb')
  expect(await ui.find({ type: 'Text', text: 'aberto há 3m' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /build novo/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /ghostty/i })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await ui.unmount()
})

test('a newer build says so, and reopen quits the old one and opens the bundle', async ($, on) => {
  const { runs, clock } = engine(on, {
    ps: ` 4242 10:00 ${GAROA}/Contents/MacOS/Garoa\n`,
    builtAt: { [`${GAROA}/Contents/MacOS/Garoa`]: NOW - 60_000 },
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(10)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /build novo pronto/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'reopen-4242' }))?.props.variant).toBe('primary')

  await ui.press({ key: 'reopen-4242' })
  const quit = runs.find(argv => argv[0] === '/bin/sh')
  expect(quit?.slice(3)).toEqual(['mac-app-runner', '4242', GAROA])
  await ui.unmount()
})

test('Release builds and names with spaces are found; close passes no bundle', async ($, on) => {
  const { runs, clock } = engine(on, {
    ps: ` 9 1:02:03 ${RAIO}/Contents/MacOS/Raio Beta\n`,
    builtAt: {},
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(10)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Raio Beta/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Release/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'aberto há 1h02' })).toBeDefined()
  await ui.press({ key: 'close-9' })
  expect(runs.find(argv => argv[0] === '/bin/sh')?.slice(3)).toEqual(['mac-app-runner', '9', ''])
  await ui.unmount()
})

test('no app open: the band is the engine\'s', async ($, on) => {
  const { clock } = engine(on, { ps: '  1 01:00 /sbin/launchd\n', builtAt: {} })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(10)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine band')
  await ui.unmount()
})
