/** One message the person sent in the task at hand. */
export type Ask = {
  text: string
  /** The end of the assistant's message the person was answering, if there was one. */
  replyTo: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'push-gate': { asks: Ask[] }
  }
}
