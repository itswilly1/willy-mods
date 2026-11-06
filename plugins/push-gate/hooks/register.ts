import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ask } from '../types'

// The person's messages since the task began: the one that started the turn
// and any typed into it while it ran.
const asks = atom({ plugin: 'push-gate', key: 'asks' } as const, [] as Ask[])

type Kind = 'push' | 'force-push' | 'repo' | 'merge' | 'publish' | 'deploy' | 'migration'
type Action = { kind: Kind; label: string }
type Verdict = { isAllowed: true } | { isAllowed: false; reason: string }

const DESCRIPTION: Record<Kind, string> = {
  push: 'enviar commits para o repositório remoto (git push)',
  'force-push': 'um push forçado ou que apaga algo no remoto',
  repo: 'criar um repositório no GitHub',
  merge: 'fazer merge de um pull request no GitHub',
  publish: 'publicar um pacote, uma imagem ou uma release',
  deploy: 'fazer deploy ou enviar arquivos para um servidor',
  migration: 'rodar uma migração no banco de produção',
}

// Words that, with no negation in the same message, are an explicit ask.
// Matched against the message lowercased and without accents.
const ASKED: Record<Kind, RegExp> = {
  push: /\bpush\b|\b(sobe|suba|subir|manda|mande|mandar|envia|envie|enviar)\b[^.!?\n]{0,30}\b(github|gitlab|remoto|origin)\b/,
  'force-push': /\b(force|forcado|forcada|forca)\b|--force/,
  repo: /\b(cria|crie|criar)\b[^.!?\n]{0,30}\brepo(sitorio)?\b|gh repo create/,
  merge: /\bmerge\b|\bmerg(ea|ear|eia|ue)\b/,
  publish: /\b(publica|publique|publicar|publish)\b/,
  deploy: /\bdeploy\b|\b(sobe|suba|subir|publica|publique|publicar|manda|mande)\b[^.!?\n]{0,30}\b(producao|prod|servidor|no ar)\b/,
  migration: /\bmigra(cao|coes|r|te)?\b[^.!?\n]{0,40}\b(producao|prod)\b|migrate deploy/,
}
const NEGATION = /\b(nao|nunca|sem|jamais|nem)\b|\bdon'?t\b|\bdo not\b|\bnever\b/

// What the classifier answers.
const YES = 'autorizou'
const NO = 'nao_autorizou'

// Origins that are the person's own words.
const PERSON = new Set(['composer', 'bridge', 'sdk', 'scheduled-trigger'])

// A cheap look for the guard's own failure: refuse only what looks risky.
const LOOKS_RISKY =
  /\bgit\b[^\n;|&]*\bpush\b|\b(vercel|netlify|firebase|flyctl|fly|wrangler|gcloud|eas|fastlane)\b[^\n;|&]*\b(deploy|submit|deliver|pilot|--prod)\b|\b(npm|pnpm|yarn|cargo|poetry)\s+publish\b|\bgh\s+(repo\s+create|pr\s+merge|release\s+create)\b|\bdocker\s+push\b|\bmigrate\s+deploy\b/

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const PREFIXES = new Set(['command', 'builtin', 'exec', 'nohup', 'time', 'then', 'do', 'else', 'elif', '!', '{', 'if', 'while', 'until'])
const WITH_FLAGS = new Set(['sudo', 'env', 'nice', 'caffeinate', 'timeout', 'gtimeout', 'xargs'])
const VERCEL_SAFE = new Set([
  'login', 'logout', 'whoami', 'link', 'env', 'pull', 'dev', 'build', 'ls', 'list', 'inspect',
  'logs', 'domains', 'dns', 'certs', 'teams', 'switch', 'projects', 'project', 'help', 'init',
  'git', 'integration', 'telemetry', 'bisect', 'target', 'curl',
])
const SCRIPT = /^(deploy|release|publish)([:._-]|$)/

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function shorten(text: string, max = 80): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function base(word: string): string {
  return word.slice(word.lastIndexOf('/') + 1)
}

function pair(words: readonly string[], first: string, second: string): boolean {
  return words.some((word, i) => word === first && words[i + 1] === second)
}

/**
 * Splits a shell line into simple commands, each a list of words with the
 * quotes taken off. Heredoc bodies and comments are skipped.
 */
