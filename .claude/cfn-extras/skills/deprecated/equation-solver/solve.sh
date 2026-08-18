#!/usr/bin/env bash
################################################################################
# equation-solver/solve.sh
# Securely solves algebraic equations using nerdamer
#
# Features:
# - Whitelist-based input validation
# - Template injection prevention
# - Safe temporary file handling
# - Command injection prevention
# - Proper error handling and cleanup
#
# Usage: ./solve.sh "equation" [variable]
# Example: ./solve.sh "x^2 + 5x + 6 = 0" "x"
################################################################################

set -euo pipefail

# Enable strict error handling
trap 'rm -f "$TEMP_FILE" 2>/dev/null; exit 1' ERR
trap 'rm -f "$TEMP_FILE" 2>/dev/null' EXIT

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MAX_EQUATION_LENGTH=500
readonly MAX_VARIABLE_LENGTH=20

# Initialize variables
EQUATION=""
VARIABLE="x"
TEMP_FILE=""

################################################################################
# Function: is_valid_char
# Checks if a single character is allowed in an equation
################################################################################
is_valid_char() {
    local char="$1"
    case "$char" in
        [a-zA-Z0-9]) return 0 ;;
        "+"|"*"|"/"|"."|"="|" "|"-"|"^") return 0 ;;
        "("|")") return 0 ;;
        *) return 1 ;;
    esac
}

