#!/usr/bin/env bash
# Tests for .claude/skills/cfn-codesearch/bin/local-codesearch-gpu.
#
# The GPU build links libonnxruntime.so dynamically, so the wrapper must put
# the runtime libraries on the loader path, and must exit 127 when they are
# missing: the post-commit hook treats 127 as "GPU cannot start" and reruns
# the CPU binary (2026-10-30, machines without a GPU such as the VPS).
#
# Fake binary and fake library dir; the real GPU binary is never run.
#
# Run: bash tests/test-codesearch-gpu-wrapper.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAPPER="$REPO_ROOT/.claude/skills/cfn-codesearch/bin/local-codesearch-gpu"
source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-cs-gpu.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$WORK"' EXIT

SHARE="$WORK/share"
BIN="$WORK/fake.bin"
cat > "$BIN" <<'EOF'
#!/usr/bin/env bash
echo "LD=$LD_LIBRARY_PATH"
echo "ARGS=$*"
EOF
chmod +x "$BIN"

run() { CODESEARCH_GPU_BIN="$1" CODESEARCH_SHARE_DIR="$SHARE" bash "$WRAPPER" index --path src 2>&1; }

# 1. Missing binary: exit 127.
OUT=$(run "$WORK/none.bin"); RC=$?
[ "$RC" = 127 ] && ok "missing binary exits 127" || bad "missing binary rc=$RC out='$OUT'"

# 2. Missing onnxruntime library: exit 127, names the file.
OUT=$(run "$BIN"); RC=$?
[ "$RC" = 127 ] && [[ "$OUT" == *libonnxruntime.so* ]] && ok "missing onnxruntime exits 127" \
  || bad "missing ort rc=$RC out='$OUT'"

# 3. Libraries present: execs the binary with args, ort and cuda dirs on the path.
mkdir -p "$SHARE/ort" "$SHARE/cuda/nvidia/cublas/lib"
: > "$SHARE/ort/libonnxruntime.so"
OUT=$(run "$BIN"); RC=$?
[ "$RC" = 0 ] && [[ "$OUT" == *"ARGS=index --path src"* ]] && ok "execs binary with args" \
  || bad "exec rc=$RC out='$OUT'"
[[ "$OUT" == *"LD=$SHARE/ort:$SHARE/cuda/nvidia/cublas/lib"* ]] && ok "library path set" \
  || bad "library path: '$OUT'"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
