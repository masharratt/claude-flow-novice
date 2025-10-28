#!/usr/bin/env bash
# Install lizard complexity analyzer

echo "Installing lizard..."

# Try pipx first (isolated install)
if command -v pipx >/dev/null 2>&1; then
    echo "Using pipx..."
    pipx install lizard
    exit 0
fi

# Try pip with user install
if command -v pip3 >/dev/null 2>&1; then
    echo "Using pip3 --user..."
    pip3 install --user lizard

    # Add to PATH if needed
    PYTHON_USER_BASE=$(python3 -m site --user-base)
    export PATH="$PYTHON_USER_BASE/bin:$PATH"

    echo ""
    echo "Add to your ~/.bashrc or ~/.zshrc:"
    echo "export PATH=\"$PYTHON_USER_BASE/bin:\$PATH\""
    exit 0
fi

# Try pip
if command -v pip >/dev/null 2>&1; then
    echo "Using pip --user..."
    pip install --user lizard
    exit 0
fi

echo "Error: No Python package manager found"
echo "Install pipx: sudo apt-get install pipx"
exit 1
