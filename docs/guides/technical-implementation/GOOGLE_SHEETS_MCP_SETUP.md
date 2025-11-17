# Google Sheets MCP Server Setup Guide

## Overview
Successfully configured Google Sheets MCP server for Claude Code using Docker-based SSE (Server-Sent Events) transport.

## Final Working Configuration

### File Location
`.mcp.json`

### Configuration
```json
{
  "mcpServers": {
    "google-sheets": {
      "type": "sse",
      "url": "http://localhost:8000/sse"
    }
  }
}
```

## Docker Container Details

### Container Name
`mcp-google-sheets`

### Container Specifications
- **Image**: `mcp-google-sheets:latest`
- **Port Mapping**: `0.0.0.0:8000 -> 8000/tcp`
- **Transport**: SSE (Server-Sent Events)
- **Endpoint**: `http://localhost:8000/sse`
- **Authentication**: Application Default Credentials (ADC) for project `spot-internal`

### Container Management Commands
```bash
# Check container status
docker ps --filter name=mcp-google-sheets

# Start container
docker start mcp-google-sheets

# Stop container
docker stop mcp-google-sheets

# View logs
docker logs --tail 50 mcp-google-sheets

# Check if container is responding
curl -v http://localhost:8000/sse
```

## Key Requirements

### 1. Correct JSON Schema
The `.mcp.json` configuration **must** include the `type` field:

**❌ WRONG - Missing type field:**
```json
{
  "mcpServers": {
    "google-sheets": {
      "url": "http://localhost:8000/sse"
    }
  }
}
```

**✅ CORRECT - Includes type field:**
```json
{
  "mcpServers": {
    "google-sheets": {
      "type": "sse",
      "url": "http://localhost:8000/sse"
    }
  }
}
```

**Error message if type is missing:**
```
[Failed to parse] Project config (shared via .mcp.json)
mcpServers.google-sheets: Does not adhere to MCP server configuration schema
```

### 2. Full Endpoint URL
Must include the full SSE endpoint path `/sse`, not just the base URL.

- ✅ Correct: `http://localhost:8000/sse`
- ❌ Wrong: `http://localhost:8000`

### 3. Docker Container Must Be Running
The Docker container must be actively running for Claude Code to connect.

**Common Issue**: Container may stop due to:
- WSL2 shutdowns/restarts
- System reboots
- Manual stops

**Solution**: Always verify container is running before starting Claude Code session:
```bash
docker ps --filter name=mcp-google-sheets
```

If stopped, restart it:
```bash
docker start mcp-google-sheets
```

### 4. Port Conflicts
Only one container can bind to port 8000 at a time.

**Issue encountered**: `mcp-sheets-fixed` container was occupying port 8000, preventing `mcp-google-sheets` from starting.

**Solution**:
```bash
# Stop conflicting container
docker stop mcp-sheets-fixed

# Start correct container
docker start mcp-google-sheets
```

## Learnings

### 1. Claude Code MCP Transport Types
Claude Code supports three transport types:
- **stdio**: Command-line spawned processes (e.g., `npx`, `python`)
- **http**: HTTP-based MCP servers
- **sse**: Server-Sent Events (streaming) MCP servers

Each requires the `type` field to be explicitly specified.

### 2. Docker vs NPX Configuration
**Docker-based (our setup)**:
- Credentials pre-configured inside container
- More isolated and reproducible
- Requires container management
- Configuration:
  ```json
  {
    "type": "sse",
    "url": "http://localhost:8000/sse"
  }
  ```

**NPX-based (alternative)**:
- Simpler to set up
- Credentials passed via environment variables
- No container management needed
- Configuration:
  ```json
  {
    "command": "npx",
    "args": ["-y", "mcp-gsheets@latest"],
    "env": {
      "GOOGLE_PROJECT_ID": "project-id",
      "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json"
    }
  }
  ```

### 3. Docker Exec vs SSE Transport
**Initial mistake**: Attempted to use `docker exec` style configuration:
```json
{
  "command": "docker",
  "args": ["exec", "-i", "mcp-google-sheets", "mcp-google-sheets"]
}
```

This failed because:
- The container runs as an SSE server, not stdio
- Docker exec would spawn a new process instance
- Claude Code expects SSE transport for this container

### 4. Container Architecture
The `mcp-google-sheets` container:
- Runs uvicorn web server on port 8000
- Exposes SSE endpoint at `/sse`
- Uses Google Application Default Credentials (ADC)
- Health checks fail (looks for `/health` endpoint) but this doesn't affect MCP functionality
- Sends ping events every ~15 seconds to keep SSE connection alive

### 5. Session ID Management
The SSE endpoint provides a dynamic session ID in its first event:
```
event: endpoint
data: /messages/?session_id=5b6fa635707349a696cb9bd56e227afa
```

Claude Code automatically manages this session lifecycle.

### 6. WSL2 Considerations
- Docker containers may stop when WSL2 shuts down
- This is expected behavior and not a Docker issue
- Always verify container status after WSL2 restarts
- Consider adding container restart policy: `docker update --restart unless-stopped mcp-google-sheets`

