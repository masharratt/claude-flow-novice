import type { EngineInterface, Register } from 'claude-code'

// Agent mailbox listener. Runs `mailbox.sh listen` for the session's life; each line it prints is
// one new message (metadata only, never the body). Mail that should wake the session starts a turn
// of its own with $.prompt.submit once the session is idle: nothing is typed into the terminal, so
// a half-typed draft in the prompt box is never touched, and it works in tmux, a plain terminal
// tab, VS Code and on the server alike. The mail hook (cfn-mailbox-hook.sh) then shows the mail
// on that prompt. Other mail only shows a toast and waits for the next prompt.
// Needs mailbox.sh listen/unread (mailbox stage 6 listener work).

// Must equal NUDGE_TEXT in mailbox.sh: the hook keeps the outside-mail guard up for this exact
// prompt, since no person typed it. tests/test-cfn-mailbox-listener-mod.sh checks they match.
export const NUDGE_TEXT = 'You have mail: run /mail read'
const COOLDOWN_MS = 60_000
const SCRIPT = '$HOME/.claude/skills/cfn-mailbox/mailbox.sh'

export type MailLine =
  | { event: 'ready'; session: string }
  | { event: 'mail'; from: string; kind: string; wake: boolean; addr_kind?: string }
  | { event: 'down'; reason?: string }
  | { event: 'up' }

// Module state: restarts with the module (a reload re-runs session.start, which restarts the child).
const st = { isBusy: false, isPending: false, lastWake: 0, session: '' }

export function parseLines(buffer: string): { lines: MailLine[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  const lines: MailLine[] = []
  for (const p of parts) {
    const s = p.trim()
    if (!s.startsWith('{')) continue
    try {
      const v = JSON.parse(s)
      if (v && typeof v.event === 'string') lines.push(v as MailLine)
    } catch {
      // a partial or foreign line: ignore it
    }
  }
  return { lines, rest }
}

function mailboxArgv(sub: string, sid: string, cwd: string): string[] {
  return ['sh', '-c', `exec bash "${SCRIPT}" ${sub} --sid "$1" --cwd "$2"`, 'sh', sid, cwd]
}

async function wake($: EngineInterface): Promise<void> {
  if (st.isBusy) {
    st.isPending = true
    return
  }
  const now = await $.clock.now()
  const wait = st.lastWake + COOLDOWN_MS - now
  if (wait > 0) {
    st.isPending = true
    $.clock.after(wait, () => void flush($))
    return
  }
  st.isPending = false
  st.lastWake = now
  // The hook may already have shown it (a tool call ran in between): wake only if mail waits.
  const sid = await $.session.id()
  const cwd = await $.session.cwd()
  const ran = await $.process.run(mailboxArgv('unread', sid, cwd), { timeoutMs: 15_000 })
  if (ran.exitCode === 0 && Number.parseInt(ran.stdout.trim(), 10) === 0) return
  void $.prompt.submit({ text: NUDGE_TEXT })
}

async function flush($: EngineInterface): Promise<void> {
  if (st.isPending && !st.isBusy) await wake($)
}

async function handleLine($: EngineInterface, line: MailLine): Promise<void> {
  if (line.event === 'ready') {
    st.session = line.session
    $.ui.status(undefined)
  } else if (line.event === 'down') {
    $.ui.status('mail: offline')
  } else if (line.event === 'up') {
    $.ui.status(undefined)
  } else if (line.wake) {
    await wake($)
  } else {
    $.ui.toast(`Mail from ${line.from} (${line.kind}); shown at your next prompt`)
  }
}

async function listen($: EngineInterface, sid: string, cwd: string): Promise<void> {
  const child = $.process.spawn({ argv: mailboxArgv('listen', sid, cwd) })
  let buffer = ''
  for await (const piece of child) {
    if (piece.stream !== 'stdout') continue
    const parsed = parseLines(buffer + piece.text)
    buffer = parsed.rest
    for (const line of parsed.lines) await handleLine($, line)
  }
  $.ui.status(st.session ? 'mail: listener stopped' : 'mail: listener did not start')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.isInteractive) return started
    const sid = await $.session.id()
    void listen($, sid, e.cwd)
    return started
  })

  // Bookkeeping only: a failure here must never block a prompt.
  on('prompt.submit', ($, e, next) => {
    st.isBusy = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      st.isBusy = false
      await flush($)
    }
    return done
  })
}
