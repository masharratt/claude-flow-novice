# CFN Platform Team Onboarding

**Duration:** 1 day (8 hours)
**Target Audience:** New development teams using CFN
**Prerequisites:** Basic git, Docker, CI/CD familiarity
**Last Updated:** 2025-11-24

---

## Morning Session (9:00 AM - 12:00 PM)

### 1. CFN Platform Introduction (60 minutes)

**What is CFN?**
Claude Flow Novice is an AI agent orchestration platform for automated development workflows.

**Key Benefits:**
- Automated code generation and testing
- Self-validating development loops
- Cost-optimized AI model usage
- Built-in quality gates

**Architecture Overview:**
```
Your Task → CFN Loop → Agents → Code/Tests → Validation → Delivery
```

**CFN Loop Phases:**
1. **Loop 3:** Agents implement your requirements
2. **Loop 2:** Validators review the work
3. **Product Owner:** Makes final decision (PROCEED/ITERATE/ABORT)

---

### 2. Getting Started (90 minutes)

**2.1 - Access Setup (30 min)**

**Required Access:**
```bash
# 1. Request CFN platform access
# Contact: platform-team@company.com

# 2. Verify access
docker ps | grep cfn
redis-cli PING
# Expected: PONG

# 3. Join Slack channels
# - #cfn-users (general help)
# - #cfn-alerts (system status)
# - #your-team (team-specific)

# 4. Review documentation
# Location: /mnt/wsl/.../docs/
```

**2.2 - First CFN Loop (30 min)**

**Exercise: Simple Task Execution**

```bash
# 1. Execute simple task via CLI mode
/cfn-loop-cli "Create hello-world.py with greeting function" --mode=standard

# 2. Monitor progress
watch -n 5 'docker ps | grep cfn'

# 3. Review results
cat hello-world.py
python hello-world.py

# 4. Check task record
docker exec cfn-postgres psql -U cfn_user -d cfn -c \
  "SELECT task_id, status, current_phase FROM tasks ORDER BY created_at DESC LIMIT 1;"
```

**Expected Output:**
- hello-world.py file created
- Function tested and validated
- Task status: completed
- Total time: ~5 minutes

**2.3 - Understanding Agent Types (30 min)**

**Available Agents:**

| Agent Type | Purpose | Example Task |
|------------|---------|--------------|
| backend-developer | Server-side code | REST API endpoints |
| frontend-developer | UI/UX code | React components |
| tester | Test creation | Unit/integration tests |
| validator | Code review | Quality assessment |
| product-owner | Decision making | Accept/reject work |
| devops-specialist | Infrastructure | Docker, CI/CD config |
| security-specialist | Security review | Vulnerability scanning |

**Agent Selection:**
CFN automatically selects agents based on task description.

**Manual Selection (Advanced):**
```bash
/cfn-loop-cli "Task description" \
  --agents=backend-developer,tester,devops-specialist
```

---

### 3. Monitoring Your Team's Usage (60 minutes)

**3.1 - Grafana Dashboards (30 min)**

**Your Team Dashboard:**
http://localhost:3000/d/team-activity

**Key Metrics to Watch:**
- **Agent Count:** Currently running agents for your team
- **Task Completion Rate:** Successful vs failed tasks
- **Cost Per Hour:** Your team's spend rate
- **Average Task Duration:** Time from start to completion

**Setting Up Alerts:**
```bash
# Get notified when your team exceeds budget
# Contact SRE team to configure team-specific alerts
# Default threshold: $10/hour
```

**3.2 - Cost Monitoring (30 min)**

**Cost Dashboard:**
http://localhost:3000/d/cost-allocation

**Understanding Costs:**
- **Z.ai (glm-4.6):** $0.50/1M tokens (cost-optimized)
- **Kimi:** $2/1M tokens (mid-range)
- **Anthropic:** $15/1M tokens (premium)

**Cost Optimization Tips:**
1. Use Z.ai by default (97% cheaper than Anthropic)
2. Keep tasks focused (smaller context = lower cost)
3. Avoid unnecessary iterations (fix root causes)
4. Monitor cost dashboard daily

**Example Cost Comparison:**
```
Task: "Implement user authentication"

Z.ai:     $0.05 (5 minutes, 100K tokens)
Anthropic: $1.50 (5 minutes, 100K tokens)

Savings: $1.45 per task (29x cheaper)
```

---

## Afternoon Session (1:00 PM - 5:00 PM)

### 4. Best Practices (90 minutes)

**4.1 - Writing Effective Task Descriptions (30 min)**

**Good Task Description:**
```bash
/cfn-loop-cli "
Implement JWT authentication for API:
- Create /auth/login endpoint
- Validate credentials against PostgreSQL users table
- Return JWT token with 1-hour expiration
- Add middleware to verify token on protected routes
- Write unit tests for all endpoints
" --mode=standard
```

**Why This Works:**
- Clear requirements
- Specific implementation details
- Testable outcomes
- Bounded scope

**Bad Task Description:**
```bash
/cfn-loop-cli "Make auth better"
```

**Why This Fails:**
- Vague requirements
- No success criteria
- Unbounded scope
- Not testable

**4.2 - Quality Modes (30 min)**

**Three Quality Modes:**

| Mode | Loop 3 Gate | Loop 2 Consensus | Iterations | Use Case |
|------|-------------|------------------|------------|----------|
| MVP | ≥70% pass | ≥80% score | 5 | Quick prototypes |
| Standard | ≥95% pass | ≥90% score | 10 | Production features |
| Enterprise | ≥98% pass | ≥95% score | 15 | Security/compliance |

