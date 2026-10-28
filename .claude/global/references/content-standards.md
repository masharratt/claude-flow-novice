# Content Standards (em dashes)

Load when: writing user-facing copy, or a review or scan flags em dashes.

- **Em dashes:** Banned in user-facing copy only (website text, UI strings, public docs). Use periods, commas, colons, or parentheses there. (Agents default to em dashes; override what ships.) Allowed everywhere else: code comments, handoffs, subagent briefs, planning artifacts (PLAN_/SPEC_/VERIFY_/DECISIONS_/ARCH_, anything under `planning/`), reports, notes. Never spawn a lane, send a fix round or fail a review over em dashes in code comments or internal docs (user ruling 2026-10-14). Code that detects, strips or tests for em dashes spells the character literally in its regex or fixture; do not "fix" those or let a scan flag them.
