## 1. Main session (opus-5, 2026-08-18T22:30Z to 08-19T16:13Z, in flight)
| metric | value |
|---|---|
| turns | 1,553 |
| output_tokens | 1,466,811 |
| input_tokens | 3,090 |
| cache_creation_input_tokens | 5,417,408 |
| cache_read_input_tokens | 228,693,940 |
| by model | claude-opus-5: 1545 turns, <synthetic>: 8 turns |
| tool calls | Bash=1343, Agent=108, SendMessage=28, ToolSearch=15, AskUserQuestion=10, mcp__notion__notion_get_page_content=3, Skill=3, Artifact=3, ListAgents=3, mcp__notion__notion_search_pages=1, Write=1 |

## 2. Subagent tree totals (108 main spawns + 48 nested grandchildren paired; 3 nested forks orphaned, not counted)
| scope | turns | output | cache_create | cache_read |
|---|---|---|---|---|
| main session | 1,553 | 1,466,811 | 5,417,408 | 228,693,940 |
| subagents (all) | 11,355 | 8,594,206 | 71,585,207 | 1,341,929,112 |
| ratio main/sub | | 0.17 | 0.08 | 0.17 |

Subagent trees by actual model (dominant model in transcript):
| model | spawns | output | cache_create | cache_read |
|---|---|---|---|---|
| opus-5 | 90 | 7,280,023 | 60,419,620 | 1,147,191,140 |
| sonnet-5 | 18 | 1,314,183 | 11,165,587 | 194,737,972 |

## 3. By part (slug)
| part | spawns | repair/re-gate spawns | output | cache_create | cache_read | turns |
|---|---|---|---|---|---|---|
| MP0 | 32 | 19 | 2,504,001 | 18,138,154 | 407,518,249 | 3,347 |
| B0 | 19 | 6 | 1,772,955 | 14,629,319 | 307,970,934 | 2,618 |
| B1 | 17 | 3 | 1,440,971 | 14,486,561 | 229,512,139 | 1,962 |
| B2 | 13 | 3 | 919,324 | 7,819,732 | 125,057,087 | 1,074 |
| B3 | 11 | 2 | 992,013 | 8,617,101 | 132,705,284 | 1,173 |
| B4 | 5 | 0 | 309,282 | 2,508,487 | 38,736,027 | 311 |
| B5 | 11 | 1 | 655,660 | 5,385,853 | 100,429,392 | 870 |

## 4. By phase (all parts)
| phase | spawns | output | cache_create | cache_read |
|---|---|---|---|---|
| spec | 9 | 895,018 | 8,172,774 | 124,924,394 |
| other | 11 | 882,824 | 6,068,982 | 168,423,827 |
| pseudo | 8 | 882,796 | 4,821,263 | 82,192,240 |
| arch | 9 | 718,610 | 7,405,064 | 110,445,098 |
| ux | 11 | 585,534 | 4,801,767 | 87,814,006 |
| data | 7 | 535,915 | 4,310,037 | 54,000,272 |
| bar_a | 5 | 471,767 | 3,088,142 | 75,503,841 |
| decide | 7 | 454,486 | 3,555,325 | 47,239,076 |
| test_plan | 7 | 449,801 | 5,337,254 | 72,695,833 |
| bar_b | 4 | 400,449 | 4,041,265 | 78,103,884 |
| write_plan | 3 | 394,123 | 2,672,859 | 59,750,292 |
| design | 6 | 316,391 | 2,515,140 | 39,350,682 |
| ops | 5 | 314,147 | 2,783,889 | 44,254,315 |
| research | 6 | 307,410 | 3,336,271 | 76,342,509 |
| plan_review | 2 | 272,841 | 2,124,672 | 48,787,662 |
| plan_review+bar_b | 1 | 248,048 | 2,337,603 | 67,980,349 |
| backprop | 4 | 194,197 | 1,447,470 | 51,531,564 |
| write_plan+bar_a | 2 | 162,094 | 1,671,239 | 31,497,750 |
| megaplan_synth | 1 | 107,755 | 1,094,191 | 21,091,518 |

## 5. AskUserQuestion calls: 10; SendMessage (subagent continuations): 28
Repair/re-gate/back-prop spawns: 34 of 108 (2,521,607 output, 18,989,217 cache_create, 502,719,325 cache_read = 29% of subagent output)
Same (part,phase) spawned >1x: B0/otherx5, B1/bar_bx2, B2/archx2, B2/uxx4, B5/archx2, MP0/archx2, MP0/backpropx2, MP0/bar_ax3, MP0/bar_bx2, MP0/opsx2, MP0/otherx4, MP0/pseudox2, MP0/specx3, MP0/test_planx3, MP0/uxx3, MP0/write_planx2

