import { redactSecrets } from "../../lib/redact";

export type IntegrationErrorCode =
  | "account_selection_required"
  | "auth_expired"
  | "auth_revoked"
  | "forbidden_pattern"
  | "nango_not_configured"
  | "network_error"
  | "not_connected"
  | "provider_forbidden"
  | "provider_not_found"
  | "rate_limited"
  | "settings_invalid"
  | "unknown_provider_error"
  | "validation_error";

export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly connectorId?: string;
  readonly status?: number;

  constructor({
    code,
    connectorId,
    message,
    status,
  }: {
    code: IntegrationErrorCode;
    connectorId?: string;
    message: string;
    status?: number;
  }) {
    super(redactSecrets(message));
    this.name = "IntegrationError";
    this.code = code;
    if (connectorId !== undefined) this.connectorId = connectorId;
    if (status !== undefined) this.status = status;
  }
}

export function integrationErrorMessage(err: unknown) {
  if (err instanceof IntegrationError) return err.message;
  if (err instanceof Error) return redactSecrets(err.message);
  if (typeof err === "string") return redactSecrets(err);
  return "Unknown integration error";
}

export function integrationErrorCode(err: unknown): IntegrationErrorCode {
  if (err instanceof IntegrationError) return err.code;

  const status = errorStatus(err);
  if (status === 401) return "auth_expired";
  if (status === 403) return "provider_forbidden";
  if (status === 404) return "provider_not_found";
  if (status === 429) return "rate_limited";
  if (status && status >= 500) return "network_error";
  return "unknown_provider_error";
}

export function errorStatus(err: unknown) {
  if (typeof err !== "object" || err === null) return null;
  if ("status" in err && typeof err.status === "number") return err.status;
  if (
    "response" in err &&
    typeof err.response === "object" &&
    err.response !== null &&
    "status" in err.response &&
    typeof err.response.status === "number"
  ) {
    return err.response.status;
  }
  return null;
}
