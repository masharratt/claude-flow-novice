# Nitpicky lens contract (read fully before walking the app)

## Mission

This app is being prepared for **launch and human testing**. Everything obvious was
already built; your job is everything that got normalized during the build process and
stopped being seen. The small errors are the product of this review: the double space,
the wrong verb, the button that is 4px off, the empty state that dead-ends, the label
that says one thing on this page and another on the next. A human tester would find
these in the first ten minutes and judge the app by them. Find them first.

## Thoroughness rules (every lens)

0. **Own browser, always.** Launch your OWN isolated browser context (your own
   Playwright instance or a fresh incognito context). NEVER drive a shared MCP
   browser tab: parallel lens agents collide there — one agent screenshots another
   agent's page and phantom bugs appear (a "silent re-login" that was really a
   sibling agent navigating). Byte-identical screenshots across agents are treated
   as contaminated evidence by the merge and must be re-shot.
1. **Walk every reachable page. Never sample.** If a nav item, tab, footer link,
   settings row, or route exists, it gets visited. An unvisited page is an unreviewed
   page — record it in your coverage block as blocked/skipped with the reason.

1. **Walk every reachable page. Never sample.** If a nav item, tab, footer link,
   settings row, or route exists, it gets visited. An unvisited page is an unreviewed
   page.
2. **Exercise every state, not just the happy one:**
   - Forms: submit empty, submit invalid, submit valid, submit twice fast, abandon
     halfway and come back.
   - Lists: empty, one item, many items, extremely long single item.
   - Every loading, error, success, and confirmation state you can trigger.
   - Back button and refresh mid-flow: is state lost silently?
   - Narrow viewport (375px wide): does anything clip, overlap, or scroll sideways?
   - Keyboard: tab through a full flow — can you reach and operate everything?
3. **Hunt the small stuff explicitly.** For every page check, at minimum:
   typos; double spaces; missing/wrong punctuation; inconsistent capitalization
   (sentence case vs Title Case); inconsistent verbs for the same action (Delete vs
   Remove vs Trash); truncated or clipped text; broken images and icons; missing
   favicon; generic or duplicated page `<title>`; console errors; failed asset
   requests (404s in the network log); date/time/number format changes between pages;
   pluralization bugs ("1 items"); leftover placeholder, lorem ipsum, or debug text;
   missing hover/focus/disabled states; spinners that never resolve; actions that fail
   silently with no feedback; dead links; tooltips that describe the wrong thing.
4. **Screenshot proof for every finding.** A finding without a screenshot does not
   ship. When the finding is a comparison (this page vs that page), capture both.
5. **Report volume is expected.** A real app at launch readiness yields dozens of
   findings across all lenses. Reporting many low-severity nits is the job; do not
   self-censor small items, and do not pad with made-up ones either.
6. **Severity scale:**
   - `high` — would embarrass the team at launch or confuse a first-time user
     (broken flow, data loss, wrong/missing feedback on a primary action, offensive
     copy bug).
   - `medium` — clearly noticeable friction, inconsistency, or polish gap.
   - `low` — nit: a detail only a careful reader or tester would catch. Report these
     anyway; that is the point of this review.
7. **Separate backend noise from app defects.** When a failure smells server-side
   (5xx bursts, 401 loops on a valid session, a whole surface stuck on spinner,
   expected data absent), still record it, but set `suspected_env_cause: true` on the
   finding. Do not spend findings budget re-reporting one backend outage twenty times;
   one env finding per affected surface plus a coverage `blocked` entry is enough.
8. **Live-target safety (applies whenever the app URL is not localhost):** this may be
   a production system with real users and real data. Read-only walk. NEVER: make
   purchases or payments; delete or modify real records; send emails, messages, or
   notifications; enable/disable security settings (2FA, password changes); invoke
   external services or bots; trigger AI generation that burns credits; export real
   customer data. Test only with data you created (clearly test-named), and only
   reversible actions. If a flow cannot be exercised safely, record it as a coverage
   `skipped` entry with the reason instead of forcing it.
9. **Stay in scope:** what a human would see and feel. No architecture opinions, no
   performance tuning, no security audit, no feature suggestions, no code-level
   refactors. Polish and correctness of the user-facing surface only.

## Lenses

Walk the whole app through **only your lens**. Other lenses have their own agents; do
not duplicate their work, but do record anything glaring you cannot un-see.

### consistency
Same concept, same word, everywhere. Same action, same verb, everywhere. Button
hierarchy (primary/secondary/danger) used the same way on every page. One spacing
scale, one corner-radius scale, one color for each meaning (danger red, success green).
Icons: same concept always the same icon. Empty states and error states styled with
one pattern. Dates, times, numbers, and currencies formatted identically everywhere.
Terminology: if page A says "workspace" and page B says "project" for the same thing,
that is a finding.

### friction
Every unnecessary click, keystroke, and wait. Missing sensible defaults. Forms that
forget input when validation fails. State lost on back/refresh/navigation. Dead ends:
pages that end with no next action. Destructive actions without confirm or undo.
Forced re-authentication mid-flow. No loading feedback on slow actions. Double-submit
hazards (no disable during request). Error messages that say "Something went wrong"
without saying what to do next. Required fields discovered only after submit.
Multi-step flows that could be one step.

### verbose-language
UI copy that uses twenty words where three work. "Please click here in order to..."
vs "Save". Marketing fluff inside product UI. Paragraphs where a label works.
Instructions that restate the obvious. Confirmation dialogs that lecture. Wordy empty
states. Inconsistent tone (formal here, casual there). Jargon the target user would
not know. Suggested rewrite belongs in the `expected` field: state the shorter copy.

### visual-polish
Misalignment by a few pixels (against siblings, grid, and edges). Inconsistent corner
radii. Cramped or excessive padding, especially in card/button internals. Elements
overlapping at common widths. Contrast that fails readability. Broken or missing hover
states. Clipped shadows and focus rings. Blurry or stretched images/icons. Ragged text
(awkward wrapping, single-word orphan lines in headings). Font weight/size drift for
the same role. Light-mode styling leaking into dark mode or vice versa.

### accessibility
Missing alt text on meaningful images (and alt on decorative ones that should be
empty). Inputs without labels (visual or programmatic). Icon-only buttons without
accessible names. Clickable `<div>`s/`<span>`s instead of buttons/links. Keyboard
traps and unreachable controls. Focus order that jumps around. Invisible focus
indicator. Contrast below 4.5:1 for body text. Missing `autocomplete` on
email/name/password fields. Form errors not announced to screen readers (no
aria-live / focus move / error summary). Heading hierarchy skips (h2 to h4). Modals
that do not trap focus or close on Escape.
