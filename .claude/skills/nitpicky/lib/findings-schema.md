# Nitpicky findings output schema

Write exactly one JSON file per agent:

    <run-dir>/findings/<lens>.json

## Shape

```json
{
  "lens": "consistency",
  "findings": [
    {
      "what": "Cart page button says 'Remove item', checkout says 'Delete item' for the same action",
      "expected": "One verb for the same action; suggest 'Remove item' on both pages",
      "url": "http://localhost:3000/cart",
      "severity": "medium",
      "area": "Cart",
      "steps": "Add item to cart, observe button; proceed to checkout, observe button",
      "screenshot": "screenshots/consistency-cart-vs-checkout-button.png"
    }
  ]
}
```

## Field rules

- `what` (required): the observable fact, concrete nouns, where it happens. Not an
  opinion ("bad UX") — a fact ("button disabled with no explanation after submit").
- `expected` (required): the correct behavior or the concrete fix direction. For
  copy findings, include the suggested shorter text.
- `url` (required): exact page URL of the screenshot.
- `severity` (required): `high` | `medium` | `low` per the lens contract.
- `screenshot` (required): path RELATIVE to the run dir, always
  `screenshots/<lens>-<short-kebab-slug>.png`. Copy the PNG into
  `<run-dir>/screenshots/` yourself before finishing. A finding whose file is missing
  is flagged `missing-screenshots` by the merge step and marked proof-broken in the
  review page.
- `area` (optional): short page/feature label shown as a chip ("Cart", "Settings > API").
- `steps` (optional): minimal repro when the defect is not obvious from the screenshot.
- `suspected_env_cause` (optional, boolean): set `true` when the failure pattern looks
  server-side rather than an app defect — bursts of 5xx, 401 loops on a valid session,
  whole surfaces stuck on spinner, data that should exist not loading. The portal gets
  a filter for it and the merge prints a run-health summary, so mark honestly instead
  of reporting backend noise as app defects.

## Coverage block (same file, top level, required)

Report which routes/pages you actually walked — honestly, including the ones you
could not:

```json
{
  "lens": "consistency",
  "coverage": [
    {"path": "/dashboard", "status": "covered"},
    {"path": "/search", "status": "blocked", "note": "permanent loading spinner; queries never resolve"},
    {"path": "/onboarding/step-3", "status": "skipped", "note": "requires completing steps 1-2 with real data"}
  ],
  "findings": []
}
```

- `path`: route or page path as the app addresses it.
- `status`: `covered` (walked through your lens) | `blocked` (tried; app or backend
  prevented it) | `skipped` (not attempted; say why in `note`).
- The merge aggregates all lenses per route and names expected routes
  (run.json `coverage.expected`) that no lens covered, so the coordinator can
  re-brief for exactly the holes. Prose mentions of "did not visit X" do not count —
  use the coverage block.

## Scope guards

- One defect per finding. Do not bundle three typos into one finding.
- Do not emit architecture, performance, security, or feature-request items.
- Do not include suggested code or file paths of the implementation; the triage
  checklist is written for an implementation team that will find the code.
- No finding without a screenshot.
