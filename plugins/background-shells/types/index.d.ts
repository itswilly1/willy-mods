export type BgTask = {
  id: string
  kind: 'shell' | 'monitor'
  label: string
  /** Epoch ms when the mod saw it start; null when first seen at a turn's end. */
  startedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'background-shells': { tasks: BgTask[]; tick: number }
  }
}
