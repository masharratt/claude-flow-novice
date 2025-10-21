# Quick Setup: Violations Monitoring

## 1. Install Server Dependencies

```bash
cd web-portal
npm install --save express socket.io ioredis --legacy-peer-deps
```

## 2. Update package.json Scripts

Add these scripts to `web-portal/package.json`:

```json
{
  "scripts": {
    "server": "node server.js",
    "dev:all": "concurrently \"npm run server\" \"npm start\"",
    "monitor": "bash ../.claude/skills/redis-coordination/monitor-cfn-violations.sh"
  }
}
```

## 3. Start All Services

```bash
# Terminal 1: Redis (if not already running)
redis-server

# Terminal 2: WebSocket server
cd web-portal
npm run server

# Terminal 3: Monitoring script
npm run monitor

# Terminal 4: React frontend
npm start
```

## 4. Integrate ViolationsPanel in App.tsx

Add these changes to `web-portal/src/App.tsx`:

### Import (line 7):
```typescript
import ViolationsPanel from './components/ViolationsPanel';
```

### Update viewMode type (line 34):
```typescript
viewMode: 'dashboard' | 'messages' | 'agents' | 'transparency' | 'mcp' | 'playwright' | 'violations';
```

### Add violations tab button (in navigation):
```typescript
<button
  className={state.viewMode === 'violations' ? 'active' : ''}
  onClick={() => setState(prev => ({ ...prev, viewMode: 'violations' }))}
  aria-label="View CFN Loop violations"
>
  🚨 Violations
</button>
```

### Add view rendering (in view switch section):
```typescript
{state.viewMode === 'violations' && (
  <ViolationsPanel
    socket={socket}
    currentSwarmId={state.currentSwarmId}
  />
)}
```

## 5. Test It

1. Open web portal: http://localhost:3000
2. Click "🚨 Violations" tab
3. Run a CFN Loop task (will create violations if issues occur)
4. Or send test violation:

```bash
curl -X POST http://localhost:3001/api/violations \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -Iseconds)'",
    "task_id": "test-123",
    "violation_type": "test_violation",
    "severity": "critical",
    "description": "Test violation from curl",
    "recommendation": "This is just a test",
    "evidence": {"test": true}
  }'
```

Should see alert appear instantly in violations panel!

## Files Created

✅ `.claude/skills/redis-coordination/monitor-cfn-violations.sh` - Monitoring script
✅ `web-portal/server.js` - WebSocket server with violations API
✅ `web-portal/src/components/ViolationsPanel.tsx` - React component
✅ `web-portal/src/components/ViolationsPanel.css` - Component styles

## What It Monitors

1. **Orchestrator Never Started** - Swarm created but orchestrator didn't spawn
2. **Gate Bypass** - Loop 2 started before Loop 3 completed
3. **Orchestrator Hang** - Agents completed but orchestrator still waiting
4. **Coordinator Timeout** - Coordinator cancelled after 5-10 min (bash timeout pattern)
5. **Product Owner Skipped** - Loop 2 complete but PO not consulted

All violations show:
- Severity level (critical/warning/info)
- Real-time timestamps
- Detailed evidence (JSON)
- Actionable recommendations
- Acknowledgment tracking

## Troubleshooting

**WebSocket connection fails:**
- Check server is running: `curl http://localhost:3001/health`
- Check port 3001 not in use: `lsof -i :3001`

**No violations appearing:**
- Check monitor script running: `ps aux | grep monitor-cfn`
- Check Redis: `redis-cli ping`
- Check Redis keys: `redis-cli KEYS "violation:*"`

**Monitor script won't start:**
- Make executable: `chmod +x .claude/skills/redis-coordination/monitor-cfn-violations.sh`
- Check dependencies: `which redis-cli` and `which jq`
