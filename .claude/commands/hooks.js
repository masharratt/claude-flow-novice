#!/usr/bin/env node

/**
 * Hooks Automation Slash Command
 * Usage: /hooks <action> [options]
 */

import { SlashCommand } from '../core/slash-command.js';

export class HooksCommand extends SlashCommand {
  constructor() {
    super('hooks', 'Manage automation hooks for agents and coordination');
  }

  getUsage() {
    return '/hooks <action> [options]';
  }

  getExamples() {
    return [
      '/hooks enable - Enable all automation hooks',
      '/hooks pre-task "Implement API" - Execute pre-task hook',
      '/hooks post-edit "src/api.js" - Execute post-edit hook',
      '/hooks session-start - Start coordination session',
      '/hooks session-restore swarm-123 - Restore session state',
      '/hooks notify "Task completed" - Send coordination notification',
      '/hooks status - Check hook status',
      '/hooks configure - Configure hook settings'
    ];
  }

  async execute(args, context) {
    const [action, ...params] = args;

    if (!action) {
      return this.formatResponse({
        success: false,
        error: 'Action required',
        usage: this.getUsage(),
        availableActions: [
          'enable', 'disable', 'status', 'configure',
          'pre-task', 'post-task', 'post-edit', 
          'session-start', 'session-restore', 'session-end',
          'notify', 'validate', 'format'
        ]
      });
    }

    try {
      let result;

      switch (action.toLowerCase()) {
        case 'enable':
          result = await this.enableHooks(params);
          break;
        
        case 'disable':
          result = await this.disableHooks(params);
          break;
        
        case 'status':
          result = await this.getHookStatus(params);
          break;
        
        case 'configure':
          result = await this.configureHooks(params);
          break;
        
        case 'pre-task':
          result = await this.preTaskHook(params);
          break;
        
        case 'post-task':
          result = await this.postTaskHook(params);
          break;
        
        case 'post-edit':
          result = await this.postEditHook(params);
          break;
        
        case 'session-start':
          result = await this.sessionStart(params);
          break;
        
        case 'session-restore':
          result = await this.sessionRestore(params);
          break;
        
        case 'session-end':
          result = await this.sessionEnd(params);
          break;
        
        case 'notify':
          result = await this.sendNotification(params);
          break;
        
        case 'validate':
          result = await this.validateCommand(params);
          break;
        
        case 'format':
          result = await this.formatCode(params);
          break;
        
        default:
          result = {
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: [
              'enable', 'disable', 'status', 'configure',
              'pre-task', 'post-task', 'post-edit',
              'session-start', 'session-restore', 'session-end',
              'notify', 'validate', 'format'
            ]
          };
      }

      return this.formatResponse(result);
    } catch (error) {
      return this.formatResponse({
        success: false,
        error: error.message,
        action: action
      });
    }
  }

  async enableHooks(params) {
    const [scope = 'all'] = params;
    
    console.log(`⚙️ Enabling hooks for scope: ${scope}`);

    const prompt = `
⚙️ **ENABLE AUTOMATION HOOKS**

**Scope:** ${scope}

**Execute the following bash commands to enable hooks:**

\`\`\`bash
# Enable hooks automation
npx claude-flow@alpha hooks enable --scope ${scope}

# Configure auto-assignment
npx claude-flow@alpha hooks configure --auto-assign true

# Enable code formatting
npx claude-flow@alpha hooks configure --auto-format true

# Enable neural training
npx claude-flow@alpha hooks configure --neural-training true
\`\`\`

**Hook Types Enabled:**
- ✅ Pre-task validation and preparation
- ✅ Post-edit formatting and analysis
- ✅ Session management and state persistence
- ✅ Automatic agent assignment
- ✅ Neural pattern training
- ✅ Performance monitoring

**Execute these hook enablement commands now**:
`;

    return {
      success: true,
      prompt: prompt,
      scope: scope,
      hooksEnabled: true
    };
  }

  async disableHooks(params) {
    const [scope = 'all'] = params;
    
    console.log(`❌ Disabling hooks for scope: ${scope}`);

    const prompt = `
❌ **DISABLE AUTOMATION HOOKS**

**Scope:** ${scope}

**Execute the following bash commands to disable hooks:**

\`\`\`bash
# Disable hooks automation
npx claude-flow@alpha hooks disable --scope ${scope}

# Save current state before disabling
npx claude-flow@alpha hooks session-end --export-metrics true
\`\`\`

**Execute these hook disabling commands now**:
`;

    return {
      success: true,
      prompt: prompt,
      scope: scope,
      hooksEnabled: false
    };
  }

