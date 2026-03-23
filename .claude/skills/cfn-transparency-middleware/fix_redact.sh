#!/bin/bash
# Fix the redact_pattern function in lib.rs

# Find the function and replace it
sed -i '/fn redact_pattern/,/^}/{
  s/fn redact_pattern.*/fn redact_pattern(\&self, content: \&str, pattern: \&str) -> Result<String> {/
  /use regex::Regex/d
  /let regex =/d
  /Regex::new/d
  /with_context/d
  s/Ok(regex.replace_all(content, format!("{}: [REDACTED]", pattern)).to_string())/Ok(content.replace(&format!("{}: ", pattern), &format!("{}: [REDACTED]", pattern)))/
}' src/lib.rs
