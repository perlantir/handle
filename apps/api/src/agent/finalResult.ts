const RESULT_MARKER_PATTERN = /\[\[HANDLE_RESULT:(SUCCESS|FAILURE)(?:\s+reason="([^"]*)")?\]\]/i;
const FAILURE_PATTERN =
  /\b(failed|failure|could not|couldn't|unable to|did not complete|does not exist|not found|error|traceback|exception|modulenotfounderror)\b/i;

export interface AgentFinalResult {
  message: string;
  reason?: string;
  success: boolean;
}

function cleanFinalMessage(output: string) {
  return output.replace(RESULT_MARKER_PATTERN, '').trim();
}

export function parseAgentFinalResult(output: string): AgentFinalResult {
  const marker = output.match(RESULT_MARKER_PATTERN);
  const message = cleanFinalMessage(output);

  if (!marker) {
    const success = !FAILURE_PATTERN.test(output);
    return {
      message,
      ...(success ? {} : { reason: 'Agent final answer indicates failure' }),
      success,
    };
  }

  const status = marker[1]?.toUpperCase();
  const success = status === 'SUCCESS';
  const reason = success ? undefined : marker[2] || 'Agent reported task failure';

  return {
    message,
    ...(reason ? { reason } : {}),
    success,
  };
}
