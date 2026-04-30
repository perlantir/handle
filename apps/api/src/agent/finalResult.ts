const RESULT_MARKER_PATTERN = /<handle_result>\s*(\{[\s\S]*?\})\s*<\/handle_result>/i;
const FAILURE_PATTERN =
  /\b(failed|failure|could not|couldn't|unable to|did not complete|does not exist|not found|error|traceback|exception|modulenotfounderror)\b/i;

interface ParsedMarker {
  reason?: unknown;
  success?: unknown;
}

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

  try {
    const markerJson = marker[1];
    if (!markerJson) throw new Error('Missing result marker JSON');

    const parsed = JSON.parse(markerJson) as ParsedMarker;
    const success = parsed.success === true;
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;

    return {
      message,
      ...(reason ? { reason } : {}),
      success,
    };
  } catch {
    return {
      message,
      reason: 'Agent final result marker was not valid JSON',
      success: false,
    };
  }
}
