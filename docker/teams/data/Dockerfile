# Data Team Agent Image
# Optimized for: Python data science, ML, analytics, Jupyter notebooks

FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME=data
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="data-003"
LABEL maintainer="data-team@company.com"
LABEL description="Data team agent with Python data science stack, Jupyter, Spark"

# Switch to root for installations
USER root

# Install Python 3.11 and data science system dependencies
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    gcc \
    g++ \
    gfortran \
    musl-dev \
    linux-headers \
    lapack-dev \
    openblas-dev \
    jpeg-dev \
    zlib-dev \
    freetype-dev \
    lcms2-dev \
    openjpeg-dev \
    tiff-dev \
    tk-dev \
    tcl-dev \
    harfbuzz-dev \
    fribidi-dev \
    && rm -rf /var/cache/apk/*

# Copy dependency files
COPY requirements.txt ./

# Install Python data science stack
# Note: Large libraries like numpy, pandas, scipy
RUN pip3 install --no-cache-dir -r requirements.txt

# Install Jupyter and extensions
RUN pip3 install --no-cache-dir \
    jupyterlab==4.0.9 \
    jupyterlab-git \
    ipywidgets

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
