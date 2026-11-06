/** One picture a tool call made or read. */
export type Shot = {
  /** The picture itself, absolute: what the button opens. */
  path: string
  /** A small PNG copy the terminal draws, or null when none could be made. */
  thumb: string | null
  /** The cells the thumbnail takes. */
  columns: number
  rows: number
}

declare module 'claude-code' {
  interface PluginState {
    'screenshot-peek': { shots: StateFamily<Shot[]> }
  }
}
