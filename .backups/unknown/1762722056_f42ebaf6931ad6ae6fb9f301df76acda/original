#!/bin/bash

# Container Cleanup Validation Test Runner
# 验证容器清理机制的专用测试工具

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Parse arguments
VERBOSE=false
EMERGENCY_CLEANUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --emergency-cleanup)
            EMERGENCY_CLEANUP=true
            shift
            ;;
        --help)
            cat << EOF
Container Cleanup Validation Test Runner

Usage: $0 [OPTIONS]

Options:
  --verbose              Enable verbose logging
  --emergency-cleanup    Only perform emergency cleanup of existing test resources
  --help                 Show this help message

Description:
  验证容器清理机制，确保没有孤儿容器和workspace泄漏。

  Tests:
  1. 记录测试前的系统状态
  2. 创建测试容器和workspace
  3. 模拟容器生命周期和清理
  4. 验证自动清理机制
  5. 手动清理剩余资源
  6. 生成详细的清理报告

EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log "🧹 Container Cleanup Validation"
log "Project root: ${PROJECT_ROOT}"

# 检查Docker是否可用
if ! command -v docker &> /dev/null; then
    log_error "Docker not found."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon not running."
    exit 1
fi

# 仅执行紧急清理
if [[ "$EMERGENCY_CLEANUP" == true ]]; then
    log "🚨 Performing emergency cleanup only..."

    # 清理测试容器
    log "清理测试容器..."
    docker ps -a --filter "name=agent-test-cleanup" --format "{{.ID}} {{.Names}}" 2>/dev/null | while read -r container_id name; do
        if [[ -n "$container_id" ]]; then
            log "停止并删除: $name ($container_id)"
            docker stop "$container_id" 2>/dev/null || true
            docker rm "$container_id" 2>/dev/null || true
        fi
    done

    # 清理测试workspace
    log "清理测试workspace..."
    find /tmp -name "agent-workspace-test-cleanup-*" -type d 2>/dev/null | while read -r workspace; do
        if [[ -n "$workspace" ]]; then
            log "删除workspace: $workspace"
            rm -rf "$workspace" 2>/dev/null || true
        fi
    done

    # 清理context测试资源
    log "清理context测试资源..."
    find /tmp -name "context-test-workspace" -type d 2>/dev/null | while read -r workspace; do
        if [[ -n "$workspace" ]]; then
            log "删除context workspace: $workspace"
            rm -rf "$workspace" 2>/dev/null || true
        fi
    done

    # 清理并发测试资源
    log "清理并发测试资源..."
    find /tmp -name "concurrent-test-workspace" -type d 2>/dev/null | while read -r workspace; do
        if [[ -n "$workspace" ]]; then
            log "删除concurrent workspace: $workspace"
            rm -rf "$workspace" 2>/dev/null || true
        fi
    done

    log_success "紧急清理完成"
    exit 0
fi

# 创建测试结果目录
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results/cleanup-validation"
mkdir -p "$TEST_RESULTS_DIR"

# 记录测试前的系统状态
log "📊 记录测试前状态..."

BEFORE_CONTAINERS=$(docker ps -a --filter "name=agent-" --format "{{.ID}}\t{{.Names}}\t{{.Status}}" 2>/dev/null | wc -l)
BEFORE_WORKSPACES=$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | wc -l)

log "测试前状态:"
log "  现有agent容器: $BEFORE_CONTAINERS"
log "  现有workspace: $BEFORE_WORKSPACES"

# 保存测试前状态
cat > "${TEST_RESULTS_DIR}/before-state.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "containers": {
    "count": $BEFORE_CONTAINERS,
    "details": "$(docker ps -a --filter "name=agent-" --format "{{.ID}} {{.Names}} {{.Status}}" 2>/dev/null | tr '\n' ';' | sed 's/;$/\\n/' | head -c 1000)"
  },
  "workspaces": {
    "count": $BEFORE_WORKSPACES,
    "details": "$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | head -10 | tr '\n' ';')"
  }
}
EOF

# 运行清理验证测试
log "🧪 运行容器清理验证测试..."
cd "$PROJECT_ROOT"

# 设置环境变量
export NODE_OPTIONS="--max-old-space-size=2048"

# 执行测试
TEST_START_TIME=$(date +%s)

if node "${SCRIPT_DIR}/container-cleanup-validator.js" 2>&1 | tee "${TEST_RESULTS_DIR}/validation-output.log"; then
    TEST_EXIT_CODE=0
    TEST_STATUS="PASSED"
    log_success "容器清理验证通过"