  async getHookStatus(params) {
    console.log('📊 Checking hook status...');

    const prompt = `
📊 **HOOK STATUS CHECK**

**Check current hook configuration and status:**

\`\`\`bash
# Get hook status
npx claude-flow@alpha hooks status

# Check active sessions
npx claude-flow@alpha hooks sessions --list

# Get performance metrics
npx claude-flow@alpha hooks metrics --summary
\`\`\`

**Execute these status checks now**:
`;

    return {
      success: true,
      prompt: prompt
    };
  }

  async configureHooks(params) {
    console.log('⚙️ Configuring hooks...');

    const prompt = `
⚙️ **CONFIGURE AUTOMATION HOOKS**

**Set up hook configuration:**

\`\`\`bash
# Configure hooks interactively
npx claude-flow@alpha hooks configure

# Or set specific options:
npx claude-flow@alpha hooks configure --auto-assign true
npx claude-flow@alpha hooks configure --auto-format true
npx claude-flow@alpha hooks configure --neural-training true
npx claude-flow@alpha hooks configure --session-persistence true
\`\`\`

**Configuration Options:**
- Auto-assignment by file type
- Code formatting and validation
- Neural pattern training
- Session state persistence
- Performance monitoring
- Error handling and recovery

**Execute hook configuration now**:
`;

    return {
      success: true,
      prompt: prompt
    };
  }

  async preTaskHook(params) {
    const task = params.join(' ');
    
    if (!task) {
      return {
        success: false,
        error: 'Task description required for pre-task hook'
      };
    }

    console.log(`🚀 Executing pre-task hook for: ${task}`);

    const prompt = `
🚀 **PRE-TASK HOOK**

**Task:** ${task}

**Execute pre-task preparation:**

\`\`\`bash
# Execute pre-task hook
npx claude-flow@alpha hooks pre-task --description "${task}"

# Auto-assign agents based on task type
npx claude-flow@alpha hooks auto-assign --task "${task}"

# Prepare resources and validate environment
npx claude-flow@alpha hooks validate --command "${task}"
\`\`\`

**Pre-Task Actions:**
- ✅ Agent assignment optimization
- ✅ Resource preparation
- ✅ Environment validation
- ✅ Dependency checking
- ✅ Context setup

**Execute these pre-task hooks now**:
`;

    return {
      success: true,
      prompt: prompt,
      task: task,
      hookType: 'pre-task'
    };
  }

  async postTaskHook(params) {
    const [taskId] = params;
    
    if (!taskId) {
      return {
        success: false,
        error: 'Task ID required for post-task hook'
      };
    }

    console.log(`✅ Executing post-task hook for: ${taskId}`);

    const prompt = `
✅ **POST-TASK HOOK**

**Task ID:** ${taskId}

**Execute post-task cleanup and analysis:**

\`\`\`bash
# Execute post-task hook
npx claude-flow@alpha hooks post-task --task-id "${taskId}"

# Train neural patterns from task completion
npx claude-flow@alpha hooks neural-train --task "${taskId}"

# Update performance metrics
npx claude-flow@alpha hooks metrics --update "${taskId}"
\`\`\`

**Post-Task Actions:**
- ✅ Performance analysis
- ✅ Neural pattern training
- ✅ Metrics collection
- ✅ Resource cleanup
- ✅ State persistence

**Execute these post-task hooks now**:
`;

    return {
      success: true,
      prompt: prompt,
      taskId: taskId,
      hookType: 'post-task'
    };
  }

  async postEditHook(params) {
    const [file, memoryKey] = params;
    
    if (!file) {
      return {
        success: false,
        error: 'File path required for post-edit hook'
      };
    }

    console.log(`📝 Executing post-edit hook for: ${file}`);

    const prompt = `
📝 **POST-EDIT HOOK**

**File:** ${file}
**Memory Key:** ${memoryKey || 'auto-generated'}

**Execute post-edit processing:**

\`\`\`bash
# Execute post-edit hook
npx claude-flow@alpha hooks post-edit --file "${file}"${memoryKey ? ` --memory-key "${memoryKey}"` : ''}

# Auto-format code
npx claude-flow@alpha hooks format --file "${file}"

# Store in coordination memory
npx claude-flow@alpha hooks memory-store --file "${file}" --context "edit"
\`\`\`

**Post-Edit Actions:**
- ✅ Code formatting and validation
- ✅ Memory storage for coordination
- ✅ Syntax checking
- ✅ Style consistency
- ✅ Documentation updates

**Execute these post-edit hooks now**:
`;

    return {
      success: true,
      prompt: prompt,
      file: file,
      memoryKey: memoryKey,
      hookType: 'post-edit'
    };
  }

