import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The engine beneath the mod: tools answer, prompts go through, the
// transcript holds what the test says, the classifier answers `answer`.
function engine(on: On, options: { answer?: (text: string) => string; lastAssistant?: string } = {}) {
  const classified: string[] = []
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('session.messages', () => ({
    value:
      options.lastAssistant === undefined
        ? []
        : [{ role: 'assistant' as const, text: options.lastAssistant, toolUses: [] }],
  }))
  on('model.classify', (_, e) => {
    classified.push(e.text)
    return { value: options.answer?.(e.text) ?? 'nao_autorizou' }
  })
  on('ui.toast', () => ({ value: undefined }))
  return classified
}

async function ask($: Engine, text: string) {
  await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
}

function isDenied(result: unknown): boolean {
  return /push-gate: bloqueei|push-gate: a checagem/.test(JSON.stringify(result))
}

test('a push nobody asked for is blocked', async ($, on) => {
  const classified = engine(on)
  await ask($, 'corrige o bug do login')

  const ran = await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m fix && git push origin main' })
  expect(isDenied(ran)).toBe(true)
  expect(classified.length).toBe(1)
  expect(classified[0]).toMatch(/git push origin main/)
})

test('an explicit ask goes through without asking the model', async ($, on) => {
  const classified = engine(on)
  await ask($, 'corrige o bug e faz o push')

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(isDenied(ran)).toBe(false)
  expect(classified.length).toBe(0)
})

test('"sim" to the assistant\'s question authorizes it', async ($, on) => {
  const classified = engine(on, {
    lastAssistant: 'Terminei e commitei. Posso fazer o push?',
    answer: text => (/Posso fazer o push\?/.test(text) && /"""sim"""/.test(text) ? 'autorizou' : 'nao_autorizou'),
  })
  await ask($, 'sim')

  const ran = await $.tool.call({ tool: 'Bash', command: 'cd app && git -C . push -u origin feature' })
  expect(isDenied(ran)).toBe(false)
  expect(classified.length).toBe(1)
})

test('a negated ask is not explicit', async ($, on) => {
  const classified = engine(on)
  await ask($, 'faz o commit mas não faz push')

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(isDenied(ran)).toBe(true)
  expect(classified.length).toBe(1)
})

test('a force push needs its own ask', async ($, on) => {
  engine(on)
  await ask($, 'faz o push')

  expect(isDenied(await $.tool.call({ tool: 'Bash', command: 'FOO=1 git push --force-with-lease' }))).toBe(true)
  expect(isDenied(await $.tool.call({ tool: 'Bash', command: 'git push origin :old-branch' }))).toBe(true)
})

test('deploys, publishes and uploads are caught', async ($, on) => {
  engine(on)
  await ask($, 'ajusta o css do header')

  for (const command of [
    'npx vercel --prod',
    'netlify deploy --dir dist',
    'bash -lc "firebase deploy --only hosting"',
    'npm publish',
    'gh repo create itswilly1/x --public --source . --push',
    'rsync -avz dist/ willy@meuservidor.com:/var/www/site',
    'npx prisma migrate deploy',
    'docker push ghcr.io/me/app:latest',
  ]) {
    expect(isDenied(await $.tool.call({ tool: 'Bash', command })), command).toBe(true)
  }
})

test('commands that only mention push run without a check', async ($, on) => {
  const classified = engine(on)
  await ask($, 'mostra o histórico')

  for (const command of [
    'git log --grep push',
    'echo "git push"',
    'git push --dry-run',
    "python3 - <<'EOF'\nprint('git push')\nEOF",
    'grep -rn "vercel --prod" docs',
    'rsync -av src/ backup/',
    'vercel env pull',
  ]) {
    expect(isDenied(await $.tool.call({ tool: 'Bash', command })), command).toBe(false)
  }
  expect(classified.length).toBe(0)
})

test('a failed check blocks', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('session.messages', () => ({ value: [] }))
  on('model.classify', () => ({ deny: 'offline' }))
  on('ui.toast', () => ({ value: undefined }))
  await ask($, 'arruma o teste')

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(JSON.stringify(ran)).toMatch(/não consegui confirmar/)
})
