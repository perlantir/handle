const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
  /eyJ[a-zA-Z0-9._-]{20,}/g,
  /[a-fA-F0-9]{40,}/g,
];

export function redactSecrets(text: string) {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, '[REDACTED]'), text);
}
