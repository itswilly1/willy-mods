import { expect, test } from 'claude-code/testing'

const SPINNER = {
  plugin: 'spinner-ptbr',
  component: 'Spinner',
  props: { word: 'Sautéing', message: null, suffix: '…', mode: 'responding' },
} as const

const TURN = {
  plugin: 'spinner-ptbr',
  component: 'TurnDuration',
  requestId: 'msg-1',
  props: { word: 'Baked', durationMs: 64_000 },
} as const

test('the spinner speaks Portuguese, the same word every time', async ($, on) => {
  // The engine beneath draws whatever word reaches it.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{String((e.props as { word?: unknown }).word)}</Text>
  })

  const words: string[] = []
  for (const surface of ['terminal', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...SPINNER, surface })
    const word = (await ui.find({ type: 'Text' }))?.text ?? ''
    expect(word).not.toBe('Sautéing')
    expect(word).toMatch(/(ando|endo|indo)$/)
    words.push(word)
    await ui.unmount()
  }
  expect(new Set(words).size).toBe(1)
})

test('the turn line reads "<verbo> por 1m 4s"', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...TURN, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: / por 1m 4s$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeUndefined()
  await ui.unmount()
})

test('ctrl+o keeps the engine line', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...TURN,
    surface: 'terminal',
    props: { ...TURN.props, isExpanded: true },
  })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