function simpleCommands(source: string): string[][] {
  const out: string[][] = []
  const heredocs: { tag: string; strip: boolean }[] = []
  let words: string[] = []
  let word = ''
  let inWord = false
  let i = 0

  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) out.push(words)
    words = []
  }

  while (i < source.length) {
    const c = source[i] ?? ''
    const after = source[i + 1] ?? ''

    if (c === '\\') {
      if (after === '\n') i += 2
      else {
        word += after
        inWord = true
        i += 2
      }
      continue
    }
    if (c === "'") {
      const end = source.indexOf("'", i + 1)
      word += source.slice(i + 1, end === -1 ? source.length : end)
      inWord = true
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < source.length && source[j] !== '"') {
        if (source[j] === '\\' && j + 1 < source.length) {
          word += source[j + 1]
          j += 2
        } else {
          word += source[j]
          j += 1
        }
      }
      inWord = true
      i = j + 1
      continue
    }
    if (c === '#' && !inWord) {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
      continue
    }
    if (c === '<' && after === '<' && source[i + 2] !== '<') {
      endWord()
      let j = i + 2
      const strip = source[j] === '-'
      if (strip) j += 1
      while (source[j] === ' ' || source[j] === '\t') j += 1
      let tag = ''
      while (j < source.length && !/[\s;&|<>()]/.test(source[j] ?? '')) {
        const d = source[j] ?? ''
        if (d !== "'" && d !== '"' && d !== '\\') tag += d
        j += 1
      }
      if (tag !== '') heredocs.push({ tag, strip })
      i = j
      continue
    }
    if (c === '\n') {
      endCommand()
      i += 1
      while (heredocs.length > 0) {
        const { tag, strip } = heredocs.shift() ?? { tag: '', strip: false }
        while (i < source.length) {
          const end = source.indexOf('\n', i)
          const line = source.slice(i, end === -1 ? source.length : end)
          i = end === -1 ? source.length : end + 1
          if ((strip ? line.replace(/^\t+/, '') : line) === tag) break
        }
      }
      continue
    }
    // `2>&1` and `&>` are redirections, not separators.
    if (c === '&' && (source[i - 1] === '>' || after === '>')) {
      word += c
      inWord = true
      i += 1
      continue
    }
    if (c === '$' && after === '(') {
      endCommand()
      i += 2
      continue
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '`') {
      endCommand()
      i += 1
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i += 1
      continue
    }
    word += c
    inWord = true
    i += 1
  }
  endCommand()
  return out
}

/** Takes off what runs a command without being it: `VAR=1`, `sudo`, `npx`, `env -i`. */
function unwrap(argv: readonly string[]): string[] {
  const words = [...argv]
  for (let guard = 0; guard < 12 && words.length > 0; guard++) {
    const head = words[0] ?? ''
    const name = base(head)
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head) || PREFIXES.has(name)) {
      words.shift()
      continue
    }
    if (WITH_FLAGS.has(name)) {
      words.shift()
      while (words.length > 0) {
        const next = words[0] ?? ''
        const isTimeout = (name === 'timeout' || name === 'gtimeout') && /^\d/.test(next)
        if (!next.startsWith('-') && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(next) && !isTimeout) break
        words.shift()
        if (/^-[ugntwCpUs]$/.test(next)) words.shift()
      }
      continue
    }
    if (name === 'npx' || name === 'bunx' || name === 'pnpx') {
      words.shift()
      while (words.length > 0 && (words[0] ?? '').startsWith('-')) words.shift()
      continue
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(name) && ['dlx', 'exec', 'x'].includes(words[1] ?? '')) {
      words.splice(0, 2)
      continue
    }
    if (name === 'xcrun') {
      words.shift()
      while (words.length > 0 && (words[0] ?? '').startsWith('-')) {
        const flag = words.shift()
        if (flag === '--sdk' || flag === '--toolchain') words.shift()
      }
      continue
    }
    break
  }
  return words
}

function gitSubcommand(args: readonly string[]): { name: string; rest: string[] } | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'].includes(arg)) {
      i += 1
      continue
    }
    if (arg.startsWith('-')) continue
    return { name: arg, rest: args.slice(i + 1) }
  }
  return undefined
}

