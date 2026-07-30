#!/usr/bin/env bash
# CFN Status Line: provider | ctx% | git | diff stats | duration | worktree

input=$(cat)

# --- Provider + model detection ---
model_id=$(echo "$input" | jq -r '.model.id // empty' 2>/dev/null || true)
if echo "$model_id" | grep -q "^claude-"; then
  provider="Anthropic"
elif [ -n "$model_id" ]; then
  provider="ZAI"
else
  provider=""
fi

# Short model name: claude-opus-4-6 -> Opus4.6, glm-5.1 -> glm-5.1
model_short=""
if [ -n "$model_id" ]; then
  case "$model_id" in
    claude-opus-*)    model_short="Opus${model_id##claude-opus-}" ;;
    claude-sonnet-*)  model_short="Sonnet${model_id##claude-sonnet-}" ;;
    claude-haiku-*)   model_short="Haiku${model_id##claude-haiku-}" ;;
    claude-*)         model_short="$model_id" ;;
    *)                model_short="$model_id" ;;
  esac
  # Normalize dashes in version: 4-6 -> 4.6
  model_short=$(echo "$model_short" | sed 's/\([0-9]\)-\([0-9]\)/\1.\2/g')
fi

# Append 1M if context window is >= 1,000,000
ctx_size=$(echo "$input" | jq -r '.context_window.context_window_size // empty' 2>/dev/null || true)
if [ -n "$ctx_size" ] && [ "$ctx_size" -ge 1000000 ] 2>/dev/null; then
  model_short="${model_short}[1M]"
fi

# --- Context window with color thresholds ---
ctx_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null || true)
ctx_part=""
if [ -n "$ctx_pct" ]; then
  if [ "$ctx_pct" -gt 85 ] 2>/dev/null; then
    ctx_part="\033[31mctx:${ctx_pct}%\033[0m"
  elif [ "$ctx_pct" -gt 50 ] 2>/dev/null; then
    ctx_part="\033[33mctx:${ctx_pct}%\033[0m"
  else
    ctx_part="\033[32mctx:${ctx_pct}%\033[0m"
  fi
fi

# --- Git branch + dirty indicator ---
cwd=$(echo "$input" | jq -r '.cwd // empty' 2>/dev/null || true)
git_part=""
if [ -n "$cwd" ] && [ -d "$cwd/.git" ] || git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
  branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
  if [ -n "$branch" ]; then
    dirty=""
    if [ -n "$(git -C "$cwd" status --porcelain 2>/dev/null | head -1)" ]; then
      dirty="*"
    fi
    ahead=$(git -C "$cwd" rev-list --count @{u}..HEAD 2>/dev/null || echo "")
    ahead_part=""
    if [ -n "$ahead" ] && [ "$ahead" -gt 0 ] 2>/dev/null; then
      ahead_part=" ↑${ahead}"
    fi
    git_part="${branch}${dirty}${ahead_part}"
  fi
fi

# --- Diff stats (lines added/removed this session) ---
lines_added=$(echo "$input" | jq -r '.cost.total_lines_added // empty' 2>/dev/null || true)
lines_removed=$(echo "$input" | jq -r '.cost.total_lines_removed // empty' 2>/dev/null || true)
diff_part=""
if [ -n "$lines_added" ] || [ -n "$lines_removed" ]; then
  diff_part="+${lines_added:-0}/-${lines_removed:-0}"
fi

# --- Session duration ---
duration_ms=$(echo "$input" | jq -r '.cost.total_duration_ms // empty' 2>/dev/null || true)
dur_part=""
if [ -n "$duration_ms" ] && [ "$duration_ms" -gt 0 ] 2>/dev/null; then
  total_sec=$((duration_ms / 1000))
  if [ "$total_sec" -ge 3600 ]; then
    dur_part="$((total_sec / 3600))h$((total_sec % 3600 / 60))m"
  elif [ "$total_sec" -ge 60 ]; then
    dur_part="$((total_sec / 60))m"
  else
    dur_part="${total_sec}s"
  fi
fi

# --- Worktree indicator ---
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // empty' 2>/dev/null || true)
wt_part=""
if [ -n "$cwd" ] && [ -n "$project_dir" ] && [ "$cwd" != "$project_dir" ]; then
  wt_name=$(basename "$cwd")
  wt_part="wt:${wt_name}"
elif [ -n "$cwd" ] && [ -f "$cwd/.git" ]; then
  # .git is a file (not dir) in worktrees
  wt_name=$(basename "$cwd")
  wt_part="wt:${wt_name}"
fi

# --- Current task (optional) ---
# Source precedence: project ($cwd/.claude/current-task.txt) overrides global
# (~/.claude/current-task.txt). One line, written by session when work starts.
task=$(head -1 "$cwd/.claude/current-task.txt" 2>/dev/null | tr -d '\r\n')
[ -z "$task" ] && task=$(head -1 "$HOME/.claude/current-task.txt" 2>/dev/null | tr -d '\r\n')
task_part=""
if [ -n "$task" ]; then
  # Truncate to 50 chars so the rest of the line still fits
  if [ ${#task} -gt 50 ]; then
    task="${task:0:49}…"
  fi
  task_part="\033[36m» ${task}\033[0m"
fi

# --- Assemble ---
parts="$task_part"
[ -n "$provider" ] && parts="${parts:+$parts  }${provider}"
[ -n "$model_short" ] && parts="${parts:+$parts }${model_short}"
[ -n "$ctx_part" ] && parts="${parts:+$parts  }${ctx_part}"
[ -n "$git_part" ] && parts="${parts:+$parts  }${git_part}"
[ -n "$diff_part" ] && parts="${parts:+$parts  }${diff_part}"
[ -n "$dur_part" ] && parts="${parts:+$parts  }${dur_part}"
[ -n "$wt_part" ] && parts="${parts:+$parts  }${wt_part}"

printf "%b" "$parts"
