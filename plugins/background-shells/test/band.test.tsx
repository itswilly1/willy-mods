import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'background-shells',
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

const NOTIFICATION =
  '<task-notification><task-id>b1</task-id><status>completed</status><summary>done</summary></task-notification>'

// Each hook here stands for the engine beneath the mod.
function engine(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const clock = mock.clock(on, { now: 0 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }))
  on('classic.Stop', () => ({}))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return clock
}

test('a background shell shows the yellow band, on the terminal', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run build', description: 'Build do projeto', run_in_background: true })

  await clock.advance(3 * 60_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const head = await ui.find({ type: 'Text', text: /1 shell em segundo plano/ })
  expect(head?.props.backgroundColor).toBe('#f9e2af')
  expect((await ui.find({ type: 'Text', text: /Build do projeto/ }))?.text).toBe('· Build do projeto 3m ')
  await ui.unmount()
})

test('the band goes away when the shell ends', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 60', run_in_background: true })
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: NOTIFICATION }] } })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /segundo plano/ })).toBeUndefined()
  await ui.unmount()
})

test("a turn's end list replaces what the mod tracked", async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'sleep 60', run_in_background: true })
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [
      { id: 'b1', type: 'shell', status: 'running', description: 'sleep 60', command: 'sleep 60' },
      { id: 'b2', type: 'shell', status: 'running', description: 'tail -f app.log', command: 'tail -f app.log' },
    ],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /2 shells em segundo plano/ })).toBeDefined()
  await ui.unmount()

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ type: 'Text', text: /segundo plano/ })).toBeUndefined()
  await after.unmount()
})

test("another mod's band still draws under this one", async ($, on) => {
  mock.clock(on, { now: 0 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', run_in_background: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /1 shell em segundo plano/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
  await ui.unmount()
})
