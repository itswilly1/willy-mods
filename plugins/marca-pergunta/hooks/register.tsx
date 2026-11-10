import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const cursor = atom({ plugin: 'marca-pergunta', key: 'cursor' } as const, null as number | null)

// A soft yellow highlighter: Catppuccin Mocha yellow (#f9e2af) toned down.
const HIGHLIGHT = '#d4c48f'
const INK = '#1e1e2e'

// Drawing is pure: no $.state writes while a row draws. The rows of your
// prompts are kept here instead (a reload redraws them, so they come back),
// and a change asks for one more draw so the band reads it.
const prompts: string[] = []
const visible = new Set<string>()

function redraw($: EngineInterface) {
  $.ui.invalidate('ui.render')
}

const passThrough = <E, R>(_: unknown, e: E, next: (e: E) => R) => next(e)

async function jump($: EngineInterface, index: number) {
  const id = prompts[index]
  if (id === undefined) return
  const moved = await $.ui.scroll({ to: { requestId: id }, block: 'start' })
  if (moved.deny !== undefined) {
    $.ui.toast(`Não deu para rolar: ${moved.deny}`)
    return
  }
  await update($, cursor, () => index)
}

export const register: Register = on => {
  // A new question starts the navigation over from the bottom.
  on('prompt.submit', async ($, e, next) => {
    await update($, cursor, () => null)
    return next(e)
  }).catch(passThrough)

  // The person's own prompt: drawn in the highlighter, and remembered for the band.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, async ($, e, next) => {
    const id = e.requestId
    let changed = false
    if (!prompts.includes(id)) {
      prompts.push(id)
      changed = true
    }
    const onScreen = e.props.onScreen
    if (onScreen !== undefined && (onScreen !== null) !== visible.has(id)) {
      if (onScreen === null) visible.delete(id)
      else visible.add(id)
      changed = true
    }
    if (changed) redraw($)

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text dimColor>{'❯ '}</Text>
        <Box flexShrink={1}>
          <Text backgroundColor={HIGHLIGHT} color={INK}>
            {` ${e.props.text} `}
          </Text>
        </Box>
      </Box>
    )
  }).catch(passThrough)

  // The band: only while your latest question has scrolled out of view.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = prompts
    const at = await read($, cursor)
    const below = await next(e)

    const last = list[list.length - 1]
    if (e.props.hasSurvey || last === undefined || visible.has(last)) return below

    // With no jump yet, "anterior" goes to the newest question above the view.
    const firstShown = list.findIndex(id => visible.has(id))
    const from = at ?? (firstShown === -1 ? list.length : firstShown)
    const previous = from - 1
    const nextOne = at === null ? -1 : at + 1

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box>
          <Text backgroundColor={HIGHLIGHT} color={INK}>
            {at === null ? ` ${list.length} perguntas ` : ` pergunta ${at + 1} de ${list.length} `}
          </Text>
          <Text>{' '}</Text>
          {previous >= 0 ? (
            <Button key="previous" label="↑ anterior" hotkey="k" onPress={() => jump($, previous)} />
          ) : null}
          {nextOne > 0 && nextOne < list.length ? (
            <Button key="next" label="↓ próxima" hotkey="j" onPress={() => jump($, nextOne)} />
          ) : null}
          {at !== null && at < list.length - 1 ? (
            <Button key="last" label="última" hotkey="u" onPress={() => jump($, list.length - 1)} />
          ) : null}
        </Box>
        {below}
      </Box>
    )
  })
}
