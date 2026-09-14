# Frontend traps a jsdom test cannot see

Three failure shapes where a unit test passes, the UI looks correct, and the browser does
something else. All three were measured in a real app, and in each one the passing test was
the reason the bug shipped. When a frontend guard matters, check it in a browser.

## Never disable a submit control from its own onClick

Preventing a double submit by latching state in the submit button's own `onClick` is broken
in Chrome and green in jsdom:

```tsx
// BROKEN: no POST ever leaves the browser
<button type="submit" disabled={pending || latched} onClick={() => setLatched(true)}>
```

React flushes the state update before the browser reaches the button's activation behavior.
The button is disabled by then, and the form never submits. Measured 2026-09-08 on a sign-in
page: the button read "Sending sign-in link", the screen-reader live region announced the
send, and the dev server log recorded no POST at all. It is indistinguishable from a
submission the page accepted, so the failure hides behind a correct-looking in-flight state.

Two working shapes:

1. **`useFormStatus().pending` alone** on the button, with no click handler. React sets it
   once the action starts, and a Server Action ending in `redirect` keeps it set until the
   page is replaced.
2. **Latch from the form's `onSubmit`**, not the button's `onClick`. That fires as part of a
   submission already underway, so the action still runs and the control dies from that
   moment on. Verified in a browser: three rapid presses, exactly one POST.

Because a behavior test cannot catch a regression here, pin it at the source instead
(`expect(SOURCE).not.toMatch(/onClick=\{/)` over the component file). Any single-press guard
on a form control needs a real browser check, not a jsdom pass.

## A same-props re-render does not test a StrictMode identity guard

StrictMode double-invoke is usually live in vitest too, because `NODE_ENV=test` resolves
React's development build (measured at 2 render-body calls per commit). The standard guard
for a render-body diff is an identity ref that skips when the incoming array is the same
object.

The obvious test for that guard, "render with the same props object twice, assert one
dispatch", **passes with the guard deleted** whenever the count is accumulated (`+=`) rather
than assigned. An unguarded island still announces the right number. The test looks like
coverage and is not: the failure the guard prevents is a count overwrite (run 1 parks 2 and
advances the ref, run 2 compares B against B and parks 0), so only assignment semantics
expose it. Accumulation hides exactly the bug the test was written for.

Instead, spy on the diff function itself with `vi.mock` plus `importOriginal` delegating to
the real implementation, and assert it is consulted once, not twice. Then verify the test
discriminates by temporarily deleting the guard and watching it go red. Note that `vi.mock`
paths resolve relative to the test file, and a wrong path registers silently, so the spy
simply never fires and the test passes for the wrong reason.

## Some real widgets need a real mouse, not locator.click()

Playwright's `locator.click()` and `elementHandle.click()` can silently no-op on a
third-party widget rendered inside a host app's own pane: the call resolves, no error is
raised, and nothing happens. Observed on a Slack Block Kit button in the thread pane.

Fall back to driving the pointer at the element's box:

```js
const box = await locator.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.up()
```

A click that reports success and produces no state change is this, not a product bug. Assert
on the resulting state change rather than on the click resolving.
