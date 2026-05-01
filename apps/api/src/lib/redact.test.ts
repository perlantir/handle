import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  it('redacts bearer tokens and JWT-shaped values', () => {
    const text =
      'Authorization: Bearer test-token-not-real-but-long-enough and jwt eyJtest-token-not-real-value';

    expect(redactSecrets(text)).toBe('Authorization: [REDACTED] and jwt [REDACTED]');
  });

  it('leaves ordinary text unchanged', () => {
    expect(redactSecrets('no credentials here')).toBe('no credentials here');
  });
});
