const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /gh[pousr]_[a-zA-Z0-9_]{20,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[baprs]-[a-zA-Z0-9-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,
  /eyJ[a-zA-Z0-9._-]{20,}/g,
  /[a-fA-F0-9]{40,}/g,
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
];

export function redactSecrets(text: string) {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, '[REDACTED]'), text);
}
