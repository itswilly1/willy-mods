import type { Register } from 'claude-code'

// A soft yellow highlighter: Catppuccin Mocha yellow (#f9e2af) toned down.
const HIGHLIGHT = '#d4c48f'
const INK = '#1e1e2e'

const passThrough = <E, R>(_: unknown, e: E, next: (e: E) => R) => next(e)

export const register: Register = on => {
  // The person's own prompt, drawn in the highlighter.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'composer' } } }, ($, e) => {
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
}
