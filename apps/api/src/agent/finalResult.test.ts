import { describe, expect, it } from 'vitest';
import { parseAgentFinalResult } from './finalResult';

describe('parseAgentFinalResult', () => {
  it('marks structured successful completions as success and strips the marker', () => {
    const result = parseAgentFinalResult(
      'Created /tmp/hn.json and printed its contents.\n<handle_result>{"success":true}</handle_result>',
    );

    expect(result).toEqual({
      message: 'Created /tmp/hn.json and printed its contents.',
      success: true,
    });
  });

  it('marks structured failures as errors with a reason', () => {
    const result = parseAgentFinalResult(
      'I could not read /tmp/hn.json.\n<handle_result>{"success":false,"reason":"File was not created"}</handle_result>',
    );

    expect(result).toEqual({
      message: 'I could not read /tmp/hn.json.',
      reason: 'File was not created',
      success: false,
    });
  });

  it('treats unstructured final answers that admit failure as errors', () => {
    const result = parseAgentFinalResult("The task failed because path '/tmp/hn.json' does not exist.");

    expect(result).toEqual({
      message: "The task failed because path '/tmp/hn.json' does not exist.",
      reason: 'Agent final answer indicates failure',
      success: false,
    });
  });
});
