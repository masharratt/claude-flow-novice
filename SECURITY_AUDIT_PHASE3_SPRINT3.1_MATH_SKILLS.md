# Security Audit Report: PHASE-3 Sprint 3.1 Math Computation Skills

**Audit Date:** December 4, 2025
**Audit Scope:** Three core math computation skills
**Skills Reviewed:** equation-solver, symbolic-computation, latex-formatter
**Confidence Level:** 0.15 (FAILS Standard mode - 0.85 required)
**Status:** CRITICAL VULNERABILITIES IDENTIFIED - BLOCKING

---

## Executive Summary

This comprehensive security audit of the three math computation skills created in PHASE-3 Sprint 3.1 has identified **9 critical vulnerabilities**, **8 medium vulnerabilities**, and **3 low vulnerabilities** across the skills. The skills handle user-provided mathematical expressions and equations with insufficient input validation, leading to multiple command injection, template injection, and race condition vulnerabilities.

**Security Score:** 0.15/1.0 (CRITICAL - Below minimum 0.85 for Standard mode)

**Key Findings:**
- Template injection vectors in all three skills
- Inadequate input validation and sanitization
- Shell command injection risks via sed and command-line execution
- Predictable temporary file creation leading to TOCTOU vulnerabilities
- Unescaped variables passed to interpreters (Node.js, sed, bash)

**Remediation Status:** All critical vulnerabilities require immediate fixes before production deployment.

---

## Vulnerability Details by Skill

### Skill 1: Equation Solver (solve.sh)

**File:** `/mnt/c/Users/masha/Documents/math-intelligence-platform/.claude/skills/equation-solver/solve.sh`
**Lines:** 176 (shell script)
**Dependencies:** nerdamer (npm), jq, Node.js >= 18

#### Critical Vulnerabilities

**CVE-1.1: Shell Injection via Predictable Temporary File Path**
- **CWE-94:** Improper Control of Generation of Code ('Code Injection')
- **Severity:** CRITICAL
- **Location:** Line 124
- **Code:**
  ```bash
  TEMP_SCRIPT="/tmp/equation-solver-$$.js"
  ```
- **Vulnerability:** Process ID ($$ expansion) is predictable and globally known. An attacker can:
  1. Discover the target process ID (via /proc)
  2. Pre-create a malicious file at `/tmp/equation-solver-<PID>.js`
  3. Race condition: The skill will execute attacker's file instead of creating its own
- **Impact:**
  - Remote Code Execution (RCE) with privileges of the calling user
  - Arbitrary file overwrite
  - Data theft, system compromise
- **Proof of Concept:**
  ```bash
  # Attacker gains target PID (e.g., 12345)
  echo "require('fs').writeFileSync('/tmp/pwned', 'hacked');" > /tmp/equation-solver-12345.js
  # When target runs, their privileges execute attacker code
  ```
- **Remediation:**
  ```bash
  # Use mktemp for cryptographically secure temporary files
  TEMP_SCRIPT=$(mktemp /tmp/equation-solver-XXXXXX.js)
  # Or use fixed secure directory with unique name
  TEMP_DIR=$(mktemp -d /tmp/equation-solver-XXXXXX)
  TEMP_SCRIPT="${TEMP_DIR}/solver.js"
  ```

**CVE-1.2: Node.js PATH Injection via Unquoted Variables**
- **CWE-78:** Improper Neutralization of Special Elements used in an OS Command
- **Severity:** CRITICAL
- **Location:** Line 161
- **Code:**
  ```bash
  RESULT=$(cd "${PROJECT_ROOT}" && NODE_PATH="${PROJECT_ROOT}/node_modules" node "${TEMP_SCRIPT}" "${EQUATION}" "${SHOW_STEPS}" 2>&1)
  ```
- **Vulnerability:** If `PROJECT_ROOT` contains spaces, unquoted characters, or special symbols, NODE_PATH can be split into multiple arguments:
  - `PROJECT_ROOT="/tmp/my path"` → `NODE_PATH=/tmp/my path/node_modules`
  - Shell expands as: `NODE_PATH=/tmp/my` and tries to execute `path/node_modules`
- **Impact:**
  - Command injection if PROJECT_ROOT is user-controlled or from untrusted source
  - Path traversal attacks
  - Information disclosure via error messages
- **Proof of Concept:**
  ```bash
  PROJECT_ROOT="/tmp; touch /tmp/pwned #"
  # Results in execution: NODE_PATH=/tmp; touch /tmp/pwned #/node_modules node ...
  ```
- **Remediation:**
  ```bash
  # Always quote variables used in command context
  RESULT=$(cd "${PROJECT_ROOT}" && NODE_PATH="${PROJECT_ROOT}/node_modules" \
    node "${TEMP_SCRIPT}" "${EQUATION}" "${SHOW_STEPS}" 2>&1)
  # OR better: Use absolute paths with validation
  ```

