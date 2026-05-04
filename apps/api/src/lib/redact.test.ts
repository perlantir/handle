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

  it('redacts payment, SSN, and common API key shapes before memory writes', () => {
    const githubToken = `ghp_${'a'.repeat(26)}`;
    const googleToken = `AIza${'a'.repeat(26)}`;
    const awsToken = `AKIA${'A'.repeat(16)}`;
    const slackToken = `xoxb-${'1'.repeat(12)}-${'a'.repeat(26)}`;
    const text =
      `card 4111-1111-1111-1111 ssn 123-45-6789 github ${githubToken} google ${googleToken} aws ${awsToken} slack ${slackToken}`;

    expect(redactSecrets(text)).toBe(
      'card [REDACTED] ssn [REDACTED] github [REDACTED] google [REDACTED] aws [REDACTED] slack [REDACTED]',
    );
  });
});