## Troubleshooting Guide

### Issue: "Failed to reconnect to google-sheets"

**Check 1: Is container running?**
```bash
docker ps --filter name=mcp-google-sheets
```

**Check 2: Is SSE endpoint responding?**
```bash
curl -v http://localhost:8000/sse
# Should return HTTP 200 and text/event-stream
```

**Check 3: Is .mcp.json valid?**
```bash
cat .mcp.json | jq .
# Should parse without errors
```

**Check 4: Is type field present?**
```bash
jq '.mcpServers."google-sheets".type' .mcp.json
# Should return "sse"
```

### Issue: "Port is already allocated"

Another container is using port 8000.

**Find conflicting container:**
```bash
docker ps --filter publish=8000
```

**Stop conflicting container:**
```bash
docker stop <container-name>
```

**Start correct container:**
```bash
docker start mcp-google-sheets
```

### Issue: Container shows "unhealthy"

This is expected and doesn't affect MCP functionality. The health check looks for `/health` endpoint which doesn't exist.

**Verify MCP is still working:**
```bash
curl http://localhost:8000/sse
# Should stream events
```

To disable health check warnings:
```bash
docker update --health-cmd="exit 0" mcp-google-sheets
```

## Verification Steps

After configuration changes:

1. **Verify JSON syntax:**
   ```bash
   cat .mcp.json | jq .
   ```

2. **Verify container is running:**
   ```bash
   docker ps --filter name=mcp-google-sheets
   ```

3. **Verify SSE endpoint:**
   ```bash
   timeout 3 curl -v http://localhost:8000/sse
   ```

4. **Restart Claude Code:**
   ```bash
   exit
   cd /mnt/c/Users/masha/Documents/philly-integrative
   claude
   ```

5. **Check MCP connection:**
   ```bash
   claude mcp list
   # Should show "google-sheets" with Connected status
   ```

6. **Test functionality:**
   In Claude Code session:
   ```
   List my Google Sheets
   ```

## Authentication Details

The container uses **Google Application Default Credentials (ADC)** for authentication to the `spot-internal` project.

**Authentication chain (in order):**
1. OAuth credentials from `credentials.json` (not found in this setup)
2. Application Default Credentials via `GOOGLE_APPLICATION_CREDENTIALS` env var
3. gcloud CLI credentials
4. GCP metadata service (for GCE instances)

**Current setup**: Uses ADC successfully.

**To verify authentication:**
```bash
docker logs mcp-google-sheets | grep -i "authenticated"
# Should show: Successfully authenticated using ADC for project: spot-internal
```

## Success Indicators

When properly configured, you'll see:

1. **In `claude mcp list`:**
   ```
   google-sheets: http://localhost:8000/sse (HTTP) - ✓ Connected
   ```

2. **In Docker logs:**
   ```
   INFO:     Application startup complete.
   INFO:     Uvicorn running on http://0.0.0.0:8000
   Successfully authenticated using ADC for project: spot-internal
   INFO:     172.17.0.1:xxxxx - "GET /sse HTTP/1.1" 200 OK
   ```

3. **In Claude Code:**
   - Google Sheets MCP tools available
   - Can list, read, and write to sheets
   - No connection errors

## Maintenance

### Regular Checks
```bash
# Weekly: Verify container is running
docker ps --filter name=mcp-google-sheets

# After WSL2 restart: Restart container if needed
docker start mcp-google-sheets
```

### Container Restart Policy
Make container auto-start:
```bash
docker update --restart unless-stopped mcp-google-sheets
```

### Logs Cleanup
Container logs can grow large:
```bash
# Check log size
docker inspect --format='{{.LogPath}}' mcp-google-sheets | xargs ls -lh

# Rotate logs (requires container restart)
docker logs mcp-google-sheets > /tmp/mcp-sheets-backup.log
docker restart mcp-google-sheets
```

## References

- **Claude Code MCP Documentation**: https://code.claude.com/docs/en/mcp
- **MCP Specification**: https://spec.modelcontextprotocol.io
- **Google Sheets API**: https://developers.google.com/sheets/api
- **Project Setup Location**: `/mnt/c/Users/masha/Documents/philly-integrative/.mcp.json`
- **Container Image**: `mcp-google-sheets:latest`
- **GCP Project**: `spot-internal`

## Quick Reference

```bash
# Start container
docker start mcp-google-sheets

# Check status
docker ps --filter name=mcp-google-sheets

# View logs
docker logs --tail 50 mcp-google-sheets

# Test endpoint
curl -v http://localhost:8000/sse

# Restart Claude Code
exit && cd /mnt/c/Users/masha/Documents/philly-integrative && claude

# Verify MCP
claude mcp list
```

---

**Last Updated**: 2025-11-17
**Status**: ✅ Working
**Container**: mcp-google-sheets
**Port**: 8000
**Transport**: SSE
