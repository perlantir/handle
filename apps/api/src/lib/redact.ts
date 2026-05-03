const SECRET_PATTERNS = [
  { name: "openai_api_key", pattern: /sk-[a-zA-Z0-9_-]{20,}/g },
  { name: "anthropic_api_key", pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { name: "github_token", pattern: /gh[pousr]_[a-zA-Z0-9_]{20,}/g },
  { name: "google_api_key", pattern: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "slack_token", pattern: /xox[baprs]-[a-zA-Z0-9-]{20,}/g },
  { name: "bearer_token", pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/g },
  { name: "jwt", pattern: /eyJ[a-zA-Z0-9._-]{20,}/g },
  { name: "hex_secret", pattern: /[a-fA-F0-9]{40,}/g },
  { name: "credit_card", pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
];

export function redactSecrets(text: string) {
  return redactSecretsWithReport(text).redacted;
}

export function redactSecretsWithReport(text: string) {
  let redacted = text;
  const matchedPatterns: string[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      matchedPatterns.push(name);
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, "[REDACTED]");
    }
  }

  return {
    matchedPatterns,
    redacted,
    redactionTriggered: matchedPatterns.length > 0,
  };
}
