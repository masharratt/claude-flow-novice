#!/bin/bash
# Data team initialization script
# Sourced by base entrypoint.sh before agent execution

set -euo pipefail

log "INFO" "Running data team initialization"

# Validate Python environment
if ! python3 --version >/dev/null 2>&1; then
    log "ERROR" "Python 3 not available"
    exit 1
fi

# Validate core data science libraries
if ! python3 -c "import numpy, pandas, sklearn" 2>/dev/null; then
    log "ERROR" "Core data science libraries not available"
    exit 1
fi

# Create standard data directories if they don't exist
DATA_DIRS=(
    "/workspace/data/raw"
    "/workspace/data/processed"
    "/workspace/models"
    "/workspace/notebooks"
    "/workspace/outputs"
)

for dir in "${DATA_DIRS[@]}"; do
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        log "INFO" "Created directory: $dir"
    fi
done

# Check if workspace has requirements.txt and install additional dependencies
if [[ -f /workspace/requirements.txt ]]; then
    log "INFO" "Found workspace requirements.txt, checking for additional dependencies"
    # Only install if different from image dependencies
    if ! diff -q /workspace/requirements.txt /app/requirements.txt >/dev/null 2>&1; then
        log "INFO" "Installing workspace-specific dependencies"
        pip3 install --no-cache-dir -r /workspace/requirements.txt
    fi
fi

# Check if Jupyter notebooks exist
NOTEBOOK_COUNT=$(find /workspace/notebooks -name "*.ipynb" 2>/dev/null | wc -l)
if [[ "$NOTEBOOK_COUNT" -gt 0 ]]; then
    log "INFO" "Found $NOTEBOOK_COUNT Jupyter notebook(s)"
fi

# Check for ML models
MODEL_COUNT=$(find /workspace/models -type f \( -name "*.pkl" -o -name "*.h5" -o -name "*.pt" \) 2>/dev/null | wc -l)
if [[ "$MODEL_COUNT" -gt 0 ]]; then
    log "INFO" "Found $MODEL_COUNT ML model file(s)"
fi

# Set matplotlib to non-interactive backend for agent use
export MPLBACKEND=Agg
log "INFO" "Set matplotlib backend to Agg (non-interactive)"

# Set optimal numpy/pandas settings for agent use
export OPENBLAS_NUM_THREADS=2
export MKL_NUM_THREADS=2
export NUMEXPR_NUM_THREADS=2
log "INFO" "Set optimal threading for numerical libraries"

log "INFO" "Data team initialization complete"
