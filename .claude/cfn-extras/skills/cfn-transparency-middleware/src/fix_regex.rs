/// Redact pattern from content
fn redact_pattern(&self, content: &str, pattern: &str) -> Result<String> {
    use regex::Regex;

    let regex = Regex::new(&format!(r"(?i){}[:\s=]+[^\s\n]+", pattern))
        .with_context(|| format!("Invalid regex pattern: {}", pattern))?;

    Ok(regex.replace_all(content, format!("{}: [REDACTED]", pattern)).to_string())
}