else
    TEST_EXIT_CODE=$?
    TEST_STATUS="FAILED"
    log_error "容器清理验证失败 (exit code: $TEST_EXIT_CODE)"
fi

TEST_END_TIME=$(date +%s)
TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))

# 记录测试后的状态
log "📊 记录测试后状态..."

AFTER_CONTAINERS=$(docker ps -a --filter "name=agent-" --format "{{.ID}}\t{{.Names}}\t{{.Status}}" 2>/dev/null | wc -l)
AFTER_WORKSPACES=$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | wc -l)

log "测试后状态:"
log "  剩余agent容器: $AFTER_CONTAINERS"
log "  剩余workspace: $AFTER_WORKSPACES"

# 保存测试后状态
cat > "${TEST_RESULTS_DIR}/after-state.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "containers": {
    "count": $AFTER_CONTAINERS,
    "details": "$(docker ps -a --filter "name=agent-" --format "{{.ID}} {{.Names}} {{.Status}}" 2>/dev/null | tr '\n' ';' | sed 's/;$/\\n/' | head -c 1000)"
  },
  "workspaces": {
    "count": $AFTER_WORKSPACES,
    "details": "$(find /tmp -name "agent-workspace-*" -type d 2>/dev/null | head -10 | tr '\n' ';')"
  }
}
EOF

# 保存测试总结
cat > "${TEST_RESULTS_DIR}/test-summary.json" << EOF
{
  "testSuite": "Container Cleanup Validation",
  "timestamp": "$(date -Iseconds)",
  "duration": ${TEST_DURATION},
  "status": "${TEST_STATUS}",
  "exitCode": ${TEST_EXIT_CODE},
  "beforeState": {
    "containers": $BEFORE_CONTAINERS,
    "workspaces": $BEFORE_WORKSPACES
  },
  "afterState": {
    "containers": $AFTER_CONTAINERS,
    "workspaces": $AFTER_WORKSPACES
  },
  "netChange": {
    "containers": $(($AFTER_CONTAINERS - $BEFORE_CONTAINERS)),
    "workspaces": $(($AFTER_WORKSPACES - $BEFORE_WORKSPACES))
  },
  "outputLog": "validation-output.log",
  "projectRoot": "${PROJECT_ROOT}"
}
EOF

log "📊 测试完成，用时 ${TEST_DURATION} 秒"
log "📄 结果保存到: ${TEST_RESULTS_DIR}/"

# 显示最终状态
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
    log_success "✅ 容器清理验证通过"
    echo ""
    echo "验证结果:"
    echo "  - 容器自动清理机制: 正常工作"
    echo "  - Workspace自动清理: 正常工作"
    echo "  - 清理及时性: 符合要求"
    echo "  - 无资源泄漏: 验证通过"
    echo ""
    echo "建议:"
    echo "  - 定期运行此测试验证清理机制"
    echo "  - 在CI/CD中集成此测试"
    echo "  - 监控生产环境的容器清理"
else
    log_error "❌ 容器清理验证失败"
    echo ""
    echo "问题检测:"
    echo "  - 容器清理机制可能存在问题"
    echo "  - Workspace清理不完整"
    echo "  - 清理延迟过长"
    echo "  - 资源泄漏风险"
    echo ""
    echo "立即行动:"
    echo "  - 检查详细日志: ${TEST_RESULTS_DIR}/validation-output.log"
    echo "  - 手动清理剩余资源: ${SCRIPT_DIR}/run-cleanup-validation.sh --emergency-cleanup"
    echo "  - 修复spawn-agent.sh中的清理机制"
    echo "  - 添加容器生命周期管理"
fi

# 如果有资源泄漏，警告用户
if [[ $(($AFTER_CONTAINERS - $BEFORE_CONTAINERS)) -gt 0 ]] || [[ $(($AFTER_WORKSPACES - $BEFORE_WORKSPACES)) -gt 0 ]]; then
    log_warning "⚠️ 检测到资源泄漏！"
    echo ""
    echo "资源泄漏详情:"
    echo "  新增容器: $(($AFTER_CONTAINERS - $BEFORE_CONTAINERS))"
    echo "  新增workspace: $(($AFTER_WORKSPACES - $BEFORE_WORKSPACES))"
    echo ""
    echo "紧急清理命令:"
    echo "  ${SCRIPT_DIR}/run-cleanup-validation.sh --emergency-cleanup"
fi

exit $TEST_EXIT_CODE