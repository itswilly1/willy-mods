/** Index in the mod's list of your prompts, oldest first. */
export type PromptIndex = number

declare module 'claude-code' {
  interface PluginState {
    'marca-pergunta': {
      /** The prompt the band last jumped to; null before any jump since your last message. */
      cursor: PromptIndex | null
    }
  }
}
