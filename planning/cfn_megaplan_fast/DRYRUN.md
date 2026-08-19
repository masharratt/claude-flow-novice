# DRYRUN: cfn-megaplan-fast projection (2026-08-19)

Run: `bash planning/cfn_megaplan_fast/dryrun.sh` (read-only; exact numbers in its stdout).

## 1. Baseline artifacts vs fast caps
Every artifact of finished parts B0 and B1 of curve2026 is over the fast cap: 24/24 OVER. Worst: VERIFY_b0 545,810B vs 40,960 (13.3x), PLAN_b0 277,014 vs 40,960 (6.8x), TEST_b0 270,109 vs 24,576 (11x), SPEC_b1 136,386 vs 24,576 (5.5x). Those files were each re-read by every downstream phase; that is the 1.34B cache-read.

## 2. extract-sections
Fixture with parts B0/B1/B2: `extract(B0)` = 744B of 980B (shared + B0 sections only). Test suite 32/32.

## 3. Projection (output tokens, same 7-part program)
| bucket | tokens |
|---|---|
| program level (spec+decide fold, data, arch+pseudo fold, ux+design fold, plan_review) | 205,560 |
| per part (test_plan, write_plan, inline bars, 0.5 x one repair spawn) x 7 | 630,229 |
| main chat (130 turns x 944 tok/turn baseline x 2 inflation) | 245,440 |
| **total** | **1,081,230** |
| baseline measured | 10,056,000 |

Factors (explicit in dryrun.sh): CAP 0.50, NONEST 0.80, FOLD 0.30, REPAIR_P 0.50, MODEL 1.0. Weakest assumption: main-chat turn count (130) and 2x per-turn inflation for inline patches. Real measurement lands at first use (PLAN AC-7 deferred note / feature-status limitation).

## 4. Observation for the first real run
curve2026 parts are distinct domains (ci-monitoring, identity, schedule, matches-chat, bookings, kiosk). If one program SPEC goes vague, add a `--part-specs` option (short per-part SPEC, shared DATA/ARCH/UX) rather than re-running per-part arch. Not built yet; cfn: single program SPEC, trigger = a part's test_plan cannot map FRs without guessing.