function judgeWords(argv: readonly string[], depth: number): Action[] {
  const words = unwrap(argv)
  const name = base(words[0] ?? '')
  const args = words.slice(1)
  const positional = args.filter(arg => !arg.startsWith('-'))
  const first = positional[0] ?? ''
  const label = shorten(words.join(' '))
  const one = (kind: Kind): Action[] => [{ kind, label }]

  if (SHELLS.has(name)) {
    const flag = args.findIndex(arg => /^-[a-z]*c[a-z]*$/.test(arg))
    const script = flag === -1 ? undefined : args[flag + 1]
    return script !== undefined && depth < 3 ? risky(script, depth + 1) : []
  }
  if (name === 'eval') return depth < 3 ? risky(args.join(' '), depth + 1) : []

  switch (name) {
    case 'git': {
      const sub = gitSubcommand(args)
      if (sub?.name !== 'push') return []
      if (sub.rest.some(arg => arg === '-n' || arg === '--dry-run')) return []
      const isForced = sub.rest.some(
        arg =>
          /^--(force(-with-lease|-if-includes)?(=.*)?|mirror|delete|prune)$/.test(arg) ||
          /^-[a-zA-Z]*[fd][a-zA-Z]*$/.test(arg) ||
          arg.startsWith('+') ||
          /^:[^/]/.test(arg),
      )
      return one(isForced ? 'force-push' : 'push')
    }
    case 'gh':
      if (pair(positional, 'repo', 'create')) return one('repo')
      if (pair(positional, 'pr', 'merge')) return one('merge')
      if (pair(positional, 'release', 'create')) return one('publish')
      return []
    case 'docker':
    case 'podman':
      if (first === 'push' || pair(positional, 'image', 'push')) return one('publish')
      if (pair(positional, 'buildx', 'build') && args.includes('--push')) return one('publish')
      return []
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun':
      if (first === 'publish' || pair(positional, 'npm', 'publish')) return one('publish')
      if ((first === 'run' || first === 'run-script') && SCRIPT.test(positional[1] ?? '')) return one('deploy')
      if (name === 'yarn' && first !== 'publish' && SCRIPT.test(first)) return one('deploy')
      return []
    case 'cargo':
    case 'poetry':
      return first === 'publish' ? one('publish') : []
    case 'gem':
      return first === 'push' ? one('publish') : []
    case 'twine':
      return first === 'upload' ? one('publish') : []
    case 'make':
      return positional.some(target => SCRIPT.test(target)) ? one('deploy') : []
    case 'vercel': {
      if (args.some(arg => ['--version', '-v', '--help', '-h'].includes(arg))) return []
      const isProd = args.includes('--prod') || args.includes('--production')
      return isProd || first === '' || !VERCEL_SAFE.has(first) ? one('deploy') : []
    }
    case 'netlify':
    case 'fly':
    case 'flyctl':
      return first === 'deploy' ? one('deploy') : []
    case 'firebase':
      return first === 'deploy' || first.endsWith(':deploy') || first === 'appdistribution:distribute'
        ? one('deploy')
        : []
    case 'wrangler':
      return first === 'deploy' ||
        first === 'publish' ||
        pair(positional, 'pages', 'deploy') ||
        pair(positional, 'pages', 'publish') ||
        pair(positional, 'versions', 'deploy')
        ? one('deploy')
        : []
    case 'gcloud':
      return positional.slice(0, 4).includes('deploy') ? one('deploy') : []
    case 'eas':
      return first === 'submit' || first === 'update' ? one('deploy') : []
    case 'fastlane':
      return ['deliver', 'pilot', 'upload_to_app_store', 'upload_to_testflight'].includes(first) ? one('deploy') : []
    case 'altool':
      return args.includes('--upload-app') || args.includes('--upload-package') ? one('deploy') : []
    case 'supabase':
      if (pair(positional, 'db', 'push')) return one('migration')
      return pair(positional, 'functions', 'deploy') ? one('deploy') : []
    case 'prisma':
      return pair(positional, 'migrate', 'deploy') ? one('migration') : []
    case 'rsync':
    case 'scp': {
      const target = positional.at(-1) ?? ''
      const isRemote = /^(?:[\w.+-]+@)?[\w.-]+:/.test(target) && !/^[A-Za-z]:[\\/]/.test(target)
      return isRemote && positional.length >= 2 ? one('deploy') : []
    }
    default:
      return []
  }
}

/** The outward-facing actions a Bash command would take, each once. */
function risky(command: string, depth = 0): Action[] {
  const seen = new Set<string>()
  const found: Action[] = []
  for (const words of simpleCommands(command)) {
    for (const action of judgeWords(words, depth)) {
      const id = `${action.kind}\u0000${action.label}`
      if (seen.has(id)) continue
      seen.add(id)
      found.push(action)
    }
  }
  return found
}

