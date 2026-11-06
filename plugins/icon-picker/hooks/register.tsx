import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Glyph, Picker } from '../types'

const picker = atom({ plugin: 'icon-picker', key: 'picker' } as const, { status: 'idle' } as Picker)

const PANE = 'icone'
const PAGE = 8
const POOL = 32
const PER_WORD = 3
const ICON = '.claude/icon'
const GLYPHS_URL = 'https://raw.githubusercontent.com/ryanoasis/nerd-fonts/master/glyphnames.json'
const GLYPHS_KEY = 'glyphs'
const NUDGED_KEY = 'nudged'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const RED = '#f38ba8'

// Families worth an icon, best first; powerline and the like are left out.
const FAMILY_RANK: Record<string, number> = {
  md: 0, fa: 1, cod: 2, oct: 3, dev: 4, fae: 5, weather: 6, seti: 7, linux: 8, custom: 9,
}
// Variants that make a poorer project icon than the plain glyph.
const VARIANT = /(^|_)(outline|off|remove|minus|plus|alert|check|cancel|lock|edit|cog|sync|multiple|variant|box|circle|marker|settings|search|refresh|account|alt)(_|$)/
// Folders the search for other projects' icons does not go into.
const SKIP = ['node_modules', '.git', 'DerivedData', 'Pods', 'vendor', 'build', 'dist', 'Library', '.build', '.next', '.cache']

type Stored = { version: string; fetchedAt: number; list: [string, string][] }

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function familyOf(name: string): string {
  return name.slice(0, name.indexOf('-'))
}

function wordsOf(name: string): string[] {
  return name.slice(name.indexOf('-') + 1).split(/[_-]/)
}

function charOf(code: string): string {
  return String.fromCodePoint(Number.parseInt(code, 16))
}

function firstGlyph(text: string): string | null {
  const line = (text.split('\n')[0] ?? '').replace(/\s+/g, '')
  return [...line][0] ?? null
}

async function glyphList($: EngineInterface): Promise<[string, string][]> {
  const stored = (await $.store.get(GLYPHS_KEY)) as Stored | undefined
  const now = await $.clock.now()
  const hasStored = stored !== undefined && Array.isArray(stored.list) && stored.list.length > 1000
  if (hasStored && now - stored.fetchedAt < MAX_AGE_MS) return stored.list

  try {
    const response = await $.http.fetch(GLYPHS_URL)
    if (!response.ok) throw new Error(`glyphnames.json respondeu ${response.status}`)
    const json = JSON.parse(response.text) as Record<string, { code?: unknown; version?: unknown }>
    const list: [string, string][] = []
    for (const [name, value] of Object.entries(json)) {
      if (name !== 'METADATA' && typeof value.code === 'string') list.push([name, value.code])
    }
    const version = typeof json.METADATA?.version === 'string' ? json.METADATA.version : ''
    await $.store.set(GLYPHS_KEY, { version, fetchedAt: now, list } satisfies Stored)
    return list
  } catch (error) {
    // An old list beats none.
    if (hasStored) return stored.list
    throw error
  }
}

async function currentIcon($: EngineInterface, root: string): Promise<string | null> {
  const text = await $.fs.read(`${root}/${ICON}`).catch(() => undefined)
  return typeof text === 'string' ? firstGlyph(text) : null
}

/** The icons the person's other projects use, by character. */
async function usedIcons($: EngineInterface, root: string): Promise<Set<string>> {
  const home = (await $.env.get('HOME')) ?? ''
  const developer = `${home}/Developer`
  const base = (await $.fs.exists(developer).catch(() => false)) ? developer : root.slice(0, root.lastIndexOf('/')) || '/'

  const args = ['find', base, '-maxdepth', '6', '(']
  SKIP.forEach((name, i) => args.push(...(i === 0 ? [] : ['-o']), '-name', name))
  args.push(')', '-prune', '-o', '-path', `*/${ICON}`, '-type', 'f', '-print')
  const out = await $.process.run(args, { timeoutMs: 20_000 }).catch(() => undefined)

  const used = new Set<string>()
  for (const file of (out?.stdout ?? '').split('\n')) {
    if (file === '' || file === `${root}/${ICON}`) continue
    const text = await $.fs.read(file).catch(() => undefined)
    const char = typeof text === 'string' ? firstGlyph(text) : null
    if (char !== null) used.add(char)
  }
  return used
}