  async sessionStart(params) {
    const [sessionType = 'coordination'] = params;
    
    console.log(`🚀 Starting ${sessionType} session...`);

    const prompt = `
🚀 **START COORDINATION SESSION**

**Session Type:** ${sessionType}

**Initialize session:**

\`\`\`bash
# Start coordination session
npx claude-flow@alpha hooks session-start --type "${sessionType}"

# Initialize memory context
npx claude-flow@alpha hooks memory-init --session "${sessionType}-${Date.now()}"

# Set up monitoring
npx claude-flow@alpha hooks monitor-start
\`\`\`

**Session Features:**
- ✅ Cross-agent memory sharing
- ✅ State persistence
- ✅ Performance tracking
- ✅ Coordination protocols
- ✅ Error recovery

**Execute session initialization now**:
`;

    return {
      success: true,
      prompt: prompt,
      sessionType: sessionType,
      sessionId: `${sessionType}-${Date.now()}`
    };
  }

  async sessionRestore(params) {
    const [sessionId] = params;
    
    if (!sessionId) {
      return {
        success: false,
        error: 'Session ID required for restoration'
      };
    }

    console.log(`🔄 Restoring session: ${sessionId}`);

    const prompt = `
🔄 **RESTORE COORDINATION SESSION**

**Session ID:** ${sessionId}

**Restore session state:**

\`\`\`bash
# Restore session
npx claude-flow@alpha hooks session-restore --session-id "${sessionId}"

# Load memory context
npx claude-flow@alpha hooks memory-restore --session "${sessionId}"

# Resume monitoring
npx claude-flow@alpha hooks monitor-resume --session "${sessionId}"
\`\`\`

**Restoration Process:**
- ✅ Load previous state
- ✅ Restore memory context
- ✅ Resume agent coordination
- ✅ Continue task tracking
- ✅ Maintain continuity

**Execute session restoration now**:
`;

    return {
      success: true,
      prompt: prompt,
      sessionId: sessionId
    };
  }

  async sessionEnd(params) {
    const [exportMetrics = 'true'] = params;
    
    console.log('💾 Ending coordination session...');

    const prompt = `
💾 **END COORDINATION SESSION**

**Export Metrics:** ${exportMetrics}

**Gracefully end session:**

\`\`\`bash
# End session with metrics export
npx claude-flow@alpha hooks session-end --export-metrics ${exportMetrics}

# Generate session summary
npx claude-flow@alpha hooks session-summary

# Clean up resources
npx claude-flow@alpha hooks cleanup
\`\`\`

**Session Cleanup:**
- ✅ Export performance metrics
- ✅ Generate session summary
- ✅ Persist important state
- ✅ Clean up temporary resources
- ✅ Archive session data

**Execute session termination now**:
`;

    return {
      success: true,
      prompt: prompt,
      exportMetrics: exportMetrics === 'true'
    };
  }

  async sendNotification(params) {
    const message = params.join(' ');
    
    if (!message) {
      return {
        success: false,
        error: 'Message required for notification'
      };
    }

    console.log(`📢 Sending notification: ${message}`);

    const prompt = `
📢 **SEND COORDINATION NOTIFICATION**

**Message:** ${message}

**Send notification to swarm:**

\`\`\`bash
# Send notification
npx claude-flow@alpha hooks notify --message "${message}"

# Update coordination status
npx claude-flow@alpha hooks status-update --message "${message}"
\`\`\`

**Execute notification now**:
`;

    return {
      success: true,
      prompt: prompt,
      message: message
    };
  }

  async validateCommand(params) {
    const command = params.join(' ');
    
    if (!command) {
      return {
        success: false,
        error: 'Command required for validation'
      };
    }

    console.log(`✅ Validating command: ${command}`);

    const prompt = `
✅ **VALIDATE COMMAND**

**Command:** ${command}

**Validate command safety and requirements:**

\`\`\`bash
# Validate command
npx claude-flow@alpha hooks validate --command "${command}"
\`\`\`

**Execute validation now**:
`;

    return {
      success: true,
      prompt: prompt,
      command: command
    };
  }

  async formatCode(params) {
    const [file] = params;
    
    if (!file) {
      return {
        success: false,
        error: 'File path required for formatting'
      };
    }

    console.log(`🎨 Formatting code: ${file}`);

    const prompt = `
🎨 **FORMAT CODE**

**File:** ${file}

**Auto-format and validate code:**

\`\`\`bash
# Format code
npx claude-flow@alpha hooks format --file "${file}"
\`\`\`

**Execute code formatting now**:
`;

    return {
      success: true,
      prompt: prompt,
      file: file
    };
  }
}

export default HooksCommand;