function isExplicit(list: readonly Ask[], kind: Kind): boolean {
  return list.some(ask => {
    const text = fold(ask.text)
    if (NEGATION.test(text) || !ASKED[kind].test(text)) return false
    return kind !== 'force-push' || ASKED.push.test(text)
  })
}

function quote(text: string, max: number): string {
  const cut = text.length > max ? `…${text.slice(-max)}` : text
  return `"""${cut}"""`
}

function brief(actions: readonly Action[], list: readonly Ask[]): string {
  const kinds = [...new Set(actions.map(action => DESCRIPTION[action.kind]))]
  const lines = [
    'Um assistente de programação quer rodar este comando no computador do usuário:',
    ...actions.map(action => `  ${action.label}`),
    `Isso é: ${kinds.join('; ')}.`,
    '',
  ]
  list.forEach((ask, i) => {
    if (ask.replyTo !== null) {
      lines.push(`Mensagem do assistente logo antes da mensagem ${i + 1} do usuário:`, quote(ask.replyTo, 500))
    }
    lines.push(`Mensagem ${i + 1} do usuário:`, quote(ask.text, 1500), '')
  })
  lines.push(
    'O usuário pediu ou autorizou explicitamente essa ação nessas mensagens? Um "sim" ou "pode" em resposta a uma pergunta do assistente sobre essa ação conta como autorização. Pedir só um commit, terminar a tarefa ou corrigir algo não conta.',
  )
  return lines.join('\n')
}

function refusal(actions: readonly Action[], why: string): string {
  const what = actions.map(action => `"${action.label}"`).join(', ')
  return `push-gate: bloqueei ${what} ${why}. Pergunte ao usuário antes, por exemplo "Posso fazer o push?", e só rode de novo depois que ele autorizar.`
}

// Verdicts already reached for the same messages, so a second push in the task does not ask again.
const verdicts = new Map<string, boolean>()

async function judge($: EngineInterface, actions: readonly Action[]): Promise<Verdict> {
  const list = await read($, asks)
  const kinds = [...new Set(actions.map(action => action.kind))].sort()
  const what = kinds.map(kind => DESCRIPTION[kind]).join('; ')
  if (list.length === 0) return { isAllowed: false, reason: refusal(actions, `porque o usuário não pediu isso nesta tarefa (${what})`) }
  if (kinds.every(kind => isExplicit(list, kind))) return { isAllowed: true }

  const key = JSON.stringify([kinds, list.map(ask => ask.text)])
  let isAuthorized = verdicts.get(key)
  if (isAuthorized === undefined) {
    try {
      isAuthorized = (await $.model.classify(brief(actions, list), [YES, NO], { model: 'haiku' })) === YES
    } catch {
      return {
        isAllowed: false,
        reason: refusal(actions, 'porque não consegui confirmar se o usuário pediu isso (a checagem falhou)'),
      }
    }
    verdicts.set(key, isAuthorized)
  }
  return isAuthorized
    ? { isAllowed: true }
    : { isAllowed: false, reason: refusal(actions, `porque o usuário não pediu isso nesta tarefa (${what})`) }
}

async function lastAssistantText($: EngineInterface): Promise<string | null> {
  const rows = await $.session.messages().catch(() => undefined)
  if (!Array.isArray(rows)) return null
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.role === 'assistant' && row.text.trim() !== '') return row.text.trim().slice(-600)
  }
  return null
}

const passThrough = <E, R>(_: unknown, e: E, next: (e: E) => R) => next(e)

export const register: Register = on => {
  // Remember what the person asked: a prompt typed while idle starts a new task.
  on('prompt.submit', async ($, e, next) => {
    if (PERSON.has(e.origin.kind) && e.isMeta !== true) {
      const ask: Ask = { text: e.text.slice(0, 4000), replyTo: await lastAssistantText($) }
      await update($, asks, list => (e.turnId === undefined ? [ask] : [...list, ask].slice(-8)))
      if (e.turnId === undefined) verdicts.clear()
    }
    return next(e)
  }).catch(passThrough)

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const actions = risky(e.command)
    if (actions.length === 0) return next(e)

    const verdict = await judge($, actions)
    if (verdict.isAllowed) return next(e)

    $.ui.toast(`push-gate barrou: ${actions[0]?.label ?? e.command}`)
    return { deny: verdict.reason }
  }).catch(($, e, next) =>
    next.called
      ? next(e)
      : LOOKS_RISKY.test(e.command)
        ? { deny: 'push-gate: a checagem falhou, então bloqueei este comando. Pergunte ao usuário antes de tentar de novo.' }
        : next(e),
  )
}
