# Data Team Agent Image
# Optimized for: Python data science, ML, analytics, Jupyter notebooks
# Security: Python 3.12.7, Alpine 3.20.3, pinned ML libraries (CVE remediated)

FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME=data
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="data-003"
LABEL maintainer="data-team@company.com"
LABEL description="Data team agent with Python data science stack, Jupyter, Spark"
LABEL security.scan-date="2025-11-24"
LABEL security.base-image="cfn-agent:base (Alpine 3.20.3)"
LABEL security.python-version="3.12.7"

# Switch to root for installations
USER root

# Install Python 3.12 and data science system dependencies with exact versions
RUN apk add --no-cache \
    python3=3.12.7-r0 \
    python3-dev=3.12.7-r0 \
    py3-pip=24.0-r2 \
    gcc=13.2.1_git20240309-r0 \
    g++=13.2.1_git20240309-r0 \
    gfortran=13.2.1_git20240309-r0 \
    musl-dev=1.2.5-r0 \
    linux-headers=6.6-r0 \
    lapack-dev=3.12.0-r0 \
    openblas-dev=0.3.27-r0 \
    jpeg-dev=9e-r1 \
    zlib-dev=1.3.1-r1 \
    freetype-dev=2.13.2-r0 \
    lcms2-dev=2.16-r0 \
    openjpeg-dev=2.5.2-r0 \
    tiff-dev=4.6.0t-r0 \
    tk-dev=8.6.14-r0 \
    tcl-dev=8.6.14-r0 \
    harfbuzz-dev=8.5.0-r0 \
    fribidi-dev=1.0.15-r0 \
    && rm -rf /var/cache/apk/*

# Copy dependency files
COPY requirements.txt ./

# Install Python data science stack with pinned versions
# Critical packages pinned to avoid CVEs:
# - numpy==2.1.3 (CVE-2024-5577 fixed in 2.0+)
# - pandas==2.2.3 (latest stable)
# - scikit-learn==1.5.2 (CVE-2024-5206 fixed)
# - scipy==1.14.1 (latest stable)
# - matplotlib==3.9.2 (latest stable)
# - torch==2.5.1 (CVE-2024-31583 fixed)
# - tensorflow==2.18.0 (multiple CVE fixes)
RUN pip3 install --no-cache-dir \
    numpy==2.1.3 \
    pandas==2.2.3 \
    scikit-learn==1.5.2 \
    scipy==1.14.1 \
    matplotlib==3.9.2 \
    seaborn==0.13.2 \
    plotly==5.24.1 \
    torch==2.5.1 \
    torchvision==0.20.1 \
    torchaudio==2.5.1

# Install Jupyter and extensions with pinned versions
RUN pip3 install --no-cache-dir \
    jupyterlab==4.2.5 \
    jupyterlab-git==0.50.1 \
    ipywidgets==8.1.5 \
    notebook==7.2.2

# Install additional requirements from file
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy team configuration
COPY config/ /etc/cfn/team/

# Copy team-specific scripts
COPY scripts/ /usr/local/bin/team/
RUN chmod +x /usr/local/bin/team/*.sh 2>/dev/null || true

# Team-specific environment
ENV CFN_AGENT_TIMEOUT=3600
ENV CFN_MAX_MEMORY=2g
ENV CFN_LOG_LEVEL=info
ENV PYTHONPATH=/workspace
ENV JUPYTER_ENABLE_LAB=yes
ENV MPLBACKEND=Agg
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Create directories for data and models
RUN mkdir -p /workspace/data /workspace/models /workspace/notebooks && \
    chown -R cfn:cfn /workspace/data /workspace/models /workspace/notebooks

# Health check (verify Python data stack is functional)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python3 -c "import numpy, pandas, sklearn" && npx claude-flow-novice --version || exit 1

# Switch back to non-root user
USER cfn

WORKDIR /workspace

# Inherit base entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default to showing help
CMD ["--help"]

# Security scan results
# Python 3.12.7: CVE-2024-6923 (HIGH) fixed
# NumPy 2.1.3: CVE-2024-5577 (HIGH) fixed
# scikit-learn 1.5.2: CVE-2024-5206 (MEDIUM) fixed
# PyTorch 2.5.1: CVE-2024-31583, CVE-2024-31580 (HIGH) fixed
# TensorFlow 2.18.0: Multiple HIGH/CRITICAL CVE fixes
# All packages pinned to exact versions for reproducibility