################################################################################
# Function: validate_expression
# Validates equation against whitelist of safe characters
################################################################################
validate_expression() {
    local expr="$1"

    if [[ -z "$expr" ]]; then
        echo "Error: Equation cannot be empty" >&2
        return 1
    fi

    if (( ${#expr} > MAX_EQUATION_LENGTH )); then
        echo "Error: Equation too long (max $MAX_EQUATION_LENGTH characters)" >&2
        return 1
    fi

    # Character validation
    local i
    for (( i=0; i<${#expr}; i++ )); do
        local char="${expr:$i:1}"
        if ! is_valid_char "$char"; then
            echo "Error: Equation contains invalid character: '$char'" >&2
            echo "Allowed: alphanumeric, +, -, *, /, ^, (), ., =, spaces" >&2
            return 1
        fi
    done

    # Dangerous pattern detection
    if grep -qE '[;`$'"'"'"|&<>\\]|process\.|require|eval|exec' <<< "$expr"; then
        echo "Error: Equation contains prohibited patterns" >&2
        return 1
    fi

    # Parentheses balancing
    local open_parens=0
    for (( i=0; i<${#expr}; i++ )); do
        local pchar="${expr:$i:1}"
        if [[ "$pchar" == "(" ]]; then
            (( open_parens++ ))
        elif [[ "$pchar" == ")" ]]; then
            (( open_parens-- ))
            if (( open_parens < 0 )); then
                echo "Error: Unbalanced parentheses in equation" >&2
                return 1
            fi
        fi
    done

    if (( open_parens != 0 )); then
        echo "Error: Unbalanced parentheses in equation" >&2
        return 1
    fi

    return 0
}

################################################################################
# Function: validate_variable
# Validates variable name against whitelist
################################################################################
validate_variable() {
    local var="$1"

    if [[ -z "$var" ]]; then
        echo "Error: Variable name cannot be empty" >&2
        return 1
    fi

    if (( ${#var} > MAX_VARIABLE_LENGTH )); then
        echo "Error: Variable name too long (max $MAX_VARIABLE_LENGTH characters)" >&2
        return 1
    fi

    # Must start with letter or underscore, contain only alphanumeric and underscore
    local first_char="${var:0:1}"
    case "$first_char" in
        [a-zA-Z_]) ;;
        *)
            echo "Error: Variable must start with letter or underscore" >&2
            return 1
            ;;
    esac

    # Check remaining characters
    local i
    for (( i=0; i<${#var}; i++ )); do
        local char="${var:$i:1}"
        case "$char" in
            [a-zA-Z0-9_]) ;;
            *)
                echo "Error: Variable contains invalid character: '$char'" >&2
                return 1
                ;;
        esac
    done

    return 0
}

################################################################################
# Function: create_safe_temp_file
# Creates a secure temporary file with proper permissions
################################################################################
create_safe_temp_file() {
    TEMP_FILE=$(mktemp -t equation-solver.XXXXXXXXXX.cjs) || {
        echo "Error: Failed to create temporary file" >&2
        return 1
    }

    chmod 600 "$TEMP_FILE" || {
        echo "Error: Failed to set temporary file permissions" >&2
        rm -f "$TEMP_FILE"
        return 1
    }

    return 0
}

################################################################################
# Function: solve_equation
# Solves the equation using nerdamer
################################################################################
solve_equation() {
    local equation="$1"
    local variable="$2"

    create_safe_temp_file || return 1

    # Write Node.js script to temp file
    # Using full path to nerdamer since we're running from any directory
    local node_modules_dir="$SCRIPT_DIR/node_modules"

    cat > "$TEMP_FILE" << 'NODEJS_SCRIPT'
(function() {
  'use strict';

  try {
    // Load nerdamer - use NODE_PATH for module resolution
    const path = require('path');
    const nm = process.env.NM_PATH;

    // Load nerdamer core
    const nerdamer = require(path.join(nm, 'nerdamer'));

    // Load additional modules by requiring the actual JS files
    require(path.join(nm, 'nerdamer', 'Algebra.js'));
    require(path.join(nm, 'nerdamer', 'Solve.js'));
    require(path.join(nm, 'nerdamer', 'Extra.js'));

    const equation = process.argv[2];
    const variable = process.argv[3];

    // Basic validation in Node context
    if (!/^[a-zA-Z0-9+*\/(). ^=\-]*$/.test(equation)) {
      console.error('Error: Invalid equation');
      process.exit(1);
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable)) {
      console.error('Error: Invalid variable');
      process.exit(1);
    }

    // Parse and solve using nerdamer
    const result = nerdamer.solve(equation, variable);

    // nerdamer.solve() returns an object with a text() method
    // text() returns a string like "[3]" or "[-2,-3]"
    const solutionText = result.text();

    // Parse the text output (format: "[sol1,sol2,...]" or "[sol]")
    let solutions = [];
    try {
      // Extract content between brackets
      const match = solutionText.match(/^\[(.*)\]$/);
      if (match && match[1]) {
        solutions = match[1].split(',').map(s => s.trim());
      } else {
        solutions = [solutionText];
      }
    } catch (e) {
      // If parsing fails, use the raw text
      solutions = [solutionText];
    }

    // Output result
    console.log(JSON.stringify({
      solutions: solutions,
      message: solutions.length + ' solution(s) found'
    }));
  } catch (err) {
    console.error(JSON.stringify({
      error: true,
      message: err.message || 'Unknown error'
    }));
    process.exit(1);
  }
})();
NODEJS_SCRIPT

    # Execute with proper quoting and environment variable for module path
    local output
    output=$(NM_PATH="$node_modules_dir" node --input-type=commonjs "$TEMP_FILE" "$equation" "$variable" 2>&1) || {
        echo "Error: Failed to solve equation" >&2
        echo "Node.js output: $output" >&2
        return 1
    }

    return 0
}

################################################################################
# Function: print_usage
# Displays usage information
################################################################################
print_usage() {
    cat << 'EOF'
Usage: solve.sh [OPTIONS] EQUATION [VARIABLE]

Securely solves algebraic equations using nerdamer.

Arguments:
  EQUATION              The equation to solve (e.g., "x^2 + 5x + 6 = 0")
  VARIABLE              The variable to solve for (default: x)

Options:
  -h, --help            Display this help message
  -v, --verbose         Enable verbose output

Examples:
  solve.sh "x + 2 = 5"
  solve.sh "2x^2 - 8 = 0" x
  solve.sh "y = 3x + 1" y

Security:
  - Input is validated against a whitelist of safe characters
  - Parentheses are balanced before processing
  - Variable names must be valid identifiers
  - Equations are limited to 500 characters
  - All temporary files are securely created with mode 600
EOF
}

################################################################################
# Main Script
################################################################################
main() {
    local verbose=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                print_usage
                exit 0
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            *)
                if [[ -z "$EQUATION" ]]; then
                    EQUATION="$1"
                elif [[ -z "$VARIABLE" ]] || [[ "$VARIABLE" == "x" ]]; then
                    VARIABLE="$1"
                else
                    echo "Error: Too many arguments" >&2
                    print_usage >&2
                    exit 1
                fi
                shift
                ;;
        esac
    done

    # Validate arguments
    if [[ -z "$EQUATION" ]]; then
        echo "Error: Equation is required" >&2
        print_usage >&2
        exit 1
    fi

    if [[ "$verbose" == "true" ]]; then
        echo "[INFO] Validating equation: $EQUATION" >&2
        echo "[INFO] Variable: $VARIABLE" >&2
    fi

    # Validate inputs
    validate_expression "$EQUATION" || exit 1
    validate_variable "$VARIABLE" || exit 1

    if [[ "$verbose" == "true" ]]; then
        echo "[INFO] Validation passed, solving equation..." >&2
    fi

    # Solve
    solve_equation "$EQUATION" "$VARIABLE" || exit 1

    if [[ "$verbose" == "true" ]]; then
        echo "[INFO] Equation solved successfully" >&2
    fi
}

# Execute
main "$@"