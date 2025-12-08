┌─────────────────┐
│  cargo check    │ → Parse Rust errors
└────────┬────────┘
         ▼
┌─────────────────┐
│ Cerebras LLM    │ → Generate fix
└────────┬────────┘
         ▼
┌─────────────────────────────────────────┐
│          LAYER 1: Structural Gates      │
│  A: Line Count Delta     G: Import Path │
│  B: Function Signature  H: Pattern Dup │
│  C: Import Duplicates   I: Impl Loc    │
│  D: Brace Balance       J: Type Cast   │
│  E: Semantic Diff       K: Match Arm   │
│  F: Orphaned Code       L: Regression  │
└────────┬────────────────────────────────┘
         ▼
┌─────────────────┐
│  LAYER 2: Clippy│
└────────┬────────┘
         ▼
┌─────────────────┐
│ LAYER 3: Review │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Write to file  │
└─────────────────┘