async function describeProject($: EngineInterface, root: string): Promise<string> {
  const parts = [`Nome da pasta do projeto: ${basename(root)}`]
  for (const [name, max] of [['README.md', 1200], ['readme.md', 1200], ['CLAUDE.md', 600]] as const) {
    const text = await $.fs.read(`${root}/${name}`).catch(() => undefined)
    if (typeof text === 'string' && text.trim() !== '') parts.push(`${name}:\n${text.slice(0, max)}`)
  }
  const pkg = await $.fs.read(`${root}/package.json`).catch(() => undefined)
  if (typeof pkg === 'string') {
    try {
      const json = JSON.parse(pkg) as { name?: unknown; description?: unknown }
      parts.push(`package.json: ${String(json.name ?? '')} ${String(json.description ?? '')}`.trim())
    } catch {
      // Not JSON: nothing to add.
    }
  }
  const entries = await $.fs.list(root).catch(() => [])
  const names = entries.map(entry => entry.name).filter(name => !name.startsWith('.'))
  if (names.length > 0) parts.push(`Arquivos na raiz: ${names.slice(0, 40).join(', ')}`)
  return parts.join('\n\n')
}

/** Words to look glyphs up by: a small model's, then the project's name, then a few that always match. */
async function keywords($: EngineInterface, root: string): Promise<string[]> {
  const prompt = [
    await describeProject($, root),
    '',
    'Sugira ícones para este projeto. Responda só com 12 a 16 palavras-chave em inglês, uma por linha, em minúsculas, da mais para a menos representativa: substantivos simples que representem visualmente o projeto e que costumam ser nomes de ícones (por exemplo: rocket, leaf, music, cloud, gamepad, chart, cookie, school, cow, guitar, rain).',
  ].join('\n')
  const reply = await $.model.complete({ model: 'haiku', prompt, maxTokens: 200, timeoutMs: 20_000 }).catch(() => undefined)
  const suggested =
    reply !== undefined && reply.isAnswered
      ? reply.text.split(/[\n,;]+/).map(word => word.toLowerCase().replace(/[^a-z]/g, ''))
      : []
  const fromName = basename(root).toLowerCase().split(/[^a-z]+/)
  return [...new Set([...suggested, ...fromName, 'folder', 'code', 'rocket', 'cube'])].filter(
    word => word.length >= 3 && word.length <= 20,
  )
}

// rain and rainy, cloud and clouds, berry and berries meet here.
function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ies|es|s|y)$/, '') : word
}

function choose(list: readonly [string, string][], words: readonly string[], used: Set<string>, current: string | null): Glyph[] {
  const byStem = new Map<string, [string, string][]>()
  for (const entry of list) {
    // A crossed-out glyph (cow_off) is never a project's icon.
    if (!(familyOf(entry[0]) in FAMILY_RANK) || /(^|_)off(_|$)/.test(entry[0])) continue
    for (const part of new Set(wordsOf(entry[0]).map(stem))) {
      const bucket = byStem.get(part)
      if (bucket === undefined) byStem.set(part, [entry])
      else bucket.push(entry)
    }
  }

  const cost = (name: string, word: string): number => {
    const parts = wordsOf(name)
    return (
      (FAMILY_RANK[familyOf(name)] ?? 10) * 2 +
      parts.length * 3 +
      (parts[0] === word ? 0 : parts.includes(word) ? 2 : 4) +
      (VARIANT.test(name.slice(name.indexOf('-') + 1)) ? 8 : 0)
    )
  }
  const ranked = words.map(word =>
    [...(byStem.get(stem(word)) ?? [])].sort((a, b) => cost(a[0], word) - cost(b[0], word)),
  )

  // One per word in turn, so the first page spans the best words.
  const chosen: Glyph[] = []
  const seen = new Set<string>()
  const taken = ranked.map(() => 0)
  const next = ranked.map(() => 0)
  for (let round = 0; round < PER_WORD && chosen.length < POOL; round++) {
    ranked.forEach((entries, w) => {
      if (chosen.length >= POOL || (taken[w] ?? 0) > round) return
      while ((next[w] ?? 0) < entries.length) {
        const entry = entries[next[w] ?? 0]
        next[w] = (next[w] ?? 0) + 1
        if (entry === undefined) break
        const char = charOf(entry[1])
        if (seen.has(char) || used.has(char) || char === current) continue
        seen.add(char)
        chosen.push({ name: entry[0], code: entry[1], char })
        taken[w] = (taken[w] ?? 0) + 1
        break
      }
    })
  }
  return chosen
}

/** Keeps the glyphs the terminal's font draws: Ghostty says so; elsewhere every one stays. */
async function drawable($: EngineInterface, glyphs: readonly Glyph[]): Promise<Glyph[]> {
  const first = glyphs[0]
  if (first === undefined) return []
  const probe = await $.process.run(['ghostty', '+show-face', `--cp=0x${first.code}`], { timeoutMs: 5_000 }).catch(() => undefined)
  if (probe === undefined) return [...glyphs]
  const found = await Promise.all(
    glyphs.map(glyph =>
      $.process
        .run(['ghostty', '+show-face', `--cp=0x${glyph.code}`], { timeoutMs: 5_000 })
        .then(out => /found in face/.test(`${out.stdout}${out.stderr}`))
        .catch(() => true),
    ),
  )
  return glyphs.filter((_, i) => found[i] === true)
}