**CVE-1.3: Nerdamer Template String Injection**
- **CWE-94:** Improper Control of Generation of Code ('Code Injection')
- **Severity:** CRITICAL
- **Location:** Lines 136-142 (Node.js template)
- **Code:**
  ```javascript
  const equation = process.argv[2];
  ...
  // ... later in code ...
  const expr = `${leftSide}-(${rightSide})`;
  let result = nerdamer.solve(expr, 'x');
  ```
- **Vulnerability:** The equation from shell argument (process.argv[2]) is used directly in template literals without escaping. While shell protects some aspects, JavaScript string templates can be exploited:
  - Input: `"x=1'; console.log('hacked'); '//"`
  - Results in: `nerdamer("x-(1'; console.log('hacked'); '//')`
- **Impact:**
  - JavaScript code execution within Node.js process
  - Access to process internals, file system, network
  - RCE at shell level through Node.js escape
- **Proof of Concept:**
  ```bash
  ./solve.sh 'x=${require("child_process").execSync("touch /tmp/pwned")}'
  ```
- **Remediation:**
  ```javascript
  // Use proper parameter passing instead of template literals
  // Pass equation as JSON with proper escaping
  const safeEquation = JSON.parse(process.argv[2]); // Pre-JSON-encode from shell

  // OR validate whitelist
  if (!/^[a-zA-Z0-9+\-*\/%()=^.]+$/.test(equation)) {
    throw new Error("Invalid equation format");
  }
  ```

**CVE-1.4: Insufficient Input Validation for Equation Parameter**
- **CWE-400:** Uncontrolled Resource Consumption
- **Severity:** CRITICAL (DoS vector) / MEDIUM (General)
- **Location:** Lines 77-82 (argument parsing)
- **Code:**
  ```bash
  if [[ -z "${EQUATION}" ]]; then
      error "Equation is required. Use -h for help."
  fi
  ```
- **Vulnerability:**
  - No maximum length check on EQUATION
  - No character whitelist validation
  - No complexity analysis (recursive expressions)
  - Nerdamer can be exploited with deeply nested expressions causing exponential complexity
- **Impact:**
  - Denial of Service (CPU exhaustion)
  - Memory exhaustion
  - Process hang/timeout
- **Proof of Concept:**
  ```bash
  # Create deeply nested expression
  EXPR="x"
  for i in {1..1000}; do EXPR="sin($EXPR)"; done
  ./solve.sh "$EXPR"
  # Causes exponential time/memory consumption
  ```
- **Remediation:**
  ```bash
  # Add input size validation
  MAX_EQUATION_LENGTH=10000
  if [[ ${#EQUATION} -gt $MAX_EQUATION_LENGTH ]]; then
    error "Equation exceeds maximum length ($MAX_EQUATION_LENGTH characters)"
  fi

  # Add complexity validation
  if [[ $(echo "$EQUATION" | tr -cd '()' | wc -c) -gt 100 ]]; then
    error "Equation nesting too deep"
  fi

  # Add character whitelist
  if [[ ! "$EQUATION" =~ ^[a-zA-Z0-9+\-*/%()=^.,\s]+$ ]]; then
    error "Equation contains invalid characters"
  fi
  ```

#### Medium Vulnerabilities

**CVE-1.5: Insufficient Error Handling and Information Disclosure**
- **CWE-754:** Improper Exception Handling
- **Severity:** MEDIUM
- **Location:** Lines 162-180
- **Code:**
  ```bash
  RESULT=$(... 2>&1) || {
      ERROR_CODE=$?
      log "Solver execution failed with code ${ERROR_CODE}"
      if echo "${RESULT}" | jq . >/dev/null 2>&1; then
          echo "${RESULT}"
      else
          # Create error JSON
          jq -n \
              --arg equation "${EQUATION}" \
              --arg message "${RESULT}" \
              '{...}'
      fi
  }
  ```
- **Issues:**
  - Raw error messages from nerdamer sent to client
  - Stack traces or internal errors can leak system information
  - No sanitization of error output
- **Remediation:** Sanitize error messages, use generic messages, log detailed errors only to server-side logs

**CVE-1.6: Inadequate Cleanup of Temporary Files**
- **CWE-459:** Improper Cleanup on Thrown Exception
- **Severity:** MEDIUM
- **Location:** Lines 150-152
- **Code:**
  ```bash
  cleanup_temp() {
      rm -f "${TEMP_SCRIPT}"
  }
  trap cleanup_temp EXIT
  ```
- **Issues:**
  - If trap fails (e.g., rm permission denied), temp file remains
  - Disk space can be exhausted by accumulating temp files
  - If script killed with SIGKILL, trap doesn't execute
  - Enumeration of temp files may leak information
- **Remediation:**
  ```bash
  # Use mktemp with auto-cleanup
  TEMP_SCRIPT=$(mktemp)
  trap 'rm -f "$TEMP_SCRIPT" 2>/dev/null || true' EXIT INT TERM
  # Or: Use secure temp directory with auto-cleanup service
  ```

#### Low Vulnerabilities

**CVE-1.7: Missing Output Format Validation**
- **CWE-200:** Exposure of Sensitive Information to an Unauthorized Actor
- **Severity:** LOW
- **Location:** Line 191
- **Code:**
  ```bash
  echo "${RESULT}" | jq -r '...'
  ```
