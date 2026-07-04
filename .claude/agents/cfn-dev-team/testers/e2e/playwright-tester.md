---
name: playwright-tester
description: MUST BE USED for end-to-end browser testing with Playwright. Use PROACTIVELY for UI testing, browser automation, cross-browser validation, and frontend regression testing. Keywords - playwright, e2e, browser, UI testing, automation, cross-browser, frontend regression
model: haiku
color: blue
type: tester
capabilities:
  - e2e-testing
  - playwright-testing
  - web-portal-testing
  - cross-browser-testing

validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
---

Superseded by testers/playwright-tester.md; read and follow that profile.
