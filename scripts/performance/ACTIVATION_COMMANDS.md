# SQLite Enhanced Backend Activation Commands

## Quick Reference

### 1. Pre-Activation Testing (Recommended)
```bash
# Test Enhanced Backend in isolation (safe, no changes to production)
./scripts/performance/test-enhanced-backend.sh

# Review test results
cat .test-enhanced-*/enhanced_backend_test_report.md
```

### 2. Dry Run Activation (No actual changes)
```bash
# Run complete activation process without making changes
./scripts/performance/sqlite-enhanced-activation.sh --dry-run

# Review what would happen
cat .backups/sqlite-*/activation_report.md
```

### 3. Full Activation (Live system)
```bash
# Activate Enhanced Backend with full safety measures
./scripts/performance/sqlite-enhanced-activation.sh

# Monitor activation progress
tail -f .backups/sqlite-*/activation.log
```

### 4. Emergency Rollback (If needed)
```bash
# Automatic rollback script (generated during activation)
bash .backups/sqlite-*/rollback.sh

# Manual rollback (if automatic fails)
cp .swarm/memory.db.old .swarm/memory.db
```

## Detailed Activation Workflow

### Phase 1: Preparation and Validation
```bash
# 1. Check system prerequisites
free -h && nproc && df -h .

# 2. Verify current database integrity
sqlite3 .swarm/memory.db "PRAGMA integrity_check;"

# 3. Test Enhanced Backend safely
./scripts/performance/test-enhanced-backend.sh

# 4. Review test results before proceeding
ls -la .test-enhanced-*/
```

### Phase 2: Configuration and Dry Run
```bash
# 1. Review optimal configuration for your hardware
cat config/performance/sqlite-enhanced-config.json

# 2. Run dry run to validate activation plan
./scripts/performance/sqlite-enhanced-activation.sh --dry-run

# 3. Review what will be changed
cat .backups/sqlite-*/enhanced_config.json
```

### Phase 3: Production Activation
```bash
# 1. Activate Enhanced Backend (creates automatic backups)
./scripts/performance/sqlite-enhanced-activation.sh

# 2. Monitor system resources during activation
watch -n 1 'free -h; echo "---"; ps aux | grep sqlite'

# 3. Verify activation success
sqlite3 .swarm/memory.db "PRAGMA cache_size; PRAGMA mmap_size; PRAGMA journal_mode;"
```

### Phase 4: Post-Activation Validation
```bash
# 1. Check database integrity
sqlite3 .swarm/memory.db "PRAGMA integrity_check;"

# 2. Test basic operations
npx claude-flow@alpha hooks session-restore --session-id test

# 3. Monitor performance
sqlite3 .swarm/memory.db "SELECT COUNT(*) FROM memory_entries;" time

# 4. Check memory usage
free -h && ps aux | grep claude-flow
```

## Performance Optimization Commands

### Immediate Optimizations (Applied during activation)
```sql
-- Cache: 2GB for aggressive performance
PRAGMA cache_size = -2048000;

-- Memory mapping: 8GB for 96GB RAM system
PRAGMA mmap_size = 8589934592;

-- In-memory temporary storage
PRAGMA temp_store = memory;

-- Write-Ahead Logging for concurrency
PRAGMA journal_mode = WAL;

-- Balanced durability vs performance
PRAGMA synchronous = NORMAL;

-- Checkpoint every 1000 pages
PRAGMA wal_autocheckpoint = 1000;

-- Auto-optimize statistics
PRAGMA optimize;
```

### Advanced Optimizations (Manual application)
```sql
-- Maximum performance mode (use with caution)
PRAGMA cache_size = -4096000;    -- 4GB cache
PRAGMA mmap_size = 17179869184;  -- 16GB memory mapping
PRAGMA busy_timeout = 60000;     -- 60 second timeout
PRAGMA threads = 8;              -- Multi-threading

-- Custom indexes for Enhanced Backend
CREATE INDEX IF NOT EXISTS idx_memory_large_values
    ON memory_entries(namespace, size) WHERE size > 10000;

CREATE INDEX IF NOT EXISTS idx_memory_recent_accessed
    ON memory_entries(accessed_at) WHERE accessed_at > datetime('now', '-1 day');

CREATE INDEX IF NOT EXISTS idx_memory_high_access
    ON memory_entries(access_count) WHERE access_count > 10;
```

## Monitoring and Maintenance Commands