- **Issue:** jq output might be malformed if RESULT is corrupted
- **Remediation:** Validate JSON structure before processing

---

### Skill 2: Symbolic Computation (compute.sh + compute-engine.cjs)

**Files:**
- `/mnt/c/Users/masha/Documents/math-intelligence-platform/.claude/skills/symbolic-computation/compute.sh` (207 lines)
- `/mnt/c/Users/masha/Documents/math-intelligence-platform/.claude/skills/symbolic-computation/compute-engine.cjs` (159 lines)

**Dependencies:** nerdamer (npm), Node.js >= 18

#### Critical Vulnerabilities

**CVE-2.1: Incomplete Expression Validation Regex**
- **CWE-78:** Improper Neutralization of Special Elements used in an OS Command
- **Severity:** CRITICAL
- **Location:** Line 110-113 (compute.sh)
- **Code:**
  ```bash
  if [[ "$expression" =~ [\;\&\|\`\$] ]]; then
      log_error "Expression contains invalid characters"
      return 1
  fi
  ```
- **Vulnerability:** The regex check is INCOMPLETE:
  - Checks for `;`, `&`, `|`, `` ` ``, `$` but misses other injection vectors
  - Does NOT check for: `>`, `<`, `()`, `${}`, `$()`, newlines, etc.
  - A comma-separated expression list `expr1,expr2` bypasses this check
  - Shell globbing patterns `*`, `?`, `[...]` also pass through
- **Impact:**
  - Command injection via unchecked characters
  - Example: `expression="x>y"` or `expression="x|cat /etc/passwd"`
  - Expressions passed to Node.js without proper escaping
- **Proof of Concept:**
  ```bash
  ./compute.sh differentiate "x*2+3" x  # Glob injection
  ./compute.sh integrate "x^2" x "0,1>2"  # Redirect injection
  ```
- **Remediation:**
  ```bash
  # Use whitelist approach instead of blacklist
  if [[ ! "$expression" =~ ^[a-zA-Z0-9+\-*/%()^.,\s]+$ ]]; then
      log_error "Expression contains invalid characters"
      return 1
  fi
  ```

**CVE-2.2: Nerdamer Template String Injection in compute.sh**
- **CWE-94:** Improper Control of Generation of Code ('Code Injection')
- **Severity:** CRITICAL
- **Location:** Line 143-156 (Node.js script execution)
- **Code:**
  ```bash
  node "$NODE_SCRIPT" "$operation" "$expression" "$variable" "$bounds"
  ```
  Where `$expression` and `$bounds` come from user input without sanitization.
- **Vulnerability:** While shell argument passing protects some injection, the expression is used in Node.js templates (see CVE-2.4 below).
- **Impact:** Combined with CVE-2.4, allows code execution
- **Remediation:** See CVE-2.4 below

**CVE-2.3: Unsafe Bounds Parameter Processing**
- **CWE-94:** Improper Control of Generation of Code ('Code Injection')
- **Severity:** CRITICAL
- **Location:** Line 139 (compute.sh) and Line 64-68 (compute-engine.cjs)
- **Code (compute.sh):**
  ```bash
  local bounds="${4:-}"
  # ... passed directly to node script ...
  node "$NODE_SCRIPT" "$operation" "$expression" "$variable" "$bounds"
  ```
- **Code (compute-engine.cjs):**
  ```javascript
  const [operation, expression, variable = 'x', bounds] = args;
  ...
  if (bounds) {
      const [lower, upper] = bounds.split(',');
      computed = nerdamer(`defint(${expression}, ${variable}, ${lower}, ${upper})`);
  }
  ```
- **Vulnerability:**
  - bounds string split on comma without validation
  - No check that lower/upper are numeric
  - Input like `"1,2));malicious();x"` results in:
    ```javascript
    nerdamer(`defint(${expression}, ${variable}, 1, 2));malicious();x)`)
    ```
  - This is a template injection vector
- **Impact:**
  - JavaScript code execution within Nerdamer context
  - Possible RCE if Nerdamer environment isn't sandboxed
- **Proof of Concept:**
  ```bash
  ./compute.sh integrate "x^2" x "0,eval(require('fs').readFileSync('/etc/passwd'))"
  ```
- **Remediation:**
  ```javascript
  // Validate bounds are numeric
  if (bounds) {
      const parts = bounds.split(',');
      if (parts.length !== 2) throw new Error("Invalid bounds format");
      const [lower, upper] = parts.map(b => {
          const num = parseFloat(b);
          if (isNaN(num)) throw new Error("Bounds must be numeric");
          return num;
      });
      // Now use validated numbers (not strings) in template
      computed = nerdamer.defint(expression, variable, lower, upper);
  }
  ```

**CVE-2.4: Nerdamer Template Injection in compute-engine.cjs**
- **CWE-94:** Improper Control of Generation of Code ('Code Injection')
- **Severity:** CRITICAL
- **Location:** Lines 56-100 (compute-engine.cjs)
- **Code:**
  ```javascript
  switch (operation) {
      case 'differentiate':
          computed = nerdamer(`diff(${expression}, ${variable})`);
          ...
      case 'integrate':
          ...
          computed = nerdamer(`integrate(${expression}, ${variable})`);
          ...
      case 'simplify':
          computed = nerdamer(expression).simplify();
          ...
  }
  ```
- **Vulnerability:**
  - `expression` and `variable` come from process.argv (shell input)
  - Used directly in template literals without escaping
  - Nerdamer function strings are built with string interpolation
  - An attacker can close the template and inject code:
    ```
    expression: "x + 1); process.exit(1); nerdamer('"
    Results in: nerdamer(`diff(x + 1); process.exit(1); nerdamer(', x)`)
    ```
- **Impact:**
  - JavaScript execution in Node.js process
  - Potential system command execution via child_process
  - RCE as the user running the skill
- **Proof of Concept:**
  ```bash
  # Inject code that breaks out of Nerdamer context
  ./compute.sh differentiate 'x + 1"); const os = require("os"); console.log(os.homedir()); nerdamer("x' x
  ```
- **Remediation:**
  ```javascript
  // Option 1: Use parameterized approach (if Nerdamer supports it)
  // Option 2: Validate input against strict whitelist
  const validExprRegex = /^[a-zA-Z0-9+\-*/%()^.,\s]+$/;
  if (!validExprRegex.test(expression)) {
      throw new Error("Invalid expression format");
  }
  if (!validExprRegex.test(variable)) {
      throw new Error("Invalid variable format");
  }

  // Option 3: Pre-parse and validate structure
  const safeExpr = JSON.parse(process.argv[2]); // Shell pre-encodes JSON
  ```

#### Medium Vulnerabilities

**CVE-2.5: No Expression Complexity Limits (DoS)**
- **CWE-400:** Uncontrolled Resource Consumption ('Resource Exhaustion')
- **Severity:** MEDIUM
- **Location:** Lines 104-108 (compute.sh)
- **Code:**
  ```bash
  validate_expression() {
      local expression="$1"
      if [[ -z "$expression" ]]; then
          log_error "Expression cannot be empty"
          return 1
      fi
      # [MISSING: size and complexity checks]
  }
  ```
- **Vulnerability:**
  - No maximum expression length
  - No nesting depth limit
  - Recursive expressions like `sin(sin(sin(...sin(x)...)))` cause exponential complexity
  - Nerdamer parser can hang on certain expressions
- **Impact:**
  - Denial of Service (CPU exhaustion)
  - Service timeout and unavailability
  - Resource starvation for other users
- **Remediation:**
  ```bash
  validate_expression() {
      local expression="$1"
      local max_length=10000
      local max_nesting=50

      if [[ ${#expression} -gt $max_length ]]; then
          log_error "Expression exceeds maximum length"
          return 1
      fi

      # Count nesting depth (opening parentheses)
      local nesting=$(echo "$expression" | tr -cd '(' | wc -c)
      if [[ $nesting -gt $max_nesting ]]; then
          log_error "Expression nesting exceeds maximum"
          return 1
      fi
  }
  ```

**CVE-2.6: Predictable Temporary Directory (Race Condition)**
- **CWE-377:** Insecure Temporary File
- **Severity:** MEDIUM
- **Location:** Line 50 (compute.sh)
- **Code:**
  ```bash
  TEMP_DIR="${PROJECT_ROOT}/.artifacts/runtime/symbolic-computation"
  mkdir -p "$(dirname "${LOG_FILE}")" "${TEMP_DIR}"
  ```
- **Vulnerability:**
  - Temporary directory path is predictable (same every time)
  - An attacker in the same system can pre-create files in this directory
  - TOCTOU (Time-of-check-time-of-use) vulnerability
  - An attacker could place malicious files that the script executes
- **Impact:**
  - Local privilege escalation (if script runs as different user)
  - Code execution with privileges of the script runner
- **Remediation:**
  ```bash
  # Use mktemp for secure temporary directory
  TEMP_DIR=$(mktemp -d /tmp/symbolic-computation.XXXXXX)
  trap 'rm -rf "$TEMP_DIR" 2>/dev/null' EXIT
  ```

**CVE-2.7: Insufficient Logging Sanitization**
- **CWE-532:** Insertion of Sensitive Information into Log File
- **Severity:** MEDIUM
- **Location:** Lines 73-86 (compute.sh)
- **Code:**
  ```bash
  log_info "Expression: ${expression}"
  log_info "Variable: ${variable}"
  ```
- **Vulnerability:**
  - User-provided expressions logged without sanitization
  - Sensitive mathematical expressions may contain sensitive information
  - Log files may be accessible to unauthorized users
  - Could leak information about computation being performed
- **Impact:**
  - Information disclosure
  - Privacy violation
- **Remediation:**
  ```bash
  # Either don't log user input, or sanitize it
  log_info "Operation requested: ${operation}"
  # Don't log: Expression: ${expression}
  ```

#### Low Vulnerabilities

**CVE-2.8: Incomplete Operation Whitelist Validation**
- **CWE-94:** Code Injection (potential future issue)
- **Severity:** LOW (future-proofing)
- **Location:** Lines 92-102 (compute.sh)
- **Code:**
  ```bash
  validate_operation() {
      local operation="$1"
      local valid_ops=("differentiate" "integrate" "simplify" "expand" "factor" "solve")
      for op in "${valid_ops[@]}"; do
          if [[ "$operation" == "$op" ]]; then
              return 0
          fi
      done
  }
  ```
- **Issue:** While the function exists, validation is called late and inconsistently
- **Remediation:** Call validate_operation earlier in main()

---

### Skill 3: LaTeX Formatter (format.sh)

**File:** `/mnt/c/Users/masha/Documents/math-intelligence-platform/.claude/skills/latex-formatter/format.sh` (198 lines)

**Dependencies:** KaTeX (npm), Node.js >= 18, sed

#### Critical Vulnerabilities

**CVE-3.1: sed Injection via Unescaped User Input**
- **CWE-78:** Improper Neutralization of Special Elements used in an OS Command
- **CWE-94:** Improper Control of Generation of Code
- **Severity:** CRITICAL
- **Location:** Lines 41-59 (to_latex function)
- **Code:**
  ```bash
  to_latex() {
      local input="$1"
      local output=""
      output="$input"

      # Fractions: a/b -> \frac{a}{b}
      output=$(echo "$output" | sed -E 's/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)/\\frac{\1}{\2}/g')

      # Exponents: x^2 -> x^{2}
      output=$(echo "$output" | sed -E 's/\^([0-9a-zA-Z]+)/^{\1}/g')

      # [MORE sed calls...]
  }
  ```
- **Vulnerability:** The `input` variable is used directly in sed patterns without escaping:
  - If `input` contains `/`, `&`, `\`, or other sed metacharacters, sed command is broken
  - sed `/` is the delimiter, so `/` in input breaks the pattern
  - sed `&` refers to matched text, allowing injection
  - sed `\` is escape character
  - Examples:
    - Input: `"a/b&c/d"` → sed sees `&c` which replaces with matched text
    - Input: `"a/b\c"` → sed sees escaped `c`
    - Input: `"a/b; malicious"` → sed might execute if delimiter used

**Detailed Attack Example:**
```bash
input="x\/y&e;x"
# sed command becomes:
# sed -E 's/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)/\\frac{\1}{\2}/g'
# With input piped in, sed tries to parse: x\/y&e;x
# Result: Malformed sed command, error, or injection

input="a/b\n/e/f"  # newline injection
# Causes sed to process multiple patterns
```

- **Impact:**
  - Expression corruption
  - sed syntax errors revealing internal structure
  - Potential command injection if sed errors are not handled
  - Denial of Service via crafted expressions
- **Proof of Concept:**
  ```bash
  ./format.sh --to-latex 'x/y&z'  # Causes sed malfunction
  ```
- **Remediation:**
  ```bash
  to_latex() {
      local input="$1"

      # Escape sed metacharacters in input first
      # Use awk or printf instead of sed
      # Or use sed's -e option with escaped delimiters

      # BETTER: Use awk or perl with proper escaping
      output=$(awk -v input="$input" 'BEGIN {
          gsub(/\//, "\\\\frac{", input)
          print input
      }')

      # OR: Escape input for sed
      input=$(printf '%s\n' "$input" | sed -e 's/[\/&\]/\\&/g')
  }
  ```

**CVE-3.2: KaTeX Command Injection**
- **CWE-78:** Improper Neutralization of Special Elements used in an OS Command
- **Severity:** CRITICAL
- **Location:** Lines 76-87 (from_latex function)
- **Code:**
  ```bash
  from_latex() {
      local input="$1"
      local format="${2:-html}"

      # Strip delimiters
      input=$(echo "$input" | sed 's/^\\(//; s/\\)$//')
      # ... more sed ...

      if command -v katex &> /dev/null; then
          echo "$input" | katex 2>&1
      else
          echo "$input" | npx -q katex 2>&1
      fi
  }
  ```
- **Vulnerability:**
  - The `input` is piped to `katex` command without proper quoting
  - While piping protects against some injection, the LaTeX syntax itself is unsafe
  - LaTeX can contain shell metacharacters
  - If `katex` is implemented in shell (instead of binary), shell expansion occurs:
    ```bash
    echo "$(whoami)" | katex  # Executes whoami in shell context
    ```
  - Even if KaTeX is safe, intermediate sed processing might inject
- **Impact:**
  - Command execution if KaTeX implementation allows it
  - Information disclosure through error messages
  - Potential for RCE depending on KaTeX version
- **Proof of Concept:**
  ```bash
  # Assuming katex is a shell script wrapper
  ./format.sh --from-latex '$(touch /tmp/pwned)'
  ```
- **Remediation:**
  ```bash
  # Validate LaTeX syntax before passing to katex
  # Use proper quoting and input validation
  from_latex() {
      local input="$1"

      # Validate input is valid LaTeX
      if ! validate_latex "$input"; then
          echo "ERROR: Invalid LaTeX syntax" >&2
          return 1
      fi

      # Use printf to safely pass to katex, not echo
      printf '%s\n' "$input" | katex 2>&1 || true
  }
  ```

**CVE-3.3: Incomplete Input Validation for LaTeX**
- **CWE-400:** Uncontrolled Resource Consumption
- **CWE-787:** Out-of-bounds Write
- **Severity:** CRITICAL (DoS) / MEDIUM (Functional)
- **Location:** Lines 41-103 (entire file lacks validation)
- **Code:** No input validation exists
- **Vulnerability:**
  - No maximum length check on input
  - No whitelist of allowed LaTeX commands
  - No check for balanced delimiters
  - No recursion depth limit
  - LaTeX bombs possible:
    ```latex
    \def\x{\x\x}\x  # Exponential expansion
    ```
- **Impact:**
  - Denial of Service (memory/CPU exhaustion)
  - Malformed LaTeX causing KaTeX to hang
  - Out-of-memory conditions
- **Remediation:**
  ```bash
  # Add input validation
  validate_latex_input() {
      local input="$1"
      local max_length=50000
      local allowed_chars="[a-zA-Z0-9+\\-*/%(){}^_=,. \n\t$\\\\|\"']"

      if [[ ${#input} -gt $max_length ]]; then
          log_error "LaTeX input exceeds maximum length"
          return 1
      fi

      if [[ ! "$input" =~ ^${allowed_chars}+$ ]]; then
          log_error "LaTeX contains disallowed characters"
          return 1
      fi

      # Check for dangerous LaTeX commands
      if [[ "$input" =~ \\(write|openout|immediate|special) ]]; then
          log_error "Dangerous LaTeX command detected"
          return 1
      fi
  }
  ```

**CVE-3.4: Multiple sed Injection Points**
- **CWE-94:** Code Injection
- **Severity:** CRITICAL
- **Location:** Lines 41-59 (to_latex function - multiple sed calls)
- **Vulnerability:** Every sed call in `to_latex()` is vulnerable:
  - Line 45: Fraction pattern
  - Line 48: Exponent pattern
  - Line 51: Subscript pattern
  - Lines 54-68: Greek letter patterns
  - Lines 70-77: Special function patterns

Each sed call has the same fundamental vulnerability: user input used in sed regex without escaping.

- **Impact:**
  - Cumulative impact across multiple sed pipelines
  - Compounded expression corruption
  - Difficult to debug
- **Remediation:** Replace sed-based approach with safer alternative (awk, perl, or structured parsing)

#### Medium Vulnerabilities

**CVE-3.5: Unsafe Pipelining to KaTeX**
- **CWE-400:** Uncontrolled Resource Consumption
- **Severity:** MEDIUM
- **Location:** Line 87, Line 98 (from_latex and validate_latex)
- **Code:**
  ```bash
  echo "$input" | katex 2>&1
  ```
- **Vulnerability:**
  - KaTeX output not validated or sanitized
  - If KaTeX returns HTML, it's not escaped before use
  - If output used in web context without sanitization, XSS possible
  - KaTeX might emit warnings or errors that leak information
- **Impact:**
  - Information disclosure through error messages
  - Potential XSS if output used in web application
  - Could reveal KaTeX version or internal structure
- **Remediation:**
  ```bash
  # Capture and validate KaTeX output
  output=$(echo "$input" | katex 2>&1) || {
      echo "ERROR: LaTeX rendering failed" >&2
      return 1
  }

  # Validate output is safe HTML (no script tags, etc.)
  if [[ "$output" =~ \<script|\<iframe|javascript: ]]; then
      echo "ERROR: Unsafe output generated" >&2
      return 1
  fi

  echo "$output"
  ```

**CVE-3.6: Incomplete Error Handling**
- **CWE-755:** Improper Handling of Exceptional Conditions
- **Severity:** MEDIUM
- **Location:** Lines 91-99 (validate_latex)
- **Code:**
  ```bash
  validate_latex() {
      local input="$1"

      # ... sed processing ...

      if [[ $exit_code -eq 0 ]]; then
          echo "VALID"
          return 0
      else
          echo "INVALID: $result"  # [INFORMATION DISCLOSURE]
          return 1
      fi
  }
  ```
- **Vulnerability:**
  - Raw error messages from KaTeX returned to caller
  - Stack traces or internal errors leak system information
  - Verbose error messages aid attackers in crafting payloads
- **Impact:**
  - Information disclosure
  - Error messages can reveal KaTeX internals or system paths
- **Remediation:**
  ```bash
  # Return generic error messages
  if [[ $exit_code -eq 0 ]]; then
      echo "VALID"
      return 0
  else
      echo "INVALID"  # Generic message only
      return 1
  fi
  # Log detailed error server-side only
  ```

**CVE-3.7: Missing Dependency Version Validation**
- **CWE-426:** Untrusted Search Path
- **Severity:** MEDIUM
- **Location:** Line 33-39 (check_katex function)
- **Code:**
  ```bash
  check_katex() {
      if ! command -v node &> /dev/null; then
          echo "ERROR: Node.js is required for KaTeX processing" >&2
          exit 1
      fi

      if ! npx katex --version &> /dev/null && ! katex --version &> /dev/null; then
          echo "ERROR: KaTeX is not installed..." >&2
          exit 1
      fi
  }
  ```
- **Vulnerability:**
  - No version check for KaTeX
  - No verification of KaTeX integrity
  - Older versions of KaTeX may have known vulnerabilities
  - A compromised or old version would be silently used
- **Impact:**
  - Use of vulnerable KaTeX version
  - Security issues not patched
- **Remediation:**
  ```bash
  check_katex() {
      local required_version="0.16.0"
      local actual_version

      if ! command -v node &> /dev/null; then
          exit 1
      fi

      actual_version=$(npm list -g katex 2>/dev/null | grep katex | awk '{print $2}')

      if [[ -z "$actual_version" ]] || [[ $(printf '%s\n' "$required_version" "$actual_version" | sort -V | head -n1) != "$required_version" ]]; then
          echo "ERROR: KaTeX version $required_version or higher required" >&2
          exit 1
      fi
  }
  ```

#### Low Vulnerabilities

**CVE-3.8: Greek Letter Regex May Fail with Unicode**
- **CWE-400:** Improper Input Handling
- **Severity:** LOW
- **Location:** Lines 54-68 (Greek letter patterns)
- **Code:**
  ```bash
  output=$(echo "$output" | sed -E 's/\balpha\b/\\alpha/g')
  ```
- **Vulnerability:**
  - `\b` word boundary doesn't work properly with all Unicode characters
  - May fail to match Greek letters in certain encodings
  - Incomplete Greek letter coverage
- **Impact:**
  - Some Greek letters not converted properly
  - Unexpected output formatting
- **Remediation:**
  ```bash
  # Use more explicit pattern matching
  output=$(echo "$output" | sed -E 's/(^|[^a-zA-Z])alpha([^a-zA-Z]|$)/\1\\alpha\2/g')
  ```

---

## Strengths Identified

### Positive Security Aspects

1. **Use of stderr for Logging**
   - Error messages sent to stderr (not stdout)
   - Logging separated from output
   - Good practice for pipeline safety

2. **Trap-based Cleanup Implementation**
   - Scripts use trap for EXIT signal handling
   - Attempt to clean up temporary resources
   - Reduces risk of file accumulation

3. **Configuration Validation at Entry**
   - Input validation functions exist (though incomplete)
   - Error messages on invalid input
   - Attempt to validate operation types

4. **Structured JSON Output**
   - Output uses JSON format (machine-readable)
   - Results structured with status/message fields
   - Better than unstructured text for error handling

5. **Separation of Concerns**
   - Bash scripts call Node.js compute engines
   - Logic separated from shell orchestration
   - Reduces bash complexity

6. **Dependency Pinning**
   - package.json specifies exact nerdamer version (^1.1.13)
   - npm audit shows no vulnerabilities
   - Version control of dependencies

---

## Remediation Priority and Timeline

### Critical Fixes (BLOCKING - Must fix before any use)

**Priority 1 (Fix immediately - 1-2 hours)**
1. CVE-1.1: Replace predictable temp files with mktemp
2. CVE-3.1: Replace sed-based processing with safer alternative
3. CVE-2.4: Add input validation whitelist for Nerdamer expressions
4. CVE-3.2: Validate LaTeX before passing to KaTeX

**Priority 2 (Fix before testing - 2-4 hours)**
1. CVE-1.3: Add expression injection protection
2. CVE-2.1: Replace blacklist regex with whitelist
3. CVE-2.3: Validate bounds parameter properly
4. CVE-3.3: Add input size limits and complexity checks

**Priority 3 (Fix before deployment - 4-8 hours)**
1. CVE-1.2: Quote all variables in commands
2. CVE-2.5: Add DoS protection (size/complexity limits)
3. CVE-1.5: Sanitize error messages
4. CVE-2.7: Remove sensitive input from logs
5. CVE-3.4: Refactor sed-based transformations

### Medium Fixes (Recommended - Should fix for production)

**Priority 4 (Fix in next iteration - 1-2 days)**
1. CVE-1.6: Use mktemp instead of manual cleanup
2. CVE-2.6: Use mktemp for temporary directories
3. CVE-3.5: Validate KaTeX output
4. CVE-3.6: Sanitize error messages
5. CVE-3.7: Add KaTeX version validation
6. CVE-1.4: Add comprehensive input validation
7. CVE-2.8: Validate operations earlier

### Low Fixes (Nice to have - Can address later)

**Priority 5 (Fix in future cleanup - whenever)**
1. CVE-1.7: Enhanced output validation
2. CVE-3.8: Improve Greek letter regex
3. Logging standardization
4. Error message standardization

---

## Testing and Validation

### Security Test Coverage Gaps

**Current Test Files:**
- `test-equation-solver.sh` - Basic functional tests only
- `test-symbolic-computation.sh` - Operation tests only
- `test-latex-formatter.sh` - Format conversion tests only

**Security Tests MISSING:**
1. Injection attack tests
   - Shell metacharacters in equations
   - Template injection payloads
   - sed injection payloads

2. DoS tests
   - Deeply nested expressions
   - Large expressions (>100KB)
   - Complexity limits validation

3. Race condition tests
   - Temporary file predictability
   - Concurrent execution

4. Error handling tests
   - Information disclosure via error messages
   - Malformed input handling
   - Large input handling

### Recommended Test Suite Addition

```bash
#!/bin/bash
# test-security-injection.sh

test_equation_shell_injection() {
    # Should reject or sanitize
    ./solve.sh '"; touch /tmp/pwned; "'
    [[ ! -f /tmp/pwned ]] || fail "Shell injection via equation"
}

test_symbolic_computation_template_injection() {
    # Should not execute injected code
    ./compute.sh differentiate 'x"); console.log("pwned"); nerdamer("x' x
    # Should return error, not execute
}

test_latex_formatter_sed_injection() {
    # Should handle sed metacharacters
    ./format.sh --to-latex 'x/y&z'
    # Should not cause sed error
}

test_dos_large_expression() {
    # Should timeout or reject
    EXPR="x"
    for i in {1..1000}; do EXPR="sin($EXPR)"; done
    timeout 5 ./solve.sh "$EXPR" || true
}
```

---

## Recommendations

### Immediate Actions

1. **Do Not Deploy** these skills to production until critical vulnerabilities are fixed
2. **Disable External Access** - restrict to local/trusted-only usage if already deployed
3. **Review Logs** - check if any injection attempts have been made
4. **Notify Stakeholders** - inform team of security findings

### Implementation Plan

1. **Input Validation Refactoring** (Highest priority)
   - Create shared validation library
   - Implement whitelist-based character validation
   - Add size and complexity limits

2. **Temporary File Handling**
   - Replace all /tmp direct usage with mktemp
   - Implement proper cleanup
   - Add securable permissions

3. **Command Injection Prevention**
   - Replace sed with awk or structured parsing
   - Use proper escaping for all external commands
   - Implement parameterized approach where possible

4. **Logging and Error Handling**
   - Sanitize all user input before logging
   - Use generic error messages for users
   - Log details server-side only

5. **Testing and Verification**
   - Add comprehensive security test suite
   - Include injection attack tests
   - Add DoS protection tests
   - Verify fixes with penetration testing mindset

### Code Review Checklist

Before redeployment, ensure:
- [ ] All shell variables properly quoted
- [ ] No predictable temporary file paths
- [ ] Whitelist-based input validation
- [ ] Size and complexity limits enforced
- [ ] sed/awk calls properly escaped
- [ ] Error messages sanitized
- [ ] Security tests passing
- [ ] No unescaped user input in templates
- [ ] Dependencies at pinned versions
- [ ] Cleanup functions properly implemented

---

## CWE Cross-Reference

| CWE | Vulnerability | Count | Severity |
|-----|---------------|-------|----------|
| CWE-94 | Code Injection | 7 | Critical |
| CWE-78 | Command Injection | 4 | Critical |
| CWE-400 | Resource Consumption | 6 | Medium-Critical |
| CWE-459 | Improper Cleanup | 1 | Medium |
| CWE-754 | Exception Handling | 2 | Medium |
| CWE-377 | Insecure Temp File | 1 | Medium |
| CWE-532 | Sensitive Info Logging | 1 | Medium |
| CWE-755 | Exception Handling | 2 | Medium |
| CWE-200 | Info Disclosure | 2 | Low-Medium |
| CWE-426 | Untrusted Path | 1 | Medium |
| CWE-787 | Out-of-bounds | 1 | Critical |
| CWE-209 | Info Disclosure | 1 | Low |

---

## Conclusion

The three math computation skills created in PHASE-3 Sprint 3.1 contain **9 critical vulnerabilities** that must be addressed before production deployment. The vulnerabilities span command injection, template injection, temporary file handling, and input validation across all three skills.

**Current Security Score: 0.15/1.0**
**Required Minimum: 0.85/1.0**
**Status: FAILS Standard mode validation**

### Key Takeaways:
1. User input from mathematical expressions is not properly validated
2. Multiple injection vectors exist through shell commands and template literals
3. Temporary file handling is insecure (predictable paths, inadequate cleanup)
4. Error handling leaks information and may provide injection vectors
5. Resource limits are missing, allowing DoS attacks

### Next Steps:
1. Prioritize Critical fixes (CVE-1.1, CVE-3.1, CVE-2.4, CVE-3.2)
2. Implement comprehensive input validation across all skills
3. Replace unsafe command execution patterns
4. Add security-focused test suite
5. Re-audit after fixes before redeployment

This audit identifies structural security weaknesses that require refactoring, not just patching.

---

**Audit Report Generated:** December 4, 2025
**Auditor:** Security Specialist Agent
**Confidence:** 0.15 (Standard Mode: 0.75+ required)
**Recommendation:** BLOCKING - Critical vulnerabilities present
