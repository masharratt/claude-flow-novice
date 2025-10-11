--[[
  cleanup-blocking-coordination.lua

  High-performance Redis Lua script for cleaning up stale blocking coordinator state.
  Target: <5s for 10,000 coordinators (2,000 coordinators/sec)

  Strategy:
  1. Single SCAN with high COUNT to minimize round trips
  2. Batch MGET to retrieve all heartbeat states in one operation
  3. Filter stale coordinators (startTime < current - 600s)
  4. Batch collection of all related keys (ACKs, signals, idempotency, activity)
  5. Batch DEL of all stale keys in one atomic operation

  Safety:
  - Uses SCAN (non-blocking) for key discovery
  - TTL-based staleness check (10 minutes = 600 seconds)
  - Preserves active coordinators
  - Atomic execution prevents race conditions

  Performance optimizations:
  - Minimize network round trips (single SCAN, single MGET, single DEL)
  - Lua execution is atomic and server-side
  - No inter-command latency
  - Batch processing reduces overhead

  KEYS: None (discovers keys dynamically)
  ARGV[1]: Stale threshold in seconds (default: 600)
  ARGV[2]: Dry run flag (0 = production, 1 = dry run)

  Returns: JSON string with cleanup metrics
  {
    "totalCoordinatorsChecked": 0,
    "staleCoordinatorsFound": 0,
    "keysDeleted": 0,
    "executionTimeMs": 0,
    "staleCoordinatorIds": []
  }
]]

local STALE_THRESHOLD_SECONDS = tonumber(ARGV[1]) or 600
local DRY_RUN = tonumber(ARGV[2]) or 0
local start_time = redis.call('TIME')
local start_time_ms = tonumber(start_time[1]) * 1000 + math.floor(tonumber(start_time[2]) / 1000)

-- Metrics tracking
local metrics = {
  totalCoordinatorsChecked = 0,
  staleCoordinatorsFound = 0,
  keysDeleted = 0,
  executionTimeMs = 0,
  staleCoordinatorIds = {}
}

-- Helper: Get current timestamp in seconds
local function current_timestamp_seconds()
  local time = redis.call('TIME')
  return tonumber(time[1])
end

-- Helper: Extract coordinator ID from heartbeat key
local function extract_coordinator_id(heartbeat_key)
  -- Format: blocking:heartbeat:{coordinatorId}
  return string.match(heartbeat_key, "^blocking:heartbeat:(.+)$")
end

-- Helper: Parse JSON timestamp from heartbeat value
local function parse_heartbeat_timestamp(heartbeat_value)
  -- Format: {"coordinatorId":"...","timestamp":1234567890123,...}
  local timestamp_ms = string.match(heartbeat_value, '"timestamp":(%d+)')
  if timestamp_ms then
    return tonumber(timestamp_ms)
  end
  return nil
end

-- Helper: Check if coordinator is stale
local function is_stale(heartbeat_value, current_time_seconds)
  local timestamp_ms = parse_heartbeat_timestamp(heartbeat_value)
  if not timestamp_ms then
    return false  -- Invalid heartbeat, skip
  end

  local timestamp_seconds = math.floor(timestamp_ms / 1000)
  local age_seconds = current_time_seconds - timestamp_seconds

  return age_seconds > STALE_THRESHOLD_SECONDS
end

-- Helper: Collect all related keys for a coordinator
local function collect_coordinator_keys(coordinator_id)
  local keys = {}

  -- 1. Heartbeat key
  table.insert(keys, "blocking:heartbeat:" .. coordinator_id)

  -- 2. Signal ACK keys (blocking:ack:coordinatorId:*)
  local ack_cursor = "0"
  repeat
    local ack_result = redis.call('SCAN', ack_cursor, 'MATCH', 'blocking:ack:' .. coordinator_id .. ':*', 'COUNT', 1000)
    ack_cursor = ack_result[1]
    for _, key in ipairs(ack_result[2]) do
      table.insert(keys, key)
    end
  until ack_cursor == "0"

  -- 3. Signal key
  table.insert(keys, "blocking:signal:" .. coordinator_id)

  -- 4. Idempotency keys (blocking:idempotency:*coordinatorId*)
  local idemp_cursor = "0"
  repeat
    local idemp_result = redis.call('SCAN', idemp_cursor, 'MATCH', 'blocking:idempotency:*' .. coordinator_id .. '*', 'COUNT', 1000)
    idemp_cursor = idemp_result[1]
    for _, key in ipairs(idemp_result[2]) do
      table.insert(keys, key)
    end
  until idemp_cursor == "0"

  -- 5. Activity tracking key
  table.insert(keys, "coordinator:activity:" .. coordinator_id)

  return keys
end

-- Step 1: Scan for all heartbeat keys with high COUNT
local heartbeat_keys = {}
local cursor = "0"
repeat
  -- Use COUNT 10000 to minimize SCAN iterations
  local result = redis.call('SCAN', cursor, 'MATCH', 'blocking:heartbeat:*', 'COUNT', 10000)
  cursor = result[1]
  for _, key in ipairs(result[2]) do
    table.insert(heartbeat_keys, key)
  end
until cursor == "0"

-- Early exit if no coordinators found
if #heartbeat_keys == 0 then
  metrics.executionTimeMs = 0
  return cjson.encode(metrics)
end

metrics.totalCoordinatorsChecked = #heartbeat_keys

-- Step 2: Batch MGET all heartbeat values
local heartbeat_values = redis.call('MGET', unpack(heartbeat_keys))

-- Step 3: Filter stale coordinators and collect all keys to delete
local current_time_seconds = current_timestamp_seconds()
local keys_to_delete = {}
local stale_coordinator_ids = {}

for i, heartbeat_key in ipairs(heartbeat_keys) do
  local heartbeat_value = heartbeat_values[i]

  if heartbeat_value and is_stale(heartbeat_value, current_time_seconds) then
    local coordinator_id = extract_coordinator_id(heartbeat_key)
    if coordinator_id then
      table.insert(stale_coordinator_ids, coordinator_id)

      -- Collect all related keys for this stale coordinator
      local coordinator_keys = collect_coordinator_keys(coordinator_id)
      for _, key in ipairs(coordinator_keys) do
        table.insert(keys_to_delete, key)
      end
    end
  end
end

metrics.staleCoordinatorsFound = #stale_coordinator_ids
metrics.staleCoordinatorIds = stale_coordinator_ids

-- Step 4: Batch DEL all stale keys
if #keys_to_delete > 0 and DRY_RUN == 0 then
  -- Redis DEL command accepts up to ~1M keys, but we'll batch in chunks of 10000 for safety
  local batch_size = 10000
  local deleted_count = 0

  for i = 1, #keys_to_delete, batch_size do
    local batch_end = math.min(i + batch_size - 1, #keys_to_delete)
    local batch = {}
    for j = i, batch_end do
      table.insert(batch, keys_to_delete[j])
    end
    deleted_count = deleted_count + redis.call('DEL', unpack(batch))
  end

  metrics.keysDeleted = deleted_count
elseif DRY_RUN == 1 then
  metrics.keysDeleted = #keys_to_delete  -- Report what would be deleted
end

-- Calculate execution time
local end_time = redis.call('TIME')
local end_time_ms = tonumber(end_time[1]) * 1000 + math.floor(tonumber(end_time[2]) / 1000)
metrics.executionTimeMs = end_time_ms - start_time_ms

return cjson.encode(metrics)
