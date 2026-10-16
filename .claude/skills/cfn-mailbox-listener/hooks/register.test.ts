import { expect, mock, test } from 'claude-code/testing'
import type { Engine, On } from 'claude-code/testing'

import { NUDGE_TEXT, parseLines } from './register'

// The listener child: prints the given lines, then ends.
function fakeMailbox(on: On, lines: string[], unread = '1') {
  const submitted: string[] = []
  const argvs: string[][] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'sid-123' }))
  on('session.cwd', () => ({ value: '/tmp/proj' }))
  on('process.spawn', async function* (_$, e) {
    argvs.push([...e.argv])
    for (const l of lines) yield { stream: 'stdout' as const, text: l + '\n' }
    return { value: { code: 0, signal: null } }
  })
  on('process.run', (_$, e) => {
    argvs.push([...e.argv])
    return { value: { exitCode: 0, stdout: unread + '\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const toasts: string[] = []
  on('ui.toast', (_$, e) => (toasts.push(String(e.text)), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  return { submitted, argvs, toasts }
}

const mail = (o: Record<string, unknown>) => JSON.stringify({ event: 'mail', from: 'michael/s/peer', kind: 'ask', wake: true, ...o })
const start = ($: Engine, isInteractive = true) =>
  $.session.start({ cwd: '/tmp/proj', surface: 'terminal', isInteractive })
const settle = () => new Promise(r => setTimeout(r, 50))

test('parseLines keeps a partial line for the next piece', () => {
  const a = parseLines('{"event":"up"}\n{"event":"rea')
  expect(a.lines).toEqual([{ event: 'up' }])
  expect(a.rest).toBe('{"event":"rea')
  expect(parseLines(a.rest + 'dy","session":"x"}\n').lines).toEqual([{ event: 'ready', session: 'x' }])
  expect(parseLines('not json\n{bad\n').lines).toEqual([])
})

test('wake mail on an idle session submits the nudge prompt, typing nothing', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const box = fakeMailbox(on, ['{"event":"ready","session":"proj-abc123"}', mail({})])
  await start($)
  await settle()
  expect(box.submitted).toEqual([NUDGE_TEXT])
  expect(box.argvs[0].join(' ')).toContain('listen --sid')
})

test('fyi mail never starts a turn', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const box = fakeMailbox(on, [mail({ kind: 'fyi', wake: false })])
  await start($)
  await settle()
  expect(box.argvs.length).toBe(1) // the listener ran, so the empty result means something
  expect(box.toasts.join(' ')).toContain('Mail from michael/s/peer (fyi)')
  expect(box.submitted).toEqual([])
})

test('nothing unread (the hook already showed it): no turn', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const box = fakeMailbox(on, [mail({})], '0')
  await start($)
  await settle()
  expect(box.argvs.map(a => a.join(' ')).some(a => a.includes('unread --sid'))).toBe(true)
  expect(box.submitted).toEqual([])
})

test('a non-interactive run (claude -p) starts no listener', async ($, on) => {
  const box = fakeMailbox(on, [mail({})])
  await start($, false)
  await settle()
  expect(box.argvs).toEqual([])
  expect(box.submitted).toEqual([])
})

test('the nudge text matches the mailbox hook guard text', () => {
  expect(NUDGE_TEXT).toBe('You have mail: run /mail read')
})

test('mail during a busy turn waits for the turn to end, then wakes once', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const box = fakeMailbox(on, [mail({})])
  on('turn.complete', () => ({ text: '' }))
  await $.prompt.submit({ text: 'a typed prompt' }) // the person's own turn: busy
  await start($)
  await settle()
  expect(box.submitted).toEqual(['a typed prompt'])
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 5, isAborted: false, turnId: 't1' })
  await settle()
  expect(box.submitted).toEqual(['a typed prompt', NUDGE_TEXT])
})
