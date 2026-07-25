# Web Portal User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard View](#dashboard-view)
4. [Agents View](#agents-view)
5. [Hierarchy View](#hierarchy-view)
6. [Performance View](#performance-view)
7. [Events View](#events-view)
8. [Fleet View](#fleet-view)
9. [CFN Loop View](#cfn-loop-view)
10. [Common Tasks](#common-tasks)
11. [Troubleshooting](#troubleshooting)

---

## Introduction

The Claude Flow Novice Web Portal is a comprehensive monitoring and management interface for AI agent orchestration. It consolidates 8 previous portal implementations into a single, unified React Single Page Application (SPA) with real-time updates via WebSocket connections.

### Key Features

- **Real-time Monitoring**: Live updates for agent status, metrics, and events
- **7 Specialized Views**: Dashboard, Agents, Hierarchy, Performance, Events, Fleet, CFN Loop
- **Advanced Filtering**: Search, filter, and sort across all views
- **Responsive Design**: Material-UI components optimized for desktop and mobile
- **WebSocket Integration**: Socket.IO for low-latency updates
- **State Management**: Zustand stores with localStorage persistence

### System Requirements

- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Screen Resolution**: 1280x720 minimum (1920x1080 recommended)
- **JavaScript**: Must be enabled
- **WebSocket**: Port 3000 must be accessible

---

## Getting Started

### Accessing the Portal

1. Navigate to `http://localhost:3001` in your web browser
2. The Dashboard view loads automatically on first access
3. Use the left sidebar navigation to switch between views

### Navigation

The portal uses a persistent left sidebar with the following navigation options:

- **Dashboard** - Overview and key metrics
- **Agents** - Agent management and monitoring
- **Hierarchy** - Agent organization tree view
- **Performance** - System performance metrics
- **Events** - Real-time event timeline
- **Fleet** - Swarm fleet management
- **CFN Loop** - CFN Loop workflow monitoring

### Connection Status

The connection status indicator appears in each view:

- **Green (Connected)**: Real-time updates active
- **Yellow (Reconnecting)**: Attempting to restore connection
- **Red (Disconnected)**: No connection, data may be stale

---

## Dashboard View

### Overview

The Dashboard provides a high-level overview of your agent orchestration system with key metrics, performance charts, and recent activity.

**Screenshot Description**: Dashboard view showing 4 metric cards at top (Active Agents, System CPU, Memory Usage, Events/sec), followed by agent hierarchy tree and status monitor side-by-side, performance charts showing CPU/Memory/Agents over time, and event timeline with alerts panel at bottom.

### Key Components

#### 1. Metric Cards (Top Row)

Four real-time metric cards display critical system statistics:

- **Active Agents**: Number of currently active agents with trend indicator
- **System CPU**: Current CPU usage percentage with trend
- **Memory Usage**: Current memory consumption (MB/GB) with trend
- **Events/sec**: Event throughput rate with trend

**Trend Indicators**:
- Green up arrow: Increasing trend
- Red down arrow: Decreasing trend
- Flat line: Stable trend

#### 2. Agent Hierarchy Tree (Left Panel)

Displays the organizational structure of agents in a collapsible tree format:

- **Root Node**: Swarm coordinator
- **Child Nodes**: Individual agents with status icons
- **Expand/Collapse**: Click folder icons to expand/collapse branches
- **Selection**: Click agent name to view details in Status Monitor

**Agent Status Icons**:
- ▶️ Green Play: Active
- ⏸️ Gray Pause: Idle
- ✅ Green Check: Completed
- ❌ Red X: Failed

#### 3. Status Monitor (Right Panel)

Displays detailed status of all agents with filtering capabilities:

- **Status Badge**: Color-coded status indicator
- **Type**: Agent role (coder, tester, reviewer, etc.)
- **Metrics**: Tasks completed, confidence score
- **Actions**: Refresh, Filter, View Details buttons

#### 4. Performance Charts (Middle Section)

Three time-series charts show system performance over selected time range:

- **CPU Usage Chart**: Line chart showing CPU percentage over time
- **Memory Usage Chart**: Area chart showing memory consumption
- **Active Agents Chart**: Bar chart showing agent count fluctuations

**Time Range Selector**:
- Last Hour
- Last 6 Hours
- Last 24 Hours
- Last 7 Days

#### 5. Event Timeline (Bottom Left)

Displays recent system events in chronological order:

- **Event Type**: Category (agent.spawned, agent.completed, etc.)
- **Message**: Human-readable event description
- **Timestamp**: Relative time (e.g., "2 minutes ago")
- **Severity**: Color-coded badge (info, warning, error, critical)
- **Limit**: Shows last 10 events by default

#### 6. Alerts Panel (Bottom Right)

Critical alerts and warnings requiring attention:

- **Priority Indicators**: High/Medium/Low badges
- **Alert Type**: System, Security, Performance
- **Action Required**: Clear, Dismiss, or Investigate links
- **Max Alerts**: Shows top 5 most recent alerts

### Common Actions

#### Refresh Dashboard

1. Click the **Refresh** icon (circular arrow) in the top-right corner
2. All metrics and charts update immediately
3. Loading spinner appears during refresh

#### Change Time Range

1. Click the **Time Range** dropdown in the top-right
2. Select desired range (1h, 6h, 24h, 7d)
3. Performance charts update to show selected range

#### Pause/Resume Auto-Refresh

1. Click the **Pause** icon (pause symbol) in the top-right
2. Icon changes to Play (auto-refresh paused)
3. Click **Play** icon to resume auto-refresh
4. Default refresh interval: 5 seconds

#### Export Dashboard Data

1. Click the **Export** icon (download symbol) in the top-right
2. Data exports as JSON file with timestamp
3. Export includes: metrics, agents, events, alerts, resource usage

**Export Format** (JSON):
```json
{
  "timestamp": "2025-10-12T10:30:00.000Z",
  "timeRange": "1h",
  "metrics": { ... },
  "agents": [ ... ],
  "events": [ ... ],
  "alerts": [ ... ],
  "resourceUsage": { ... }
}
```

#### Select Agent from Hierarchy

1. Navigate to Agent Hierarchy Tree (left panel)
2. Expand swarm nodes by clicking folder icons
3. Click agent name to highlight
4. Status Monitor updates to show selected agent details

---

## Agents View

### Overview

The Agents view provides comprehensive agent management with list/grid display modes, advanced filtering, search, and agent lifecycle operations (spawn, terminate).

**Screenshot Description**: Agents view showing search bar and filters in left sidebar, main area with list/grid toggle and agent cards displaying name, status, type, metrics, and action buttons. Spawn Agent button in top-right corner.

### Layout Components

#### 1. Header Bar

- **Title**: "Agents" with people icon
- **Refresh Button**: Manual refresh trigger
- **Filters Toggle**: Show/hide left sidebar filters
- **View Mode Toggle**: Switch between List and Grid views
- **Spawn Agent Button**: Opens agent spawn modal

#### 2. Connection Status Banner

Yellow warning banner appears when WebSocket disconnected:
- "WebSocket disconnected. Real-time updates are unavailable."
- Auto-dismisses when connection restored

#### 3. Filters Sidebar (Left Panel)

**Search Bar**:
- Real-time fuzzy search across agent name, ID, and type
- Matches partial strings (case-insensitive)
- Updates results as you type

**Status Filter**:
- All (default)
- Active
- Idle
- Paused
- Completed
- Failed

**Type Filter**:
- All (default)
- coder
- reviewer
- tester
- security-specialist
- architect
- coordinator
- researcher
- devops-engineer

**Capabilities Filter** (Multi-select):
- coding
- testing
- security
- review
- architecture
- documentation
- devops
- database

**Clear Filters Button**: Resets all filters to default values

#### 4. Statistics Chips

Row of chips showing real-time counts:
- **Total**: All agents matching current filters
- **Active**: Green chip with play icon
- **Completed**: Blue chip with check icon
- **Failed**: Red chip with error icon

#### 5. Agent Display Area

**List View** (default):
- Tabular layout with columns: Name/ID, Status, Type, Metrics, Actions
- Dense information display
- Ideal for scanning large agent lists

**Grid View**:
- Card-based layout (3 columns on desktop, 1 on mobile)
- Visual emphasis on status and metrics
- Ideal for monitoring smaller agent sets

**Pagination**:
- 20 agents per page
- Page controls at bottom
- Shows "Page X of Y"
- First/Previous/Next/Last buttons

### Agent Card Components

#### List View Agent Row

- **Left Section**: Status icon, agent name, agent ID (caption)
- **Middle Section**: Status chip, type label, metrics (tasks, confidence)
- **Right Section**: View button, Terminate button

#### Grid View Agent Card

- **Header**: Agent name, status icon
- **Body**: Status chip, type, ID, metrics
- **Footer**: View button, Terminate button

### Agent Operations

#### Spawn New Agent

1. Click **Spawn Agent** button (top-right)
2. Spawn Agent modal appears
3. Fill out form:
   - **Agent Name** (required): Unique identifier
   - **Agent Type** (dropdown): Select from available types
   - **Capabilities** (checkboxes): Select one or more
4. Click **Spawn** button
5. New agent appears in list immediately
6. Success notification appears

**Screenshot Description**: Spawn Agent modal showing name text field, type dropdown, and capabilities checkboxes with Spawn/Cancel buttons.

**Validation**:
- Agent name is required (button disabled if empty)
- Name must be unique (error shown if duplicate)

#### View Agent Details

1. Locate agent in list/grid view
2. Click **View** button
3. Agent details panel/page opens
4. Shows: Full metrics, history, logs, parent swarm

*(Note: Detail view implementation in progress)*

#### Terminate Agent

1. Locate agent in list/grid view
2. Click **Terminate** button (red)
3. Confirmation modal appears with agent details
4. Optionally enter termination reason
5. Click **Terminate** button to confirm
6. Agent status changes to "completed" or removed from list
7. Confirmation notification appears

**Screenshot Description**: Terminate Agent modal showing warning alert, agent details (name, type, status), optional reason text area, and Cancel/Terminate buttons.

**Warning**: Termination is irreversible. Active tasks will be aborted.

### Filtering Workflows

#### Find Active Coders

1. Open Filters sidebar
2. Set **Status** filter to "Active"
3. Set **Type** filter to "coder"
4. Results update automatically
5. Statistics chips show filtered counts

#### Search by Name

1. Type agent name in Search bar
2. Results filter as you type
3. Matching agents highlighted
4. Works with partial matches

#### Find Agents with Security Capability

1. Open **Capabilities** filter dropdown
2. Check "security" checkbox
3. Click outside dropdown to apply
4. Results show agents with security capability
5. Can combine with other filters

---

## Hierarchy View

### Overview

The Hierarchy view displays agent organizational structure in a tree format, showing parent-child relationships and swarm membership.

**Screenshot Description**: Hierarchy view showing expandable tree with swarm coordinator at root, child agents as branches, with expand/collapse controls, status icons, and agent metadata.

### Tree Structure

#### Root Level

- **Swarm Coordinators**: Top-level agents managing swarms
- **Standalone Agents**: Agents not part of a swarm
- **Expand All/Collapse All**: Global tree controls

#### Child Levels

- **Swarm Members**: Agents belonging to coordinator
- **Depth Indicators**: Indentation shows hierarchy depth
- **Connection Lines**: Visual tree structure lines

### Agent Nodes

Each node displays:
- **Status Icon**: Current agent state (active, idle, completed, failed)
- **Agent Name**: Unique identifier
- **Agent Type**: Role badge
- **Expand/Collapse Icon**: For nodes with children

### Interactions

#### Expand/Collapse Node

1. Click folder icon next to agent name
2. Child agents appear/disappear
3. Icon rotates to indicate state

#### Select Agent

1. Click agent name
2. Node highlights
3. Details panel updates (if enabled)
4. Other views can sync selection

#### Search in Hierarchy

1. Use search bar at top of view
2. Tree filters to matching nodes
3. Parent paths remain visible
4. Clear search to restore full tree

### Use Cases

- **Visualize Swarm Structure**: See coordinator-agent relationships
- **Monitor Hierarchy Health**: Identify failing branches
- **Locate Specific Agent**: Use search to find in large trees
- **Understand Dependencies**: See which agents report to which coordinators

---

## Performance View

### Overview

The Performance view provides detailed system and agent performance metrics through interactive charts and real-time monitoring.

**Screenshot Description**: Performance view showing three charts stacked vertically - CPU usage line chart, Memory usage area chart, and Active agents bar chart, with time range selector at top.

### Chart Components

#### 1. CPU Usage Chart (Line Chart)

- **Y-Axis**: CPU percentage (0-100%)
- **X-Axis**: Time
- **Line Color**: Blue (normal), Orange (high load), Red (critical)
- **Threshold Indicators**: Horizontal lines at 70% (warning), 90% (critical)
- **Tooltip**: Shows exact value and timestamp on hover

**Interpretation**:
- Below 70%: Healthy
- 70-90%: Elevated, monitor closely
- Above 90%: Critical, investigate immediately

#### 2. Memory Usage Chart (Area Chart)

- **Y-Axis**: Memory in MB/GB
- **X-Axis**: Time
- **Area Fill**: Gradient from green to yellow to red based on usage
- **Total Memory Line**: Dotted line showing system maximum
- **Tooltip**: Shows exact memory consumption

**Interpretation**:
- Below 70% of total: Healthy
- 70-85% of total: Elevated
- Above 85% of total: Critical, risk of OOM errors

#### 3. Active Agents Chart (Bar Chart)

- **Y-Axis**: Number of agents
- **X-Axis**: Time intervals
- **Bar Colors**: Green (active), Blue (idle), Red (failed)
- **Stacked Bars**: Shows agent status distribution
- **Tooltip**: Shows exact counts per status

**Interpretation**:
- Increasing active agents: System scaling up
- Flat active agents: Steady state
- Decreasing active agents: Swarm winding down or agents failing

### Time Range Controls

Located at top of view:

- **Dropdown Selector**: Choose time range
- **Options**: Last Hour, Last 6 Hours, Last 24 Hours, Last 7 Days
- **Auto-Refresh**: Charts update every 5 seconds
- **Pause Button**: Temporarily stop auto-refresh

### Performance Indicators

#### System Health Status

Color-coded status badge showing overall health:
- **Green**: All metrics normal
- **Yellow**: One or more metrics elevated
- **Orange**: Multiple metrics elevated or one critical
- **Red**: Critical performance issues

#### Resource Gauges

Circular gauges showing current resource utilization:
- **CPU Gauge**: Current CPU percentage
- **Memory Gauge**: Current memory usage
- **Disk Gauge**: Current disk usage (if available)
- **Network Gauge**: Current network throughput (if available)

### Common Workflows

#### Investigate CPU Spike

1. Notice CPU chart shows spike
2. Note timestamp of spike
3. Switch to Events view
4. Filter events by timestamp range
5. Identify which agent(s) caused spike
6. Take corrective action (adjust agent workload, terminate, etc.)

#### Monitor Memory Growth

1. Observe Memory chart over 24-hour period
2. Look for steady upward trend (memory leak indicator)
3. Identify time when growth started
4. Correlate with agent spawn/terminate events
5. Investigate specific agents running during growth period

#### Track Agent Scaling

1. Review Active Agents chart
2. Compare against workload metrics
3. Verify agents scale up/down appropriately
4. Adjust swarm configuration if needed

---

## Events View

### Overview

The Events view displays a real-time timeline of system events with advanced filtering, search, and severity indicators. Uses virtual scrolling for efficient rendering of large event lists.

**Screenshot Description**: Events view showing left sidebar with filters (search, category, severity, date range, statistics), and main area with vertically scrolling event timeline. Each event shows type, message, timestamp, severity badge, and optional agent ID.

### Layout Components

#### 1. Header Bar

- **Title**: "Events"
- **Filter Toggle**: Show/hide left sidebar
- **Refresh Button**: Manual refresh trigger
- **Connection Indicator**: WebSocket status

#### 2. Filters Sidebar (Left Panel)

**Search Bar**:
- Search across event message, agent ID, and event type
- Real-time filtering as you type
- Case-insensitive matching

**Category Filter** (Dropdown):
- All Categories (default)
- Agent Lifecycle: agent.spawned, agent.terminated
- Agent Complete: agent.completed
- CFN Loop: cfn.loop.phase.start, cfn.loop.phase.complete
- System Error: system.error

**Severity Filter** (Dropdown):
- All Severities (default)
- Info: Informational events
- Warning: Potential issues
- Error: Errors requiring attention
- Critical: Critical failures requiring immediate action

**Date Range Filter** (Dropdown):
- All Time (default): Shows all events
- Last Hour: Events from past 60 minutes
- Last 7 Days: Events from past week

**Clear Filters Button**: Resets all filters to defaults

**Statistics Section**:
- Total: Total event count
- Info: Count with blue badge
- Warning: Count with orange badge
- Error: Count with red badge
- Critical: Count with dark red badge

#### 3. Event Timeline (Main Area)

**Virtual Scrolling**:
- Efficiently renders thousands of events
- Only visible events in DOM
- Smooth scrolling performance
- Automatically adjusts to window size

**Event Items**:
Each event displays:
- **Event Type** (caption): Category label
- **Message**: Human-readable description
- **Agent ID** (if applicable): Source agent
- **Severity Badge**: Color-coded chip (info, warning, error, critical)
- **Timestamp**: Localized time display
- **Left Border**: Color matches severity

### Event Severity Colors

- **Info** (Blue): Normal operations, informational
- **Warning** (Orange): Potential issues, monitor closely
- **Error** (Red): Errors occurred, investigate
- **Critical** (Dark Red): Critical failures, immediate action required

### Event Types

#### Agent Lifecycle Events

- `agent.spawned`: New agent created
- `agent.terminated`: Agent terminated
- `agent.lifecycle`: General lifecycle change

#### Agent Completion Events

- `agent.completed`: Agent finished task successfully
- `agent.complete`: Agent completion notification

#### CFN Loop Events

- `cfn.loop.phase.start`: CFN Loop phase started
- `cfn.loop.phase.complete`: CFN Loop phase completed
- `cfn.loop.validation`: Validation event

#### System Events

- `system.error`: System-level error
- `system.warning`: System-level warning
- `system.startup`: System started
- `system.shutdown`: System shutting down

### Common Workflows

#### Monitor Recent Errors

1. Open Events view
2. Set **Severity Filter** to "Error"
3. Set **Date Range Filter** to "Last Hour"
4. Review error events chronologically
5. Click event to see full details (if implemented)

#### Track Specific Agent

1. Enter agent ID in **Search Bar**
2. Events filter to show only that agent
3. Review agent's activity timeline
4. Identify patterns or issues

#### Investigate CFN Loop Phase

1. Set **Category Filter** to "CFN Loop"
2. Look for phase start/complete events
3. Verify completion events follow start events
4. Check for error events between start/complete

#### Export Event Log

1. Apply desired filters
2. Click **Export** button (if implemented)
3. Save as JSON or CSV
4. Use for auditing or external analysis

---

## Fleet View

### Overview

The Fleet view provides swarm-level management and monitoring, showing aggregated metrics, swarm list with status, and agent distribution visualization.

**Screenshot Description**: Fleet view showing 4 metric cards at top (Total Agents, Active Swarms, Avg Confidence, Tasks Completed), swarm list in middle with status chips for each swarm, and pie chart at bottom showing agent type distribution.

### Layout Components

#### 1. Header Bar

- **Title**: "Fleet Overview" with cloud icon
- **Refresh Button**: Manual refresh trigger

#### 2. Aggregation Metrics (Top Row)

Four cards showing fleet-wide statistics:

**Total Agents Card**:
- Count of all agents across all swarms
- Updated in real-time

**Active Swarms Card**:
- Count of swarms currently running
- Excludes completed/terminated swarms

**Avg Confidence Card**:
- Average confidence score across all agents
- Calculated as percentage (0-100%)
- Weighted by agent count

**Tasks Completed Card**:
- Total tasks completed by all agents
- Cumulative count across swarms

#### 3. Swarm List

**View Mode Toggle** (Grid/List):
- **List View**: Compact rows with status chips
- **Grid View**: Card-based layout with more details

**Virtual Scrolling**:
- Efficiently renders large swarm lists
- Smooth scrolling performance
- Automatically adjusts item height

**Swarm Cards/Rows Display**:
Each swarm shows:
- **Swarm Name**: Identifier (e.g., "Sprint 3.3 Implementation")
- **Agent Count**: Total agents in swarm
- **Status Chips**:
  - Active: Green chip with count
  - Idle: Gray chip with count
  - Done: Blue chip with count
  - Failed: Red chip with count (if any)
- **Created At**: Timestamp (in list view)

#### 4. Agent Distribution Chart (Bottom)

**Pie Chart**:
- Shows agent type distribution across entire fleet
- Color-coded segments for each agent type
- Hover to see exact counts
- Legend showing type names

**Agent Types** (typical):
- coder (teal)
- reviewer (pink)
- tester (yellow)
- security-specialist (blue)
- architect (purple)
- coordinator (orange)

### Swarm Status Interpretation

#### Healthy Swarm

- High active agent count
- Low or zero failed agents
- Balanced idle agents
- Some completed agents (showing progress)

#### Stalled Swarm

- Low active agent count
- High idle agent count
- Few completed agents
- No recent activity

#### Failing Swarm

- High failed agent count
- Low completed agent count
- May have mix of active/idle
- Requires investigation

### Common Workflows

#### Monitor Fleet Health

1. Review **Aggregation Metrics** cards
2. Check **Avg Confidence** (should be >70%)
3. Scan **Swarm List** for red (failed) chips
4. Investigate swarms with high failure rates

#### Compare Swarm Performance

1. Switch to **List View** for tabular comparison
2. Compare agent counts across swarms
3. Compare status distributions
4. Identify underperforming swarms

#### Analyze Agent Type Distribution

1. Scroll to **Agent Distribution Chart**
2. Identify most/least common agent types
3. Determine if distribution matches workload
4. Adjust swarm spawn strategies if needed

#### Drill Down to Swarm Details

1. Locate swarm in list/grid
2. Click swarm name (if linked)
3. Navigate to swarm detail view
4. See individual agent details

---

## CFN Loop View

### Overview

The CFN Loop view monitors the CFN (Consensus Formation Network) Loop workflow, showing loop progression (Loop 0-4), phase tracking, validator results, and confidence metrics.

**Screenshot Description**: CFN Loop view showing current loop number and phase name at top, progress bars for Loop 3 (implementation) and Loop 2 (validation), validator results cards, and phase timeline showing completed/active/pending phases.

### CFN Loop Workflow Overview

The CFN Loop is a multi-stage autonomous workflow:

- **Loop 0**: Epic/Sprint orchestration (multi-phase planning)
- **Loop 1**: Phase execution (sequential phases)
- **Loop 2**: Consensus validation (2-4 validators)
- **Loop 3**: Primary swarm implementation
- **Loop 4**: Product Owner decision gate (PROCEED/DEFER/ESCALATE)

### Layout Components

#### 1. Header Section

- **Current Loop Number**: Badge showing active loop (0-4)
- **Current Phase Name**: E.g., "Sprint 3.3 Implementation"
- **Loop Status**: Indicator (in-progress, completed, failed)
- **Validator Count**: Number of validators in Loop 2

#### 2. Metrics Cards

**Gate Threshold Card**:
- Minimum confidence required for Loop 3 agents
- Default: 0.75 (75%)
- Configurable per mode (MVP/Standard/Enterprise)

**Consensus Threshold Card**:
- Minimum consensus required for Loop 2 validators
- Default: 0.90 (90%)
- Higher in Enterprise mode (0.95)

**Avg Loop 3 Confidence Card**:
- Average confidence across all Loop 3 agents
- Green if ≥ Gate Threshold
- Red if < Gate Threshold

**Avg Loop 2 Consensus Card**:
- Average consensus across all Loop 2 validators
- Green if ≥ Consensus Threshold
- Red if < Consensus Threshold

#### 3. Progress Bars

**Loop 3 Progress Bar**:
- Shows implementation progress (0-100%)
- Updates as agents complete tasks
- Green when complete, blue during progress

**Loop 2 Progress Bar**:
- Shows validation progress (0-100%)
- Updates as validators complete reviews
- Green when consensus reached, blue during validation

#### 4. Validator Results Section

List of validator agents with results:

**Validator Card**:
- **Validator Name**: E.g., "reviewer-1", "security-specialist-1"
- **Status Badge**: Pending (gray), Passed (green), Failed (red)
- **Confidence Score**: Validator's confidence (0-100%)
- **Issues List**: Array of identified issues (if any)

**Issue Severity**:
- Critical: Must fix before proceeding
- High: Should fix before proceeding
- Medium: Can defer to backlog
- Low: Optional improvements

#### 5. Phase Timeline

Visual timeline showing CFN Loop phases:

**Phase Card**:
- **Phase Number**: Sequential identifier
- **Phase Name**: Descriptive title
- **Sprint List**: Sprints within phase (if multi-sprint)
- **Status**: Completed (green check), Active (blue pulse), Pending (gray)
- **Started At**: Timestamp (if started)
- **Completed At**: Timestamp (if completed)

### CFN Loop Progression

#### Loop 3: Implementation

1. Multiple agents spawned in parallel
2. Each agent implements assigned subtask
3. Agents self-report confidence scores
4. **Gate Check**: All agents must meet Gate Threshold (≥0.75)
5. If gate passes, proceed to Loop 2
6. If gate fails, retry Loop 3 with targeted improvements

#### Loop 2: Validation

1. Validator team spawned (2-4 validators)
2. Validators review Loop 3 implementations
3. Validators report consensus scores
4. **Consensus Check**: Average must meet Consensus Threshold (≥0.90)
5. If consensus reached, proceed to Loop 4
6. If consensus fails, provide recommendations and proceed to Loop 4 (Product Owner decides)

#### Loop 4: Product Owner Decision

1. Product Owner reviews Loop 3 and Loop 2 results
2. Makes autonomous GOAP decision:
   - **PROCEED**: Continue to next phase
   - **DEFER**: Approve work, backlog issues, continue
   - **ESCALATE**: Critical ambiguity, require human review
3. If PROCEED/DEFER, auto-transition to next phase
4. If ESCALATE, notify human operator

### Confidence and Consensus Interpretation

#### Confidence Scores (Loop 3)

- **0.85-1.00**: Excellent, high confidence
- **0.75-0.84**: Good, meets threshold
- **0.60-0.74**: Below threshold, retry needed
- **Below 0.60**: Poor, significant issues

#### Consensus Scores (Loop 2)

- **0.95-1.00**: Strong consensus, enterprise-ready
- **0.90-0.94**: Good consensus, standard quality
- **0.80-0.89**: Weak consensus, concerns raised
- **Below 0.80**: No consensus, issues identified

### Common Workflows

#### Monitor Loop 3 Progress

1. Check **Loop 3 Progress Bar**
2. Review **Avg Loop 3 Confidence**
3. Wait for all agents to complete
4. Verify average meets **Gate Threshold**
5. If passes, Loop 2 initiates automatically

#### Review Validator Results

1. Navigate to **Validator Results Section**
2. Check each validator status
3. Review confidence scores
4. Read issues list for failed validators
5. Prioritize issues by severity

#### Track Phase Completion

1. Review **Phase Timeline**
2. Identify active phase (blue pulse)
3. Monitor Loop 3 and Loop 2 progress
4. Wait for Loop 4 decision
5. Verify phase marked as completed (green check)

#### Troubleshoot Low Confidence

1. Identify agents with low confidence (<0.75)
2. Switch to Agents view
3. Filter by specific agent IDs
4. Review agent logs/metrics
5. Terminate and respawn with adjusted instructions

---

## Common Tasks

### Task 1: Monitor System Health

**Objective**: Get quick overview of system status

1. Navigate to **Dashboard** view
2. Check **Metric Cards** (Active Agents, CPU, Memory, Events/sec)
3. Verify all metrics in normal ranges
4. Review **Alerts Panel** for critical alerts
5. Check **Connection Status** (should be green)

**Success Criteria**: All metrics green/yellow, no critical alerts

---

### Task 2: Find and Terminate Failing Agents

**Objective**: Clean up failed agents to free resources

1. Navigate to **Agents** view
2. Open **Filters** sidebar
3. Set **Status Filter** to "Failed"
4. Review failed agents list
5. Select agents to terminate
6. Click **Terminate** button for each
7. Confirm termination in modal
8. Verify agents removed from list

**Success Criteria**: No failed agents remaining

---

### Task 3: Investigate Performance Degradation

**Objective**: Identify cause of slow system performance

1. Navigate to **Performance** view
2. Set **Time Range** to "Last 24 Hours"
3. Review **CPU Usage Chart** for spikes
4. Review **Memory Usage Chart** for growth
5. Note timestamp of performance issue
6. Navigate to **Events** view
7. Set **Date Range Filter** to cover timestamp
8. Look for error/warning events at that time
9. Identify agents active during issue
10. Navigate to **Agents** view
11. Search for problematic agent IDs
12. Review agent metrics and logs
13. Terminate problematic agents if needed

**Success Criteria**: Issue cause identified, corrective action taken

---

### Task 4: Monitor CFN Loop Phase Completion

**Objective**: Track progress of current CFN Loop phase

1. Navigate to **CFN Loop** view
2. Check **Current Loop Number** and **Phase Name**
3. Monitor **Loop 3 Progress Bar** (implementation)
4. Wait for Loop 3 to complete (100%)
5. Verify **Avg Loop 3 Confidence** ≥ Gate Threshold
6. Monitor **Loop 2 Progress Bar** (validation)
7. Wait for Loop 2 to complete (100%)
8. Verify **Avg Loop 2 Consensus** ≥ Consensus Threshold
9. Review **Validator Results** for issues
10. Wait for **Loop 4 Decision**
11. Verify phase marked as completed in **Phase Timeline**

**Success Criteria**: Phase completed successfully, Loop 4 decision = PROCEED or DEFER

---

### Task 5: Export Dashboard Data for Reporting

**Objective**: Generate report with current system metrics

1. Navigate to **Dashboard** view
2. Set **Time Range** to desired period
3. Wait for all metrics to load
4. Click **Export** icon (download symbol)
5. Save JSON file to local disk
6. Open JSON file in text editor or JSON viewer
7. Extract desired metrics for report
8. Format as needed (CSV, spreadsheet, PDF, etc.)

**Success Criteria**: JSON file downloaded with complete data

---

### Task 6: Set Up Monitoring for Specific Swarm

**Objective**: Track performance of a specific swarm over time

1. Navigate to **Fleet** view
2. Locate swarm in **Swarm List**
3. Note swarm ID and name
4. Navigate to **Agents** view
5. Enter swarm ID in **Search Bar** (if agents tagged with swarm metadata)
6. Bookmark/note list of agent IDs
7. Navigate to **Events** view
8. Search for swarm ID
9. Review event timeline for swarm activity
10. Navigate to **Performance** view
11. Monitor metrics, noting correlation with swarm activity

**Success Criteria**: Comprehensive view of swarm performance and activity

---

## Troubleshooting

### Connection Issues

#### Problem: "WebSocket disconnected" banner appears

**Causes**:
- Backend server not running
- Network connectivity issue
- Port 3000 blocked by firewall
- Too many concurrent connections

**Solutions**:
1. Verify backend server is running: `npm run dev:server`
2. Check server logs for errors
3. Verify port 3000 is accessible: `curl http://localhost:3000/api/health`
4. Check browser console for WebSocket errors
5. Try refreshing browser page (F5)
6. Clear browser cache and reload
7. Check firewall/antivirus settings

**Prevention**: Ensure stable network, keep backend server running

---

#### Problem: Connection drops frequently

**Causes**:
- Unstable network
- Server resource constraints
- WebSocket timeout too low
- Reverse proxy misconfiguration

**Solutions**:
1. Check network stability: `ping localhost`
2. Review server resource usage (CPU, memory)
3. Increase WebSocket timeout in server config
4. Verify reverse proxy WebSocket support (if using)
5. Enable WebSocket reconnection with longer delays

**Prevention**: Use stable network, adequate server resources, proper proxy config

---

### Performance Issues

#### Problem: Dashboard loads slowly

**Causes**:
- Large number of agents (>1000)
- High event volume
- Browser resource constraints
- Network latency

**Solutions**:
1. Reduce **Time Range** to shorter period (1h instead of 7d)
2. Close unused browser tabs to free memory
3. Disable browser extensions temporarily
4. Clear browser cache
5. Use **Pause** button to stop auto-refresh
6. Upgrade browser to latest version

**Prevention**: Keep agent count reasonable, use shorter time ranges

---

#### Problem: Charts not rendering

**Causes**:
- Chart.js library not loaded
- Invalid data format
- Browser compatibility issue

**Solutions**:
1. Check browser console for JavaScript errors
2. Verify Chart.js version compatibility
3. Try different browser (Chrome, Firefox)
4. Clear browser cache and reload
5. Check for ad blockers interfering with scripts

**Prevention**: Use modern browsers, keep portal updated

---

### Data Issues

#### Problem: Metrics show as 0 or "No data"

**Causes**:
- No agents running
- WebSocket not connected
- Backend not receiving data
- Data retention policy expired old data

**Solutions**:
1. Verify agents are running: Check **Agents** view
2. Verify WebSocket connection (should show green)
3. Check backend logs for data ingestion errors
4. Verify time range includes recent data
5. Restart backend server if needed

**Prevention**: Ensure agents spawn successfully, monitor connection status

---

#### Problem: Stale data displayed

**Causes**:
- Auto-refresh paused
- WebSocket disconnected
- Browser tab inactive (background)
- Server not sending updates

**Solutions**:
1. Check if **Pause** button is active (showing Play icon)
2. Click **Resume** to restart auto-refresh
3. Click **Refresh** button to force update
4. Verify WebSocket connection status
5. Bring browser tab to foreground
6. Check server logs for update publishing

**Prevention**: Keep browser tab active, ensure WebSocket connected

---

### UI Issues

#### Problem: Filters not working

**Causes**:
- JavaScript error in filter logic
- Race condition with data loading
- Browser compatibility issue

**Solutions**:
1. Click **Clear Filters** button to reset
2. Refresh browser page (F5)
3. Check browser console for errors
4. Try different filter combinations
5. Verify data is loaded before filtering

**Prevention**: Apply filters after data loads, report bugs to developers

---

#### Problem: Modal dialogs not appearing

**Causes**:
- Z-index CSS issue
- JavaScript error preventing modal
- Browser popup blocker (rare)

**Solutions**:
1. Check browser console for JavaScript errors
2. Try zooming browser to 100% (Ctrl+0)
3. Disable browser extensions temporarily
4. Clear browser cache
5. Try different browser

**Prevention**: Keep browser updated, avoid excessive browser extensions

---

### Agent Management Issues

#### Problem: Cannot spawn new agent

**Causes**:
- Agent name already exists
- Invalid agent type
- Backend API error
- Resource constraints

**Solutions**:
1. Verify agent name is unique
2. Check required fields are filled
3. Check browser console and server logs for errors
4. Verify backend has available resources
5. Try simpler agent configuration
6. Contact system administrator if issue persists

**Prevention**: Use unique agent names, monitor system resources

---

#### Problem: Terminated agents still appear

**Causes**:
- UI state not updated
- WebSocket notification not received
- Backend delay in processing

**Solutions**:
1. Click **Refresh** button in Agents view
2. Wait a few seconds and check again
3. Refresh browser page (F5)
4. Verify WebSocket connection
5. Check server logs for termination confirmation

**Prevention**: Wait for confirmation notification before expecting UI update

---

### CFN Loop Issues

#### Problem: Loop 3 stuck at <100% progress

**Causes**:
- Agent(s) hung or crashed
- Agent confidence below threshold
- Agent waiting for external resource

**Solutions**:
1. Navigate to **Agents** view
2. Filter to Loop 3 agents (check metadata)
3. Identify agents with low confidence (<0.75)
4. Review agent logs for errors
5. Terminate hung agents
6. Respawn failed agents with adjusted instructions
7. Wait for all agents to meet gate threshold

**Prevention**: Monitor agent progress regularly, use appropriate timeouts

---

#### Problem: Loop 2 consensus not reached

**Causes**:
- Implementation quality below standards
- Validators identifying legitimate issues
- Threshold too high for workload

**Solutions**:
1. Review **Validator Results** section
2. Read issues raised by validators
3. Prioritize critical/high severity issues
4. Loop 4 Product Owner will make decision
5. If PROCEED decision, issues go to backlog
6. If DEFER decision, return to Loop 3 with fixes

**Prevention**: Ensure Loop 3 quality, adjust thresholds if consistently failing

---

### Browser Compatibility

**Supported Browsers**:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Known Issues**:
- IE11: Not supported
- Safari 13: WebSocket reconnection issues
- Firefox <88: Chart rendering issues

**Recommendations**:
- Use Chrome or Firefox for best experience
- Keep browser updated to latest version
- Enable JavaScript and WebSocket support

---

### Getting Help

**Documentation**:
- **API Documentation**: `/docs/API.md`
- **Deployment Guide**: `/docs/DEPLOYMENT.md`
- **Architecture Documentation**: `/docs/ARCHITECTURE.md`
- **Troubleshooting Guide**: `/docs/TROUBLESHOOTING.md`

**Support Channels**:
- GitHub Issues: [repository]/issues
- Slack/Discord: [community channel]
- Email: support@claude-flow-novice.com

**Logs**:
- Browser Console: F12 → Console tab
- Server Logs: `npm run dev:server` output
- Backend Logs: Check server log files

---

## Glossary

**Agent**: Autonomous AI entity performing specific tasks (coder, tester, reviewer, etc.)

**Swarm**: Group of coordinated agents working together on a common objective

**CFN Loop**: Consensus Formation Network Loop - multi-stage workflow for autonomous development

**WebSocket**: Real-time bidirectional communication protocol between client and server

**Zustand Store**: State management library for React components

**Gate Threshold**: Minimum confidence required for agents to pass Loop 3

**Consensus Threshold**: Minimum agreement required for validators to pass Loop 2

**Confidence Score**: Self-reported metric (0-1) indicating agent's certainty in task completion

**Virtual Scrolling**: Rendering technique for efficiently displaying large lists

**Persistence**: LocalStorage-backed state retention across browser sessions

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-12
**Maintained By**: Claude Flow Novice Documentation Team