### Real-time Performance Monitoring
```bash
# Database size and growth
watch -n 5 'du -h .swarm/memory.db*'

# Query performance monitoring
sqlite3 .swarm/memory.db ".timer on" "SELECT COUNT(*) FROM memory_entries;"

# Memory usage tracking
watch -n 2 'free -h | grep Mem'

# WAL file size monitoring
watch -n 10 'ls -lh .swarm/memory.db*'
```

### Health Checks
```bash
# Database integrity
sqlite3 .swarm/memory.db "PRAGMA integrity_check;"

# WAL checkpoint status
sqlite3 .swarm/memory.db "PRAGMA wal_checkpoint;"

# Performance statistics
sqlite3 .swarm/memory.db "PRAGMA optimize;" "ANALYZE;"

# Connection count (if Enhanced Backend active)
ps aux | grep -c sqlite
```

### Maintenance Operations
```bash
# Manual WAL checkpoint
sqlite3 .swarm/memory.db "PRAGMA wal_checkpoint(FULL);"

# Vacuum database (shrink file size)
sqlite3 .swarm/memory.db "VACUUM;"

# Update statistics
sqlite3 .swarm/memory.db "ANALYZE;"

# Optimize indices
sqlite3 .swarm/memory.db "PRAGMA optimize;"
```

## Troubleshooting Commands

### If Activation Fails
```bash
# Check activation log
tail -100 .backups/sqlite-*/activation.log

# Verify rollback script exists
ls -la .backups/sqlite-*/rollback.sh

# Run automatic rollback
bash .backups/sqlite-*/rollback.sh
```

### If Performance Issues Occur
```bash
# Check current settings
sqlite3 .swarm/memory.db "
PRAGMA cache_size;
PRAGMA mmap_size;
PRAGMA journal_mode;
PRAGMA synchronous;
PRAGMA temp_store;
"

# Reset to conservative settings
sqlite3 .swarm/memory.db "
PRAGMA cache_size = -1000000;  -- 1GB cache
PRAGMA mmap_size = 4294967296; -- 4GB mapping
PRAGMA synchronous = NORMAL;
"

# Check for long-running transactions
sqlite3 .swarm/memory.db "PRAGMA wal_checkpoint;"
```

### If Memory Issues Occur
```bash
# Check system memory usage
free -h && ps aux --sort=-%mem | head -10

# Reduce SQLite memory usage
sqlite3 .swarm/memory.db "
PRAGMA cache_size = -512000;   -- 512MB cache
PRAGMA mmap_size = 2147483648; -- 2GB mapping
"

# Force WAL checkpoint to free memory
sqlite3 .swarm/memory.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

## Safety Measures

### Before Activation
- ✅ Database backup created automatically
- ✅ Rollback script generated
- ✅ System requirements verified
- ✅ Dry run validation completed

### During Activation
- ✅ Transaction safety with rollback
- ✅ Integrity checks at each step
- ✅ Resource monitoring
- ✅ Progress logging

### After Activation
- ✅ Automated verification tests
- ✅ Performance benchmarking
- ✅ Health monitoring setup
- ✅ Documentation generated

## Configuration Files

### Main Configuration
- `config/performance/sqlite-enhanced-config.json` - Complete configuration
- `.backups/sqlite-*/enhanced_config.json` - Applied settings
- `.backups/sqlite-*/activation_report.md` - Activation summary

### Test Results
- `.test-enhanced-*/enhanced_backend_test_report.md` - Test summary
- `.test-enhanced-*/basic_test.json` - Performance baselines
- `.test-enhanced-*/load_test.json` - Load testing results

### Monitoring Data
- `.claude-flow/metrics/performance.json` - Performance metrics
- `.backups/sqlite-*/baseline_metrics.json` - Pre-activation state
- `.backups/sqlite-*/enhanced_test_results.json` - Post-activation state

## Emergency Contacts and Resources

### Rollback Procedures
1. **Automatic**: Run generated rollback script
2. **Manual**: Copy .old database file back
3. **Emergency**: Restore from .backups directory

### Support Files
- Activation script: `scripts/performance/sqlite-enhanced-activation.sh`
- Test script: `scripts/performance/test-enhanced-backend.sh`
- Configuration: `config/performance/sqlite-enhanced-config.json`
- Analysis: `docs/performance/sqlite-performance-analysis.md`

---

**Note**: Always run test script first, then dry run, before production activation.