**Choosing the Right Mode:**
```bash
# Fast prototyping
/cfn-loop-cli "Create prototype dashboard" --mode=mvp

# Production work (default)
/cfn-loop-cli "Implement payment processing" --mode=standard

# Critical systems
/cfn-loop-cli "Implement encryption module" --mode=enterprise
```

**4.3 - Common Pitfalls (30 min)**

**Pitfall 1: Tasks Too Large**
- Problem: Task takes >1 hour, costs escalate
- Solution: Break into smaller sub-tasks

**Pitfall 2: Unclear Success Criteria**
- Problem: Agents iterate endlessly
- Solution: Define specific, testable outcomes

**Pitfall 3: Ignoring Cost Alerts**
- Problem: Unexpected budget overruns
- Solution: Monitor cost dashboard, set alerts

**Pitfall 4: Not Reviewing Results**
- Problem: Low-quality code merged
- Solution: Always review agent output before merging

---

### 5. Integration with Your Workflow (60 minutes)

**5.1 - Git Integration (30 min)**

**Workflow:**
```bash
# 1. Create feature branch
git checkout -b feature/new-auth

# 2. Run CFN Loop
/cfn-loop-cli "Implement JWT auth" --mode=standard

# 3. Review agent output
git diff
git log

# 4. Run tests
npm test

# 5. Create PR
git push origin feature/new-auth
# Create PR via GitHub UI

# 6. CI/CD pipeline runs
# - Linting
# - Tests
# - Security scan

# 7. Merge after approval
```

**5.2 - CI/CD Integration (30 min)**

**Adding CFN to Your Pipeline:**

```yaml
# .github/workflows/cfn-integration.yml
name: CFN Validation

on: [push, pull_request]

jobs:
  cfn-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Run CFN validation
        run: |
          /cfn-loop-cli "Review code for security issues" \
            --mode=enterprise \
            --agents=security-specialist

      - name: Check results
        run: |
          # Parse CFN output
          # Fail build if security issues found
```

---

### 6. Getting Help (60 minutes)

**6.1 - Support Channels (20 min)**

**Slack Channels:**
- **#cfn-users:** General questions, usage help
- **#cfn-alerts:** System status, outages
- **#cfn-oncall:** Urgent issues (tag @oncall)

**Documentation:**
- Full docs: `/mnt/wsl/.../docs/`
- Runbooks: `/mnt/wsl/.../docs/runbooks/`
- Training: `/mnt/wsl/.../docs/training/`

**Office Hours:**
- Every Tuesday 2-3 PM
- Meet platform team
- Ask questions, share feedback

**6.2 - Troubleshooting Common Issues (40 min)**

**Issue 1: Task Stuck**
```bash
# Symptom: Task not progressing for >30 minutes

# Check status
docker exec cfn-postgres psql -U cfn_user -d cfn -c \
  "SELECT task_id, status, current_phase FROM tasks WHERE status != 'completed' ORDER BY created_at DESC LIMIT 5;"

# If stuck, contact on-call
# Slack: @oncall in #cfn-oncall
```

**Issue 2: High Cost Alert**
```bash
# Symptom: Team cost alert fired (>$10/hour)

# Check cost dashboard
# http://localhost:3000/d/cost-allocation

# Identify expensive tasks
# Kill long-running agents if needed
# Contact on-call for assistance
```

**Issue 3: Low Quality Output**
```bash
# Symptom: Agent-generated code doesn't meet standards

# Solutions:
# 1. Improve task description specificity
# 2. Use higher quality mode (--mode=enterprise)
# 3. Manually review and refine
# 4. Provide feedback to platform team
```

---

## Onboarding Checklist

**Day 1 Completion:**
- [ ] Access verified (Docker, Redis, PostgreSQL, Slack)
- [ ] Executed first CFN Loop successfully
- [ ] Reviewed team dashboard in Grafana
- [ ] Understood cost monitoring
- [ ] Practiced writing task descriptions
- [ ] Integrated CFN into development workflow
- [ ] Knows how to get help

**Next Steps:**
- [ ] Execute 3 real tasks for your team (week 1)
- [ ] Attend Tuesday office hours (week 1)
- [ ] Review cost dashboard daily (ongoing)
- [ ] Provide feedback on platform (week 2)
- [ ] Mentor new team members (month 2)

---

## Quick Reference Card

**Common Commands:**
```bash
# Execute task (CLI mode)
/cfn-loop-cli "Description" --mode=standard

# Check task status
docker exec cfn-postgres psql -U cfn_user -d cfn -c \
  "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1;"

# Monitor agents
docker ps | grep cfn

# Check cost
# Open: http://localhost:3000/d/cost-allocation
```

**Key Dashboards:**
- Team Activity: http://localhost:3000/d/team-activity
- Cost Allocation: http://localhost:3000/d/cost-allocation
- Agent Performance: http://localhost:3000/d/agent-performance

**Get Help:**
- Slack: #cfn-users
- Urgent: @oncall in #cfn-oncall
- Office Hours: Tuesday 2-3 PM
- Docs: `/mnt/wsl/.../docs/`

---

**Welcome to CFN!**

Questions? Ask in #cfn-users or attend office hours.

**Feedback:** https://forms.company.com/cfn-onboarding-feedback
