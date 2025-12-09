task-intelligence/
├── SKILL.md                          # This file
├── cfn-task-intelligence.sh          # Main CLI interface
└── lib/
    ├── classifier/                   # Task classification
    │   ├── SKILL.md
    │   └── classify-task.sh
    ├── complexity/                   # Complexity estimation
    │   ├── SKILL.md
    │   └── estimate-complexity.sh
    ├── specialist/                   # Specialist recommendation
    │   ���── SKILL.md
    │   └── recommend-specialist.sh
    └── integration/                  # System integration layer
        ├── SKILL.md
        ├── pre-execution-hook.sh
        ├── post-feedback-hook.sh
        └── learning-loop.sh