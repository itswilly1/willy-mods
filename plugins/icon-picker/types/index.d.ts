/** One Nerd Font glyph: its name in glyphnames.json, its code point in hex, the character. */
export type Glyph = { name: string; code: string; char: string }

/** What the /icone pane shows. */
export type Picker =
  | { status: 'idle' }
  | { status: 'loading'; root: string; project: string }
  | { status: 'ready'; root: string; project: string; current: string | null; glyphs: Glyph[]; page: number }
  | { status: 'error'; root: string; project: string; message: string }

declare module 'claude-code' {
  interface PluginState {
    'icon-picker': { picker: Picker }
  }
}
