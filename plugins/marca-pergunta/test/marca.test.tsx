import { expect, mock, test } from 'claude-code/testing'

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
