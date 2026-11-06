import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ran = (stdout = '', exitCode = 0): Run => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

// The machine beneath the mod: files with their times, sips, open.
function engine(on: On, files: Record<string, { mtimeMs: number; width: number; height: number }>) {
  const ids: string[] = []
  const opened: string[] = []
  mock.clock(on, { now: 10_000 })
  mock.env(on, { HOME: '/Users/w', TMPDIR: '/tmp/T/' })
  on('session.cwd', () => ({ value: '/proj' }))
  on('tool.call', (_, e) => {
    ids.push(e.tool_use_id)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('fs.stat', (_, e) => {
    const file = files[e.path]
    return file === undefined
      ? { deny: 'ENOENT' }
      : { value: { kind: 'file' as const, size: 1000, mtimeMs: file.mtimeMs, isLink: false } }
  })
  on('fs.exists', () => ({ value: true }))
  on('process.run', (_, e) => {
    const [command, ...args] = e.argv
    if (command === 'open') opened.push(args[0] ?? '')
    if (command === 'sips' && args[0] === '-g') {
      const path = args.at(-1) ?? ''
      const file = files[path] ?? (path.startsWith('/tmp/T/') ? { width: 480, height: 300 } : undefined)
      return { value: file === undefined ? ran('', 1) : ran(`  pixelWidth: ${file.width}\n  pixelHeight: ${file.height}\n`) }
    }
    return { value: ran() }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  return { ids, opened }
}

function row(id: string, tool: string, input: unknown) {
  return {
    plugin: 'screenshot-peek',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false },
  } as const
}

test('a new screenshot shows small under its call and opens on a press', async ($, on) => {
  const { ids, opened } = engine(on, { '/Users/w/Desktop/home.png': { mtimeMs: 10_500, width: 1440, height: 900 } })
  const command = 'screencapture -x ~/Desktop/home.png'
  await $.tool.call({ tool: 'Bash', command })
  const id = ids[0] ?? ''

  const ui = await $.ui.mount({ ...row(id, 'Bash', { command }), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: 'row' }))?.text).toBe('row')
  const image = await ui.find({ type: 'Image' })
  expect(image?.props.columns).toBe(20)
  expect(image?.props.rows).toBe(6)
  expect(image?.props.source).toEqual({ file: `/tmp/T/screenshot-peek/${id.replace(/[^A-Za-z0-9_-]/g, '')}-0.png`, format: 'png' })

  await ui.press({ key: 'open-0' })
  expect(opened).toEqual(['/Users/w/Desktop/home.png'])
  await ui.unmount()
})

test('a picture the command only names is not shown', async ($, on) => {
  const { ids } = engine(on, { '/proj/logo.png': { mtimeMs: 1_000, width: 512, height: 512 } })
  const command = 'git add logo.png'
  await $.tool.call({ tool: 'Bash', command })

  const ui = await $.ui.mount({ ...row(ids[0] ?? '', 'Bash', { command }), surface: 'terminal' })
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a picture Claude reads shows too, cut to its top when tall', async ($, on) => {
  const path = '/Users/w/Desktop/Captura de Tela 2026-11-06 às 17.10.02.png'
  const { ids } = engine(on, { [path]: { mtimeMs: 1_000, width: 1210, height: 1770 } })
  await $.tool.call({ tool: 'Read', file_path: path })

  const ui = await $.ui.mount({ ...row(ids[0] ?? '', 'Read', { file_path: path }), surface: 'terminal' })
  expect((await ui.find({ type: 'Image' }))?.props.rows).toBe(6)
  await ui.unmount()
})

test('a quoted path with spaces after a cd is found', async ($, on) => {
  const path = '/Users/w/Desktop/Captura de Tela 2026-11-06 às 17.10.02.png'
  const { ids } = engine(on, { [path]: { mtimeMs: 10_200, width: 1440, height: 900 } })
  const command = `cd /tmp && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot="${path}" http://localhost:8080/site/`
  await $.tool.call({ tool: 'Bash', command })

  const ui = await $.ui.mount({ ...row(ids[0] ?? '', 'Bash', { command }), surface: 'terminal' })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  await ui.unmount()
})

test('on the desktop the row gets the button and the name', async ($, on) => {
  const { ids } = engine(on, { '/tmp/shot.png': { mtimeMs: 10_100, width: 800, height: 600 } })
  const command = 'screencapture -x /tmp/shot.png'
  await $.tool.call({ tool: 'Bash', command })

  const ui = await $.ui.mount({ ...row(ids[0] ?? '', 'Bash', { command }), surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: 'shot.png' }))?.text).toBe('shot.png')
  expect((await ui.find({ type: 'Button', key: 'open-0' }))?.props.label).toBe('abrir')
  await ui.unmount()
})
