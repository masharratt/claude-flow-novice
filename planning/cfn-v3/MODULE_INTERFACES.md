# CFN Loop Orchestrator Module Interfaces

## Core Interface Principles
- Use environment variables for configuration
- Standardized return codes
- Minimal side effects
- Clear input/output contracts

## 1. Core Orchestration Module
### File: `core_orchestration.sh`

#### Inputs (Environment Variables)
- `CFN_LOOP_TASK_ID`: Unique task identifier
- `CFN_LOOP_MODE`: Execution mode (standard/epic/single)
- `CFN_MAX_ITERATIONS`: Maximum iteration limit
- `CFN_LOOP_CONTEXT_FILE`: JSON context file path

#### Exported Functions
```bash
orchestrate_cfn_loop() {
    # Main orchestration entry point
    # Returns: 0 (success), 1-255 (specific error codes)
}

get_current_iteration() {
    # Returns current iteration number
}

signal_loop_progression() {
    # Signals transition between Loop 3, Loop 2, Product Owner
}
```

#### Error Codes
- `0`: Successful completion
- `1`: Configuration error
- `2`: Context loading failure
- `3`: Loop 3 implementation failed
- `4`: Loop 2 validation failed
- `5`: Product Owner rejection

## 2. Loop 3 Module
### File: `loop3_module.sh`

#### Inputs
- `CFN_LOOP_3_AGENTS`: Comma-separated implementer agents
- `CFN_CONTEXT_FILE`: Detailed context JSON

#### Exported Functions
```bash
execute_loop_3_agents() {
    # Spawn and manage Loop 3 implementer agents
    # Returns confidence score
}

calculate_loop_3_confidence() {
    # Aggregate confidence from Loop 3 agents
}

trigger_loop_3_iteration() {
    # Restart Loop 3 with specific feedback
}
```

## 3. Loop 2 Module
### File: `loop2_module.sh`

#### Inputs
- `CFN_LOOP_2_AGENTS`: Comma-separated validator agents
- `CFN_LOOP_3_RESULTS`: Loop 3 implementation results

#### Exported Functions
```bash
execute_loop_2_validation() {
    # Spawn and manage Loop 2 validator agents
    # Returns consensus score
}

calculate_consensus() {
    # Compute validator consensus
}

generate_validator_feedback() {
    # Create structured feedback for next iteration
}
```

## 4. Product Owner Module
### File: `product_owner_module.sh`

#### Inputs
- `CFN_LOOP_RESULTS`: Aggregated Loop 2 results
- `CFN_ACCEPTANCE_CRITERIA`: JSON acceptance criteria

#### Exported Functions
```bash
evaluate_deliverables() {
    # Check if deliverables meet acceptance criteria
    # Returns: proceed/iterate/abort
}

generate_strategic_feedback() {
    # Provide high-level strategic guidance
}
```

## 5. Context Management Module
### File: `context_manager.sh`

#### Exported Functions
```bash
load_epic_context() {
    # Load epic-level context from Redis/file
}

store_iteration_context() {
    # Store current iteration context
}

inject_context_to_agent() {
    # Prepare context for specific agent spawn
}
```

## 6. Metrics & Logging Module
### File: `metrics_logger.sh`

#### Exported Functions
```bash
log_iteration_metrics() {
    # Record performance, confidence scores
}

export_iteration_report() {
    # Generate structured iteration report
}

track_agent_performance() {
    # Aggregate agent-level performance metrics
}
```

## 7. Configuration Module
### File: `config_loader.sh`

#### Exported Functions
```bash
validate_configuration() {
    # Validate all input parameters
}

load_environment_config() {
    # Load dynamic configuration
}

set_default_parameters() {
    # Set sensible defaults
}
```

## Shared State Management

### Redis Key Patterns
- `cfn_loop:{task_id}:context`: Full task context
- `cfn_loop:{task_id}:iteration:{n}`: Per-iteration state
- `cfn_loop:{task_id}:metrics`: Performance metrics

### Recommended Practices
- Use atomic Redis operations
- Implement proper locking mechanisms
- Use TTL for temporary keys
- Provide cleanup functions

## Hook System Interfaces

### Hook Registration
```bash
register_hook() {
    # hook_type, hook_script_path
}

execute_hooks() {
    # Execute hooks for specific stage
}
```

### Hook Types
- `pre_iteration`
- `post_loop3`
- `post_loop2`
- `post_iteration`
- `cleanup`