## 6. Top 10 spawns by tree tokens (output+cache_create+cache_read)
| # | part | phase | desc | actual model | output | cache_create | cache_read | turns | nested |
|---|---|---|---|---|---|---|---|---|---|
| 49 | B0 | plan_review+bar_b | B0 L9 plan review and Bar B | opus-5 | 248,048 | 2,337,603 | 67,980,349 | 551 | 3 |
| 100 | B0 | other | B0 defect repair and re-gate | opus-5 | 141,979 | 984,141 | 40,390,767 | 339 | 2 |
| 77 | B1 | bar_b | B1 Bar B repair round | opus-5 | 226,766 | 2,407,808 | 36,732,999 | 367 | 8 |
| 12 | MP0 | plan_review | Run cfn-plan-review on MP0 plan | opus-5 | 221,583 | 1,661,625 | 37,188,438 | 292 | 4 |
| 20 | MP0 | write_plan | W4 structural PLAN repair | opus-5 | 147,538 | 1,032,880 | 33,278,481 | 270 | 0 |
| 61 | B3 | spec | B3 L2 spec phase | opus-5 | 231,697 | 2,282,568 | 30,078,800 | 256 | 4 |
| 52 | B0 | other | B0 signal id collision repair | sonnet-5 | 188,223 | 940,870 | 27,864,832 | 233 | 0 |
| 93 | MP0 | backprop | Apply MP0 back-prop queue | opus-5 | 80,309 | 581,551 | 28,091,145 | 223 | 0 |
| 19 | MP0 | test_plan | W3 repair TEST plan | sonnet-5 | 96,399 | 1,142,173 | 26,980,382 | 193 | 0 |
| 56 | B3 | research | B3 L1 research phase | opus-5 | 111,835 | 1,432,181 | 26,254,921 | 245 | 4 |

## 7. Top 10 by output tokens
| # | part | desc | output |
|---|---|---|---|
| 49 | B0 | B0 L9 plan review and Bar B | 248,048 |
| 61 | B3 | B3 L2 spec phase | 231,697 |
| 77 | B1 | B1 Bar B repair round | 226,766 |
| 12 | MP0 | Run cfn-plan-review on MP0 plan | 221,583 |
| 52 | B0 | B0 signal id collision repair | 188,223 |
| 64 | B5 | B5 L3 pseudo phase | 167,293 |
| 59 | B2 | B2 L2 spec phase | 165,505 |
| 25 | MP0 | W5 VERIFY manifest sync | 163,068 |
| 47 | B1 | B1 L5 arch phase | 150,097 |
| 20 | MP0 | W4 structural PLAN repair | 147,538 |

## 8. Artifact sizes (bytes / ~tokens=bytes/4)
| part | RESEARCH | SPEC | DECISIONS | PSEUDO | DATA | ARCH | UX | DESIGN | OPS | TEST | PLAN | REVIEW | VERIFY | MEGAPLAN | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MP0 | - | 130k | 60k | 94k | 328k | 227k | 303k | 73k | 142k | 150k | 356k | 114k | 474k | 17k | 2676k (~669k tok) |
| B0 | - | 121k | 89k | 125k | 80k | 178k | 69k | 38k | 136k | 270k | 277k | 116k | 545k | 49k | 2131k (~532k tok) |
| B1 | 24k | 136k | 60k | 120k | 150k | 140k | 144k | 72k | 53k | 156k | 221k | 39k | 318k | - | 1639k (~409k tok) |
| B2 | 45k | 124k | 67k | 171k | 151k | 134k | 153k | 67k | - | 204k | - | - | - | - | 1136k (~284k tok) |
| B3 | 75k | 115k | 55k | 219k | 131k | 104k | 122k | 122k | 119k | - | - | - | - | - | 1078k (~269k tok) |
| B4 | 54k | 109k | 72k | 147k | 35k | - | - | - | - | - | - | - | - | - | 419k (~104k tok) |
| B5 | 54k | 85k | 58k | 178k | 110k | 128k | 92k | 42k | - | 71k | - | - | - | - | 836k (~209k tok) |
| PROG | - | - | 19k | - | - | - | - | - | - | - | - | - | - | 11k | 86k (~21k tok) |

All planning .md in the 8 dirs: 10,003,852 bytes (~2,500,963 tokens). Also VERIFY sidecars: MP0 .blessed.json 244k.