/** A Mac app from Xcode's build products that is running now. */
export type App = {
  pid: number
  /** The bundle's name without `.app`. */
  name: string
  /** The `.app` bundle, absolute: what `open` reopens. */
  bundle: string
  /** The executable inside the bundle, absolute. */
  binary: string
  /** The build configuration folder: Debug, Release, Debug-maccatalyst. */
  config: string
  /** When the process started, epoch ms. */
  startedAt: number
  /** When the executable was last written, epoch ms: a newer build lands here. */
  builtAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'mac-app-runner': { apps: App[]; tick: number; busy: number[] }
  }
}
