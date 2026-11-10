import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'marca-pergunta',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

function prompt(requestId: string, text: string, onScreen: { first: number; last: number; of: number } | null) {
  return {
    plugin: 'marca-pergunta',
    component: 'UserMessage',
    requestId,
    surface: 'terminal',
    props: { text, origin: { kind: 'composer' }, isExpanded: false, onScreen },
  } as const
}

// Each hook here stands for the engine beneath the mod.
type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

function engine(on: On) {
  mock.clock(on, { now: 0 })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('your own question is drawn in the soft yellow highlighter', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(prompt('p1', 'tem um campo Categoria?', { first: 0, last: 2, of: 3 }))
  const row = await ui.find({ type: 'Text', text: /Categoria/ })
  expect(row?.props.backgroundColor).toBe('#d4c48f')
  expect(row?.props.color).toBe('#1e1e2e')
  await ui.unmount()
})

test("another party's message keeps the engine's row", async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({
    ...prompt('n1', 'shell terminou', null),
    props: { text: 'shell terminou', origin: { kind: 'task-notification' }, isExpanded: false },
  })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect(await ui.find({ type: 'Text', text: /shell terminou/ })).toBeUndefined()
  await ui.unmount()
})

test('the band shows once your latest question scrolls away, and not before', async ($, on) => {
  engine(on)
  const first = await $.ui.mount(prompt('p1', 'primeira', null))
  const latest = await $.ui.mount(prompt('p2', 'segunda', { first: 0, last: 2, of: 3 }))

  const quiet = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await quiet.find({ type: 'Text', text: /perguntas/ })).toBeUndefined()
  await quiet.unmount()

  await latest.unmount()
  await $.ui.mount(prompt('p2', 'segunda', null))

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /perguntas/ }))?.text).toBe(' 2 perguntas ')
  expect((await band.find({ type: 'Button', key: 'previous' }))?.props.label).toBe('↑ anterior')
  expect(await band.find({ type: 'Button', key: 'next' })).toBeUndefined()
  await band.unmount()
  await first.unmount()
})
