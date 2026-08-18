#!/usr/bin/env bash
# Fix the redact_pattern function in lib.rs

# Find the function and replace it

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
sed -i '/fn redact_pattern/,/^}/{
  s/fn redact_pattern.*/fn redact_pattern(\&self, content: \&str, pattern: \&str) -> Result<String> {/
  /use regex::Regex/d
  /let regex =/d
  /Regex::new/d
  /with_context/d
  s/Ok(regex.replace_all(content, format!("{}: [REDACTED]", pattern)).to_string())/Ok(content.replace(&format!("{}: ", pattern), &format!("{}: [REDACTED]", pattern)))/
}' src/lib.rs