async function suggestions($: EngineInterface, root: string, current: string | null): Promise<Glyph[]> {
  const [list, used, words] = await Promise.all([glyphList($), usedIcons($, root), keywords($, root)])
  return drawable($, choose(list, words, used, current))
}

async function load($: EngineInterface, root: string, project: string): Promise<void> {
  try {
    const current = await currentIcon($, root)
    const glyphs = await suggestions($, root, current)
    if (glyphs.length === 0) throw new Error('nenhum glifo combinou com o projeto')
    await update($, picker, (): Picker => ({ status: 'ready', root, project, current, glyphs, page: 0 }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, picker, (): Picker => ({ status: 'error', root, project, message }))
  }
}

async function save($: EngineInterface, root: string, project: string, glyph: Glyph): Promise<void> {
  await $.fs.write(`${root}/${ICON}`, `${glyph.char}\n`)
  await $.ui.close({ id: PANE })
  await update($, picker, (): Picker => ({ status: 'idle' }))
  $.ui.toast(`Ícone ${glyph.char} salvo para ${project}`)
}

// A git project with no icon gets the first suggestion, where git ignores the
// file (a global ignore keeps it out of every repository); elsewhere a nudge, once.
async function autoCreate($: EngineInterface): Promise<void> {
  const repo = await $.session.repo().catch(() => null)
  if (repo === null || (await $.fs.exists(`${repo.root}/${ICON}`).catch(() => true))) return
  const project = basename(repo.root)

  const check = await $.process.run(['git', '-C', repo.root, 'check-ignore', '-q', ICON]).catch(() => undefined)
  if (check?.exitCode !== 0) {
    const nudged = ((await $.store.get(NUDGED_KEY)) as string[] | undefined) ?? []
    if (nudged.includes(repo.root)) return
    await $.store.set(NUDGED_KEY, [...nudged, repo.root].slice(-200))
    $.ui.toast(`${project} não tem ícone · /icone escolhe um`)
    return
  }

  const first = (await suggestions($, repo.root, null))[0]
  if (first === undefined) return
  await $.fs.write(`${repo.root}/${ICON}`, `${first.char}\n`)
  $.ui.toast(`Ícone ${first.char} criado para ${project} · /icone para trocar`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'icone',
      description: 'Escolhe o ícone Nerd Font do projeto (.claude/icon)',
    })
    $.clock.after(2_000, () => {
      void autoCreate($).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'icone' }, async $ => {
    const repo = await $.session.repo()
    if (repo === null) return { text: 'Este diretório não está num repositório git: o ícone fica em <projeto>/.claude/icon.' }
    const root = repo.root
    const project = basename(root)

    await update($, picker, (): Picker => ({ status: 'loading', root, project }))
    await $.ui.open({ id: PANE, title: `Ícone de ${project}`, focus: true, closeOnEscape: true })
    $.clock.after(0, () => {
      void load($, root, project)
    })
    return { text: `Painel de ícones aberto para ${project}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, picker)
    const { Box, Text, Button } = $.ui.resolve(e)
    const close = () => $.ui.close({ id: PANE })

    if (state.status === 'idle') return <Text dimColor>Rode /icone dentro de um projeto.</Text>
    if (state.status === 'loading') {
      return (
        <Box flexDirection="column">
          <Text bold>{`Ícone de ${state.project}`}</Text>
          <Text dimColor>Procurando glifos que combinem…</Text>
        </Box>
      )
    }
    if (state.status === 'error') {
      return (
        <Box flexDirection="column">
          <Text bold>{`Ícone de ${state.project}`}</Text>
          <Text color={RED}>{`Não deu: ${state.message}`}</Text>
          <Button key="close" label="fechar" hotkey="f" onPress={close} />
        </Box>
      )
    }

    const pages = Math.ceil(state.glyphs.length / PAGE)
    const shown = state.glyphs.slice(state.page * PAGE, state.page * PAGE + PAGE)
    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{`Ícone de ${state.project}`}</Text>
          <Text dimColor>{state.current === null ? '  · sem ícone ainda' : `  · atual: ${state.current}`}</Text>
        </Text>
        <Text> </Text>
        {shown.map((glyph, i) => (
          <Button key={`glyph-${glyph.code}`} plain hotkey={String(i + 1)} onPress={() => save($, state.root, state.project, glyph)}>
            {`${glyph.char}  `}
            <Text dimColor>{glyph.name}</Text>
          </Button>
        ))}
        <Text> </Text>
        <Box flexDirection="row" columnGap={2}>
          {pages > 1 && (
            <Button
              key="more"
              label={`outros ${state.page + 1}/${pages}`}
              hotkey="o"
              onPress={() =>
                update($, picker, now => (now.status === 'ready' ? { ...now, page: (now.page + 1) % pages } : now))
              }
            />
          )}
          <Button key="close" label="fechar" hotkey="f" onPress={close} />
        </Box>
      </Box>
    )
  })
}
