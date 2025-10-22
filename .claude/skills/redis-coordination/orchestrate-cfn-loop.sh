function inject_validator_feedback_to_context() {
  local task_id="$1"
  local iteration="$2"
  local original_context="$3"

  # Extract validator feedback from previous iterations
  if [[ "$iteration" -gt 1 ]]; then
    local validator_history=$(redis-cli lrange "swarm:${task_id}:validator:history" 0 9)

    if [[ -n "$validator_history" ]]; then
      # Prepend validator history to context
      echo "Validator Feedback from Previous Iterations:
${validator_history}

Original Context:
${original_context}"
    else
      echo "${original_context}"
    fi
  else
    echo "${original_context}"
  fi
}